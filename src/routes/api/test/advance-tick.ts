import { createFileRoute } from "@tanstack/react-router";
import { statusForError } from "#/lib/errors";
import { advanceTick } from "#/server/drills/drills.server";
import { checkTestAccess, jsonResponse } from "#/server/test-mode";

export const Route = createFileRoute("/api/test/advance-tick")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const access = checkTestAccess(request);
				if (!access.ok) return access.response;

				let body: unknown;
				try {
					body = await request.json();
				} catch {
					return jsonResponse(
						{ error: { code: "E-INPUT-400", message: "Body must be JSON." } },
						400,
					);
				}

				const drillId = (body as { drillId?: unknown })?.drillId;
				if (typeof drillId !== "string" || drillId.length === 0) {
					return jsonResponse(
						{ error: { code: "E-INPUT-400", message: "drillId is required." } },
						400,
					);
				}

				const result = await advanceTick(drillId);
				if (!result.ok) {
					return jsonResponse(
						{ error: { code: result.code, message: result.message } },
						statusForError(result.code),
					);
				}

				return jsonResponse({
					ok: true,
					tick: result.data.tick,
					state: result.data.state,
				});
			},
		},
	},
});
