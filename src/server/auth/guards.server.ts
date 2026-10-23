import { AppError } from "#/lib/errors";
import { readSession } from "./session.server";
import type { SessionUser } from "./types";

/** Server-side guard for any authenticated call. */
export async function requireSessionUser(): Promise<SessionUser> {
	const lookup = await readSession();
	if (!lookup.user) {
		throw new AppError("E-AUTH-004", "Your session expired. Sign in again.");
	}
	return lookup.user;
}

/** Server-side guard for Commander-only calls (FR-A3). */
export async function requireCommanderUser(): Promise<SessionUser> {
	const user = await requireSessionUser();
	if (user.role !== "commander") {
		throw new AppError("E-ROLE-403", "Your role does not allow this action.");
	}
	return user;
}
