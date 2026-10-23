import { and, desc, eq, inArray } from "drizzle-orm";
import {
	type ActionType,
	type DrillState,
	runScenario,
	type ScenarioDefinition,
	type ScenarioEventInput,
	type ScenarioStatus,
	type ScoreBreakdown,
	transition,
	validateScenario,
} from "#/engine";
import { AppError } from "#/lib/errors";
import {
	requireCommanderUser,
	requireSessionUser,
} from "#/server/auth/guards.server";
import { getDb, schema } from "#/server/db/client.server";
import { failResult, okResult, type ServerResult } from "#/server/results";

export interface ScenarioListItem {
	id: string;
	name: string;
	seed: number;
	maxTicks: number;
	status: ScenarioStatus;
	eventCount: number;
	/** A scenario with no required action resolves without a decision. */
	requiredActionCount: number;
	curated: boolean;
	ownerEmail: string;
	updatedAt: string;
}

export interface ScenarioDetail {
	id: string;
	name: string;
	seed: number;
	maxTicks: number;
	status: ScenarioStatus;
	definition: ScenarioDefinition;
	ownerEmail: string;
	createdAt: string;
	updatedAt: string;
	/** A scenario can only have one open drill; the page opens it instead of
	 * offering a Start button that the server would reject. */
	openDrill: { id: string; state: string; tick: number } | null;
}

export interface ScenarioVerification {
	solvable: boolean;
	finalState: DrillState;
	/** Tick the reference solution resolved at, or null when it never did. */
	resolveTick: number | null;
	maxTicks: number;
	/** Score of the reference solution: the highest score this scenario offers. */
	score: ScoreBreakdown;
	actions: { tick: number; type: ActionType }[];
	deadLetters: number[];
	slaBreachWindows: number;
}

export interface CreateScenarioInput {
	name: string;
	seed: number;
	maxTicks: number;
	eventsJson: string;
}

export async function listScenarios(): Promise<ScenarioListItem[]> {
	await requireSessionUser();
	const db = getDb();

	const rows = await db
		.select({
			id: schema.scenarios.id,
			name: schema.scenarios.name,
			seed: schema.scenarios.seed,
			maxTicks: schema.scenarios.maxTicks,
			status: schema.scenarios.status,
			definition: schema.scenarios.definition,
			updatedAt: schema.scenarios.updatedAt,
			ownerEmail: schema.users.email,
		})
		.from(schema.scenarios)
		.innerJoin(schema.users, eq(schema.scenarios.ownerId, schema.users.id))
		.orderBy(desc(schema.scenarios.updatedAt));

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		seed: row.seed,
		maxTicks: row.maxTicks,
		status: row.status,
		eventCount: Array.isArray(row.definition?.events)
			? row.definition.events.length
			: 0,
		requiredActionCount: Array.isArray(row.definition?.requiredActions)
			? row.definition.requiredActions.length
			: 0,
		curated: row.definition?.curated === true,
		ownerEmail: row.ownerEmail,
		updatedAt: row.updatedAt.toISOString(),
	}));
}

export async function getScenario(
	id: string,
): Promise<ServerResult<ScenarioDetail>> {
	await requireSessionUser();
	const db = getDb();

	const [row] = await db
		.select({
			id: schema.scenarios.id,
			name: schema.scenarios.name,
			seed: schema.scenarios.seed,
			maxTicks: schema.scenarios.maxTicks,
			status: schema.scenarios.status,
			definition: schema.scenarios.definition,
			createdAt: schema.scenarios.createdAt,
			updatedAt: schema.scenarios.updatedAt,
			ownerEmail: schema.users.email,
		})
		.from(schema.scenarios)
		.innerJoin(schema.users, eq(schema.scenarios.ownerId, schema.users.id))
		.where(eq(schema.scenarios.id, id))
		.limit(1);

	if (!row) return failResult("E-NOT-FOUND-404", "Scenario not found.");

	const [open] = await db
		.select({
			id: schema.drills.id,
			state: schema.drills.state,
			tick: schema.drills.tick,
		})
		.from(schema.drills)
		.where(
			and(
				eq(schema.drills.scenarioId, id),
				inArray(schema.drills.state, ["RUNNING", "PAUSED"]),
			),
		)
		.orderBy(desc(schema.drills.createdAt))
		.limit(1);

	return okResult({
		id: row.id,
		name: row.name,
		seed: row.seed,
		maxTicks: row.maxTicks,
		status: row.status,
		definition: row.definition,
		ownerEmail: row.ownerEmail,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		openDrill: open ?? null,
	});
}

/**
 * DRAFT-only edit (PRD B/C editing story): the scenario re-validates fully,
 * so a saved draft is exactly as valid as a freshly created one. READY and
 * everything after must not change under an existing, possibly referenced,
 * definition — editing is what DRAFT is for.
 */
export async function updateScenario(
	id: string,
	input: CreateScenarioInput,
): Promise<ServerResult<{ id: string; status: ScenarioStatus }>> {
	await requireCommanderUser();

	const db = getDb();
	const [row] = await db
		.select({
			status: schema.scenarios.status,
			definition: schema.scenarios.definition,
		})
		.from(schema.scenarios)
		.where(eq(schema.scenarios.id, id))
		.limit(1);

	if (!row) return failResult("E-NOT-FOUND-404", "Scenario not found.");
	if (row.definition?.curated === true) {
		return failResult(
			"E-STATE-409",
			"Curated demo scenarios cannot be edited.",
		);
	}
	if (row.status !== "DRAFT") {
		return failResult("E-STATE-409", "Only a DRAFT scenario can be edited.");
	}

	const events = parseEvents(input.eventsJson);
	if (!events.ok) return events;

	const validated = validateScenario({
		name: input.name,
		seed: input.seed,
		maxTicks: input.maxTicks,
		events: events.data,
		curated: false,
	});
	if (!validated.ok) {
		return failResult("E-INPUT-400", "Scenario failed validation.", {
			errors: validated.errors,
		});
	}

	const [updated] = await db
		.update(schema.scenarios)
		.set({
			name: input.name.trim(),
			seed: validated.value.seed,
			maxTicks: validated.value.maxTicks,
			definition: validated.value,
			updatedAt: new Date(),
		})
		.where(eq(schema.scenarios.id, id))
		.returning({ id: schema.scenarios.id });

	if (!updated) {
		return failResult("E-STATE-409", "Scenario changed while saving.");
	}

	return okResult({ id: updated.id, status: "DRAFT" as ScenarioStatus });
}

function parseEvents(eventsJson: string): ServerResult<ScenarioEventInput[]> {
	if (eventsJson.trim() === "") return okResult([]);

	try {
		const parsed = JSON.parse(eventsJson);
		if (!Array.isArray(parsed)) {
			return failResult("E-BLD-JSON", "Events must be a JSON array.");
		}
		return okResult(parsed as ScenarioEventInput[]);
	} catch {
		return failResult("E-BLD-JSON", "Events must be valid JSON.");
	}
}

export async function createScenario(
	input: CreateScenarioInput,
): Promise<ServerResult<{ id: string; status: ScenarioStatus }>> {
	const user = await requireCommanderUser();

	const events = parseEvents(input.eventsJson);
	if (!events.ok) return events;

	const validated = validateScenario({
		name: input.name,
		seed: input.seed,
		maxTicks: input.maxTicks,
		events: events.data,
		curated: false,
	});

	if (!validated.ok) {
		return failResult("E-INPUT-400", "Scenario failed validation.", {
			errors: validated.errors,
		});
	}

	const db = getDb();
	const [created] = await db
		.insert(schema.scenarios)
		.values({
			ownerId: user.id,
			name: input.name.trim(),
			seed: validated.value.seed,
			maxTicks: validated.value.maxTicks,
			definition: validated.value,
			status: "DRAFT",
		})
		.returning({ id: schema.scenarios.id });

	if (!created) throw new AppError("E-DB-500", "Scenario could not be saved.");

	return okResult({ id: created.id, status: "DRAFT" as ScenarioStatus });
}

/**
 * FR-B7: DRAFT becomes READY only after the stored definition validates again.
 * The conditional update keeps two concurrent publishes from both succeeding.
 */
export async function publishScenario(
	id: string,
): Promise<ServerResult<{ status: ScenarioStatus }>> {
	await requireCommanderUser();
	const db = getDb();

	const [row] = await db
		.select({
			status: schema.scenarios.status,
			definition: schema.scenarios.definition,
			name: schema.scenarios.name,
		})
		.from(schema.scenarios)
		.where(eq(schema.scenarios.id, id))
		.limit(1);

	if (!row) return failResult("E-NOT-FOUND-404", "Scenario not found.");
	if (row.status === "READY")
		return okResult({ status: "READY" as ScenarioStatus });

	const validated = validateScenario({
		name: row.name,
		seed: row.definition.seed,
		maxTicks: row.definition.maxTicks,
		events: row.definition.events,
		metrics: row.definition.metrics,
		requiredActions: row.definition.requiredActions,
		curated: row.definition.curated ?? false,
	});

	if (!validated.ok) {
		return failResult("E-INPUT-400", "Scenario failed validation.", {
			errors: validated.errors,
		});
	}

	const allowed = transition("DRAFT", "READY", {
		tick: 0,
		maxTicks: row.definition.maxTicks,
		validationPassed: true,
		requiredActionsSatisfied: false,
	});
	if (!allowed.ok) {
		return failResult(allowed.code, allowed.reason);
	}

	const [updated] = await db
		.update(schema.scenarios)
		.set({
			status: "READY",
			definition: validated.value,
			updatedAt: new Date(),
		})
		.where(
			and(eq(schema.scenarios.id, id), eq(schema.scenarios.status, "DRAFT")),
		)
		.returning({ status: schema.scenarios.status });

	if (!updated) {
		return failResult("E-STATE-409", "Scenario is no longer a draft.");
	}

	return okResult({ status: "READY" as ScenarioStatus });
}

export async function deleteScenario(
	id: string,
): Promise<ServerResult<{ deleted: true }>> {
	await requireCommanderUser();
	const db = getDb();

	const [row] = await db
		.select({ curated: schema.scenarios.definition })
		.from(schema.scenarios)
		.where(eq(schema.scenarios.id, id))
		.limit(1);

	if (!row) return failResult("E-NOT-FOUND-404", "Scenario not found.");
	if (row.curated?.curated === true) {
		return failResult(
			"E-STATE-409",
			"Curated demo scenarios cannot be deleted.",
		);
	}

	await db.delete(schema.scenarios).where(eq(schema.scenarios.id, id));
	return okResult({ deleted: true as const });
}

/**
 * Proves that a scenario is winnable. The reference solution performs each
 * required action on consecutive ticks, starting at tick 1; the result comes
 * from the same pure engine that scores a real drill, so "par" can never drift
 * from the scoreboard. Read-only: it writes nothing and is safe for observers.
 */
export async function verifyScenario(
	id: string,
): Promise<ServerResult<ScenarioVerification>> {
	await requireSessionUser();
	const db = getDb();

	const [row] = await db
		.select({
			definition: schema.scenarios.definition,
			maxTicks: schema.scenarios.maxTicks,
		})
		.from(schema.scenarios)
		.where(eq(schema.scenarios.id, id))
		.limit(1);

	if (!row) return failResult("E-NOT-FOUND-404", "Scenario not found.");

	const definition = row.definition;
	const actions = definition.requiredActions.map((type, index) => ({
		tick: index + 1,
		type,
	}));
	const run = runScenario({ definition, actions });

	return okResult({
		solvable: run.finalState === "EVALUATED" && run.mttrTicks !== null,
		finalState: run.finalState,
		resolveTick: run.mttrTicks,
		maxTicks: row.maxTicks,
		score: run.score,
		actions,
		deadLetters: run.deadLetters,
		slaBreachWindows: run.slaBreachWindows,
	});
}
