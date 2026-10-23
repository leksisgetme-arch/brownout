import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { getDb } from "#/server/db/client.server";
import { isTestMode } from "#/server/env";

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: async () => {
				let db: "ok" | "unavailable" = "ok";

				try {
					await getDb().execute(sql`select 1`);
				} catch (error) {
					db = "unavailable";
					console.error("[brownout] health: database check failed", error);
				}

				return new Response(
					JSON.stringify({
						status: db === "ok" ? "ok" : "degraded",
						db,
						testMode: isTestMode(),
						version: "0.1.0",
					}),
					{
						status: 200,
						headers: {
							"content-type": "application/json; charset=utf-8",
							"cache-control": "no-store",
						},
					},
				);
			},
		},
	},
});
