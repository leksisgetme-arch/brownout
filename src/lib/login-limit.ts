import { evaluateRateLimit } from "./rate-limit";

/**
 * Failed sign-ins are throttled separately from drill starts: credential
 * stuffing is slower and more patient than clicking Start, so the window is
 * longer and the limit is per email address.
 */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 5 * 60_000;

export function evaluateLoginLimit(hits: readonly number[], nowMs: number) {
	return evaluateRateLimit(hits, nowMs, {
		limit: LOGIN_MAX_FAILURES,
		windowMs: LOGIN_WINDOW_MS,
	});
}
