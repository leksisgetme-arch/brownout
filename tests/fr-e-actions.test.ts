import { describe, expect, it } from "vitest";
import {
	applyAction,
	initialProgress,
	requiredActionsSatisfied,
} from "#/engine";
import type { ActionType, DrillState } from "#/engine/types";

function running(required: ActionType[], tick = 1) {
	return { ...initialProgress(required), state: "RUNNING" as DrillState, tick };
}

describe("FR-E mitigation actions", () => {
	it.each([
		"restart_worker",
		"scale_up",
		"rotate_token",
		"enable_circuit_breaker",
		"failover_db",
	] as const)("accepts %s while RUNNING", (action) => {
		const result = applyAction(running([action]), action);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.correct).toBe(true);
			expect(result.requiredActionsSatisfied).toBe(true);
		}
	});

	it("records a wrong action and penalises it", () => {
		const result = applyAction(running(["failover_db"]), "scale_up");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.correct).toBe(false);
			expect(result.progress.wrongActions).toBe(1);
			expect(result.requiredActionsSatisfied).toBe(false);
		}
	});

	it("counts a repeated correct action as wrong", () => {
		const first = applyAction(running(["rotate_token"]), "rotate_token");
		if (!first.ok) throw new Error("expected ok");
		const second = applyAction(first.progress, "rotate_token");
		expect(second.ok).toBe(true);
		if (second.ok) {
			expect(second.correct).toBe(false);
			expect(second.progress.wrongActions).toBe(1);
		}
	});

	it("records the first action tick only once", () => {
		const first = applyAction(running(["scale_up"], 4), "scale_up");
		if (!first.ok) throw new Error("expected ok");
		const second = applyAction({ ...first.progress, tick: 9 }, "failover_db");
		if (!second.ok) throw new Error("expected ok");
		expect(second.progress.firstActionTick).toBe(4);
	});

	it.each(["PAUSED", "READY", "RESOLVED", "FAILED", "EVALUATED"] as const)(
		"rejects actions while %s with E-STATE-409 and leaves progress untouched",
		(state) => {
			const progress = { ...initialProgress(["scale_up"]), state, tick: 5 };
			const result = applyAction(progress, "scale_up");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.code).toBe("E-STATE-409");
				expect(result.progress).toEqual(progress);
			}
		},
	);

	it("rejects an unknown action with E-INPUT-400", () => {
		const result = applyAction(running(["scale_up"]), "reboot_everything" as ActionType);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe("E-INPUT-400");
	});

	it("reports satisfaction only when every required action has run", () => {
		const start = running(["scale_up", "enable_circuit_breaker"]);
		expect(requiredActionsSatisfied(start)).toBe(false);

		const one = applyAction(start, "scale_up");
		if (!one.ok) throw new Error("expected ok");
		expect(one.requiredActionsSatisfied).toBe(false);

		const two = applyAction(one.progress, "enable_circuit_breaker");
		if (!two.ok) throw new Error("expected ok");
		expect(two.requiredActionsSatisfied).toBe(true);
	});

	it("treats a scenario without required actions as satisfied", () => {
		expect(requiredActionsSatisfied(initialProgress([]))).toBe(true);
	});
});
