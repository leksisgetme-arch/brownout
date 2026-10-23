import { redirect } from "@tanstack/react-router";
import { getCurrentUserFn } from "./functions";
import type { SessionUser } from "./types";

/** Route guard: redirects to /login with a stable code when there is no session. */
export async function requireUser(): Promise<SessionUser> {
	const { user, expired } = await getCurrentUserFn();

	if (!user) {
		throw redirect({
			to: "/login",
			search: { error: expired ? "E-AUTH-004" : undefined },
		});
	}

	return user;
}

/** Route guard: Commanders only, everyone else lands on the dashboard. */
export async function requireCommander(): Promise<SessionUser> {
	const user = await requireUser();
	if (user.role !== "commander") {
		throw redirect({ to: "/app", search: { error: "E-ROLE-403" } });
	}
	return user;
}
