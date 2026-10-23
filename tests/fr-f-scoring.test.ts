import { describe, expect, it } from "vitest";
import {
	BASE_SCORE,
	BUILTIN_SCENARIOS,
	computeScore,
	countSlaBreachWindows,
	gradeFor,
	HINT_PENALTY,
	MTTA_GRACE_TICKS,
	SLA_BREACH_PENALTY,
	SLA_WINDOW_TICKS,
	WRONG_ACTION_PENALTY,
} from "#/engine";
import { runScenario } from "#/engine/run";

const neutral = {
	firstActionTick: MTTA_GRACE_TICKS,
	maxTicks: 60,
	wrongActions: 0,
	slaBreachWindows: 0,
	hintsUsed: 0,
};

describe("FR-F scoring constants match the PRD", () => {
	it("uses the documented weights", () => {
		expect(BASE_SCORE).toBe(100);
		expect(MTTA_GRACE_TICKS).toBe(3);
		expect(WRONG_ACTION_PENALTY).toBe(5);
		expect(SLA_BREACH_PENALTY).toBe(10);
		expect(HINT_PENALTY).toBe(5);
	});
});

describe("FR-F MTTA penalty", () => {
	it.each([
		[1, 0, 100],
		[2, 0, 100],
		[3, 0, 100],
		[4, 1, 99],
		[5, 2, 98],
		[13, 10, 90],
	] as const)(
		"first action at tick %i costs %i points (total %i)",
		(firstActionTick, penalty, total) => {
			const score = computeScore({ ...neutral, firstActionTick });
			expect(score.mttaPenalty).toBe(penalty);
			expect(score.total).toBe(total);
		},
	);

	it("charges the whole tick budget when no action was taken", () => {
		const score = computeScore({ ...neutral, firstActionTick: null, maxTicks: 60 });
		expect(score.mttaTicks).toBe(60);
		expect(score.mttaPenalty).toBe(57);
	});
});

describe("FR-F penalties stack", () => {
	it("charges five per wrong action", () => {
		expect(computeScore({ ...neutral, wrongActions: 4 }).total).toBe(80);
	});

	it("charges ten per SLA breach window", () => {
		expect(computeScore({ ...neutral, slaBreachWindows: 3 }).total).toBe(70);
	});

	it("charges five per hint", () => {
		expect(computeScore({ ...neutral, hintsUsed: 5 }).total).toBe(75);
	});

	it("combines every penalty and reports each line", () => {
		const score = computeScore({
			firstActionTick: 9,
			maxTicks: 60,
			wrongActions: 2,
			slaBreachWindows: 1,
			hintsUsed: 1,
		});
		expect(score).toMatchObject({
			base: 100,
			mttaPenalty: 6,
			wrongActionPenalty: 10,
			slaPenalty: 10,
			hintPenalty: 5,
			total: 69,
			grade: "C",
		});
	});

	it("clamps at zero and never exceeds one hundred", () => {
		const worst = computeScore({
			firstActionTick: 600,
			maxTicks: 600,
			wrongActions: 40,
			slaBreachWindows: 60,
			hintsUsed: 20,
		});
		expect(worst.total).toBe(0);
		expect(worst.grade).toBe("F");

		const best = computeScore({ ...neutral, firstActionTick: 0 });
		expect(best.total).toBe(100);
	});
});

describe("FR-F grade bands", () => {
	it.each([
		[100, "A"],
		[90, "A"],
		[89, "B"],
		[75, "B"],
		[74, "C"],
		[60, "C"],
		[59, "D"],
		[40, "D"],
		[39, "F"],
		[0, "F"],
	] as const)("%i is grade %s", (total, grade) => {
		expect(gradeFor(total)).toBe(grade);
	});
});

describe("FR-F SLA breach windows", () => {
	it("spans ten ticks per window", () => {
		expect(SLA_WINDOW_TICKS).toBe(10);
	});

	it("charges a window once however many critical ticks it holds", () => {
		const ticks = [
			{ tick: 1, breached: true },
			{ tick: 2, breached: true },
			{ tick: 3, breached: true },
		];
		expect(countSlaBreachWindows(ticks)).toBe(1);
	});

	it("charges each separate window", () => {
		const ticks = [
			{ tick: 1, breached: true },
			{ tick: 11, breached: true },
			{ tick: 21, breached: true },
		];
		expect(countSlaBreachWindows(ticks)).toBe(3);
	});

	it("ignores healthy ticks and tick zero", () => {
		expect(
			countSlaBreachWindows([
				{ tick: 0, breached: true },
				{ tick: 5, breached: false },
			]),
		).toBe(0);
	});
});

/**
 * Documented expectations. Each timeline is fixed, so the score is a contract:
 * if the engine changes, these numbers must change with a deliberate decision.
 */
const TIMELINES = {
	fast: "first required action on tick 1, the next one tick later",
	grace: "first required action on tick 3 (the last free tick)",
	slow: "first required action on tick 10",
	wrong: "one wrong action on tick 2, then the required ones from tick 3",
} as const;

describe("FR-F built-in scenarios produce documented scores", () => {
	it.each([
		{
			name: "Expired deploy token",
			timeline: "fast",
			expected: { total: 100, grade: "A", mtta: 1, mttr: 2, sla: 0, wrong: 0 },
		},
		{
			name: "Expired deploy token",
			timeline: "grace",
			expected: { total: 100, grade: "A", mtta: 3, mttr: 4, sla: 0, wrong: 0 },
		},
		{
			name: "Expired deploy token",
			timeline: "slow",
			expected: { total: 93, grade: "A", mtta: 10, mttr: 11, sla: 0, wrong: 0 },
		},
		{
			name: "Expired deploy token",
			timeline: "wrong",
			expected: { total: 95, grade: "A", mtta: 2, mttr: 4, sla: 0, wrong: 1 },
		},
		{
			name: "Queue backpressure",
			timeline: "fast",
			expected: { total: 90, grade: "A", mtta: 1, mttr: 2, sla: 1, wrong: 0 },
		},
		{
			name: "Queue backpressure",
			timeline: "slow",
			expected: { total: 73, grade: "C", mtta: 10, mttr: 11, sla: 2, wrong: 0 },
		},
		{
			name: "Database failover",
			timeline: "fast",
			expected: { total: 90, grade: "A", mtta: 1, mttr: 1, sla: 1, wrong: 0 },
		},
		{
			name: "Database failover",
			timeline: "slow",
			expected: { total: 83, grade: "B", mtta: 10, mttr: 10, sla: 1, wrong: 0 },
		},
	] as const)("$name with the $timeline timeline scores $expected.total", ({
		name,
		timeline,
		expected,
	}) => {
		const scenario = BUILTIN_SCENARIOS.find((entry) => entry.name === name);
		if (!scenario) throw new Error(`missing built-in scenario ${name}`);

		const required = scenario.definition.requiredActions;
		const actions =
			timeline === "fast"
				? required.map((type, index) => ({ tick: 1 + index, type }))
				: timeline === "grace"
					? required.map((type, index) => ({ tick: 3 + index, type }))
					: timeline === "slow"
						? required.map((type, index) => ({ tick: 10 + index, type }))
						: [
								{
									tick: 2,
									type: (required[0] === "scale_up"
										? "failover_db"
										: "scale_up") as (typeof required)[number],
								},
								...required.map((type, index) => ({ tick: 3 + index, type })),
							];

		const run = runScenario({ definition: scenario.definition, actions });
		expect({
			total: run.score.total,
			grade: run.score.grade,
			mtta: run.mttaTicks,
			mttr: run.mttrTicks,
			sla: run.slaBreachWindows,
			wrong: run.wrongActions,
		}).toEqual(expected);
	});

	it("names every timeline in the table above", () => {
		expect(Object.keys(TIMELINES)).toEqual(["fast", "grace", "slow", "wrong"]);
	});
});
