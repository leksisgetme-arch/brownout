import { describe, expect, it } from "vitest";
import {
	evaluateLoginLimit,
	LOGIN_MAX_FAILURES,
	LOGIN_WINDOW_MS,
} from "#/lib/login-limit";
import { RATE_LIMIT_WINDOW_MS } from "#/lib/rate-limit";

const now = Date.UTC(2026, 5, 1, 12, 0, 0);

describe("login throttle", () => {
	it("allows attempts while under the failure budget", () => {
		for (let count = 0; count < LOGIN_MAX_FAILURES; count += 1) {
			const hits = Array.from(
				{ length: count },
				(_, index) => now - index * 1000,
			);
			expect(evaluateLoginLimit(hits, now).allowed).toBe(true);
		}
	});

	it("blocks once the failure budget is spent", () => {
		const hits = Array.from(
			{ length: LOGIN_MAX_FAILURES },
			(_, index) => now - index * 1000,
		);
		const decision = evaluateLoginLimit(hits, now);
		expect(decision.allowed).toBe(false);
		expect(decision.remaining).toBe(0);
	});

	it("reports a Retry-After inside the login window", () => {
		const hits = Array.from(
			{ length: LOGIN_MAX_FAILURES },
			(_, index) => now - index * 1000,
		);
		const decision = evaluateLoginLimit(hits, now);
		expect(decision.retryAfterSeconds).toBeGreaterThan(0);
		expect(decision.retryAfterSeconds).toBeLessThanOrEqual(
			LOGIN_WINDOW_MS / 1000,
		);
	});

	it("forgets failures older than the login window", () => {
		const stale = Array.from(
			{ length: LOGIN_MAX_FAILURES },
			(_, index) => now - LOGIN_WINDOW_MS - 1000 - index,
		);
		expect(evaluateLoginLimit(stale, now).allowed).toBe(true);
	});

	it("uses a longer window than the drill-start budget", () => {
		expect(LOGIN_WINDOW_MS).toBeGreaterThan(RATE_LIMIT_WINDOW_MS);
	});
});
