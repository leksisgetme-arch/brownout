import type { ActionType, ScoreBreakdown } from "#/engine";

/**
 * Pure reading of the drill history: how ready the team looks, what to drill
 * next, and what to fix after a run. Kept out of the components so the numbers
 * on the dashboard, the report and the tests all come from one function.
 */
export interface RunSummary {
	id: string;
	scenarioId: string;
	scenarioName: string;
	state: string;
	createdAt: string;
	score: { total: number; grade: string } | null;
}

export interface ReadinessSummary {
	/** Mean of the most recent graded runs, rounded. Null when nothing is graded. */
	average: number | null;
	latest: number | null;
	/** Latest minus the run before it. Null when there is only one run. */
	delta: number | null;
	gradedCount: number;
	/** Oldest to newest, at most six entries. Drives the trend bars. */
	trend: { id: string; score: number }[];
}

const WINDOW = 5;
const TREND_SIZE = 6;

function chronological<T extends { createdAt: string }>(
	runs: readonly T[],
): T[] {
	return [...runs].sort((left, right) =>
		left.createdAt.localeCompare(right.createdAt),
	);
}

export function readinessSummary(
	runs: readonly RunSummary[],
): ReadinessSummary {
	const graded = chronological(runs).filter(
		(run): run is RunSummary & { score: { total: number; grade: string } } =>
			run.score !== null,
	);
	const scores = graded.map((run) => run.score.total);
	const recent = scores.slice(-WINDOW);
	const latest = scores.at(-1) ?? null;
	const previous = scores.at(-2) ?? null;

	return {
		average: recent.length
			? Math.round(
					recent.reduce((sum, value) => sum + value, 0) / recent.length,
				)
			: null,
		latest,
		delta: latest !== null && previous !== null ? latest - previous : null,
		gradedCount: scores.length,
		trend: graded
			.slice(-TREND_SIZE)
			.map((run) => ({ id: run.id, score: run.score.total })),
	};
}

export interface ScenarioRef {
	id: string;
	name: string;
	status: string;
	/** Scenarios without a required action resolve without a decision. */
	requiredActionCount: number;
}

export interface ScenarioChoice {
	scenarioId: string;
	name: string;
	reason: "new" | "weakest";
	lastScore: number | null;
}

/**
 * The next drill is the weakest ready scenario: one that was never graded
 * comes first (it is an unknown risk), then the lowest last score. Scenarios
 * with nothing to decide are only used when there is no alternative.
 */
export function recommendNext(
	scenarios: readonly ScenarioRef[],
	runs: readonly RunSummary[],
): ScenarioChoice | null {
	const readyScenarios = scenarios.filter(
		(scenario) => scenario.status === "READY",
	);
	if (readyScenarios.length === 0) return null;
	const drillable = readyScenarios.filter(
		(scenario) => scenario.requiredActionCount > 0,
	);
	const ready = drillable.length > 0 ? drillable : readyScenarios;

	const lastScore = new Map<string, number>();
	for (const run of chronological(runs)) {
		if (run.score) lastScore.set(run.scenarioId, run.score.total);
	}

	const untried = ready.find((scenario) => !lastScore.has(scenario.id));
	if (untried) {
		return {
			scenarioId: untried.id,
			name: untried.name,
			reason: "new",
			lastScore: null,
		};
	}

	const weakest = [...ready].sort((left, right) => {
		const a = lastScore.get(left.id) ?? Number.POSITIVE_INFINITY;
		const b = lastScore.get(right.id) ?? Number.POSITIVE_INFINITY;
		if (a !== b) return a - b;
		return ready.indexOf(left) - ready.indexOf(right);
	})[0];

	return {
		scenarioId: weakest.id,
		name: weakest.name,
		reason: "weakest",
		lastScore: lastScore.get(weakest.id) ?? null,
	};
}

export type FixItem =
	| { id: "missed"; action: ActionType }
	| { id: "wrong"; count: number }
	| { id: "mtta"; ticks: number }
	| { id: "sla"; windows: number }
	| { id: "clean" };

/**
 * Turns a finished run into a short list of things to change next time. The
 * order is the order of the score breakdown, so the first item is always the
 * largest loss the operator can control.
 */
export function buildFixList(input: {
	requiredActions: readonly ActionType[];
	performedActions: readonly ActionType[];
	wrongActions: number;
	breakdown: ScoreBreakdown | null;
}): FixItem[] {
	const items: FixItem[] = [];
	const missed = input.requiredActions.filter(
		(action) => !input.performedActions.includes(action),
	);

	for (const action of missed) items.push({ id: "missed", action });
	if (input.wrongActions > 0) {
		items.push({ id: "wrong", count: input.wrongActions });
	}
	if (input.breakdown && input.breakdown.mttaPenalty > 0) {
		items.push({ id: "mtta", ticks: input.breakdown.mttaTicks });
	}
	if (input.breakdown && input.breakdown.slaPenalty > 0) {
		items.push({
			id: "sla",
			windows: Math.round(input.breakdown.slaPenalty / 10),
		});
	}

	return items.length === 0 ? [{ id: "clean" }] : items;
}
