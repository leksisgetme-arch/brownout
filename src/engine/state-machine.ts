import type { DrillState } from "./types";

export interface TransitionContext {
	tick: number;
	maxTicks: number;
	validationPassed: boolean;
	requiredActionsSatisfied: boolean;
}

export type TransitionResult =
	| { ok: true; from: DrillState; to: DrillState }
	| {
			ok: false;
			code: "E-STATE-409";
			from: DrillState;
			to: DrillState;
			reason: string;
	  };

/**
 * The full transition table from the PRD. Anything not listed here is rejected
 * with E-STATE-409 and the state must not change.
 */
export const ALLOWED_TRANSITIONS: Record<DrillState, readonly DrillState[]> = {
	DRAFT: ["READY"],
	READY: ["RUNNING"],
	RUNNING: ["PAUSED", "RESOLVED", "FAILED", "READY"],
	PAUSED: ["RUNNING", "READY"],
	RESOLVED: ["EVALUATED"],
	FAILED: ["EVALUATED"],
	EVALUATED: [],
};

export const DEFAULT_TRANSITION_CONTEXT: TransitionContext = {
	tick: 0,
	maxTicks: 0,
	validationPassed: false,
	requiredActionsSatisfied: false,
};

function conditionFailure(
	from: DrillState,
	to: DrillState,
	ctx: TransitionContext,
): string | null {
	if (from === "DRAFT" && to === "READY" && !ctx.validationPassed) {
		return "scenario validation has not passed";
	}
	if (
		from === "RUNNING" &&
		to === "RESOLVED" &&
		!ctx.requiredActionsSatisfied
	) {
		return "required mitigations are not complete";
	}
	if (from === "RUNNING" && to === "FAILED" && ctx.tick <= ctx.maxTicks) {
		return "tick limit has not been exceeded";
	}
	return null;
}

export function transition(
	from: DrillState,
	to: DrillState,
	ctx: TransitionContext = DEFAULT_TRANSITION_CONTEXT,
): TransitionResult {
	if (!ALLOWED_TRANSITIONS[from].includes(to)) {
		return {
			ok: false,
			code: "E-STATE-409",
			from,
			to,
			reason: `${from} -> ${to} is not allowed`,
		};
	}

	const failedCondition = conditionFailure(from, to, ctx);
	if (failedCondition) {
		return {
			ok: false,
			code: "E-STATE-409",
			from,
			to,
			reason: failedCondition,
		};
	}

	return { ok: true, from, to };
}

export function isTerminal(state: DrillState): boolean {
	return state === "EVALUATED";
}

export function isActive(state: DrillState): boolean {
	return state === "RUNNING" || state === "PAUSED";
}

/** Actions are only accepted while the drill is running (FR-E). */
export function canAcceptAction(state: DrillState): boolean {
	return state === "RUNNING";
}
