import { createHash, randomBytes } from "node:crypto";
import {
	deleteCookie,
	getCookie,
	setCookie,
} from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "#/server/db/client.server";
import { isSessionExpired } from "./rules";
import type { SessionLookup, SessionUser } from "./types";

export const SESSION_COOKIE = "brownout_session";
export const SESSION_TTL_DAYS = 7;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function cookieOptions() {
	return {
		httpOnly: true,
		sameSite: "lax" as const,
		secure: process.env.NODE_ENV === "production",
		path: "/",
	};
}

export async function createSession(userId: string): Promise<void> {
	const token = randomBytes(32).toString("base64url");
	const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

	const db = getDb();
	await db.insert(schema.sessions).values({
		userId,
		tokenHash: hashToken(token),
		expiresAt,
	});

	setCookie(SESSION_COOKIE, token, {
		...cookieOptions(),
		maxAge: SESSION_TTL_SECONDS,
	});
}

export async function readSession(): Promise<SessionLookup> {
	const token = getCookie(SESSION_COOKIE);
	if (!token) return { user: null, expired: false };

	const db = getDb();
	const [row] = await db
		.select({
			sessionId: schema.sessions.id,
			expiresAt: schema.sessions.expiresAt,
			id: schema.users.id,
			email: schema.users.email,
			role: schema.users.role,
			isDemo: schema.users.isDemo,
		})
		.from(schema.sessions)
		.innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
		.where(eq(schema.sessions.tokenHash, hashToken(token)))
		.limit(1);

	if (!row) {
		deleteCookie(SESSION_COOKIE, cookieOptions());
		return { user: null, expired: false };
	}

	if (isSessionExpired(row.expiresAt, Date.now())) {
		await db
			.delete(schema.sessions)
			.where(eq(schema.sessions.id, row.sessionId));
		deleteCookie(SESSION_COOKIE, cookieOptions());
		return { user: null, expired: true };
	}

	const user: SessionUser = {
		id: row.id,
		email: row.email,
		role: row.role,
		isDemo: row.isDemo,
	};
	return { user, expired: false };
}

export async function destroySession(): Promise<void> {
	const token = getCookie(SESSION_COOKIE);
	if (token) {
		const db = getDb();
		await db
			.delete(schema.sessions)
			.where(eq(schema.sessions.tokenHash, hashToken(token)));
	}
	deleteCookie(SESSION_COOKIE, cookieOptions());
}
