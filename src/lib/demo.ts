/** Curated demo accounts. Seeded, labelled in the UI, and the only accounts test mode may reset. */
export const DEMO_PASSWORD = "Brownout123!";

export const DEMO_ACCOUNTS = [
	{ role: "commander" as const, email: "commander@brownout.dev" },
	{ role: "observer" as const, email: "observer@brownout.dev" },
];

export const DEMO_EMAILS = DEMO_ACCOUNTS.map((account) => account.email);
