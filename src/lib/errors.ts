/**
 * Stable error codes. Every user-visible failure maps to exactly one of these.
 * The code is part of the public contract with the TestSprite suite, so never
 * rename an existing code: add a new one instead.
 */
export const ERROR_STATUS = {
	"E-AUTH-001": 401,
	"E-AUTH-002": 422,
	"E-AUTH-003": 422,
	"E-AUTH-004": 401,
	"E-AUTH-005": 409,
	"E-ROLE-403": 403,
	"E-STATE-409": 409,
	"E-BLD-NAME": 422,
	"E-BLD-TICKS": 422,
	"E-BLD-EVENTS": 422,
	"E-BLD-JSON": 422,
	"E-BLD-PAYLOAD": 422,
	"E-BLD-TARGET": 422,
	"E-BLD-FAILURE": 422,
	"E-SIG-401": 401,
	"E-RATE-429": 429,
	"E-TEST-401": 401,
	"E-INPUT-400": 400,
	"E-NOT-FOUND-404": 404,
	"E-ENV-500": 500,
	"E-DB-500": 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export function statusForError(code: ErrorCode): number {
	return ERROR_STATUS[code];
}

/** Thrown by server code; serialised to { code, message } at the boundary. */
export class AppError extends Error {
	readonly code: ErrorCode;
	readonly status: number;
	readonly field?: string;

	constructor(code: ErrorCode, message?: string, field?: string) {
		super(message ?? code);
		this.name = "AppError";
		this.code = code;
		this.status = statusForError(code);
		this.field = field;
	}
}

export interface SerializedError {
	code: ErrorCode;
	message: string;
	field?: string;
}

export function isErrorCode(value: unknown): value is ErrorCode {
	return typeof value === "string" && value in ERROR_STATUS;
}
