import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "#/server/env";
import * as schema from "./schema";

function createNeonDatabase(url: string) {
	const sql = neon(url);
	return drizzleNeon({ client: sql, schema });
}

function createNodeDatabase(url: string) {
	const pool = new Pool({ connectionString: url, max: 5 });
	return drizzleNode({ client: pool, schema });
}

/** Both drivers expose the same Drizzle query builder surface we use. */
export type Database = ReturnType<typeof createNeonDatabase>;

let cached: Database | undefined;

/** Neon-hosted databases use the HTTP driver; anything else uses node-postgres. */
export function usesNeonHttpDriver(url: string): boolean {
	try {
		const host = new URL(url).hostname;
		return host.endsWith(".neon.tech") || host.endsWith(".vercel-storage.com");
	} catch {
		return true;
	}
}

/**
 * Neon HTTP: one stateless fetch per query, no socket pool to exhaust on
 * serverless. Local Postgres and non-Neon hosts fall back to node-postgres so
 * the app runs in Docker. Because neither path uses interactive transactions,
 * state changes must be single conditional statements.
 */
export function getDb(): Database {
	if (!cached) {
		const url = getEnv().DATABASE_URL;
		cached = usesNeonHttpDriver(url)
			? createNeonDatabase(url)
			: (createNodeDatabase(url) as unknown as Database);
	}
	return cached;
}

export { schema };
