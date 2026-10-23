import { describe, expect, it } from "vitest";
import { computeScore } from "#/engine";
import {
	buildFixList,
	readinessSummary,
	recommendNext,
	type RunSummary,
} from "#/lib/readiness";

function run(
	id: string,
	createdAt: string,
	score: number | null,
	scenarioId = "s1",
): RunSummary {
	return {
		id,
		scenarioId,
		scenarioName: `scenario ${scenarioId}`,
		state: score === null ? "RUNNING" : "EVALUATED",
		createdAt,
		score: score === null ? null : { total: score, grade: "C" },
	};
}

const breakdown = computeScore({
	firstActionTick: 2,
	maxTicks: 60,
	wrongActions: 0,
	slaBreachWindows: 0,
	hintsUsed: 0,
});

describe("readiness summary", () => {
	it("is empty when nothing has been graded", () => {
		const summary = readinessSummary([run("a", "2026-01-01T00:00:00Z", null)]);
		expect(summary.average).toBeNull();
		expect(summary.latest).toBeNull();
		expect(summary.delta).toBeNull();
		expect(summary.gradedCount).toBe(0);
		expect(summary.trend).toEqual([]);
	});

	it("orders runs by createdAt, not by the order the list arrives in", () => {
		const summary = readinessSummary([
			run("new", "2026-01-03T00:00:00Z", 90),
			run("old", "2026-01-01T00:00:00Z", 60),
			run("mid", "2026-01-02T00:00:00Z", 70),
		]);
		expect(summary.trend.map((entry) => entry.score)).toEqual([60, 70, 90]);
		expect(summary.latest).toBe(90);
		expect(summary.delta).toBe(20);
		expect(summary.average).toBe(73);
	});

	it("averages only the last five graded runs", () => {
		const runs = [50, 60, 70, 80, 90, 100].map((score, index) =>
			run(String(index), `2026-01-0${index + 1}T00:00:00Z`, score),
		);
		const summary = readinessSummary(runs);
		expect(summary.average).toBe(80);
		expect(summary.gradedCount).toBe(6);
		expect(summary.trend).toHaveLength(6);
	});

	it("keeps the newest six runs in the trend", () => {
		const runs = Array.from({ length: 8 }, (_, index) =>
			run(String(index), `2026-01-0${index + 1}T00:00:00Z`, 40 + index),
		);
		expect(readinessSummary(runs).trend.map((entry) => entry.score)).toEqual([
			42, 43, 44, 45, 46, 47,
		]);
	});

	it("ignores an open drill in the average", () => {
		const summary = readinessSummary([
			run("open", "2026-01-03T00:00:00Z", null),
			run("done", "2026-01-02T00:00:00Z", 80),
		]);
		expect(summary.average).toBe(80);
		expect(summary.gradedCount).toBe(1);
	});
});

describe("next drill", () => {
	const scenarios = [
		{
			id: "s1",
			name: "Queue backpressure",
			status: "READY",
			requiredActionCount: 2,
		},
		{
			id: "s2",
			name: "Token expiry",
			status: "READY",
			requiredActionCount: 1,
		},
		{ id: "s3", name: "Draft only", status: "DRAFT", requiredActionCount: 1 },
	];

	it("returns null when there is no READY scenario", () => {
		expect(
			recommendNext(
				[
					{
						id: "s3",
						name: "Draft",
						status: "DRAFT",
						requiredActionCount: 1,
					},
				],
				[],
			),
		).toBeNull();
	});

	it("skips a scenario with nothing to decide when another exists", () => {
		const choice = recommendNext(
			[
				{
					id: "empty",
					name: "Empty",
					status: "READY",
					requiredActionCount: 0,
				},
				...scenarios,
			],
			[],
		);
		expect(choice?.scenarioId).toBe("s1");
	});

	it("still returns the only READY scenario when it has no actions", () => {
		const choice = recommendNext(
			[
				{
					id: "empty",
					name: "Empty",
					status: "READY",
					requiredActionCount: 0,
				},
			],
			[],
		);
		expect(choice?.scenarioId).toBe("empty");
	});

	it("prefers a scenario that was never graded", () => {
		const choice = recommendNext(scenarios, [
			run("a", "2026-01-01T00:00:00Z", 70, "s1"),
		]);
		expect(choice?.scenarioId).toBe("s2");
		expect(choice?.reason).toBe("new");
	});

	it("falls back to the lowest last score", () => {
		const choice = recommendNext(scenarios, [
			run("a", "2026-01-01T00:00:00Z", 88, "s1"),
			run("b", "2026-01-02T00:00:00Z", 61, "s2"),
			run("c", "2026-01-03T00:00:00Z", 74, "s2"),
		]);
		expect(choice?.scenarioId).toBe("s2");
		expect(choice?.reason).toBe("weakest");
		expect(choice?.lastScore).toBe(74);
	});

	it("never recommends a draft", () => {
		const choice = recommendNext(scenarios, []);
		expect(choice?.scenarioId).toBe("s1");
	});
});

describe("fix list", () => {
	it("lists every missed required action", () => {
		const fixes = buildFixList({
			requiredActions: ["scale_up", "rotate_token"],
			performedActions: ["scale_up"],
			wrongActions: 0,
			breakdown,
		});
		expect(fixes).toEqual([{ id: "missed", action: "rotate_token" }]);
	});

	it("orders the loss sources by what the operator controls", () => {
		const fixes = buildFixList({
			requiredActions: ["failover_db"],
			performedActions: [],
			wrongActions: 2,
			breakdown: computeScore({
				firstActionTick: 9,
				maxTicks: 60,
				wrongActions: 2,
				slaBreachWindows: 2,
				hintsUsed: 0,
			}),
		});
		expect(fixes.map((fix) => fix.id)).toEqual([
			"missed",
			"wrong",
			"mtta",
			"sla",
		]);
	});

	it("is clean when nothing was lost", () => {
		expect(
			buildFixList({
				requiredActions: ["scale_up"],
				performedActions: ["scale_up"],
				wrongActions: 0,
				breakdown,
			}),
		).toEqual([{ id: "clean" }]);
	});
});
