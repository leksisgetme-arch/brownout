<div align="center">

<img src="publics/landing-Hero.png" alt="Brownout landing page: rehearse the bad day before it happens" width="100%" />

# Brownout

**Rehearse the bad day before it happens.**

A deterministic incident-drill simulator: run an incident scenario, respond before the virtual tick
limit, and get a score you can explain line by line — plus a report that names the next thing to fix.

[![Live app](https://img.shields.io/badge/live-brownout--860.netlify.app-0f766e?style=flat-square)](https://brownout-860.netlify.app)
[![Rulebook](https://img.shields.io/badge/in--app-rulebook-d97706?style=flat-square)](https://brownout-860.netlify.app/rulebook)
[![Unit tests](https://img.shields.io/badge/unit%20tests-338%20passing-0f766e?style=flat-square)](#test-layers)
[![Portal cases](https://img.shields.io/badge/portal%20cases-69-1d4ed8?style=flat-square)](#what-the-portal-suite-checks)
[![Stack](https://img.shields.io/badge/TanStack%20Start-React%2019-111827?style=flat-square)](#stack)

**Live:** [brownout-860.netlify.app](https://brownout-860.netlify.app) ·
**Source:** [leksisgetme-arch/brownout](https://github.com/leksisgetme-arch/brownout) ·
**Rulebook:** [/rulebook](https://brownout-860.netlify.app/rulebook) ·
**No-login demo:** [/demo](https://brownout-860.netlify.app/demo)

</div>

---

## Contents

1. [The problem](#the-problem)
2. [The product](#the-product)
3. [How a drill is scored](#how-a-drill-is-scored)
4. [Architecture](#architecture)
5. [Testing](#testing)
6. [Reference](#reference)
7. [Deployment](#deployment)
8. [Hackathon submission](#hackathon-submission-testsprite-season-4)
9. [Project rules](#project-rules)
10. [Decisions and assumptions](#decisions-and-assumptions)

---

## The problem

On-call teams write runbooks and almost never rehearse them. When a real incident lands, the runbook
is read for the first time under pressure: the mitigation order is guessed, the "is this even
fixable?" question is answered by trial, and nobody can say afterwards whether the response was good
or merely lucky.

Brownout makes the runbook rehearsable. A scenario is a seed, a clock, a set of injected delivery
failures and a reference solution. Running it produces a score computed from the response timeline,
and the same run can be replayed after the runbook changes to see whether the team actually improved.

## The product

| | |
| --- | --- |
| **Who it is for** | On-call engineers and incident commanders who own a runbook and want evidence that it works. |
| **What you do** | Start a drill, watch the incident timeline arrive as signed webhooks, pick mitigations before the tick limit. |
| **What you get** | A graded report: score with every penalty named, MTTA/MTTR, dead letters, and a fix list for next time. |
| **Why it is different** | The score is a pure function of a deterministic run, and every scenario ships with a reference solution, so "this runbook is winnable" is a fact instead of an opinion. |

### The loop

The app is built around one loop, not a dashboard full of widgets.

```mermaid
flowchart LR
  T["Today<br/>readiness + next drill"] --> D["Drill room<br/>mitigations under a clock"]
  D --> R["Report<br/>score + fix list"]
  R -->|same seed| D
  S["Library<br/>scenarios as runbooks"] -->|verify| P["Reference solution<br/>par score"]
  P --> T
```

| Step | What the user sees | What backs it |
| --- | --- | --- |
| **Today** | Readiness = mean of the last five graded drills, a six-run trend, and one recommended scenario (never graded first, then the lowest score). | `src/lib/readiness.ts`, pure and unit tested |
| **Drill room** | Tick countdown, live metrics against the engine's SLA thresholds, five mitigations, and immediate per-action feedback (correct / wrong / repeat) without revealing the required list. | `performAction` + `runScenario` replay |
| **Report** | Score, grade, penalty breakdown, MTTA/MTTR, dead letters, and **what to fix next**. | `buildFixList` over the stored action timeline |
| **Re-run** | One click back into the same scenario. Same seed, so the next score is comparable. | Deterministic engine |
| **Library** | Every scenario can be verified: a reference solution is replayed through the scoring engine and reports *winnable*, the resolve tick, and the par score. | `verifyScenario` |
| **Builder** | Name, seed, tick limit, baseline metrics, required actions, and the event schedule. A draft with required actions becomes a drill that can actually be won. | `validateScenario`, DRAFT → READY |

### The 60-second demo

| Role | Email | Password |
| --- | --- | --- |
| Commander | `commander@brownout.dev` | `Brownout123!` |
| Observer | `observer@brownout.dev` | `Brownout123!` |

1. Open the live URL and sign in as the Commander.
2. The dashboard opens on **Today**: readiness, a trend, and the one drill to run next.
3. Start it. The drill room asks for mitigation actions while the virtual clock runs.
4. Finish, or run out of time. The **report** gives a score, its exact penalties, and a fix list.
5. Press **Run this scenario again** — same seed, so the comparison is fair.

A guest can open any shared report without signing in and sees no action buttons (`FR-A4`). The
public `/demo` page renders the engine output read-only, also without a login.

### Screenshots

Every screen below is a real run of the app against a real database, not a mockup.

**Today — readiness, trend, and the one drill to run next**

<img src="publics/dashboard-today.png" alt="Dashboard with readiness, a six-run trend and the next drill" width="100%" />

**Drill room — mitigations under a clock, live metrics, delivery log**

<img src="publics/drill-detaile.png" alt="Drill room with controls, actions, live metrics and the delivery log" width="100%" />

**Report — score with every penalty named, fix list, and a same-seed re-run**

<img src="publics/report-artifact.png" alt="Post-incident report with the penalty breakdown, fix list and re-run button" width="100%" />

**Library — is this runbook actually winnable?**

<img src="publics/verify-scenario.png" alt="Scenario page with the verified reference solution and par score" width="100%" />

**Incident console — SLA pressure and the webhook feed**

<img src="publics/dagsboard.png" alt="Live incident console with SLA pressure chart and the delivery feed" width="100%" />

**Landing — the deterministic clock, scrubbed by scrolling**

<img src="publics/stc.png" alt="Landing page scrubbing the deterministic drill clock" width="100%" />

---

## How a drill is scored

```
score = 100
      − max(0, MTTA_ticks − 3)          # one point per tick after the 3-tick grace
      − 5 × wrongActions               # a wrong action and a repeat both count
      − 10 × SLA_breach_windows        # a window is 10 ticks wide, charged once
      − 5 × hintsUsed
```

Grades: **A** ≥ 90, **B** ≥ 75, **C** ≥ 60, **D** ≥ 40, **F** below 40.

Worked example, taken from a real run in the screenshots: first action at tick 10, one wrong action,
five SLA windows, no hints.

```
100 − (10 − 3) − (5 × 1) − (10 × 5) = 38 → F
```

The report prints exactly those rows and `/rulebook` documents the same weights. One source of truth:
`src/engine/scoring.ts`.

---

## Architecture

```mermaid
flowchart TB
  subgraph Browser
    UI["React 19 + TanStack Router<br/>Today · Drill · Report · Library"]
  end

  subgraph Server["TanStack Start (server functions)"]
    AUTH["Auth + role guards<br/>hashed sessions, throttled sign-in"]
    DRILL["Drill lifecycle<br/>start · pause · resume · act · reset"]
    SCEN["Scenario CRUD<br/>validate · publish · verify"]
    CLOCK["Virtual clock<br/>lazy catch-up + cron backstop"]
  end

  subgraph Pure["src/engine — no I/O, no clock, no randomness"]
    SM["State machine<br/>7 states"]
    DEL["Delivery engine<br/>HMAC · seq · idempotency · reorder window · retries"]
    MET["Metrics + SLA windows"]
    SCORE["Scoring"]
    RUN["runScenario()<br/>the whole drill"]
  end

  DB[("Postgres / Neon<br/>users · scenarios · drills · deliveries · scores")]
  RECV["Sandbox receiver<br/>in-process only, never a user URL"]

  UI -->|server functions| AUTH
  UI --> DRILL
  UI --> SCEN
  DRILL --> CLOCK
  DRILL --> RUN
  SCEN --> RUN
  RUN --> SM
  RUN --> DEL
  RUN --> MET
  RUN --> SCORE
  DEL --> RECV
  AUTH --> DB
  DRILL --> DB
  SCEN --> DB
  CLOCK --> DB
```

### Stack

| Layer | Choice |
| --- | --- |
| Framework | TanStack Start (React 19, TypeScript strict) |
| Routing | TanStack Router, file-based routes in `src/routes` |
| Data fetching | TanStack Query with the router SSR integration |
| Database | Neon serverless Postgres (HTTP driver in production, `pg` locally) |
| ORM | Drizzle ORM + generated migrations |
| Styling | Tailwind CSS v4, small in-house headless components |
| Passwords | `bcryptjs` (pure JS, serverless-safe) |
| Tests | Vitest (unit), `node:test` + Playwright (browser e2e) |
| Lint / format | Biome |
| Deploy | Netlify (continuous deploy) and Vercel (Nitro) |

### Folder layout

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
  components/        in-house UI primitives, TodayPanel, IncidentConsole
  lib/               error registry, i18n dictionary, coverage map, readiness math
drizzle/             generated SQL migrations and snapshots
netlify/functions/   scheduled cron-tick trigger for the drill clock
scripts/             migrate and seed scripts
tests/               Vitest unit tests, one file per requirement family
```

### The drill lifecycle

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> READY: validation passes
  READY --> RUNNING: start (5 per minute)
  RUNNING --> PAUSED: pause
  PAUSED --> RUNNING: resume
  RUNNING --> RESOLVED: every required action applied
  RUNNING --> FAILED: tick limit reached
  RESOLVED --> EVALUATED: score from the engine replay
  FAILED --> EVALUATED: score from the engine replay
  RUNNING --> READY: reset
  PAUSED --> READY: reset
```

Anything else answers `E-STATE-409` and leaves the state untouched. Mutations are conditional
`UPDATE … WHERE state = …`, which is the optimistic lock: a double click loses the race and gets
`E-STATE-409` instead of producing two states.

### Delivery engine and the sandbox receiver

```mermaid
sequenceDiagram
  participant E as Engine
  participant S as Scheduler
  participant R as Sandbox receiver
  participant L as Run log

  E->>S: events (tick, seq, payload, failure mode)
  S->>R: signed delivery (HMAC over seq.body)
  R-->>S: delivered / held / duplicate / rejected
  S-->>L: attempt and status

  alt http500, timeout, or drop
    S->>R: retry at +1 tick
    S->>R: retry at +2 ticks
    R-->>S: still failing
    S-->>L: dead_letter (attempt 3)
  end

  Note over R: Out-of-order messages wait in a 3-slot window<br/>and are released in seq order.
```

- One receiver, `sandbox://brownout/receiver`. There is no free-form URL and no outbound request.
- Each delivery carries `seq`, `Idempotency-Key`, and an HMAC signature; a repeat is logged as
  `duplicate`, a bad signature is rejected with `E-SIG-401`.
- The delivery log is persisted from the engine's own output up to the current tick, keyed by
  `(drill, seq)`, so replaying a tick is idempotent.

### Determinism rules

1. No `Date.now`, `Math.random`, `performance.now`, or `new Date()` inside `src/engine`.
   `tests/determinism.test.ts` scans the folder and fails the build if one appears.
2. Randomness comes from `createRng(seed)` (mulberry32).
3. The drill clock is a virtual tick. Real time appears only in session expiry and audit timestamps.
4. Unit tests use fixed inputs — never today's date.

One tick is one virtual second. Nothing runs in the background on serverless, so the clock is
materialised lazily: `drills.updated_at` is the anchor, and every read catches the drill up to now
with a conditional `UPDATE … WHERE tick = <the tick just read>`. Pause and resume move the anchor, so
a paused drill does not age. A minute cron (`GET /api/cron/tick`) is the backstop for drills nobody
is watching.

### Data model

`users`, `sessions`, `scenarios`, `drills`, `drill_events`, `deliveries`, `actions`, `scores`,
`share_links`, `rate_limit_hits`.

Session tokens are 32 random bytes, stored only as a SHA-256 hash. Cookies are `httpOnly`,
`SameSite=Lax`, and `Secure` in production. Sessions live in the database and expire after 7 days.
A shared report is a random 16-byte token in `share_links`; it never exposes a session and expires
30 days after the link is created.

---

## Testing

The suite is layered so each layer proves something the others cannot.

### Test layers

| Layer | Scale | What it proves |
| --- | --- | --- |
| Unit (Vitest) | 338 tests in 21 files | Pure rules: state transitions, delivery retries, HMAC, scoring, builder limits, rate limiting, i18n parity, determinism. |
| Browser e2e (`node:test` + Playwright) | 8 tests | The real app over HTTP and a real database: sign-in, throttling, the test-mode clock, the console, the mobile menu, the guest report. |
| Portal suite (TestSprite) | 69 generated cases | Behaviour against a PR preview: roles, states, boundaries, `E-*` codes, report numbers. |

```bash
pnpm check       # Biome lint + format
pnpm typecheck   # tsc --noEmit
pnpm test        # 338 unit tests
pnpm test:e2e    # browser suite against a running app
pnpm build       # production build
```

`pnpm test:e2e` needs a reachable instance (`pnpm dev` in another terminal, or
`BROWNOUT_BASE_URL=https://…`) plus a local Chrome (`CHROME_PATH` overrides the lookup).

### Requirement coverage

Every functional requirement in the PRD sections A–I is pinned by a test whose `describe` block names
the requirement ID. The same table is rendered on `/rulebook` from `src/lib/coverage.ts`, so the UI and
the docs cannot drift from the suite.

| Requirement | What the test pins | Test file |
| --- | --- | --- |
| `FR-A1` | Email + password sign-in with stable auth codes | `tests/auth-rules.test.ts` |
| `FR-A2` | Expired sessions are rejected | `tests/auth-rules.test.ts` |
| `FR-A3` | Observer cannot create or run (`E-ROLE-403`) | `tests/auth-rules.test.ts` |
| `FR-B1` | Name length 3–60 | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B2` | Tick limit 10–600 | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B3` | At most 20 events, payload at most 4 KB | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B4` | Allowed failure modes only | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B5` | Sandbox receiver target only (`E-BLD-TARGET`) | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B6` | Hostile text stored verbatim, never executed | `tests/fr-b-scenario-builder.test.ts` |
| `FR-B7` | DRAFT becomes READY only after validation | `tests/fr-b-scenario-builder.test.ts` |
| `FR-C` | Transition table, `E-STATE-409` for anything else | `tests/fr-c-state-machine.test.ts` |
| `FR-D1` | Sequence, Idempotency-Key, HMAC over `seq.body` | `tests/fr-d-delivery.test.ts` |
| `FR-D2` | Three attempts, backoff 1 then 2, then `dead_letter` | `tests/fr-d-delivery.test.ts` |
| `FR-D3` | Bad signature rejected with `E-SIG-401` | `tests/fr-d-delivery.test.ts` |
| `FR-D4` | Repeated Idempotency-Key marked duplicate | `tests/fr-d-delivery.test.ts` |
| `FR-D5` | Out-of-order messages held (max 3) then released in order | `tests/fr-d-delivery.test.ts` |
| `FR-D6` | timeout / http500 surface in the log, never crash | `tests/fr-d-delivery.test.ts` |
| `FR-E` | Five actions, wrong actions recorded and penalised | `tests/fr-e-actions.test.ts` |
| `FR-F` | Scoring weights, grade bands, documented built-in scores | `tests/fr-f-scoring.test.ts` |
| `FR-H` | Same seed and timeline produce an identical log and score | `tests/fr-h-determinism.test.ts` |
| `FR-I1` | No free-form delivery target, no outbound requests | `tests/fr-i-security.test.ts` |
| `FR-I2` | Five drill starts per minute, then `E-RATE-429` | `tests/fr-i-security.test.ts` |
| `FR-I3` | Payload and event ceilings | `tests/fr-i-security.test.ts` |

Boundary cases sit on the exact edge: name 3/60 vs 2/61, ticks 10/600 vs 9/601, 20 vs 21 events,
payload 4096 vs 4097 bytes, MTTA at tick 3 vs 4, and the tick limit at `maxTicks` vs `maxTicks + 1`.
The curated scenarios also have documented exact scores for four fixed action timelines in
`tests/fr-f-scoring.test.ts`.

### What the portal suite checks

The TestSprite GitHub App owns the behavioural suite; `ci.yml` deliberately runs only static analysis
and unit tests so the two never duplicate work. The 69 portal cases are organised around the same
contracts the app exposes.

| Family | What the cases assert |
| --- | --- |
| Auth and roles | Stable auth codes, throttled sign-in, observer gets `E-ROLE-403` on every mutation |
| Scenario builder | Exact boundaries: name 3/60 vs 2/61, ticks 10/600 vs 9/601, 20 vs 21 events, 4096 vs 4097 bytes, sandbox target only |
| State machine | Illegal transitions answer `E-STATE-409` and never change the stored state |
| Delivery and receiver | seq order, HMAC signature, duplicate, out-of-order hold and release, retry ladder, dead letters |
| Actions and scoring | Correct vs wrong vs repeat, `wrongActions` increments once, exact score from the breakdown |
| Report | Report numbers equal the engine run; the fix list names the real failure; guests get no buttons |
| Today and re-run | Readiness updates after a graded run, the recommendation changes, the second run is comparable |
| Reference solution | Replay is deterministic: same scenario, same par score, twice |
| i18n, a11y, mobile | EN/ID parity, keyboard focus, no horizontal scroll at 360 px |

Every interactive element carries a `data-testid` (202 hooks today) and every user-visible failure
carries a stable code, so a generated test never has to match on prose.

### Test mode and the virtual clock

With `TEST_MODE=true` the wall clock is frozen: an open drill only moves when the operator clicks
**Advance tick**, so a browser run can reproduce an exact tick instead of racing the clock. With the
flag off, drills use the automatic one-tick-per-second clock. The public deployment keeps it off for
the production context, so a visitor sees the real clock, while deploy previews keep it on so the
portal suite can step the clock one tick at a time. Either way the two test endpoints are
secret-gated: `404` when the flag is off, `401 E-TEST-401` when the secret is wrong.

```bash
curl -X POST http://localhost:3000/api/test/reset \
  -H "x-brownout-test-secret: $TEST_SECRET"

curl -X POST http://localhost:3000/api/test/advance-tick \
  -H "x-brownout-test-secret: $TEST_SECRET" \
  -H "content-type: application/json" \
  -d '{"drillId":"<uuid>"}'
```

`reset` deletes drills that belong to scenarios owned by demo accounts and clears rate-limit hits. It
never deletes users or scenarios, and it cannot touch non-demo data.

---

## Reference

### Stable error codes

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

### Getting started

```bash
pnpm install
cp .env.example .env      # then paste your Neon URLs
pnpm db:migrate           # applies drizzle/*.sql to DATABASE_URL_UNPOOLED
pnpm seed                 # creates the two demo accounts and the curated scenarios
pnpm dev                  # http://localhost:3000
```

Local Postgres works too: point both URLs at
`postgresql://postgres:postgres@localhost:5432/brownout`. The runtime uses the Neon HTTP driver for
`*.neon.tech` / `*.vercel-storage.com` hosts and node-postgres for every other host, so a Docker
database needs no code changes.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled Neon connection used at runtime. |
| `DATABASE_URL_UNPOOLED` | for migrations | Direct connection used by Drizzle Kit. |
| `TEST_MODE` | no | `"true"` freezes the clock and enables `POST /api/test/*`. Anything else disables it. |
| `TEST_SECRET` | when test mode is on | Minimum 16 characters. Sent as `x-brownout-test-secret`. |
| `CRON_SECRET` | for the drill clock | Minimum 16 characters. Vercel Cron sends it as `Authorization: Bearer …`. Without it `/api/cron/tick` answers 404. |

A bad configuration fails on the first server access with one message that names every invalid
variable and never prints its value (`E-ENV-500`).

### Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server on port 3000 |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm check` | Biome lint + format check |
| `pnpm test` | Vitest unit suite |
| `pnpm test:e2e` | Browser suite against a running app (Chrome, HTTP, real database) |
| `pnpm db:generate` | Generate a SQL migration from the Drizzle schema |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm seed` | Idempotent curated seed |

### Health

`GET /api/health` returns `{ status, db, testMode, version }`. It always answers `200`; `status` is
`degraded` when the database check fails, so a platform liveness probe stays green while the payload
tells you what is broken.

### Accessibility and i18n

- Semantic landmarks (`header`, `nav`, `main`, `footer`), one `h1` per page, labelled form controls.
- Visible focus ring on every interactive element; skip link to `#main`.
- AA contrast on the dark palette.
- Language switcher (EN/ID) writes a cookie and re-renders on the server; all copy lives in
  `src/lib/i18n/messages.ts`, and a parity test fails if one dictionary drifts.
- Action feedback is an `<output>` element, so screen readers announce it without stealing focus.

---

## Deployment

One tree, two targets. `vite.config.ts` picks the server plugin from `DEPLOY_TARGET`, so neither
target forces a branch.

| Target | Server plugin | Config | Deploy command |
| --- | --- | --- | --- |
| Netlify | `@netlify/vite-plugin-tanstack-start` | `netlify.toml` | `netlify deploy --build --prod` |
| Vercel | Nitro | `vercel.json` | `vercel deploy --prod` |

Netlify sets `DEPLOY_TARGET=netlify` in `[build.environment]`; anything else (pushes to Vercel, local
dev) keeps Nitro. Both plugins own the server output, so exactly one may be active per build.

Continuous deployment runs from `.github/workflows/netlify.yml`: on every push to `main` it repeats
the CI gate (Biome, `tsc`, Vitest), builds, and publishes with the same `netlify.toml` a local
`netlify deploy --build --prod` uses. Every pull request additionally gets its own preview at
`https://pr-<n>--brownout-860.netlify.app`.

The per-minute drill clock has a single implementation — `GET /api/cron/tick` — and two triggers: the
Vercel Cron entry in `vercel.json`, and the Netlify scheduled function in
`netlify/functions/cron-tick.ts`, which calls the route with `CRON_SECRET`. Netlify scheduled
functions run on published deploys only, never on deploy previews.

---

## Hackathon submission (TestSprite Season 4)

Brownout is a submission to TestSprite Hackathon Season 4.

### Submission essentials

| Item | Value |
| --- | --- |
| Repository | https://github.com/leksisgetme-arch/brownout |
| Live app | https://brownout-860.netlify.app |
| Demo accounts | `commander@brownout.dev` / `observer@brownout.dev`, password `Brownout123!` |
| PR-gated suite | 69 cases in the TestSprite portal, run against the PR preview |
| Local gate | Biome + `tsc` + 338 Vitest tests on every PR, plus 8 browser e2e tests |
| Docs for the test agent | [`PRD.testsprite.md`](PRD.testsprite.md) — URL map, selector contract, error codes, invariants |

---

## Project rules

These are the rules the work followed, kept here so the repository explains its own conventions.

1. Verify every API against current official docs; never invent an API or flag.
2. Small PRs, one concern each, conventional commits.
3. Never weaken or delete a test, and never edit seed/demo data to turn a check green.
4. Determinism: virtual tick plus seeded randomness inside `src/engine`.
5. Every user-visible error has a stable code; every interactive element has a `data-testid`.
6. No secrets in the repo — `.env.example` only.
7. UI copy lives in the i18n dictionary (EN + ID).
8. Accessibility baseline: semantics, focus, AA contrast, keyboard access.
9. Ambiguity is resolved by the simplest deterministic option and recorded as an assumption.

## Decisions and assumptions

1. **Default locale is English.** Indonesian is one click away and persists in a cookie; both
   dictionaries are complete and parity-tested.
2. **Health returns 200 even when the database is down**, with `status: "degraded"`, so platform
   liveness probes stay meaningful.
3. **Test endpoints return 404 when `TEST_MODE` is off** rather than 403, so they are not advertised.
4. **`E-AUTH-005` was added** for duplicate signup emails; reusing `E-AUTH-002` would be misleading.
5. **Two database drivers, no interactive transactions.** State changes are single conditional
   statements, so a double click cannot produce two states.
6. **bcrypt cost 10**, pure JavaScript, no native build step.
7. **Session TTL is 7 days**, stored in the database and hashed at rest.
8. **Demo seed is curated** and labelled in the UI. The seed is idempotent and never touches
   non-demo users.
9. **A newly created scenario stays DRAFT** until `publishScenario` re-validates the stored
   definition (FR-B7). Only READY scenarios can start a drill.
10. **Rate limit is 5 starts per minute per user.** Sign-in failures are throttled separately: five
    failures per five minutes, with a dummy bcrypt compare for unknown emails.
11. **The live view polls, it does not use SSE.** Polling survives serverless cold starts and is easy
    to test.
12. **Server-only modules use the documented `.server.ts` suffix.** `*.functions.ts` files contain
    only `createServerFn` wrappers, so bcrypt, `pg`, and Drizzle never reach the browser bundle.
13. **The migration runner is `scripts/migrate.ts`**, because Drizzle Kit auto-selects the Neon
    driver and cannot reach a local Postgres.
14. **Every transport failure uses the same retry ladder.** `http500`, `timeout`, and `drop` all
    fail the attempt, back off 1 then 2 ticks, and dead-letter on the third.
15. **An `out_of_order` event is delivered after its successor**, so the receiver has to hold it —
    that is what makes FR-D5 observable in a log.
16. **An action is correct only when it is a required action that has not run yet.** A wrong action
    and a repeat both cost five points; one rule, no special cases.
17. **SLA windows are ten ticks wide** and charged once, so a long incident does not zero out for
    arithmetic reasons alone.
18. **Metrics are a deterministic function of seed, tick, and completed mitigations**, with ±10%
    jitter from a seeded RNG.
19. **The engine replay is the scoring authority.** The server stores the action timeline and
    recomputes the score, so a stored report can never disagree with the engine.
20. **The clock is lazy, with cron as a backstop.** Ticks are derived from the last drill write, so a
    drill with no open page stays consistent when it is next read.
21. **A scenario with no required action is not recommended** while a decision-bearing scenario
    exists: it resolves without asking the responder anything.
22. **`verifyScenario` is read-only.** It replays a reference solution through the pure engine and
    writes nothing, so observers may call it too.
23. **The fix list is derived from the same breakdown as the score.** It never invents a cause the
    engine did not charge for, and a drill without a score shows a "not scored yet" note instead.
