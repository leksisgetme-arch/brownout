import { createFileRoute } from "@tanstack/react-router";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "#/server/db/client.server";
import { checkTestAccess, jsonResponse } from "#/server/test-mode";

export const Route = createFileRoute("/api/test/reset")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const access = checkTestAccess(request);
				if (!access.ok) return access.response;

				const db = getDb();

				const demoScenarios = await db
					.select({ id: schema.scenarios.id })
					.from(schema.scenarios)
					.innerJoin(
						schema.users,
						eq(schema.scenarios.ownerId, schema.users.id),
					)
					.where(eq(schema.users.isDemo, true));

				const ids = demoScenarios.map((row) => row.id);
				const deleted =
					ids.length > 0
						? await db
								.delete(schema.drills)
								.where(inArray(schema.drills.scenarioId, ids))
								.returning({ id: schema.drills.id })
						: [];

				await db.delete(schema.rateLimitHits);

				return jsonResponse({ ok: true, deletedDrills: deleted.length });
			},
		},
	},
});
