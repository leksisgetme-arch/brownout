import type { ScenarioValidationError } from "#/engine";
import { AppError, type ErrorCode } from "#/lib/errors";

/**
 * Every server function returns this envelope. Nothing throws across the
 * boundary, so the UI always has a stable code to render.
 */
export type ServerResult<T> =
	| { ok: true; data: T }
	| {
			ok: false;
			code: ErrorCode;
			message: string;
			retryAfterSeconds?: number;
			errors?: ScenarioValidationError[];
	  };

export function okResult<T>(data: T): ServerResult<T> {
	return { ok: true, data };
}

export function failResult(
	code: ErrorCode,
	message: string,
	extra: {
		retryAfterSeconds?: number;
		errors?: ScenarioValidationError[];
	} = {},
): ServerResult<never> {
	return { ok: false, code, message, ...extra };
}

/** Runs a handler and converts any throw into a coded failure. */
export async function runResult<T>(
	handler: () => Promise<ServerResult<T>>,
): Promise<ServerResult<T>> {
	try {
		return await handler();
	} catch (error) {
		if (error instanceof AppError) {
			return failResult(error.code, error.message);
		}
		return failResult(
			"E-DB-500",
			error instanceof Error ? error.message : "Unexpected server error",
		);
	}
}
