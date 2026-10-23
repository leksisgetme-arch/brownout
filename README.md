# Brownout

**Drill your team's worst day.** Brownout is a deterministic incident drill simulator: pick a
scenario, respond before the virtual tick limit, and get a score you can explain line by line.

- Deterministic: every run uses a seed and a virtual clock. Nothing in `src/engine` reads the wall
  clock or `Math.random`.
- Explainable: every score is a sum of named penalties.
- Testable: stable error codes, stable `data-testid` attributes, and a test mode that advances the
  clock on demand.

> **Status:** foundation milestone. Auth, roles, schema, seed, health, test-mode endpoints, layout,
> i18n, and the pure engine primitives are in place. Scenario builder validation, the live drill
> loop, delivery engine, scoring pipeline, and reports UI arrive in the next pull requests.

## Live URL

```
https://brownout-860.netlify.app   # Netlify production
```

## Deployment

One tree, two targets. `vite.config.ts` picks the server plugin from
`DEPLOY_TARGET`, so neither target forces a branch.

| Target | Server plugin | Config | Deploy command |
| --- | --- | --- | --- |
| Netlify | `@netlify/vite-plugin-tanstack-start` | `netlify.toml` | `netlify deploy --build --prod` |
| Vercel | Nitro | `vercel.json` | `vercel deploy --prod` |

Netlify sets `DEPLOY_TARGET=netlify` in `[build.environment]`; anything else
(pushes to Vercel, local dev) keeps Nitro. Both plugins own the server output,
so exactly one may be active per build.

Deployment is automatic: `.github/workflows/netlify.yml` runs the same checks as
CI and then deploys to Netlify on every push to `main`. It needs the
`NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` repository secrets.

The per-minute drill clock has a single implementation — `GET /api/cron/tick` —
and two triggers: the Vercel Cron entry in `vercel.json`, and the Netlify
scheduled function in `netlify/functions/cron-tick.ts`, which calls the route
with `CRON_SECRET`. Netlify scheduled functions run on published deploys only,
never on deploy previews.

### Netlify

```bash
netlify link                        # link this clone to the project
netlify env:import .env             # DATABASE_URL, DATABASE_URL_UNPOOLED, TEST_*, CRON_SECRET
netlify deploy --build --prod       # build with DEPLOY_TARGET=netlify and publish dist/client
```

`CRON_SECRET` is required on Netlify; without it the scheduled function skips its
tick and the drill clock only advances when someone reads a drill.

## Demo credentials (curated)

Both accounts and the three built-in scenarios are **curated demo data**. The UI labels seeded
scenarios with a "Curated" badge, and the seed script is the only thing that writes them.

| Role | Email | Password |
| --- | --- | --- |
| Commander | `commander@brownout.dev` | `Brownout123!` |
| Observer | `observer@brownout.dev` | `Brownout123!` |

- Commander: create scenarios, start drills, create share links.
- Observer: read-only. Write attempts return `E-ROLE-403`.
- Guest: `/report/$token` opens without login and renders no action buttons.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | TanStack Start (React 19, TypeScript strict) |
| Routing | TanStack Router, file-based routes in `src/routes` |
| Data fetching | TanStack Query with the router SSR integration |
| Database | Neon serverless Postgres (`@neondatabase/serverless` HTTP driver in production, `pg` for local Postgres) |
| ORM | Drizzle ORM + Drizzle migrations (`drizzle-kit generate`, `scripts/migrate.ts`) |
| Styling | Tailwind CSS v4, small in-house headless components |
| Passwords | `bcryptjs` (pure JS, no native build, serverless-safe) |
| Tests | Vitest |
| Lint/format | Biome |
| Package manager | pnpm |
| Deploy | Vercel (Nitro) and Netlify (`@netlify/vite-plugin-tanstack-start`) |

## Getting started

```bash
pnpm install
cp .env.example .env      # then paste your Neon URLs
pnpm db:migrate           # applies drizzle/*.sql to DATABASE_URL_UNPOOLED
pnpm seed                 # creates the two demo accounts and three curated scenarios
pnpm dev                  # http://localhost:3000
```

Local Postgres works too: point both URLs at
`postgresql://postgres:postgres@localhost:5432/brownout`. The runtime uses the Neon HTTP driver
for `*.neon.tech` / `*.vercel-storage.com` hosts and node-postgres for every other host, so a Docker
database needs no code changes.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled Neon connection used at runtime. |
| `DATABASE_URL_UNPOOLED` | for migrations | Direct connection used by Drizzle Kit. |
| `TEST_MODE` | no | `"true"` enables `POST /api/test/*`. Anything else disables it. |
| `TEST_SECRET` | when test mode is on | Minimum 16 characters. Sent as `x-brownout-test-secret`. |
| `CRON_SECRET` | for the drill clock | Minimum 16 characters. Vercel Cron sends it as `Authorization: Bearer …`. Without it `/api/cron/tick` answers 404. |

Environment validation uses a Zod schema. A bad configuration fails on the first server access with
one message that names every invalid variable and never prints its value:

```
E-ENV-500 Invalid server environment. Fix these variables in .env or the deployment settings:
  - DATABASE_URL is required
```

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server on port 3000 |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm check` | Biome lint + format check |
| `pnpm test` | Vitest unit suite |
| `pnpm test:e2e` | Browser suite against a running `pnpm dev` (Chrome, HTTP, real database) |
| `pnpm db:generate` | Generate a SQL migration from the Drizzle schema |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm seed` | Idempotent curated seed |

## Folder layout

```
src/
  routes/            public pages, auth, app/*, report/$token, rulebook, api/*
  server/            db client + schema, auth guards, scenario CRUD, drill lifecycle
    drills/          start, pause, resume, reset, act, advance, evaluate, share, report
  engine/            pure TypeScript domain logic — no I/O, no clock, no randomness
    crypto.ts        SHA-256 / HMAC-SHA256, pinned against node:crypto
    delivery.ts      signing, retries, idempotency, reordering window, schedule
    actions.ts       the five mitigations and their scoring effect
    metrics.ts       deterministic per-tick metrics and SLA windows
    run.ts           the whole drill: log, metrics, score, dead letters
  components/        in-house UI primitives and layout
  lib/               error registry, i18n dictionary, coverage map, rate-limit math
drizzle/             generated SQL migrations and snapshots
netlify/functions/   scheduled cron-tick trigger for the drill clock
scripts/             migrate and seed scripts
tests/               Vitest unit tests, one file per requirement family
```

## Data model

`users`, `sessions`, `scenarios`, `drills`, `drill_events`, `deliveries`, `actions`, `scores`,
`share_links`, `rate_limit_hits`. The first migration lives in `drizzle/`.

Session tokens are 32 random bytes, stored only as a SHA-256 hash. Cookies are `httpOnly`,
`SameSite=Lax`, and `Secure` in production. Sessions live in the database and expire after 7 days.

## Determinism rules

1. No `Date.now`, `Math.random`, `performance.now`, or `new Date()` inside `src/engine`.
   `tests/determinism.test.ts` scans the folder and fails the build if one appears.
2. Randomness comes from `createRng(seed)` (mulberry32).
3. The drill clock is a virtual tick. Real time only appears in session expiry and audit timestamps.
4. Unit tests use fixed inputs — never today's date.

## Stable error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `E-AUTH-001` | 401 | Wrong credentials |
| `E-AUTH-002` | 422 | Invalid email |
| `E-AUTH-003` | 422 | Password shorter than 8 characters |
| `E-AUTH-004` | 401 | Expired session |
| `E-AUTH-005` | 409 | Email already registered |
| `E-ROLE-403` | 403 | Observer attempted a write |
| `E-STATE-409` | 409 | Illegal drill state transition |
| `E-BLD-NAME` / `E-BLD-TICKS` / `E-BLD-EVENTS` | 422 | Scenario builder limits |
| `E-BLD-JSON` / `E-BLD-PAYLOAD` / `E-BLD-TARGET` / `E-BLD-FAILURE` | 422 | Scenario builder content |
| `E-SIG-401` | 401 | Webhook signature invalid |
| `E-RATE-429` | 429 | More than 5 drill starts per minute |
| `E-TEST-401` | 401 | Missing or wrong test secret |
| `E-INPUT-400` | 400 | Malformed request body |
| `E-NOT-FOUND-404` | 404 | Unknown resource |
| `E-ENV-500` | 500 | Invalid server environment |
| `E-DB-500` | 500 | Database unavailable |

`/rulebook` renders the same table in both languages.

## Test mode

Both endpoints require `TEST_MODE=true` and the secret header. With test mode off they return
`404`; with a wrong secret they return `401 E-TEST-401`.

```bash
curl -X POST http://localhost:3000/api/test/reset \
  -H "x-brownout-test-secret: $TEST_SECRET"

curl -X POST http://localhost:3000/api/test/advance-tick \
  -H "x-brownout-test-secret: $TEST_SECRET" \
  -H "content-type: application/json" \
  -d '{"drillId":"<uuid>"}'
```

`reset` deletes drills that belong to scenarios owned by demo accounts and clears rate-limit hits.
It never deletes users or scenarios, and it cannot touch non-demo data.

## Virtual clock

One tick is one virtual second. Nothing runs in the background on serverless, so the clock is
materialised lazily: `drills.updated_at` is the anchor, and every read (`getDrillDetail`,
`performAction`, `pauseDrill`, the report page) catches the drill up to now with a conditional
`UPDATE … WHERE tick = <the tick just read>`. Pause and resume move the anchor, so a paused drill
does not age; reaching the tick limit marks the drill `FAILED` and scores it.

`vercel.json` schedules `GET /api/cron/tick` every minute so drills nobody is watching still move
forward. The route requires `CRON_SECRET`; on plans that cannot run per-minute crons, call
`catchUpActiveDrills()` from any other scheduler instead. The same catch-up still runs on read, so
the clock stays correct either way.

## Health

`GET /api/health` returns `{ status, db, testMode, version }`. It always answers `200`; `status` is
`degraded` when the database check fails, so a platform liveness probe stays green while the payload
tells you what is broken.

## What the TestSprite suite covers

_To be filled once the suite exists in the TestSprite portal._ Planned families: auth and roles,
scenario builder limits, state machine, delivery/receiver, scoring and reports, live view, security
limits, empty and error states.

## Requirement coverage

Every functional requirement in PRD sections A-I is pinned by a test whose `describe` block names
the requirement ID. The same table is rendered on `/rulebook` from `src/lib/coverage.ts`, so the UI
and the docs cannot drift from the suite.

| Requirement | What the test pins | Test file |
| --- | --- | --- |
| `FR-A1` | Email + password sign-in with stable auth codes | `tests/auth-rules.test.ts` |
| `FR-A2` | Expired sessions are rejected | `tests/auth-rules.test.ts` |
| `FR-A3` | Observer cannot create or run (E-ROLE-403) | `tests/auth-rules.test.ts` |
| `FR-B1` | Name length 3-60 | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B2` | Tick limit 10-600 | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B3` | At most 20 events, payload at most 4 KB | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B4` | Allowed failure modes only | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B5` | Sandbox receiver target only (E-BLD-TARGET) | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B6` | Hostile text stored verbatim, never executed | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B7` | DRAFT becomes READY only after validation | `tests/fr-b-scenario-builder.test.ts` |
| `FR-C` | Transition table, E-STATE-409 for anything else | `tests/fr-c-state-machine.test.ts` |
| `FR-D1` | Sequence, Idempotency-Key, HMAC signature over seq.body | `tests/fr-d-delivery.test.ts` |
| `FR-D2` | Three attempts, backoff 1 then 2, then DEAD_LETTER | `tests/fr-d-delivery.test.ts` |
| `FR-D3` | Bad signature rejected with E-SIG-401 | `tests/fr-d-delivery.test.ts` |
| `FR-D4` | Repeated Idempotency-Key marked duplicate | `tests/fr-d-delivery.test.ts` |
| `FR-D5` | Out-of-order messages held (max 3) then released in order | `tests/fr-d-delivery.test.ts` |
| `FR-D6` | timeout / http500 surface in the log, never crash | `tests/fr-d-delivery.test.ts` |
| `FR-E` | Five actions, wrong actions recorded and penalised | `tests/fr-e-actions.test.ts` |
| `FR-F` | Scoring weights, grade bands, documented built-in scores | `tests/fr-f-scoring.test.ts` |
| `FR-H` | Same seed and timeline produce an identical log and score | `tests/fr-h-determinism.test.ts` |
| `FR-I1` | No free-form delivery target, no outbound requests | `tests/fr-i-security.test.ts` |
| `FR-I2` | Five drill starts per minute, then E-RATE-429 | `tests/fr-i-security.test.ts` |
| `FR-I3` | Payload and event ceilings | `tests/fr-i-security.test.ts` |

Boundary cases are tested at the exact edges: name 3/60 vs 2/61, ticks 10/600 vs 9/601, 20 vs 21
events, payload 4096 vs 4097 bytes, MTTA at tick 3 vs 4, and the tick limit at `maxTicks` vs
`maxTicks + 1`. The three curated scenarios also have documented exact scores for four fixed action
timelines in `tests/fr-f-scoring.test.ts`.

## Accessibility and i18n

- Semantic landmarks (`header`, `nav`, `main`, `footer`), one `h1` per page, labelled form controls.
- Visible focus ring on every interactive element; skip link to `#main`.
- AA contrast on the dark palette (zinc-100 on zinc-950, amber-300 accents).
- Language switcher (EN/ID) writes a cookie and re-renders on the server; all copy lives in
  `src/lib/i18n/messages.ts`.

## Project rules

1. Verify every API against current official docs; never invent an API or flag.
2. Small PRs, one concern each, conventional commits. Never push to `main`.
3. Never weaken or delete a test, and never edit seed/demo data to turn a check green.
4. Determinism: virtual tick plus seeded randomness inside `src/engine`.
5. Every user-visible error has a stable code; every interactive element has a `data-testid`.
6. No secrets in the repo — `.env.example` only.
7. UI copy lives in the i18n dictionary (EN + ID).
8. Accessibility baseline: semantics, focus, AA contrast, keyboard access.
9. Ambiguity is resolved by the simplest deterministic option and recorded as an assumption.

## Assumptions made in this milestone

1. **The repository starts with a single foundation commit on `main`.** No pull request was
   opened; the PR-based workflow and branch protection begin with the next change.
2. **Default locale is English.** Indonesian is one click away and persists in a cookie. Chosen so
   the default demo path is readable for judges; both dictionaries are complete.
3. **Health returns 200 even when the database is down**, with `status: "degraded"`. This keeps
   platform liveness probes meaningful; a stricter 503 can be added when a real readiness probe
   exists.
4. **Test endpoints return 404 when `TEST_MODE` is off** rather than 403, so production does not
   advertise them. When enabled, both the flag and a 16+ character secret are required.
5. **`E-AUTH-005` was added** for duplicate signup emails. The PRD only defines four auth codes and
   reusing `E-AUTH-002` ("invalid email") for "already registered" would be misleading.
6. **Two database drivers, no interactive transactions.** Neon hosts use the HTTP driver; other
   hosts (local Docker, plain Postgres) use node-postgres. Both run without interactive
   transactions, so state changes are single conditional statements and double-clicks cannot
   produce two states. Later PRs must use conditional `UPDATE ... WHERE state = ...` for transitions.
7. **bcrypt cost 10.** Fast enough for serverless cold starts, above the common minimum. bcryptjs is
   pure JavaScript with no native build step, and is actively maintained.
8. **Session TTL is 7 days**, stored in the database and hashed at rest. `E-AUTH-004` is shown when a
   session row exists but has expired.
9. **Demo seed is curated** and labelled in the UI and here. The seed is idempotent and never touches
   non-demo users.
10. **A newly created scenario stays DRAFT** until `publishScenario` re-validates the stored
    definition and promotes it to READY (FR-B7). Only READY scenarios can start a drill.
11. **Rate limit is 5 starts per minute per user** (single-workspace app), measured with
    `rate_limit_hits`. The pure decision function is unit tested; the DB path is intentionally thin.
12. **The live view polls, it does not use SSE.** TanStack Query refetches the drill every two
    seconds (FR-H1); polling survives serverless cold starts and is easy to test. `?motion=off` is
    honoured by the console, and a failed poll shows `Menyambung ulang… / Reconnecting…` (FR-H4).
13. **Server-only modules use the documented `.server.ts` suffix** (`auth.server.ts`,
    `session.server.ts`, `scenarios.server.ts`, `client.server.ts`). `*.functions.ts` files contain
    only `createServerFn` wrappers, so bcrypt, `pg`, and Drizzle never reach the browser bundle.
14. **The migration runner is `scripts/migrate.ts`** using `drizzle-orm/node-postgres/migrator`
    instead of `drizzle-kit migrate`. Drizzle Kit auto-selects the Neon driver, which cannot reach
    a local Postgres; the script works for both Neon direct URLs and local containers.
15. **The unit suite is 310 tests** across auth rules, the state machine, scoring, the delivery
    engine and receiver, validation, rate limit, env schema, error registry, i18n parity, engine
    purity, the HMAC implementation (pinned against `node:crypto`), and one file per requirement
    family in section 5 of the PRD.

16. **Every transport failure uses the same retry ladder.** `http500`, `timeout`, and `drop` all
    fail the attempt, back off 1 then 2 ticks, and dead-letter on the third. `drop` means the
    request never reached the receiver, but retrying it keeps FR-D2 as one rule instead of three.

17. **An `out_of_order` event is delivered after its successor.** The schedule moves it one tick
    past the next event so the receiver has to hold it; a trailing out-of-order event waits a fixed
    two ticks. This is what makes FR-D5 observable in a log rather than only in a unit test.

18. **An action is correct only when it is a required action that has not run yet.** A wrong action
    and a repeat of a correct action are both recorded and cost five points. One rule, no special
    cases, and it matches "wrong actions are recorded and penalised".

19. **SLA windows are ten ticks wide.** A window costs ten points once, no matter how many ticks
    inside it are critical. Per-tick charging would zero out any long incident, which makes the
    score useless; the PRD wording ("jendela tick") supports a window.

20. **Metrics are a deterministic function of seed, tick, and completed mitigations.** Each tick
    draws ±10% jitter from `createRng(seed + tick * 7919)` and multiplies the scenario baseline by
    `0.6` per completed mitigation. A tick is critical when error rate > 5%, latency > 500 ms, or
    queue depth > 100.

21. **The engine replay is the scoring authority.** The server stores the action timeline and
    recomputes the score with `runScenario`, so a stored report can never disagree with the engine.

22. **Mutations are conditional updates, which are the optimistic lock.** Every transition is
    `UPDATE drills SET state = ... WHERE id = ... AND state IN (...)`; the losing side of a
    double-click updates zero rows and gets `E-STATE-409`. Neon's HTTP driver has no interactive
    transactions, so this is the strongest guarantee available without a connection pool.

23. **Auth forms use `method="post"`.** A submit before hydration would otherwise fall back to a
    native GET and put the password in the URL, history, and referrer.

24. **The clock is lazy, with cron as a backstop.** Ticks are derived from the last drill write, so
    a drill with no open page stays consistent when it is next read. Vercel Cron every minute keeps
    the stored state from lagging behind that read; both paths share `catchUpClock`.

25. **Failed sign-ins are throttled per email: five failures per five minutes.** Successful sign-in
    clears the counter, unknown emails do a dummy bcrypt compare so timing does not reveal whether
    an account exists, and the sixth attempt answers `E-RATE-429` with a retry hint. Drill starts
    keep their separate PRD budget of five per minute.
