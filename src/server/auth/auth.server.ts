import { getCookie, setCookie } from "@tanstack/react-start/server";
import { compare, hash } from "bcryptjs";
import { and, eq, gte } from "drizzle-orm";
import {
	DEFAULT_LOCALE,
	isLocale,
	LOCALE_COOKIE,
	type Locale,
} from "#/lib/i18n/locale";
import { evaluateLoginLimit, LOGIN_WINDOW_MS } from "#/lib/login-limit";
import { getDb, schema } from "#/server/db/client.server";
import { validateEmail, validatePassword } from "./rules";
import { createSession, destroySession, readSession } from "./session.server";
import type { AuthResult, CredentialsInput, SessionLookup } from "./types";

export const BCRYPT_COST = 10;

/**
 * Compared against when the email is unknown, so a missing account and a wrong
 * password cost the same bcrypt work and cannot be told apart by timing.
 */
const DUMMY_PASSWORD_HASH =
	"$2b$10$X5Br27l1jSRF2cqZNVIoDe3lAjWB2bgZZmIuzVdNLBuf8jK5BSr6C";

function loginKey(email: string): string {
	return `login:${email}`;
}

async function loginFailures(key: string): Promise<number[]> {
	const db = getDb();
	const rows = await db
		.select({ createdAt: schema.rateLimitHits.createdAt })
		.from(schema.rateLimitHits)
		.where(
			and(
				eq(schema.rateLimitHits.key, key),
				gte(
					schema.rateLimitHits.createdAt,
					new Date(Date.now() - LOGIN_WINDOW_MS),
				),
			),
		);
	return rows.map((row) => row.createdAt.getTime());
}

async function recordLoginFailure(key: string): Promise<void> {
	await getDb().insert(schema.rateLimitHits).values({ key });
}

async function clearLoginFailures(key: string): Promise<void> {
	await getDb()
		.delete(schema.rateLimitHits)
		.where(eq(schema.rateLimitHits.key, key));
}

export async function loginWithPassword(
	input: CredentialsInput,
): Promise<AuthResult> {
	const email = validateEmail(input.email);
	if (!email.ok) {
		return { ok: false, code: email.code, message: email.message };
	}

	if (input.password.length === 0) {
		return {
			ok: false,
			code: "E-AUTH-001",
			message: "Wrong email or password.",
		};
	}

	const key = loginKey(email.value);
	const budget = evaluateLoginLimit(await loginFailures(key), Date.now());
	if (!budget.allowed) {
		return {
			ok: false,
			code: "E-RATE-429",
			message: `Too many failed sign-ins. Try again in ${budget.retryAfterSeconds} seconds.`,
			retryAfterSeconds: budget.retryAfterSeconds,
		};
	}

	const db = getDb();
	const [user] = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, email.value))
		.limit(1);

	// Same work, same code and same shape whether the account exists or not.
	const valid = await compare(
		input.password,
		user?.passwordHash ?? DUMMY_PASSWORD_HASH,
	);

	if (!user || !valid) {
		await recordLoginFailure(key);
		return {
			ok: false,
			code: "E-AUTH-001",
			message: "Wrong email or password.",
		};
	}

	await clearLoginFailures(key);
	await createSession(user.id);

	return {
		ok: true,
		user: {
			id: user.id,
			email: user.email,
			role: user.role,
			isDemo: user.isDemo,
		},
	};
}

export async function signupWithPassword(
	input: CredentialsInput,
): Promise<AuthResult> {
	const email = validateEmail(input.email);
	if (!email.ok) {
		return { ok: false, code: email.code, message: email.message };
	}

	const password = validatePassword(input.password);
	if (!password.ok) {
		return { ok: false, code: password.code, message: password.message };
	}

	const db = getDb();
	const [existing] = await db
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(eq(schema.users.email, email.value))
		.limit(1);

	if (existing) {
		return {
			ok: false,
			code: "E-AUTH-005",
			message: "That email is already registered.",
		};
	}

	const passwordHash = await hash(password.value, BCRYPT_COST);
	const [created] = await db
		.insert(schema.users)
		.values({ email: email.value, passwordHash, role: "observer" })
		.returning({
			id: schema.users.id,
			email: schema.users.email,
			role: schema.users.role,
		});

	if (!created) {
		return {
			ok: false,
			code: "E-AUTH-001",
			message: "Account could not be created.",
		};
	}

	await createSession(created.id);

	return {
		ok: true,
		user: {
			id: created.id,
			email: created.email,
			role: created.role,
			isDemo: false,
		},
	};
}

export async function currentSession(): Promise<SessionLookup> {
	return readSession();
}

export async function logout(): Promise<void> {
	await destroySession();
}

export function readLocaleCookie(): Locale {
	const value = getCookie(LOCALE_COOKIE);
	return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function writeLocaleCookie(locale: Locale): void {
	setCookie(LOCALE_COOKIE, locale, {
		httpOnly: false,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: 60 * 60 * 24 * 365,
	});
}
