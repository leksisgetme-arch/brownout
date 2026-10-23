import { describe, expect, it } from "vitest";
import {
	ALLOWED_TRANSITIONS,
	DRILL_STATES,
	transition,
	type DrillState,
	type TransitionContext,
} from "#/engine";

const open: TransitionContext = {
	tick: 0,
	maxTicks: 60,
	validationPassed: true,
	requiredActionsSatisfied: true,
};

/** The table from PRD section C, written out independently of the source. */
const PRD_TABLE: Array<[DrillState, DrillState]> = [
	["DRAFT", "READY"],
	["READY", "RUNNING"],
	["RUNNING", "PAUSED"],
	["PAUSED", "RUNNING"],
	["RUNNING", "RESOLVED"],
	["RUNNING", "FAILED"],
	["RESOLVED", "EVALUATED"],
	["FAILED", "EVALUATED"],
	["RUNNING", "READY"],
	["PAUSED", "READY"],
];

function isInTable(from: DrillState, to: DrillState): boolean {
	return PRD_TABLE.some(([a, b]) => a === from && b === to);
}

describe("FR-C the transition table matches the PRD exactly", () => {
	it.each(
		DRILL_STATES.flatMap((from) => DRILL_STATES.map((to) => [from, to] as const)),
	)("%s -> %s", (from, to) => {
		const expected = isInTable(from, to);
		const result = transition(from, to, {
			...open,
			tick: from === "RUNNING" && to === "FAILED" ? open.maxTicks + 1 : 0,
		});
		expect(result.ok).toBe(expected);
		if (!expected) {
			expect(result).toMatchObject({ ok: false, code: "E-STATE-409" });
		}
	});

	it("declares no transitions out of EVALUATED", () => {
		expect(ALLOWED_TRANSITIONS.EVALUATED).toEqual([]);
	});
});

describe("FR-C transition conditions", () => {
	it("refuses DRAFT -> READY while validation has not passed", () => {
		const result = transition("DRAFT", "READY", { ...open, validationPassed: false });
		expect(result).toMatchObject({ ok: false, code: "E-STATE-409" });
	});

	it("refuses RUNNING -> RESOLVED while required actions are missing", () => {
		const result = transition("RUNNING", "RESOLVED", {
			...open,
			requiredActionsSatisfied: false,
		});
		expect(result).toMatchObject({ ok: false, code: "E-STATE-409" });
	});

	it("refuses RUNNING -> FAILED at exactly the tick limit", () => {
		expect(
			transition("RUNNING", "FAILED", { ...open, tick: 60, maxTicks: 60 }).ok,
		).toBe(false);
	});

	it("allows RUNNING -> FAILED once the limit is passed", () => {
		expect(
			transition("RUNNING", "FAILED", { ...open, tick: 61, maxTicks: 60 }).ok,
		).toBe(true);
	});
});

describe("FR-C a rejected transition never changes the state", () => {
	it("echoes the original state back", () => {
		const result = transition("PAUSED", "EVALUATED", open);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.from).toBe("PAUSED");
			expect(result.to).toBe("EVALUATED");
			expect(result.reason).toContain("not allowed");
		}
	});
});

describe("FR-C a full run walks the table in order", () => {
	it("runs DRAFT -> READY -> RUNNING -> RESOLVED -> EVALUATED", () => {
		const path: DrillState[] = ["DRAFT", "READY", "RUNNING", "RESOLVED", "EVALUATED"];
		for (let index = 0; index < path.length - 1; index += 1) {
			const result = transition(path[index] as DrillState, path[index + 1] as DrillState, {
				...open,
				tick: 5,
			});
			expect(result.ok).toBe(true);
		}
	});
});
