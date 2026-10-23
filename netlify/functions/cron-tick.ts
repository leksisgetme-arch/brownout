/// <reference types="node" />

/**
 * Netlify scheduled function — the equivalent of the Vercel Cron entry in
 * `vercel.json`. Netlify has no cron-in-config HTTP hook, so this function
 * calls the app's own `/api/cron/tick` route every minute with the shared
 * `CRON_SECRET`, exactly like Vercel Cron does.
 *
 * The route remains the single implementation of the catch-up logic; this file
 * only exists to trigger it. Scheduled functions run on published deploys only
 * (not on deploy previews or branch deploys) and are capped at 30 seconds.
 *
 * `URL` is injected by Netlify for every function invocation. Without it, or
 * without `CRON_SECRET`, the tick route would answer 404/401, so we skip and log
 * instead of pretending the clock advanced.
 */

const TICK_PATH = "/api/cron/tick";

export default async (): Promise<Response> => {
	const baseUrl = process.env.URL ?? process.env.DEPLOY_PRIME_URL;
	const secret = process.env.CRON_SECRET;

	if (!baseUrl || !secret) {
		console.warn(
			"[cron-tick] Skipped: URL or CRON_SECRET is missing in the function environment.",
		);
		return new Response(null, { status: 204 });
	}

	try {
		const response = await fetch(`${baseUrl}${TICK_PATH}`, {
			headers: { authorization: `Bearer ${secret}` },
		});
		const payload = await response.text();

		if (response.ok) {
			console.log(`[cron-tick] ${response.status} ${payload}`);
			return new Response(null, { status: 204 });
		}

		console.error(`[cron-tick] ${response.status} ${payload}`);
		return new Response(null, { status: 500 });
	} catch (error) {
		console.error("[cron-tick] Request failed:", error);
		return new Response(null, { status: 500 });
	}
};

export const config = { schedule: "* * * * *" };
