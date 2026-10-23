import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const migrationUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const command = process.argv[2] ?? "";
const isGenerate = command === "generate";

if (!migrationUrl && !isGenerate) {
  throw new Error(
    "E-ENV-500 Missing DATABASE_URL_UNPOOLED (or DATABASE_URL). Migrations need a direct, non-pooled Neon connection.",
  );
}

if (!migrationUrl) {
  console.warn(
    "[brownout] No database URL found. Generating SQL only; apply it later with pnpm db:migrate.",
  );
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: migrationUrl ?? "postgresql://generate-only:generate-only@localhost:5432/generate-only",
  },
});
