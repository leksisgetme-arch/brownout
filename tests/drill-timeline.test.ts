import { describe, expect, it } from "vitest";
import { runLogLine } from "#/lib/drill-timeline";
import { t } from "#/lib/i18n/messages";

const translate = (
	key: Parameters<typeof t>[1],
	vars?: Record<string, string | number>,
) => t("en", key, vars);

describe("engine log timeline", () => {
	it("marks a dead letter as amber and keeps the failure reason", () => {
		const line = runLogLine(
			{
				kind: "delivery",
				tick: 51,
				seq: 4,
				attempt: 3,
				status: "dead_letter",
				failure: "drop",
				released: [],
				type: "queue.backlog",
			},
			translate,
		);
		expect(line).not.toBeNull();
		expect(line?.text).toBe("delivery #4 · dead_letter (drop)");
		expect(line?.tone).toBe("text-amber");
		expect(line?.tick).toBe(51);
	});

	it("treats a delivered attempt as neutral", () => {
		const line = runLogLine(
			{
				kind: "delivery",
				tick: 6,
				seq: 1,
				attempt: 1,
				status: "delivered",
				failure: null,
				released: [],
				type: "queue.backlog",
			},
			translate,
		);
		expect(line?.text).toBe("delivery #1 · delivered");
		expect(line?.tone).toBe("text-ink-2");
	});

	it("labels a wrong mitigation and colours it like a warning", () => {
		const line = runLogLine(
			{
				kind: "action",
				tick: 31,
				action: "restart_worker",
				correct: false,
				code: null,
				wrongActions: 1,
			},
			translate,
		);
		expect(line?.text).toBe("action restart_worker · wrong action");
		expect(line?.tone).toBe("text-amber");
	});

	it("marks a resolved state as success", () => {
		const line = runLogLine(
			{
				kind: "state",
				tick: 84,
				from: "RUNNING",
				to: "RESOLVED",
				code: null,
				reason: null,
			},
			translate,
		);
		expect(line?.text).toBe("state RUNNING → RESOLVED");
		expect(line?.tone).toBe("text-teal");
	});

	it("drops metric samples: they belong in the chart, not the feed", () => {
		const line = runLogLine(
			{
				kind: "metrics",
				tick: 5,
				errorRate: 0.2,
				latencyMs: 900,
				queueDepth: 120,
				breached: true,
			},
			translate,
		);
		expect(line).toBeNull();
	});
});
