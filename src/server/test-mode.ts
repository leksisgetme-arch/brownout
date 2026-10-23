import { timingSafeEqual } from "node:crypto";
import { getEnv, isTestMode } from "./env";

const encoder = new TextEncoder();

function jsonError(code: string, message: string, status: number): Response {
	return new Response(JSON.stringify({ error: { code, message } }), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

/**
 * Test endpoints exist only when TEST_MODE=true AND the caller presents the
 * shared secret. When test mode is off the routes answer 404, so a production
 * deployment does not advertise them.
 */
export function checkTestAccess(
	request: Request,
): { ok: true } | { ok: false; response: Response } {
	if (!isTestMode()) {
		return {
			ok: false,
			response: jsonError("E-NOT-FOUND-404", "Not found.", 404),
		};
	}

	const expected = getEnv().TEST_SECRET;
	const provided = request.headers.get("x-brownout-test-secret");

	if (!expected || !provided) {
		return {
			ok: false,
			response: jsonError("E-TEST-401", "Missing or invalid test secret.", 401),
		};
	}

	const a = encoder.encode(provided);
	const b = encoder.encode(expected);

	if (a.length !== b.length || !timingSafeEqual(a, b)) {
		return {
			ok: false,
			response: jsonError("E-TEST-401", "Missing or invalid test secret.", 401),
		};
	}

	return { ok: true };
}

export function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}
