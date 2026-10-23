import type { Role } from "#/engine/types";

/**
 * Pure authentication and authorisation rules. No database, no clock, no
 * randomness: every function here is unit tested without mocks.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;

// Intentionally conservative: one @, no whitespace, a dot in the domain.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthRuleCode = "E-AUTH-002" | "E-AUTH-003" | "E-ROLE-403";

export type RuleResult<T> =
	| { ok: true; value: T }
	| { ok: false; code: AuthRuleCode; message: string };

export function validateEmail(raw: string): RuleResult<string> {
	const email = raw.trim().toLowerCase();

	if (
		email.length === 0 ||
		email.length > EMAIL_MAX_LENGTH ||
		!EMAIL_PATTERN.test(email)
	) {
		return {
			ok: false,
			code: "E-AUTH-002",
			message: "Enter a valid email address.",
		};
	}

	return { ok: true, value: email };
}

export function validatePassword(raw: string): RuleResult<string> {
	if (raw.length < PASSWORD_MIN_LENGTH) {
		return {
			ok: false,
			code: "E-AUTH-003",
			message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
		};
	}

	if (raw.length > PASSWORD_MAX_LENGTH) {
		return {
			ok: false,
			code: "E-AUTH-003",
			message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
		};
	}

	return { ok: true, value: raw };
}

export function canCreateScenario(role: Role): boolean {
	return role === "commander";
}

export function canRunDrill(role: Role): boolean {
	return role === "commander";
}

/** Observer is read-only: every write path must call this first. */
export function requireCommander(role: Role): RuleResult<Role> {
	if (!canCreateScenario(role) || !canRunDrill(role)) {
		return {
			ok: false,
			code: "E-ROLE-403",
			message: "Your role does not allow this action.",
		};
	}
	return { ok: true, value: role };
}

export function isSessionExpired(
	expiresAt: Date | number,
	nowMs: number,
): boolean {
	const expiry = expiresAt instanceof Date ? expiresAt.getTime() : expiresAt;
	return !Number.isFinite(expiry) || expiry <= nowMs;
}
