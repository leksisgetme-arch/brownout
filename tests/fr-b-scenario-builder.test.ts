import { describe, expect, it } from "vitest";
import {
	MAX_EVENTS,
	MAX_PAYLOAD_BYTES,
	NAME_MAX_LENGTH,
	NAME_MIN_LENGTH,
	SANDBOX_RECEIVER_ID,
	TICKS_MAX,
	TICKS_MIN,
	validateScenario,
	type ScenarioInput,
} from "#/engine";

function input(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
	return {
		name: "Edge case drill",
		seed: 42,
		maxTicks: 60,
		events: [{ tick: 1, type: "ping", payload: { ok: true }, failure: null }],
		requiredActions: ["scale_up"],
		...overrides,
	};
}

function codes(result: ReturnType<typeof validateScenario>): string[] {
	return result.ok ? [] : result.errors.map((error) => error.code);
}

describe("FR-B1 name length", () => {
	it.each([
		[NAME_MIN_LENGTH, true],
		[NAME_MAX_LENGTH, true],
		[NAME_MIN_LENGTH - 1, false],
		[NAME_MAX_LENGTH + 1, false],
	] as const)("accepts a %i character name: %s", (length, accepted) => {
		const result = validateScenario(input({ name: "a".repeat(length) }));
		expect(result.ok).toBe(accepted);
		if (!accepted) expect(codes(result)).toContain("E-BLD-NAME");
	});

	it("trims surrounding whitespace before measuring", () => {
		expect(validateScenario(input({ name: "  ab  " })).ok).toBe(false);
		expect(validateScenario(input({ name: "  abc  " })).ok).toBe(true);
	});
});

describe("FR-B2 tick limit", () => {
	it.each([
		[TICKS_MIN, true],
		[TICKS_MAX, true],
		[TICKS_MIN - 1, false],
		[TICKS_MAX + 1, false],
		[60.5, false],
	] as const)("accepts maxTicks %s: %s", (maxTicks, accepted) => {
		const result = validateScenario(
			input({ maxTicks, events: [{ tick: 1, type: "ping" }] }),
		);
		expect(result.ok).toBe(accepted);
		if (!accepted) expect(codes(result)).toContain("E-BLD-TICKS");
	});

	it("rejects an event beyond the tick limit", () => {
		const result = validateScenario(
			input({ maxTicks: 10, events: [{ tick: 11, type: "late" }] }),
		);
		expect(codes(result)).toContain("E-BLD-EVENTS");
	});
});

describe("FR-B3 event count and payload size", () => {
	const events = (count: number) =>
		Array.from({ length: count }, (_, index) => ({
			tick: index,
			type: `evt.${index}`,
			payload: {},
		}));

	it.each([
		[MAX_EVENTS, true],
		[MAX_EVENTS + 1, false],
	] as const)("accepts %i events: %s", (count, accepted) => {
		const result = validateScenario(input({ events: events(count) }));
		expect(result.ok).toBe(accepted);
		if (!accepted) expect(codes(result)).toContain("E-BLD-EVENTS");
	});

	it("measures the payload in UTF-8 bytes, not characters", () => {
		// 2048 two-byte characters serialise to 4096 bytes plus the JSON wrapper.
		const payload = { k: "é".repeat(2044) };
		const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
		expect(bytes).toBe(MAX_PAYLOAD_BYTES);
		expect(
			validateScenario(input({ events: [{ tick: 1, type: "p", payload }] })).ok,
		).toBe(true);

		const over = { k: "é".repeat(2045) };
		const overBytes = new TextEncoder().encode(JSON.stringify(over)).length;
		expect(overBytes).toBe(MAX_PAYLOAD_BYTES + 2);
		expect(
			codes(
				validateScenario(input({ events: [{ tick: 1, type: "p", payload: over }] })),
			),
		).toContain("E-BLD-PAYLOAD");
	});

	it("rejects invalid JSON text", () => {
		expect(
			codes(
				validateScenario(
					input({ events: [{ tick: 1, type: "p", payload: "{not json" }] }),
				),
			),
		).toContain("E-BLD-JSON");
	});

	it("rejects a JSON payload that is not an object", () => {
		expect(
			codes(validateScenario(input({ events: [{ tick: 1, type: "p", payload: "[1,2]" }] }))),
		).toContain("E-BLD-PAYLOAD");
	});
});

describe("FR-B4 failure types", () => {
	it.each(["http500", "timeout", "duplicate", "out_of_order", "drop", null] as const)(
		"accepts failure %s",
		(failure) => {
			expect(
				validateScenario(input({ events: [{ tick: 1, type: "p", failure }] })).ok,
			).toBe(true);
		},
	);

	it("rejects an unknown failure type", () => {
		expect(
			codes(
				validateScenario(input({ events: [{ tick: 1, type: "p", failure: "segfault" }] })),
			),
		).toContain("E-BLD-FAILURE");
	});
});

describe("FR-B5 sandbox-only target", () => {
	it("defaults the target to the sandbox receiver", () => {
		const result = validateScenario(input());
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.events[0]?.target).toBe(SANDBOX_RECEIVER_ID);
	});

	it.each([
		"https://example.com/hook",
		"http://169.254.169.254/latest/meta-data",
		"sandbox://brownout/other",
	])("rejects %s with E-BLD-TARGET", (target) => {
		expect(
			codes(validateScenario(input({ events: [{ tick: 1, type: "p", target }] }))),
		).toContain("E-BLD-TARGET");
	});
});

describe("FR-B6 hostile text is stored verbatim", () => {
	it("keeps HTML and script text as data", () => {
		const hostile = "<script>alert('x')</script>";
		const result = validateScenario(
			input({ events: [{ tick: 1, type: hostile, payload: { note: hostile } }] }),
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.events[0]?.type).toBe(hostile);
			expect(result.value.events[0]?.payload.note).toBe(hostile);
		}
	});
});

describe("FR-B7 DRAFT to READY needs a valid scenario", () => {
	it("returns no errors for a valid scenario", () => {
		expect(validateScenario(input()).ok).toBe(true);
	});

	it("returns every error at once instead of stopping at the first", () => {
		const result = validateScenario(
			input({
				name: "x",
				maxTicks: 2,
				events: [{ tick: 99, type: "p", failure: "nope", target: "https://x" }],
			}),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(4);
	});

	it("sorts events by tick so the schedule is stable", () => {
		const result = validateScenario(
			input({
				events: [
					{ tick: 9, type: "late" },
					{ tick: 2, type: "early" },
					{ tick: 5, type: "middle" },
				],
			}),
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.events.map((event) => event.tick)).toEqual([2, 5, 9]);
		}
	});

	it("keeps the original order for events sharing a tick", () => {
		const result = validateScenario(
			input({
				events: [
					{ tick: 3, type: "first" },
					{ tick: 3, type: "second" },
				],
			}),
		);
		if (!result.ok) throw new Error("expected a valid scenario");
		expect(result.value.events.map((event) => event.type)).toEqual([
			"first",
			"second",
		]);
	});
});
