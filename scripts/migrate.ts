import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Applies drizzle/*.sql through a direct Postgres connection. Works against a
 * Neon direct URL and against a local Postgres container.
 */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "E-ENV-500 Missing DATABASE_URL_UNPOOLED (or DATABASE_URL). Migrations need a direct, non-pooled connection.",
    );
  }

  const pool = new Pool({ connectionString: url, max: 1 });

  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
