import "dotenv/config";
import { hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { BUILTIN_SCENARIO_INPUTS } from "../src/engine/builtin-scenarios";
import { validateScenario } from "../src/engine/validate-scenario";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/lib/demo";
import { getDb, schema } from "../src/server/db/client.server";

/**
 * Seeds the two curated demo accounts and three curated built-in scenarios.
 * Idempotent: run it as often as you like. It never touches non-demo users.
 */

const SCENARIOS = BUILTIN_SCENARIO_INPUTS;

async function upsertDemoUser(email: string, role: "commander" | "observer"): Promise<string> {
  const db = getDb();
  const passwordHash = await hash(DEMO_PASSWORD, 10);

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(schema.users)
      .set({ passwordHash, role, isDemo: true, updatedAt: new Date() })
      .where(eq(schema.users.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(schema.users)
    .values({ email, passwordHash, role, isDemo: true })
    .returning({ id: schema.users.id });

  if (!created) throw new Error(`E-DB-500 Could not create demo user ${email}`);
  return created.id;
}

async function main() {
  const db = getDb();

  const commanderEmail = DEMO_ACCOUNTS.find((account) => account.role === "commander")?.email;
  const observerEmail = DEMO_ACCOUNTS.find((account) => account.role === "observer")?.email;

  if (!commanderEmail || !observerEmail) {
    throw new Error("E-INPUT-400 Demo accounts are misconfigured.");
  }

  const commanderId = await upsertDemoUser(commanderEmail, "commander");
  await upsertDemoUser(observerEmail, "observer");

  let created = 0;
  let updated = 0;

  for (const input of SCENARIOS) {
    const result = validateScenario(input);
    if (!result.ok) {
      throw new Error(
        `E-BLD-INPUT Scenario "${input.name}" is invalid: ${result.errors
          .map((error) => `${error.code} ${error.message}`)
          .join("; ")}`,
      );
    }

    const definition = result.value;

    const [existing] = await db
      .select({ id: schema.scenarios.id })
      .from(schema.scenarios)
      .where(
        and(eq(schema.scenarios.ownerId, commanderId), eq(schema.scenarios.name, input.name)),
      )
      .limit(1);

    if (existing) {
      await db
        .update(schema.scenarios)
        .set({
          seed: definition.seed,
          maxTicks: definition.maxTicks,
          definition,
          status: "READY",
          updatedAt: new Date(),
        })
        .where(eq(schema.scenarios.id, existing.id));
      updated += 1;
    } else {
      await db.insert(schema.scenarios).values({
        ownerId: commanderId,
        name: input.name.trim(),
        seed: definition.seed,
        maxTicks: definition.maxTicks,
        definition,
        status: "READY",
      });
      created += 1;
    }
  }

  console.log("");
  console.log("Brownout seed complete.");
  console.log(`  users:     ${DEMO_ACCOUNTS.length} curated demo accounts`);
  console.log(`  scenarios: ${created} created, ${updated} updated (curated)`);
  console.log("");
  console.log("Demo credentials (curated data):");
  for (const account of DEMO_ACCOUNTS) {
    console.log(`  ${account.role.padEnd(9)} ${account.email} / ${DEMO_PASSWORD}`);
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
