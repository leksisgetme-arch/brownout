import {
	applyAction,
	type DrillProgress,
	initialProgress,
	requiredActionsSatisfied,
} from "./actions";
import {
	deliver,
	ReceiverWindow,
	type ScheduledAttempt,
	scheduleDeliveries,
	signDelivery,
} from "./delivery";
import {
	countSlaBreachWindows,
	type MetricSample,
	metricsForTick,
} from "./metrics";
import { computeScore, type ScoreBreakdown } from "./scoring";
import { transition } from "./state-machine";
import type {
	ActionType,
	DrillState,
	FailureMode,
	ScenarioDefinition,
} from "./types";

/**
 * Simulation-only signing material. The sandbox receiver never leaves the
 * process, so this is not a credential and must not be treated as one.
 */
export const SANDBOX_SIGNING_SECRET = "brownout-sandbox-receiver";

export interface DrillAction {
	tick: number;
	type: ActionType;
}

export interface RunOptions {
	definition: ScenarioDefinition;
	/** Actions in the order the operator performed them. */
	actions?: readonly DrillAction[];
	hintsUsed?: number;
	secret?: string;
}

export type RunLogEntry =
	| {
			kind: "state";
			tick: number;
			from: DrillState;
			to: DrillState;
			code: null;
			reason: null;
	  }
	| {
			kind: "delivery";
			tick: number;
			seq: number;
			attempt: number;
			status:
				| "delivered"
				| "held"
				| "duplicate"
				| "stale"
				| "overflow"
				| "rejected"
				| "failed"
				| "dead_letter";
			failure: FailureMode | null;
			released: number[];
			type: string;
	  }
	| {
			kind: "action";
			tick: number;
			action: ActionType;
			correct: boolean;
			code: "E-STATE-409" | "E-INPUT-400" | null;
			wrongActions: number;
	  }
	| {
			kind: "metrics";
			tick: number;
			errorRate: number;
			latencyMs: number;
			queueDepth: number;
			breached: boolean;
	  };

export interface RunResult {
	finalState: DrillState;
	log: RunLogEntry[];
	score: ScoreBreakdown;
	metrics: MetricSample[];
	deadLetters: number[];
	mttaTicks: number;
	mttrTicks: number | null;
	wrongActions: number;
	slaBreachWindows: number;
	hintsUsed: number;
}

function compareAttempts(
	left: ScheduledAttempt,
	right: ScheduledAttempt,
): number {
	if (left.tick !== right.tick) return left.tick - right.tick;
	if (left.seq !== right.seq) return left.seq - right.seq;
	return left.attempt - right.attempt;
}

/**
 * Runs a whole drill from READY to EVALUATED.
 *
 * Pure: the same definition, action timeline and hint count always produce the
 * same log, the same metrics and the same score (PRD F, last bullet).
 */
export function runScenario(options: RunOptions): RunResult {
	const { definition } = options;
	const secret = options.secret ?? SANDBOX_SIGNING_SECRET;
	const hintsUsed = Math.max(0, Math.trunc(options.hintsUsed ?? 0));
	const planned = options.actions ?? [];
	const maxTicks = definition.maxTicks;

	const log: RunLogEntry[] = [];
	const metrics: MetricSample[] = [];
	const deadLetters: number[] = [];

	const receiver = new ReceiverWindow();
	let pending: ScheduledAttempt[] = scheduleDeliveries(definition);
	let progress: DrillProgress = {
		...initialProgress(definition.requiredActions),
		state: "RUNNING",
	};
	let state: DrillState = "RUNNING";
	let mttrTicks: number | null = null;

	log.push({
		kind: "state",
		tick: 0,
		from: "READY",
		to: "RUNNING",
		code: null,
		reason: null,
	});

	const completedMitigations = (current: DrillProgress): number =>
		new Set(
			current.performedActions.filter((action) =>
				current.requiredActions.includes(action),
			),
		).size;

	if (requiredActionsSatisfied(progress)) {
		mttrTicks = 0;
		const resolved = transition("RUNNING", "RESOLVED", {
			tick: 0,
			maxTicks,
			validationPassed: true,
			requiredActionsSatisfied: true,
		});
		if (resolved.ok) {
			state = "RESOLVED";
			log.push({
				kind: "state",
				tick: 0,
				from: "RUNNING",
				to: "RESOLVED",
				code: null,
				reason: null,
			});
		}
	}

	for (let tick = 1; tick <= maxTicks && state === "RUNNING"; tick += 1) {
		progress = { ...progress, tick };

		const due = pending
			.filter((attempt) => attempt.tick <= tick)
			.sort(compareAttempts);
		pending = pending.filter((attempt) => attempt.tick > tick);

		for (const attempt of due) {
			const outcome = deliver(
				{
					message: {
						seq: attempt.seq,
						idempotencyKey: attempt.idempotencyKey,
						body: attempt.body,
					},
					signature: signDelivery(secret, attempt.seq, attempt.body),
					attempt: attempt.attempt,
					tick,
					failure: attempt.failure,
				},
				receiver,
				secret,
			);

			if (outcome.status === "failed") {
				log.push({
					kind: "delivery",
					tick,
					seq: attempt.seq,
					attempt: attempt.attempt,
					status: "failed",
					failure: attempt.failure,
					released: [],
					type: attempt.type,
				});

				if (
					outcome.retry.status === "RETRY" &&
					outcome.retry.nextAttemptTick !== null
				) {
					pending.push({
						...attempt,
						tick: outcome.retry.nextAttemptTick,
						attempt: outcome.retry.attempt,
					});
				} else {
					deadLetters.push(attempt.seq);
					log.push({
						kind: "delivery",
						tick,
						seq: attempt.seq,
						attempt: attempt.attempt,
						status: "dead_letter",
						failure: attempt.failure,
						released: [],
						type: attempt.type,
					});
				}
			} else {
				log.push({
					kind: "delivery",
					tick,
					seq: attempt.seq,
					attempt: attempt.attempt,
					status: outcome.status,
					failure: attempt.failure,
					released: outcome.status === "delivered" ? outcome.released : [],
					type: attempt.type,
				});
			}
		}

		for (const action of planned.filter((entry) => entry.tick === tick)) {
			const result = applyAction(progress, action.type);
			if (result.ok) {
				progress = result.progress;
			}
			log.push({
				kind: "action",
				tick,
				action: action.type,
				correct: result.ok ? result.correct : false,
				code: result.ok ? null : result.code,
				wrongActions: result.progress.wrongActions,
			});
		}

		const sample = metricsForTick(
			definition.metrics,
			definition.seed,
			tick,
			completedMitigations(progress),
		);
		metrics.push(sample);
		log.push({
			kind: "metrics",
			tick,
			errorRate: sample.errorRate,
			latencyMs: sample.latencyMs,
			queueDepth: sample.queueDepth,
			breached: sample.breached,
		});

		if (requiredActionsSatisfied(progress)) {
			const resolved = transition("RUNNING", "RESOLVED", {
				tick,
				maxTicks,
				validationPassed: true,
				requiredActionsSatisfied: true,
			});
			if (resolved.ok) {
				state = "RESOLVED";
				mttrTicks = tick;
				log.push({
					kind: "state",
					tick,
					from: "RUNNING",
					to: "RESOLVED",
					code: null,
					reason: null,
				});
			}
		}
	}

	if (state === "RUNNING") {
		const failed = transition("RUNNING", "FAILED", {
			tick: maxTicks + 1,
			maxTicks,
			validationPassed: true,
			requiredActionsSatisfied: false,
		});
		if (failed.ok) {
			state = "FAILED";
			log.push({
				kind: "state",
				tick: maxTicks + 1,
				from: "RUNNING",
				to: "FAILED",
				code: null,
				reason: null,
			});
		}
	}

	const evaluated = transition(state, "EVALUATED", {
		tick: mttrTicks ?? maxTicks + 1,
		maxTicks,
		validationPassed: true,
		requiredActionsSatisfied: state === "RESOLVED",
	});
	if (evaluated.ok) {
		log.push({
			kind: "state",
			tick: mttrTicks ?? maxTicks + 1,
			from: state,
			to: "EVALUATED",
			code: null,
			reason: null,
		});
		state = "EVALUATED";
	}

	const slaBreachWindows = countSlaBreachWindows(metrics);

	const score = computeScore({
		firstActionTick: progress.firstActionTick,
		maxTicks,
		wrongActions: progress.wrongActions,
		slaBreachWindows,
		hintsUsed,
	});

	return {
		finalState: state,
		log,
		score,
		metrics,
		deadLetters,
		mttaTicks: score.mttaTicks,
		mttrTicks,
		wrongActions: progress.wrongActions,
		slaBreachWindows,
		hintsUsed,
	};
}
