import { describe, expect, it } from "vitest";
import { evaluateRateLimit, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "#/lib/rate-limit";

const now = Date.UTC(2026, 5, 1, 0, 0, 0);

describe("evaluateRateLimit", () => {
  it("allows the first five hits in a window", () => {
    for (let count = 0; count < RATE_LIMIT_MAX; count += 1) {
      const hits = Array.from({ length: count }, (_, index) => now - index * 1000);
      expect(evaluateRateLimit(hits, now).allowed).toBe(true);
    }
  });

  it("blocks the sixth hit and reports Retry-After", () => {
    const hits = Array.from({ length: RATE_LIMIT_MAX }, (_, index) => now - index * 1000);
    const decision = evaluateRateLimit(hits, now);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("ignores hits outside the window", () => {
    const stale = Array.from(
      { length: RATE_LIMIT_MAX },
      (_, index) => now - RATE_LIMIT_WINDOW_MS - 1000 - index,
    );
    expect(evaluateRateLimit(stale, now).allowed).toBe(true);
  });

  it("counts only the recent hits", () => {
    const hits = [
      now - RATE_LIMIT_WINDOW_MS - 1,
      now - 4000,
      now - 3000,
      now - 2000,
      now - 1000,
    ];
    expect(evaluateRateLimit(hits, now).allowed).toBe(true);
  });

  it("computes the oldest hit for Retry-After", () => {
    const hits = Array.from({ length: RATE_LIMIT_MAX }, (_, index) => now - index * 1000);
    const decision = evaluateRateLimit(hits, now);
    // The oldest hit is four seconds old, so the window frees up in 56 seconds.
    expect(decision.retryAfterSeconds).toBe(56);
  });
});
