import { useMemo, useState } from "react";
import {
	BUILTIN_SCENARIOS,
	computeScore,
	countSlaBreachWindows,
	type DrillAction,
	type MetricSample,
	type RunLogEntry,
	runScenario,
	type ScoreBreakdown,
} from "#/engine";

/** The demo timeline is fixed, so every visitor sees the same numbers. */
export const PREVIEW_SCENARIO = "Expired deploy token";
const PREVIEW_ACTIONS: DrillAction[] = [
	{ tick: 30, type: "rotate_token" },
	{ tick: 32, type: "restart_worker" },
];

export type DeliveryEntry = Extract<RunLogEntry, { kind: "delivery" }>;

export interface DrillPreview {
	maxTicks: number;
	tick: number;
	setTick: (next: number) => void;
	state: string;
	metrics: MetricSample;
	deliveries: DeliveryEntry[];
	deadLetters: DeliveryEntry[];
	score: ScoreBreakdown;
	actionTick: number | null;
}

export function useDrillPreview(): DrillPreview {
	const scenario = useMemo(() => {
		const found =
			BUILTIN_SCENARIOS.find((entry) => entry.name === PREVIEW_SCENARIO) ??
			BUILTIN_SCENARIOS[0];
		if (!found) throw new Error("E-INPUT-400 No built-in scenarios");
		return found;
	}, []);

	const run = useMemo(
		() =>
			runScenario({
				definition: scenario.definition,
				actions: PREVIEW_ACTIONS,
			}),
		[scenario],
	);

	const maxTicks = scenario.definition.maxTicks;
	const [tick, setTickState] = useState(20);

	const setTick = (next: number) => {
		setTickState(Math.min(maxTicks, Math.max(0, Math.round(next))));
	};

	const state = useMemo(() => {
		let current = "RUNNING";
		for (const entry of run.log) {
			if (entry.kind === "state" && entry.tick <= tick) current = entry.to;
		}
		return current;
	}, [run.log, tick]);

	const metrics = useMemo(() => {
		const fallback: MetricSample = {
			tick: 0,
			errorRate: scenario.definition.metrics.errorRate,
			latencyMs: scenario.definition.metrics.latencyMs,
			queueDepth: scenario.definition.metrics.queueDepth,
			breached: false,
		};
		if (run.metrics.length === 0) return fallback;
		const index = Math.min(Math.max(tick, 1), run.metrics.length) - 1;
		return run.metrics[index] ?? fallback;
	}, [run.metrics, scenario.definition.metrics, tick]);

	const deliveries = useMemo(
		() =>
			run.log.filter(
				(entry): entry is DeliveryEntry =>
					entry.kind === "delivery" && entry.tick <= tick,
			),
		[run.log, tick],
	);

	const deadLetters = useMemo(
		() => deliveries.filter((entry) => entry.status === "dead_letter"),
		[deliveries],
	);

	const actionTick = useMemo(() => {
		const first = PREVIEW_ACTIONS.find((action) => action.tick <= tick);
		return first?.tick ?? null;
	}, [tick]);

	const score = useMemo(
		() =>
			computeScore({
				firstActionTick: actionTick,
				maxTicks: Math.max(tick, 1),
				wrongActions: 0,
				slaBreachWindows: countSlaBreachWindows(
					run.metrics.filter((sample) => sample.tick <= tick),
				),
				hintsUsed: 0,
			}),
		[actionTick, run.metrics, tick],
	);

	return {
		maxTicks,
		tick,
		setTick,
		state,
		metrics,
		deliveries,
		deadLetters,
		score,
		actionTick,
	};
}
