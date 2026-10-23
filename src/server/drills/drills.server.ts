import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
	type ActionType,
	applyAction,
	type DrillAction,
	type DrillProgress,
	type DrillState,
	initialProgress,
	isKnownAction,
	type JsonObject,
	type JsonValue,
	type MetricSample,
	metricsForTick,
	type RunLogEntry,
	runScenario,
	type ScenarioDefinition,
	type ScoreBreakdown,
	SLA_ERROR_RATE,
	SLA_LATENCY_MS,
	SLA_QUEUE_DEPTH,
	transition,
	WRONG_ACTION_PENALTY,
} from "#/engine";
import { AppError } from "#/lib/errors";
import { evaluateRateLimit, RATE_LIMIT_WINDOW_MS } from "#/lib/rate-limit";
import {
	requireCommanderUser,
	requireSessionUser,
} from "#/server/auth/guards.server";
import type { SessionUser } from "#/server/auth/types";
import { getDb, schema } from "#/server/db/client.server";
import { isTestMode } from "#/server/env";
import { failResult, okResult, type ServerResult } from "#/server/results";

export interface DrillEventView {
	id: string;
	tick: number;
	type: string;
	payload: JsonObject;
	createdAt: string;
}

export interface ActionView {
	id: string;
	type: ActionType;
	tick: number;
	correct: boolean;
	penalty: number;
}

export interface DeliveryView {
	seq: number;
	attempt: number;
	status: string;
	type: string | null;
}

export interface DrillDetail {
	id: string;
	scenarioId: string;
	scenarioName: string;
	state: DrillState;
	tick: number;
	maxTicks: number;
	seed: number;
	curated: boolean;
	startedAt: string | null;
	endedAt: string | null;
	/** True only when TEST_MODE=true, so the console can offer the tick button. */
	testMode: boolean;
	requiredActions: ActionType[];
	performedActions: ActionType[];
	wrongActions: number;
	firstActionTick: number | null;
	metrics: MetricSample;
	/** Tick at which the drill resolved or failed, or null while it is open. */
	mttrTicks: number | null;
	events: DrillEventView[];
	actions: ActionView[];
	deliveries: DeliveryView[];
	log: RunLogEntry[];
	score: { total: number; grade: string; breakdown: ScoreBreakdown } | null;
}

export interface DrillListItem {
	id: string;
	scenarioId: string;
	scenarioName: string;
	state: DrillState;
	tick: number;
	maxTicks: number;
	createdAt: string;
	score: { total: number; grade: string } | null;
	/** Tick of the first action, i.e. the run's MTTA. Null when none landed. */
	firstActionTick: number | null;
	wrongActions: number;
	/** Tick the drill closed at (RESOLVED/FAILED), else null. */
	mttrTicks: number | null;
}

/** Metric history of one drill, for the live charts on the dashboard. */
export interface DrillSeries {
	drillId: string;
	state: DrillState;
	tick: number;
	maxTicks: number;
	thresholds: { errorRate: number; latencyMs: number; queueDepth: number };
	samples: MetricSample[];
	breachedTicks: number;
}

interface DrillRowContext {
	drillId: string;
	scenarioId: string;
	scenarioName: string;
	state: DrillState;
	tick: number;
	maxTicks: number;
	seed: number;
	definition: ScenarioDefinition;
	startedAt: Date | null;
	endedAt: Date | null;
}

async function loadDrillContext(
	drillId: string,
): Promise<DrillRowContext | null> {
	const db = getDb();
	const [row] = await db
		.select({
			drillId: schema.drills.id,
			scenarioId: schema.drills.scenarioId,
			state: schema.drills.state,
			tick: schema.drills.tick,
			startedAt: schema.drills.startedAt,
			endedAt: schema.drills.endedAt,
			scenarioName: schema.scenarios.name,
			maxTicks: schema.scenarios.maxTicks,
			seed: schema.scenarios.seed,
			definition: schema.scenarios.definition,
		})
		.from(schema.drills)
		.innerJoin(
			schema.scenarios,
			eq(schema.drills.scenarioId, schema.scenarios.id),
		)
		.where(eq(schema.drills.id, drillId))
		.limit(1);

	return row ?? null;
}

async function loadActionTimeline(drillId: string): Promise<DrillAction[]> {
	const db = getDb();
	const rows = await db
		.select({ tick: schema.actions.tick, type: schema.actions.type })
		.from(schema.actions)
		.where(eq(schema.actions.drillId, drillId))
		.orderBy(asc(schema.actions.createdAt), asc(schema.actions.id));

	return rows.map((row) => ({ tick: row.tick, type: row.type }));
}

function progressFrom(
	definition: ScenarioDefinition,
	actions: readonly DrillAction[],
	tick: number,
	state: DrillState = "RUNNING",
): DrillProgress {
	// Replay as RUNNING even for a finished drill: applyAction refuses actions
	// outside RUNNING, so passing the final state here would hide MTTA and the
	// wrong-action count from the detail and the shared report. The real state
	// is applied after the replay.
	let progress: DrillProgress = {
		...initialProgress(definition.requiredActions),
		state: "RUNNING",
	};
	for (const action of actions) {
		const result = applyAction({ ...progress, tick: action.tick }, action.type);
		if (result.ok) progress = result.progress;
	}
	return { ...progress, state, tick };
}

/**
 * Conditional state change. The WHERE clause carries the expected source state,
 * so two concurrent clicks cannot both win: the loser updates zero rows and gets
 * E-STATE-409 (PRD C, last paragraph).
 */
async function changeState(
	drillId: string,
	from: readonly DrillState[],
	to: DrillState,
	patch: { endedAt?: Date | null; resetTick?: boolean } = {},
): Promise<boolean> {
	const db = getDb();
	const [row] = await db
		.update(schema.drills)
		.set({
			state: to,
			updatedAt: new Date(),
			...(patch.endedAt !== undefined ? { endedAt: patch.endedAt } : {}),
			...(patch.resetTick ? { tick: 0, startedAt: null } : {}),
		})
		.where(
			and(
				eq(schema.drills.id, drillId),
				inArray(schema.drills.state, [...from]),
			),
		)
		.returning({ id: schema.drills.id });

	return Boolean(row);
}

async function appendEvent(
	drillId: string,
	tick: number,
	type: string,
	payload: JsonObject = {},
): Promise<void> {
	const db = getDb();
	await db.insert(schema.drillEvents).values({ drillId, tick, type, payload });
}

export async function listDrills(): Promise<DrillListItem[]> {
	await requireSessionUser();
	// The dashboard is a console, not a snapshot. Bring open drills up to date
	// first, so a card never shows a tick the engine has already left behind
	// (and a drill past its limit flips to EVALUATED with its score).
	await catchUpActiveDrills(10);
	const db = getDb();

	const rows = await db
		.select({
			id: schema.drills.id,
			scenarioId: schema.drills.scenarioId,
			scenarioName: schema.scenarios.name,
			state: schema.drills.state,
			tick: schema.drills.tick,
			maxTicks: schema.scenarios.maxTicks,
			createdAt: schema.drills.createdAt,
			scoreTotal: schema.scores.total,
			scoreGrade: schema.scores.grade,
		})
		.from(schema.drills)
		.innerJoin(
			schema.scenarios,
			eq(schema.drills.scenarioId, schema.scenarios.id),
		)
		.leftJoin(schema.scores, eq(schema.scores.drillId, schema.drills.id))
		.orderBy(desc(schema.drills.createdAt))
		.limit(20);

	const ids = rows.map((row) => row.id);
	const actionRows = ids.length
		? await db
				.select({
					drillId: schema.actions.drillId,
					tick: schema.actions.tick,
					correct: schema.actions.correct,
				})
				.from(schema.actions)
				.where(inArray(schema.actions.drillId, ids))
		: [];
	const closingRows = ids.length
		? await db
				.select({
					drillId: schema.drillEvents.drillId,
					tick: schema.drillEvents.tick,
				})
				.from(schema.drillEvents)
				.where(
					and(
						inArray(schema.drillEvents.drillId, ids),
						// MTTR is time to recovery. A failed drill never recovered, so it
						// has no MTTR; the failure tick is not a recovery time.
						eq(schema.drillEvents.type, "drill.resolved"),
					),
				)
		: [];

	const firstAction = new Map<string, number>();
	const wrongActions = new Map<string, number>();
	for (const action of actionRows) {
		const current = firstAction.get(action.drillId);
		if (current === undefined || action.tick < current) {
			firstAction.set(action.drillId, action.tick);
		}
		if (!action.correct) {
			wrongActions.set(
				action.drillId,
				(wrongActions.get(action.drillId) ?? 0) + 1,
			);
		}
	}
	const resolvedAt = new Map<string, number>();
	for (const event of closingRows) {
		if (!resolvedAt.has(event.drillId))
			resolvedAt.set(event.drillId, event.tick);
	}

	return rows.map((row) => ({
		id: row.id,
		scenarioId: row.scenarioId,
		scenarioName: row.scenarioName,
		state: row.state,
		tick: row.tick,
		maxTicks: row.maxTicks,
		createdAt: row.createdAt.toISOString(),
		score:
			row.scoreTotal === null
				? null
				: { total: row.scoreTotal, grade: row.scoreGrade ?? "F" },
		firstActionTick: firstAction.get(row.id) ?? null,
		wrongActions: wrongActions.get(row.id) ?? 0,
		mttrTicks: resolvedAt.get(row.id) ?? null,
	}));
}

/** FR-I2: at most five starts per minute per commander, enforced in Postgres. */
async function consumeStartBudget(
	user: SessionUser,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
	const db = getDb();
	const key = `drill-start:${user.id}`;
	const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

	const recent = await db
		.select({ createdAt: schema.rateLimitHits.createdAt })
		.from(schema.rateLimitHits)
		.where(
			and(
				eq(schema.rateLimitHits.key, key),
				gt(schema.rateLimitHits.createdAt, since),
			),
		);

	const decision = evaluateRateLimit(
		recent.map((hit) => hit.createdAt.getTime()),
		Date.now(),
		// Parallel browser cases each start their own drill. The five-per-minute
		// budget is a production guard (FR-I2), so test mode raises the ceiling
		// instead of turning a suite run into a wall of E-RATE-429.
		isTestMode()
			? { limit: 1_000, windowMs: RATE_LIMIT_WINDOW_MS }
			: { limit: 5, windowMs: RATE_LIMIT_WINDOW_MS },
	);

	if (!decision.allowed) {
		return { allowed: false, retryAfterSeconds: decision.retryAfterSeconds };
	}

	await db.insert(schema.rateLimitHits).values({ key });
	return { allowed: true };
}

export async function startDrill(
	scenarioId: string,
): Promise<ServerResult<{ drillId: string }>> {
	const user = await requireCommanderUser();

	const budget = await consumeStartBudget(user);
	if (!budget.allowed) {
		return failResult(
			"E-RATE-429",
			"Too many drill starts. Wait before starting another one.",
			{ retryAfterSeconds: budget.retryAfterSeconds },
		);
	}

	const db = getDb();
	const [scenario] = await db
		.select()
		.from(schema.scenarios)
		.where(eq(schema.scenarios.id, scenarioId))
		.limit(1);

	if (!scenario) {
		return failResult("E-NOT-FOUND-404", "Scenario not found.");
	}

	const allowed = transition("READY", "RUNNING", {
		tick: 0,
		maxTicks: scenario.maxTicks,
		validationPassed: true,
		requiredActionsSatisfied: false,
	});

	if (scenario.status !== "READY" || !allowed.ok) {
		return failResult("E-STATE-409", "Only a READY scenario can be started.");
	}

	// One open drill per scenario: a second click opens a second clock for the
	// same incident, which makes the dashboard read like two realities. Test
	// mode lifts the rule so parallel browser cases can each own a clock.
	if (!isTestMode()) {
		const [open] = await db
			.select({ id: schema.drills.id })
			.from(schema.drills)
			.where(
				and(
					eq(schema.drills.scenarioId, scenario.id),
					inArray(schema.drills.state, ["RUNNING", "PAUSED"]),
				),
			)
			.limit(1);

		if (open) {
			return failResult(
				"E-STATE-409",
				"A drill is already open for this scenario. Open it or reset it first.",
			);
		}
	}

	const [drill] = await db
		.insert(schema.drills)
		.values({
			scenarioId: scenario.id,
			state: "RUNNING",
			tick: 0,
			startedAt: new Date(),
		})
		.returning({ id: schema.drills.id });

	if (!drill) {
		throw new AppError("E-DB-500", "Drill could not be created.");
	}

	await appendEvent(drill.id, 0, "drill.started", {
		scenarioId: scenario.id,
		seed: scenario.seed,
	});

	return okResult({ drillId: drill.id });
}

export async function pauseDrill(
	drillId: string,
): Promise<ServerResult<{ state: DrillState }>> {
	await requireCommanderUser();
	await catchUpClock(drillId);
	const changed = await changeState(drillId, ["RUNNING"], "PAUSED");
	if (!changed) {
		return failResult("E-STATE-409", "Only a RUNNING drill can be paused.");
	}
	const context = await loadDrillContext(drillId);
	await appendEvent(drillId, context?.tick ?? 0, "drill.paused");
	return okResult({ state: "PAUSED" as DrillState });
}

export async function resumeDrill(
	drillId: string,
): Promise<ServerResult<{ state: DrillState }>> {
	await requireCommanderUser();
	const changed = await changeState(drillId, ["PAUSED"], "RUNNING");
	if (!changed) {
		return failResult("E-STATE-409", "Only a PAUSED drill can be resumed.");
	}
	const context = await loadDrillContext(drillId);
	await appendEvent(drillId, context?.tick ?? 0, "drill.resumed");
	return okResult({ state: "RUNNING" as DrillState });
}

/** Reset clears progress, so the drill returns to READY with tick 0 (PRD C). */
export async function resetDrill(
	drillId: string,
): Promise<ServerResult<{ state: DrillState; tick: number }>> {
	await requireCommanderUser();
	const changed = await changeState(drillId, ["RUNNING", "PAUSED"], "READY", {
		endedAt: null,
		resetTick: true,
	});
	if (!changed) {
		return failResult("E-STATE-409", "Only a running drill can be reset.");
	}

	const db = getDb();
	await Promise.all([
		db.delete(schema.actions).where(eq(schema.actions.drillId, drillId)),
		db.delete(schema.deliveries).where(eq(schema.deliveries.drillId, drillId)),
		db
			.delete(schema.drillEvents)
			.where(eq(schema.drillEvents.drillId, drillId)),
	]);

	await appendEvent(drillId, 0, "drill.reset");
	return okResult({ state: "READY" as DrillState, tick: 0 });
}

export async function performAction(
	drillId: string,
	action: string,
): Promise<
	ServerResult<{
		state: DrillState;
		correct: boolean;
		wrongActions: number;
		requiredActionsSatisfied: boolean;
	}>
> {
	await requireCommanderUser();

	if (!isKnownAction(action)) {
		return failResult("E-INPUT-400", `${action} is not a mitigation action`);
	}

	await catchUpClock(drillId);
	const context = await loadDrillContext(drillId);
	if (!context) return failResult("E-NOT-FOUND-404", "Drill not found.");
	if (context.state !== "RUNNING") {
		return failResult(
			"E-STATE-409",
			`Actions are only accepted while RUNNING, drill is ${context.state}.`,
		);
	}

	const timeline = await loadActionTimeline(drillId);
	const progress = progressFrom(context.definition, timeline, context.tick);
	const result = applyAction(progress, action);

	if (!result.ok) {
		return failResult(result.code, result.reason);
	}

	const db = getDb();
	await db.insert(schema.actions).values({
		drillId,
		type: action,
		tick: context.tick,
		correct: result.correct,
		penalty: result.correct ? 0 : WRONG_ACTION_PENALTY,
	});
	await appendEvent(drillId, context.tick, "action.performed", {
		action,
		correct: result.correct,
	});

	let state: DrillState = "RUNNING";
	if (result.requiredActionsSatisfied) {
		const resolved = await changeState(drillId, ["RUNNING"], "RESOLVED", {
			endedAt: new Date(),
		});
		if (resolved) {
			state = "RESOLVED";
			await appendEvent(drillId, context.tick, "drill.resolved");
			await evaluateDrill(drillId);
			state = "EVALUATED";
		}
	}

	return okResult({
		state,
		correct: result.correct,
		wrongActions: result.progress.wrongActions,
		requiredActionsSatisfied: result.requiredActionsSatisfied,
	});
}

/** Resolved or failed drills are scored once, from the engine replay. */
export async function evaluateDrill(
	drillId: string,
): Promise<ServerResult<{ total: number; grade: string }>> {
	const context = await loadDrillContext(drillId);
	if (!context) return failResult("E-NOT-FOUND-404", "Drill not found.");

	if (context.state !== "RESOLVED" && context.state !== "FAILED") {
		return failResult(
			"E-STATE-409",
			"Only a resolved or failed drill can be evaluated.",
		);
	}

	const timeline = await loadActionTimeline(drillId);
	const run = runScenario({
		definition: context.definition,
		actions: timeline,
	});

	const db = getDb();
	await db
		.insert(schema.scores)
		.values({
			drillId,
			total: run.score.total,
			grade: run.score.grade,
			breakdown: run.score as unknown as Record<string, JsonValue>,
		})
		.onConflictDoUpdate({
			target: schema.scores.drillId,
			set: {
				total: run.score.total,
				grade: run.score.grade,
				breakdown: run.score as unknown as Record<string, JsonValue>,
			},
		});

	const moved = await changeState(drillId, ["RESOLVED", "FAILED"], "EVALUATED");
	if (moved) {
		await appendEvent(drillId, context.tick, "drill.evaluated", {
			total: run.score.total,
			grade: run.score.grade,
		});
	}

	return okResult({ total: run.score.total, grade: run.score.grade });
}

/**
 * Writes the engine's delivery log up to the current tick. One row per message,
 * keyed by (drill, seq), so replaying the same tick is idempotent.
 */
async function syncDeliveries(
	drillId: string,
	definition: ScenarioDefinition,
	actions: readonly DrillAction[],
	upToTick: number,
): Promise<void> {
	const run = runScenario({ definition, actions });
	const latest = new Map<
		number,
		{ seq: number; attempt: number; status: string; type: string }
	>();

	for (const entry of run.log) {
		if (entry.kind !== "delivery" || entry.tick > upToTick) continue;
		latest.set(entry.seq, {
			seq: entry.seq,
			attempt: entry.attempt,
			status: entry.status.toUpperCase(),
			type: entry.type,
		});
	}

	if (latest.size === 0) return;

	const db = getDb();
	for (const row of latest.values()) {
		await db
			.insert(schema.deliveries)
			.values({
				drillId,
				seq: row.seq,
				idempotencyKey: `evt-${row.seq}`,
				attempt: row.attempt,
				status: row.status as "PENDING",
			})
			.onConflictDoUpdate({
				target: [schema.deliveries.drillId, schema.deliveries.seq],
				set: { attempt: row.attempt, status: row.status as "PENDING" },
			});
	}
}

/** One virtual tick is one second of wall time. */
export const CLOCK_TICK_MS = 1000;

/**
 * The drill clock.
 *
 * Nothing ticks in the background on serverless, so every read catches the
 * drill up to "now" using drills.updatedAt as the anchor. Pause/resume move the
 * anchor, so a paused drill does not age. The write is conditional on the tick
 * that was just read, so two overlapping polls cannot both advance the clock.
 */
type ClockOutcome = "advanced" | "finished" | "idle";

async function catchUpClock(drillId: string): Promise<ClockOutcome> {
	const db = getDb();
	const [row] = await db
		.select({
			tick: schema.drills.tick,
			state: schema.drills.state,
			updatedAt: schema.drills.updatedAt,
			maxTicks: schema.scenarios.maxTicks,
		})
		.from(schema.drills)
		.innerJoin(
			schema.scenarios,
			eq(schema.drills.scenarioId, schema.scenarios.id),
		)
		.where(eq(schema.drills.id, drillId))
		.limit(1);

	if (!row || row.state !== "RUNNING") return "idle";

	// The tick limit was already used up on an earlier read: out of time.
	if (row.tick >= row.maxTicks) {
		const failed = await changeState(drillId, ["RUNNING"], "FAILED", {
			endedAt: new Date(),
		});
		if (failed) {
			await appendEvent(drillId, row.maxTicks, "drill.failed");
			await evaluateDrill(drillId);
			return "finished";
		}
		return "idle";
	}

	const elapsed = Math.floor(
		(Date.now() - row.updatedAt.getTime()) / CLOCK_TICK_MS,
	);
	if (elapsed <= 0) return "idle";

	const nextTick = Math.min(row.maxTicks, row.tick + elapsed);
	// Keep the sub-second remainder, so frequent polls cannot slow the clock.
	const anchor = new Date(
		row.updatedAt.getTime() + (nextTick - row.tick) * CLOCK_TICK_MS,
	);

	const [updated] = await db
		.update(schema.drills)
		.set({ tick: nextTick, updatedAt: anchor })
		.where(
			and(
				eq(schema.drills.id, drillId),
				eq(schema.drills.state, "RUNNING"),
				eq(schema.drills.tick, row.tick),
			),
		)
		.returning({ tick: schema.drills.tick });

	if (!updated) return "idle";

	const context = await loadDrillContext(drillId);
	if (!context) return "advanced";
	const timeline = await loadActionTimeline(drillId);
	await syncDeliveries(drillId, context.definition, timeline, nextTick);
	return "advanced";
}

export interface ClockSummary {
	scanned: number;
	advanced: number;
	finished: number;
}

/**
 * Cron entry point: materialises the clock for drills nobody is watching, so a
 * running drill never stays RUNNING forever just because its page is closed.
 */
export async function catchUpActiveDrills(limit = 25): Promise<ClockSummary> {
	const db = getDb();
	const rows = await db
		.select({ id: schema.drills.id })
		.from(schema.drills)
		.where(eq(schema.drills.state, "RUNNING"))
		.orderBy(asc(schema.drills.updatedAt))
		.limit(limit);

	let advanced = 0;
	let finished = 0;
	for (const row of rows) {
		const outcome = await catchUpClock(row.id);
		if (outcome === "advanced") advanced += 1;
		if (outcome === "finished") finished += 1;
	}

	return { scanned: rows.length, advanced, finished };
}

/** Test mode only: one virtual tick. Atomic, so double clicks advance once each. */
export async function advanceTick(
	drillId: string,
): Promise<ServerResult<{ state: DrillState; tick: number }>> {
	const db = getDb();

	const [updated] = await db
		.update(schema.drills)
		.set({ tick: sql`${schema.drills.tick} + 1`, updatedAt: new Date() })
		.where(
			and(eq(schema.drills.id, drillId), eq(schema.drills.state, "RUNNING")),
		)
		.returning({ tick: schema.drills.tick });

	if (!updated) {
		return failResult("E-STATE-409", "Only a RUNNING drill can advance.");
	}

	const context = await loadDrillContext(drillId);
	if (!context) return failResult("E-NOT-FOUND-404", "Drill not found.");

	await appendEvent(drillId, updated.tick, "tick.advanced");

	const timeline = await loadActionTimeline(drillId);
	await syncDeliveries(drillId, context.definition, timeline, updated.tick);

	if (updated.tick > context.maxTicks) {
		const failed = await changeState(drillId, ["RUNNING"], "FAILED", {
			endedAt: new Date(),
		});
		if (failed) {
			await appendEvent(drillId, updated.tick, "drill.failed");
			await evaluateDrill(drillId);
			return okResult({ state: "EVALUATED" as DrillState, tick: updated.tick });
		}
	}

	return okResult({ state: "RUNNING" as DrillState, tick: updated.tick });
}

/**
 * Metric history for the console charts. Samples come from the same pure
 * `metricsForTick` the engine uses, so the curve is reproducible: seed, tick,
 * and how many mitigations had landed at that tick, nothing else.
 */
export async function getDrillSeries(
	drillId: string,
): Promise<ServerResult<DrillSeries>> {
	await requireSessionUser();
	await catchUpClock(drillId);
	const context = await loadDrillContext(drillId);
	if (!context) return failResult("E-NOT-FOUND-404", "Drill not found.");

	const timeline = await loadActionTimeline(drillId);
	const required = new Set(context.definition.requiredActions);
	const completed = new Set<ActionType>();
	const ordered = [...timeline].sort((a, b) => a.tick - b.tick);
	let cursor = 0;

	const samples: MetricSample[] = [];
	for (let tick = 0; tick <= context.tick; tick += 1) {
		while (cursor < ordered.length && ordered[cursor].tick <= tick) {
			const action = ordered[cursor];
			cursor += 1;
			if (required.has(action.type)) completed.add(action.type);
		}
		samples.push(
			metricsForTick(
				context.definition.metrics,
				context.seed,
				tick,
				completed.size,
			),
		);
	}

	return okResult({
		drillId,
		state: context.state,
		tick: context.tick,
		maxTicks: context.maxTicks,
		thresholds: {
			errorRate: SLA_ERROR_RATE,
			latencyMs: SLA_LATENCY_MS,
			queueDepth: SLA_QUEUE_DEPTH,
		},
		samples,
		breachedTicks: samples.filter((sample) => sample.breached).length,
	});
}

export async function getDrillDetail(
	drillId: string,
): Promise<ServerResult<DrillDetail>> {
	await requireSessionUser();
	await catchUpClock(drillId);
	const context = await loadDrillContext(drillId);
	if (!context) return failResult("E-NOT-FOUND-404", "Drill not found.");

	return okResult(await buildDrillDetail(context));
}

export async function buildDrillDetail(
	context: DrillRowContext,
): Promise<DrillDetail> {
	const db = getDb();
	const [timeline, events, actionRows, deliveryRows, scoreRows] =
		await Promise.all([
			loadActionTimeline(context.drillId),
			db
				.select()
				.from(schema.drillEvents)
				.where(eq(schema.drillEvents.drillId, context.drillId))
				.orderBy(
					asc(schema.drillEvents.tick),
					asc(schema.drillEvents.createdAt),
				),
			db
				.select()
				.from(schema.actions)
				.where(eq(schema.actions.drillId, context.drillId))
				.orderBy(asc(schema.actions.tick), asc(schema.actions.createdAt)),
			db
				.select()
				.from(schema.deliveries)
				.where(eq(schema.deliveries.drillId, context.drillId))
				.orderBy(asc(schema.deliveries.seq)),
			db
				.select()
				.from(schema.scores)
				.where(eq(schema.scores.drillId, context.drillId))
				.limit(1),
		]);

	const progress = progressFrom(
		context.definition,
		timeline,
		context.tick,
		context.state,
	);
	const completed = new Set(
		progress.performedActions.filter((action) =>
			context.definition.requiredActions.includes(action),
		),
	).size;

	const score = scoreRows[0];
	const run = runScenario({
		definition: context.definition,
		actions: timeline,
	});
	const closingEvent = [...events]
		.reverse()
		.find((event) => event.type === "drill.resolved");

	return {
		id: context.drillId,
		scenarioId: context.scenarioId,
		scenarioName: context.scenarioName,
		state: context.state,
		tick: context.tick,
		maxTicks: context.maxTicks,
		seed: context.seed,
		curated: context.definition.curated === true,
		startedAt: context.startedAt?.toISOString() ?? null,
		endedAt: context.endedAt?.toISOString() ?? null,
		testMode: isTestMode(),
		requiredActions: [...context.definition.requiredActions],
		performedActions: [...progress.performedActions],
		wrongActions: progress.wrongActions,
		firstActionTick: progress.firstActionTick,
		metrics: metricsForTick(
			context.definition.metrics,
			context.seed,
			context.tick,
			completed,
		),
		mttrTicks: closingEvent?.tick ?? null,
		events: events.map((event) => ({
			id: event.id,
			tick: event.tick,
			type: event.type,
			payload: event.payload,
			createdAt: event.createdAt.toISOString(),
		})),
		actions: actionRows.map((action) => ({
			id: action.id,
			type: action.type,
			tick: action.tick,
			correct: action.correct,
			penalty: action.penalty,
		})),
		deliveries: deliveryRows.map((delivery) => ({
			seq: delivery.seq,
			attempt: delivery.attempt,
			status: delivery.status,
			type: null,
		})),
		log: run.log.filter((entry) => entry.tick <= context.tick),
		score: score
			? {
					total: score.total,
					grade: score.grade,
					breakdown: score.breakdown as unknown as ScoreBreakdown,
				}
			: null,
	};
}

/** Report view: read-only, no session required, no action buttons (FR-A4). */
/** Share links are public report URLs, so they expire. Thirty days is long
 * enough for a retro and short enough that a leaked link stops working. */
const SHARE_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createShareLink(
	drillId: string,
): Promise<ServerResult<{ token: string; expiresAt: string }>> {
	await requireCommanderUser();
	const db = getDb();

	const [existing] = await db
		.select({
			token: schema.shareLinks.token,
			expiresAt: schema.shareLinks.expiresAt,
		})
		.from(schema.shareLinks)
		.where(eq(schema.shareLinks.drillId, drillId))
		.limit(1);

	if (existing) {
		// Older rows predate the expiry rule; give them one on the next share.
		if (existing.expiresAt) {
			return okResult({
				token: existing.token,
				expiresAt: existing.expiresAt.toISOString(),
			});
		}
		const expiresAt = new Date(Date.now() + SHARE_LINK_TTL_MS);
		await db
			.update(schema.shareLinks)
			.set({ expiresAt })
			.where(eq(schema.shareLinks.token, existing.token));
		return okResult({
			token: existing.token,
			expiresAt: expiresAt.toISOString(),
		});
	}

	const token = randomBytes(16).toString("hex");
	const expiresAt = new Date(Date.now() + SHARE_LINK_TTL_MS);
	await db.insert(schema.shareLinks).values({ drillId, token, expiresAt });
	return okResult({ token, expiresAt: expiresAt.toISOString() });
}

export async function getReportByToken(
	token: string,
): Promise<ServerResult<DrillDetail>> {
	const db = getDb();

	const [link] = await db
		.select({
			token: schema.shareLinks.token,
			drillId: schema.shareLinks.drillId,
			expiresAt: schema.shareLinks.expiresAt,
		})
		.from(schema.shareLinks)
		.where(eq(schema.shareLinks.token, token))
		.limit(1);

	if (!link) return failResult("E-NOT-FOUND-404", "Report not found.");
	if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
		return failResult("E-NOT-FOUND-404", "This report link has expired.");
	}

	await catchUpClock(link.drillId);
	const context = await loadDrillContext(link.drillId);
	if (!context) return failResult("E-NOT-FOUND-404", "Report not found.");

	return okResult(await buildDrillDetail(context));
}
