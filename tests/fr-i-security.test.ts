import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	BUILTIN_SCENARIOS,
	MAX_EVENTS,
	MAX_PAYLOAD_BYTES,
	SANDBOX_RECEIVER_ID,
	scheduleDeliveries,
	validateScenario,
} from "#/engine";
import {
	evaluateRateLimit,
	RATE_LIMIT_MAX,
	RATE_LIMIT_WINDOW_MS,
} from "#/lib/rate-limit";

const ENGINE_DIR = join(process.cwd(), "src", "engine");

describe("FR-I1 there is no free-form delivery target", () => {
	it("only the sandbox receiver id is accepted", () => {
		expect(SANDBOX_RECEIVER_ID).toBe("sandbox://brownout/receiver");
	});

	it.each(BUILTIN_SCENARIOS.map((entry) => [entry.name, entry] as const))(
		"%s targets the sandbox receiver on every event",
		(_name, entry) => {
			for (const event of entry.definition.events) {
				expect(event.target).toBe(SANDBOX_RECEIVER_ID);
			}
		},
	);

	it("never carries a target through the delivery schedule", () => {
		const planned = scheduleDeliveries(BUILTIN_SCENARIOS[0]?.definition ?? {
			schemaVersion: 1,
			seed: 0,
			maxTicks: 10,
			metrics: { errorRate: 0, latencyMs: 0, queueDepth: 0 },
			requiredActions: [],
			events: [],
		});
		for (const attempt of planned) {
			expect(JSON.stringify(attempt)).not.toMatch(/https?:\/\//);
			expect(Object.keys(attempt)).not.toContain("target");
		}
	});

	it("rejects private-network and metadata URLs", () => {
		for (const target of [
			"http://169.254.169.254/latest/meta-data",
			"http://localhost:5432",
			"https://evil.example/hook",
		]) {
			const result = validateScenario({
				name: "SSRF attempt",
				seed: 1,
				maxTicks: 10,
				events: [{ tick: 1, type: "p", target }],
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.errors.map((error) => error.code)).toContain("E-BLD-TARGET");
			}
		}
	});

	it("keeps the engine free of network calls", () => {
		const sources = readdirSync(ENGINE_DIR)
			.filter((file) => file.endsWith(".ts"))
			.map((file) => readFileSync(join(ENGINE_DIR, file), "utf8"));

		for (const source of sources) {
			expect(source).not.toMatch(/\bfetch\s*\(/);
			expect(source).not.toMatch(/node:https?/);
			expect(source).not.toMatch(/\bXMLHttpRequest\b/);
		}
	});
});

describe("FR-I2 rate limit of five drill starts per minute", () => {
	const now = 1_000_000;

	// The decision runs before the new hit is stored, so "4 stored hits" means
	// the fifth start is the last one allowed inside the window.
	it("allows the fifth start and reports one slot left before it", () => {
		const hits = [now - 4000, now - 3000, now - 2000, now - 1000];
		const decision = evaluateRateLimit(hits, now);
		expect(decision.allowed).toBe(true);
		expect(decision.remaining).toBe(1);
	});

	it("blocks the sixth start and returns a positive Retry-After", () => {
		const hits = [now - 4000, now - 3000, now - 2000, now - 1000, now];
		const decision = evaluateRateLimit(hits, now);
		expect(decision.allowed).toBe(false);
		expect(decision.retryAfterSeconds).toBeGreaterThan(0);
		expect(decision.retryAfterSeconds).toBeLessThanOrEqual(
			RATE_LIMIT_WINDOW_MS / 1000,
		);
	});

	it("counts only hits inside the rolling window", () => {
		const stale = now - RATE_LIMIT_WINDOW_MS - 1;
		const decision = evaluateRateLimit([stale, stale, stale, stale, stale], now);
		expect(decision.allowed).toBe(true);
		expect(decision.remaining).toBe(RATE_LIMIT_MAX);
	});

	it("recovers once the whole window has rolled past", () => {
		const hits = [now - 4000, now - 3000, now - 2000, now - 1000, now];
		expect(evaluateRateLimit(hits, now).allowed).toBe(false);
		expect(evaluateRateLimit(hits, now + RATE_LIMIT_WINDOW_MS).allowed).toBe(true);
	});
});

describe("FR-I3 payload and event ceilings", () => {
	it("caps events at twenty", () => {
		expect(MAX_EVENTS).toBe(20);
	});

	it("caps payloads at four kilobytes", () => {
		expect(MAX_PAYLOAD_BYTES).toBe(4096);
	});

	it("rejects a scenario that breaks both ceilings at once", () => {
		const events = Array.from({ length: 21 }, (_, index) => ({
			tick: index,
			type: "flood",
			payload: { blob: "x".repeat(5000) },
		}));
		const result = validateScenario({
			name: "Flood",
			seed: 1,
			maxTicks: 60,
			events,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			const codes = result.errors.map((error) => error.code);
			expect(codes).toContain("E-BLD-EVENTS");
			expect(codes).toContain("E-BLD-PAYLOAD");
		}
	});
});
