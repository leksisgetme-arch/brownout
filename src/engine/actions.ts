import { canAcceptAction } from "./state-machine";
import { ACTION_TYPES, type ActionType, type DrillState } from "./types";

export interface DrillProgress {
	state: DrillState;
	tick: number;
	requiredActions: readonly ActionType[];
	performedActions: readonly ActionType[];
	wrongActions: number;
	firstActionTick: number | null;
}

export function initialProgress(
	requiredActions: readonly ActionType[],
): DrillProgress {
	return {
		state: "READY",
		tick: 0,
		requiredActions,
		performedActions: [],
		wrongActions: 0,
		firstActionTick: null,
	};
}

export function requiredActionsSatisfied(progress: DrillProgress): boolean {
	return progress.requiredActions.every((action) =>
		progress.performedActions.includes(action),
	);
}

export function isKnownAction(value: string): value is ActionType {
	return (ACTION_TYPES as readonly string[]).includes(value);
}

export type ActionResult =
	| {
			ok: true;
			/** True only for a required action that had not been performed yet. */
			correct: boolean;
			progress: DrillProgress;
			requiredActionsSatisfied: boolean;
	  }
	| {
			ok: false;
			code: "E-STATE-409" | "E-INPUT-400";
			reason: string;
			progress: DrillProgress;
	  };

/**
 * Applies one mitigation action.
 *
 * An action is correct only when it is a required action that has not run yet.
 * Everything else — a wrong action or a repeat — is recorded and penalised, so
 * there is exactly one rule to reason about (PRD E).
 */
export function applyAction(
	progress: DrillProgress,
	action: ActionType,
): ActionResult {
	if (!isKnownAction(action)) {
		return {
			ok: false,
			code: "E-INPUT-400",
			reason: `${action} is not a mitigation action`,
			progress,
		};
	}

	if (!canAcceptAction(progress.state)) {
		return {
			ok: false,
			code: "E-STATE-409",
			reason: `actions are only accepted while RUNNING, drill is ${progress.state}`,
			progress,
		};
	}

	const correct =
		progress.requiredActions.includes(action) &&
		!progress.performedActions.includes(action);

	const next: DrillProgress = {
		...progress,
		performedActions: [...progress.performedActions, action],
		wrongActions: correct ? progress.wrongActions : progress.wrongActions + 1,
		firstActionTick: progress.firstActionTick ?? progress.tick,
	};

	return {
		ok: true,
		correct,
		progress: next,
		requiredActionsSatisfied: requiredActionsSatisfied(next),
	};
}
