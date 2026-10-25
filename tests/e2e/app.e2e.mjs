/**
 * End-to-end checks against a running app, driven by a real browser.
 *
 *   pnpm dev          # in another terminal
 *   pnpm test:e2e
 *
 * These are the only tests in the repo that go through HTTP and the database,
 * so they complement the pure unit suite instead of duplicating it. They need a
 * reachable instance and a local Chrome (CHROME_PATH overrides the lookup).
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";

const BASE = process.env.BROWNOUT_BASE_URL ?? "http://localhost:3000";
const COMMANDER = {
	email: process.env.BROWNOUT_COMMANDER_EMAIL ?? "commander@brownout.dev",
	password: process.env.BROWNOUT_COMMANDER_PASSWORD ?? "Brownout123!",
};

const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
];

let browser;

before(async () => {
	const health = await fetch(`${BASE}/api/health`).catch(() => null);
	assert.ok(
		health?.ok,
		`No app answering at ${BASE}. Start it with "pnpm dev" first.`,
	);

	const executablePath = CHROME_CANDIDATES.filter(Boolean).find((path) =>
		existsSync(path),
	);
	assert.ok(
		executablePath,
		"Chrome not found. Set CHROME_PATH to a local Chrome or Chromium binary.",
	);

	browser = await chromium.launch({ executablePath, headless: true });
});

after(async () => {
	await browser?.close();
});

async function signIn(page, email, password) {
	await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
	await page.fill('[data-testid="login-email"]', email);
	await page.fill('[data-testid="login-password"]', password);
	await page.click('[data-testid="login-form"] button[type="submit"]');
}

/**
 * A scenario can only have one open drill, so a reused dev database can run out
 * of Start buttons. Reset the newest open drill to free its scenario again.
 */
async function startableScenario(page) {
	const start = page.locator('[data-testid^="scenario-start-"]');
	if ((await start.count()) > 0) return start.first();

	await page
		.locator(
			'[data-testid="console-open-drill"], [data-testid="last-drill-link"]',
		)
		.first()
		.click();
	await page.waitForSelector('[data-testid="drill-detail"]', {
		timeout: 30_000,
	});
	await page.click('[data-testid="reset-drill"]');
	await page.waitForTimeout(600);
	await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
	await page.waitForSelector('[data-testid="dashboard-page"]', {
		timeout: 30_000,
	});
	return start.first();
}

test("health reports a reachable database", async () => {
	const response = await fetch(`${BASE}/api/health`);
	assert.equal(response.status, 200);
	const body = await response.json();
	assert.equal(body.db, "ok");
	assert.equal(typeof body.testMode, "boolean");
});

test("cron endpoint refuses unauthenticated callers", async () => {
	const response = await fetch(`${BASE}/api/cron/tick`);
	assert.ok(
		response.status === 401 || response.status === 404,
		`expected 401/404, got ${response.status}`,
	);
	const body = await response.json();
	assert.ok(body.error?.code);
});

test("wrong password returns E-AUTH-001 without leaking the account", async () => {
	const page = await browser.newPage();
	try {
		await signIn(page, `nobody-${Date.now()}@brownout.dev`, "WrongPassword123!");
		await page.waitForSelector('[data-testid="error-code"]');
		assert.equal(
			(await page.locator('[data-testid="error-code"]').innerText()).trim(),
			"E-AUTH-001",
		);
	} finally {
		await page.close();
	}
});

test("sixth failed sign-in is throttled with E-RATE-429", async () => {	const page = await browser.newPage();
	try {
		const email = `throttle-${Date.now()}@brownout.dev`;

		// The only POST on this page is the sign-in server function, so counting
		// finished POST responses is a race-free wait for each attempt.
		let finished = 0;
		page.on("response", (response) => {
			if (response.request().method() === "POST") finished += 1;
		});

		const waitForAttempt = async (expected) => {
			const deadline = Date.now() + 10_000;
			while (finished < expected && Date.now() < deadline) {
				await page.waitForTimeout(50);
			}
			assert.equal(finished, expected, "sign-in request did not finish");
		};

		await signIn(page, email, "WrongPassword123!");
		await waitForAttempt(1);

		for (let attempt = 2; attempt <= 5; attempt += 1) {
			await page.click('[data-testid="login-submit"]');
			await waitForAttempt(attempt);
			assert.equal(
				(await page.locator('[data-testid="error-code"]').innerText()).trim(),
				"E-AUTH-001",
			);
		}

		await page.click('[data-testid="login-submit"]');
		await waitForAttempt(6);
		assert.equal(
			(await page.locator('[data-testid="error-code"]').innerText()).trim(),
			"E-RATE-429",
		);
	} finally {
		await page.close();
	}
});

test("commander starts a drill and advances the test-mode clock", async () => {
	const page = await browser.newPage();
	try {
		await signIn(page, COMMANDER.email, COMMANDER.password);
		await page.waitForSelector('[data-testid="dashboard-page"]', {
			timeout: 30_000,
		});
		assert.equal(
			await page.locator('[data-testid="footer-wordmark"]').count(),
			0,
			"the landing decoration must not render on the dashboard",
		);

		await (await startableScenario(page)).click();
		await page.waitForSelector('[data-testid="drill-detail"]', {
			timeout: 30_000,
		});

		const tick = async () =>
			Number(await page.locator('[data-testid="drill-tick"]').innerText());

		await page.waitForTimeout(600);
		const first = await tick();
		// Test mode freezes the wall clock so a run is reproducible; the
		// Advance tick control is the only thing that moves it.
		await page.click('[data-testid="advance-tick"]');
		await page.waitForTimeout(1200);
		const second = await tick();
		assert.equal(
			second,
			first + 1,
			`expected one manual tick, saw ${first} -> ${second}`,
		);

		await page.click('[data-testid="pause-drill"]');
		await page.waitForFunction(
			() =>
				document
					.querySelector('[data-testid="drill-state"]')
					?.textContent?.includes("PAUSED"),
			undefined,
			{ timeout: 30_000 },
		);
		// A poll that was already in flight can land one tick after the pause,
		// so let the console settle before freezing the expectation.
		await page.waitForTimeout(6000);
		const paused = await tick();
		await page.waitForTimeout(4000);
		assert.equal(await tick(), paused, "a paused drill must not age");
	} finally {
		await page.close();
	}
});

test("the dashboard console mirrors the open drill", async () => {
	const page = await browser.newPage();
	try {
		await signIn(page, COMMANDER.email, COMMANDER.password);
		await page.waitForSelector('[data-testid="incident-console"]', {
			timeout: 30_000,
		});

		// Three live metric panels, each fed by the engine's own samples.
		assert.equal(await page.locator('[data-testid="sparkline"]').count(), 3);
		assert.match(
			await page.locator('[data-testid="console-metric-errorRate-value"]').innerText(),
			/^\d+\.\d%$/,
		);
		assert.ok(
			(await page.locator('[data-testid="console-feed"] li').count()) > 0,
			"the feed must show engine log lines",
		);

		// The drill from the previous test is paused, so the console must not age.
		const tick = async () =>
			page.locator('[data-testid="console-tick"]').innerText();
		const before = await tick();
		assert.match(before, /tick \d+ of \d+/);
		await page.waitForTimeout(6000);
		assert.equal(await tick(), before, "a paused drill must not tick");
	} finally {
		await page.close();
	}
});

test("the mobile header opens a menu without sideways scrolling", async () => {
	const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
	try {
		await page.goto(BASE, { waitUntil: "networkidle" });
		await page.waitForTimeout(600);
		assert.equal(
			await page.evaluate(
				() =>
					document.documentElement.scrollWidth -
					document.documentElement.clientWidth,
			),
			0,
			"the header must not push the page sideways",
		);

		await page.click('[data-testid="mobile-menu-toggle"]');
		assert.ok(await page.locator('[data-testid="mobile-menu"]').isVisible());
		await page.click('[data-testid="menu-rulebook"]');
		await page.waitForURL("**/rulebook");
		await page
			.locator('[data-testid="mobile-menu"]')
			.waitFor({ state: "detached", timeout: 5000 });
		assert.equal(
			await page.locator('[data-testid="mobile-menu"]').count(),
			0,
			"navigating must dismiss the panel",
		);
	} finally {
		await page.close();
	}
});

test("a shared report opens for a guest with no action buttons", async () => {
	const page = await browser.newPage();
	let guest;
	try {
		await signIn(page, COMMANDER.email, COMMANDER.password);
		await page.waitForSelector('[data-testid="dashboard-page"]', {
			timeout: 30_000,
		});
		await page.click(
			'[data-testid="last-drill-link"], [data-testid="console-open-drill"]',
		);
		await page.waitForSelector('[data-testid="drill-detail"]', {
			timeout: 30_000,
		});

		await page.click('[data-testid="share-link-button"]');
		const link = page.locator('[data-testid="share-link-value"]');
		await link.waitFor({ timeout: 10_000 });
		const href = await link.getAttribute("href");
		assert.ok(href?.includes("/report/"), `unexpected share href ${href}`);

		guest = await browser.newContext();
		const report = await guest.newPage();
		await report.goto(href, { waitUntil: "networkidle" });
		await report.waitForSelector('[data-testid="report-page"]', {
			timeout: 30_000,
		});
		assert.equal(
			await report.locator('[data-testid="pause-drill"]').count(),
			0,
			"guests must not get drill controls",
		);

		// Free the scenario again so the next run always finds a Start button.
		await page.click('[data-testid="reset-drill"]');
		await page.waitForTimeout(600);
	} finally {
		await guest?.close();
		await page.close();
	}
});
