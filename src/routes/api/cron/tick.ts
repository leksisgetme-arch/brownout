import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { catchUpActiveDrills } from "#/server/drills/drills.server";
import { getCronSecret } from "#/server/env";
import { jsonResponse } from "#/server/test-mode";

const encoder = new TextEncoder();

function sameSecret(provided: string, expected: string): boolean {
	const a = encoder.encode(provided);
	const b = encoder.encode(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Vercel Cron (see vercel.json) calls this every minute with
 * `Authorization: Bearer $CRON_SECRET`. It advances drills that nobody has open,
 * so a running drill cannot stay RUNNING forever after its page is closed.
 * Without a configured secret the route answers 404, like the test endpoints.
 */
export const Route = createFileRoute("/api/cron/tick")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const secret = getCronSecret();
				if (!secret) {
					return jsonResponse(
						{ error: { code: "E-NOT-FOUND-404", message: "Not found." } },
						404,
					);
				}

				const header = request.headers.get("authorization") ?? "";
				if (
					!header.startsWith("Bearer ") ||
					!sameSecret(header.slice(7), secret)
				) {
					return jsonResponse(
						{
							error: {
								code: "E-AUTH-001",
								message: "Wrong cron secret.",
							},
						},
						401,
					);
				}

				const summary = await catchUpActiveDrills();
				return jsonResponse({ ok: true, ...summary });
			},
		},
	},
});
