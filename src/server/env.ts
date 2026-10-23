import { z } from "zod";

/**
 * Server-only environment contract. This module must never be imported from
 * client code: it is only reached through server functions, server routes, or
 * scripts. Validation happens on first server access so a bad deploy fails with
 * one clear message instead of an obscure runtime error.
 */

const postgresUrl = z
	.string()
	.trim()
	.min(1, "is required")
	.refine(
		(value) => /^postgres(ql)?:\/\//.test(value),
		"must be a postgres:// URL",
	);

const EnvSchema = z
	.object({
		DATABASE_URL: postgresUrl,
		DATABASE_URL_UNPOOLED: postgresUrl.optional(),
		TEST_MODE: z.enum(["true", "false"]).default("false"),
		TEST_SECRET: z
			.string()
			.min(16, "must be at least 16 characters")
			.optional(),
		/** Vercel cron sends this as `Authorization: Bearer <CRON_SECRET>`. */
		CRON_SECRET: z
			.string()
			.min(16, "must be at least 16 characters")
			.optional(),
	})
	.superRefine((env, ctx) => {
		if (env.TEST_MODE === "true" && !env.TEST_SECRET) {
			ctx.addIssue({
				code: "custom",
				path: ["TEST_SECRET"],
				message: "is required when TEST_MODE=true",
			});
		}
	});

export type Env = z.infer<typeof EnvSchema>;

export interface EnvCheck {
	ok: boolean;
	env?: Env;
	message: string;
}

export function checkEnv(
	source: Record<string, string | undefined> = process.env,
): EnvCheck {
	const parsed = EnvSchema.safeParse(source);

	if (parsed.success) {
		return { ok: true, env: parsed.data, message: "Environment is valid." };
	}

	const details = parsed.error.issues
		.map((issue) => `  - ${issue.path.join(".") || "(root)"} ${issue.message}`)
		.join("\n");

	return {
		ok: false,
		message: `E-ENV-500 Invalid server environment. Fix these variables in .env or the deployment settings:\n${details}`,
	};
}

let cached: Env | undefined;

export class EnvError extends Error {
	readonly code = "E-ENV-500" as const;

	constructor(message: string) {
		super(message);
		this.name = "EnvError";
	}
}

export function getEnv(): Env {
	if (cached) return cached;

	const result = checkEnv();
	if (!result.ok || !result.env) {
		throw new EnvError(result.message);
	}

	cached = result.env;
	return cached;
}

export function isTestMode(): boolean {
	try {
		return getEnv().TEST_MODE === "true";
	} catch {
		return false;
	}
}

/** Undefined when the deployment has not configured a cron secret. */
export function getCronSecret(): string | undefined {
	try {
		return getEnv().CRON_SECRET;
	} catch {
		return undefined;
	}
}
