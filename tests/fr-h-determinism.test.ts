import { describe, expect, it } from "vitest";
import { BUILTIN_SCENARIOS, runScenario } from "#/engine";
import type { DrillAction } from "#/engine/run";
import { validateScenario } from "#/engine/validate-scenario";

function timeline(required: readonly string[], startTick: number): DrillAction[] {
	return required.map((type, index) => ({
		tick: startTick + index,
		type: type as DrillAction["type"],
	}));
}

describe("FR-H determinism of a whole run", () => {
	it.each(BUILTIN_SCENARIOS.map((entry) => [entry.name, entry] as const))(
		"%s produces an identical log and score on every run",
		(_name, entry) => {
			const actions = timeline(entry.definition.requiredActions, 4);
			const first = runScenario({ definition: entry.definition, actions, hintsUsed: 1 });
			const second = runScenario({ definition: entry.definition, actions, hintsUsed: 1 });

			expect(second.log).toEqual(first.log);
			expect(second.metrics).toEqual(first.metrics);
			expect(second.score).toEqual(first.score);
			expect(second.finalState).toBe(first.finalState);
		},
	);

	it("keeps the run stable when the action list is replayed out of order", () => {
		const entry = BUILTIN_SCENARIOS[0];
		if (!entry) throw new Error("missing scenario");
		const forward = timeline(entry.definition.requiredActions, 5);
		const shuffled = [...forward].reverse();
		const a = runScenario({ definition: entry.definition, actions: forward });
		const b = runScenario({ definition: entry.definition, actions: shuffled });
		// Same ticks, different order: the log records the order, the score does not.
		expect(a.score.total).toBe(b.score.total);
	});

	it("replays actions performed at tick 0 instead of dropping them", () => {
		const entry = BUILTIN_SCENARIOS[2];
		if (!entry) throw new Error("missing scenario");
		const run = runScenario({
			definition: entry.definition,
			actions: [
				{ tick: 0, type: "restart_worker" },
				{ tick: 0, type: "failover_db" },
			],
		});

		const actions = run.log.filter((line) => line.kind === "action");
		expect(actions).toHaveLength(2);
		expect(run.wrongActions).toBe(1);
		expect(run.score.wrongActionPenalty).toBe(5);
		expect(run.mttaTicks).toBe(0);
		expect(run.finalState).toBe("EVALUATED");
		expect(run.score.total).toBe(95);
	});

	it("changes the log when the seed changes", () => {
		const base = validateScenario({
			name: "Seed drift",
			seed: 1,
			maxTicks: 30,
			metrics: { errorRate: 0.5, latencyMs: 900, queueDepth: 900 },
			requiredActions: ["scale_up"],
			events: [{ tick: 2, type: "ping" }],
		});
		const other = validateScenario({
			name: "Seed drift",
			seed: 2,
			maxTicks: 30,
			metrics: { errorRate: 0.5, latencyMs: 900, queueDepth: 900 },
			requiredActions: ["scale_up"],
			events: [{ tick: 2, type: "ping" }],
		});
		if (!base.ok || !other.ok) throw new Error("fixtures must be valid");

		const a = runScenario({ definition: base.value, actions: [] });
		const b = runScenario({ definition: other.value, actions: [] });
		expect(a.metrics).not.toEqual(b.metrics);
	});

	it("never emits a wall-clock value in the log", () => {
		const entry = BUILTIN_SCENARIOS[2];
		if (!entry) throw new Error("missing scenario");
		const run = runScenario({ definition: entry.definition, actions: [] });
		for (const line of run.log) {
			expect(line.tick).toBeTypeOf("number");
			expect(Number.isInteger(line.tick)).toBe(true);
		}
	});
});
