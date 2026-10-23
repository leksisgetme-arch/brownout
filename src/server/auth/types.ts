import type { Role } from "#/engine/types";

export interface SessionUser {
	id: string;
	email: string;
	role: Role;
	isDemo: boolean;
}

export interface SessionLookup {
	user: SessionUser | null;
	/** True only when a session row existed but had passed its expiry. */
	expired: boolean;
}

export type AuthErrorCode =
	| "E-AUTH-001"
	| "E-AUTH-002"
	| "E-AUTH-003"
	| "E-AUTH-004"
	| "E-AUTH-005"
	| "E-ROLE-403"
	| "E-RATE-429";

export type AuthResult =
	| { ok: true; user: SessionUser }
	| {
			ok: false;
			code: AuthErrorCode;
			message: string;
			retryAfterSeconds?: number;
	  };

export interface CredentialsInput {
	email: string;
	password: string;
}
