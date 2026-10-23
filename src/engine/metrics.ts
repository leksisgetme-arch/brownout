import { createRng } from "./rng";
import type { ScenarioMetrics } from "./types";

/** Critical thresholds. A tick is critical when any metric crosses one. */
export const SLA_ERROR_RATE = 0.05;
export const SLA_LATENCY_MS = 500;
export const SLA_QUEUE_DEPTH = 100;

/** Every completed mitigation multiplies the remaining load by this factor. */
export const MITIGATION_DAMPING = 0.6;

/** Jitter band applied to the scenario baseline, so a run is not a flat line. */
export const JITTER_BAND = 0.1;

/** A scoring window spans this many ticks (PRD F: "jendela tick"). */
export const SLA_WINDOW_TICKS = 10;

export interface MetricSample extends ScenarioMetrics {
	tick: number;
	breached: boolean;
}

/**
 * Deterministic metric sample for one tick.
 *
 * Drift is drawn from a per-tick generator seeded with (seed, tick), so the
 * sample depends only on the scenario seed, the tick, and how many mitigations
 * have landed — never on call order.
 */
export function metricsForTick(
	base: ScenarioMetrics,
	seed: number,
	tick: number,
	completedMitigations: number,
): MetricSample {
	const rng = createRng(seed + tick * 7919);
	const factor = 1 + (rng.next() * 2 - 1) * JITTER_BAND;
	const damp = MITIGATION_DAMPING ** Math.max(0, completedMitigations);
	const scale = factor * damp;

	const sample = {
		tick,
		errorRate: round4(base.errorRate * scale),
		latencyMs: Math.max(0, Math.round(base.latencyMs * scale)),
		queueDepth: Math.max(0, Math.round(base.queueDepth * scale)),
	};
	return { ...sample, breached: isCritical(sample) };
}

export function isCritical(metrics: ScenarioMetrics): boolean {
	return (
		metrics.errorRate > SLA_ERROR_RATE ||
		metrics.latencyMs > SLA_LATENCY_MS ||
		metrics.queueDepth > SLA_QUEUE_DEPTH
	);
}

/** Window index for a tick; windows are 1-based so tick 0 has no window. */
export function windowForTick(tick: number): number {
	return Math.ceil(tick / SLA_WINDOW_TICKS);
}

/**
 * Counts windows that contain at least one critical tick. A window is charged
 * once, no matter how long the incident stays critical inside it.
 */
export function countSlaBreachWindows(
	ticks: ReadonlyArray<{ tick: number; breached: boolean }>,
): number {
	const breached = new Set<number>();
	for (const sample of ticks) {
		if (sample.breached && sample.tick > 0) {
			breached.add(windowForTick(sample.tick));
		}
	}
	return breached.size;
}

function round4(value: number): number {
	return Math.round(value * 10000) / 10000;
}
