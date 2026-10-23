/** Rate limit is intentionally small so a 429 is cheap to test (PRD FR-I2). */
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 60_000;

export interface RateLimitDecision {
	allowed: boolean;
	retryAfterSeconds: number;
	remaining: number;
}

export interface RateLimitOptions {
	limit: number;
	windowMs: number;
}

/**
 * Pure decision function: the caller supplies the hit timestamps and "now", so
 * the result is reproducible in tests. The budget can be overridden for other
 * limits (login failures use a longer window than drill starts).
 */
export function evaluateRateLimit(
	hits: readonly number[],
	nowMs: number,
	options: RateLimitOptions = {
		limit: RATE_LIMIT_MAX,
		windowMs: RATE_LIMIT_WINDOW_MS,
	},
): RateLimitDecision {
	const recent = hits
		.filter((hit) => nowMs - hit < options.windowMs && hit <= nowMs)
		.sort((a, b) => a - b);

	if (recent.length < options.limit) {
		return {
			allowed: true,
			retryAfterSeconds: 0,
			remaining: options.limit - recent.length,
		};
	}

	const oldest = recent[0] ?? nowMs;
	const retryAfterSeconds = Math.max(
		1,
		Math.ceil((oldest + options.windowMs - nowMs) / 1000),
	);

	return { allowed: false, retryAfterSeconds, remaining: 0 };
}
