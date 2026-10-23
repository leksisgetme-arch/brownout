# Brownout — TestSprite PRD

**Product:** Brownout — deterministic incident-drill simulator
**Document purpose:** source of truth for generating and judging the end-to-end suite
**Version:** 2.0 (adds Today, per-action feedback, report fix list, reference solution)
**Language of the app:** English by default, Indonesian available from the header

---

## 1. What the product does

Brownout trains a team for the worst hour of an on-call rotation. A Commander writes an incident
scenario. Starting a drill replays that scenario as a timeline of sandbox webhook deliveries with
injected failures, on a virtual clock where **1 tick = 1 real second**. The responder applies
mitigation actions before the tick limit. The run is then scored by a pure, deterministic engine and
turned into a report that explains every point and lists what to fix next.

The product is not a dashboard of fake charts. Every number on screen is derived from the engine run.
The same seed and the same action timeline always produce the same log and the same score.

### What a judge should see in under two minutes

1. Sign in as the Commander.
2. The dashboard opens on **Today**: readiness, a trend, and one recommended drill.
3. Start it, apply mitigations, watch the metrics and the delivery log.
4. Finish (or time out) and read the report: score, penalty rows, fix list, share link.
5. Press **Run this scenario again** and compare.

---

## 2. Test environment

| Item | Value |
| --- | --- |
| Base URL | `https://brownout-860.netlify.app` |
| Local URL | `http://localhost:3000` (for a locally running build) |
| Browser | Chromium / Chrome, desktop, 1280 × 900 |
| Default language | English (`EN` selected in the header) |
| Session | Cookie-based; sessions last 7 days |

### Accounts (do not create new ones unless a case is about sign-up)

| Role | Email | Password | Can do |
| --- | --- | --- | --- |
| Commander | `commander@brownout.dev` | `Brownout123!` | Create scenarios, start/pause/reset drills, apply actions, create share links |
| Observer | `observer@brownout.dev` | `Brownout123!` | Read everything, write nothing |
| Guest | — | — | Open a shared report; no action controls of any kind |

A newly signed-up account is always an **Observer**. Do not expect it to be able to start a drill.

### Preflight (run before generating cases)

The deployed build must expose these surfaces. If any is missing, the deployment is stale: stop and
report it instead of testing an old UI.

- `/app` contains `[data-testid="today-panel"]` and `[data-testid="readiness-score"]`.
- A scenario page contains `[data-testid="verify-scenario"]`.
- A drill page shows `[data-testid="action-feedback"]` after the first action.
- A scored report contains `[data-testid="report-fix-list"]`.

---

## 3. Test data (curated scenarios)

These three scenarios are seeded and labelled “Curated”. Use them; do not invent scenarios for
destructive cases.

| Name | Seed | Tick limit | Required actions | Injected failures (tick) |
| --- | --- | --- | --- | --- |
| Expired deploy token | 1337 | 60 | `rotate_token`, `restart_worker` | `http500` (12), `timeout` (26) |
| Queue backpressure | 2024 | 90 | `scale_up`, `enable_circuit_breaker` | `duplicate` (18), `out_of_order` (33), `drop` (48) |
| Database failover | 777 | 120 | `failover_db` | `timeout` (21), `http500` (44) |

Failure modes: `http500`, `timeout`, `duplicate`, `out_of_order`, `drop`.

Action labels in the UI (EN): Restart worker, Scale up, Rotate token, Enable circuit breaker,
Fail over database. Their ids are `restart_worker`, `scale_up`, `rotate_token`,
`enable_circuit_breaker`, `failover_db`.

---

## 4. URL map

| Path | Auth | What it is |
| --- | --- | --- |
| `/` | public | Landing page with the scroll story and demo |
| `/demo` | public | Read-only engine preview, no login, no action buttons |
| `/rulebook` | public | Requirement coverage, error codes, a worked example |
| `/login`, `/signup` | public | Auth forms |
| `/app` | signed in | Dashboard: Today, live console, scenarios, drill history |
| `/app/scenarios/new` | Commander | Scenario builder |
| `/app/scenarios/<id>` | signed in | Scenario detail, start, reference solution |
| `/app/scenarios/<id>/edit` | Commander | Edit a draft |
| `/app/drills/<id>` | signed in | Drill room: clock, metrics, actions, delivery log |
| `/report/<token>` | public | Shared post-incident report, read-only |
| `/api/health` | public | `{ status, db, testMode, version }` |

---

## 5. Functional requirements

Each row is a contract. Assert the number or the code, not just the presence of text.

### A. Authentication and roles

| ID | Requirement | Expected result |
| --- | --- | --- |
| FR-A1 | Sign in with valid demo credentials | Redirected to `/app`; header shows the email; dashboard loads |
| FR-A2 | Wrong password | Error `E-AUTH-001` in `[data-testid="error-code"]`; still on `/login`; no account hint |
| FR-A3 | Invalid email / password shorter than 8 | `E-AUTH-002` / `E-AUTH-003` |
| FR-A4 | Sign up with a new email | Signed in as an **Observer**; creating or running is unavailable |
| FR-A5 | Duplicate sign-up | `E-AUTH-005` |
| FR-A6 | Sixth failed sign-in in five minutes | `E-RATE-429` with a retry hint |
| FR-A7 | Observer opens `/app` | `[data-testid="observer-notice"]` visible; no Start button anywhere |
| FR-A8 | Observer on a scenario page | Read-only notice; no publish/edit/start; reference solution is still allowed |
| FR-A9 | Guest opens `/report/<token>` | Report renders; zero drill controls; `[data-testid="report-rerun"]` is absent |

### B. Scenario builder (Commander only)

Validate at the exact boundaries. The form publishes valid content into a scenario; a DRAFT cannot
start a drill.

| ID | Field / rule | Boundary that must pass | Boundary that must fail |
| --- | --- | --- | --- |
| FR-B1 | Name | 3 and 60 characters | 2 and 61 → `E-BLD-NAME` |
| FR-B2 | Tick limit | 10 and 600 | 9 and 601 → `E-BLD-TICKS` |
| FR-B3 | Events | 20 events | 21 → `E-BLD-EVENTS` |
| FR-B4 | Payload size | 4096 bytes | 4097 → `E-BLD-PAYLOAD` |
| FR-B5 | Payload JSON | Valid JSON object | Broken JSON → `E-BLD-JSON` |
| FR-B6 | Failure mode | The five allowed values | Anything else → `E-BLD-FAILURE` |
| FR-B7 | Target | `sandbox://brownout/receiver` only | Any URL or host → `E-BLD-TARGET` |
| FR-B8 | Hostile text | `<script>alert(1)</script>` is stored and shown escaped | No dialog, no script execution |
| FR-B9 | Draft lifecycle | New scenario is DRAFT; publishing validates and makes it READY | READY-only scenarios appear as startable |

### C. Drill state machine

States: `DRAFT`, `READY`, `RUNNING`, `PAUSED`, `RESOLVED`, `FAILED`, `EVALUATED`.

| ID | Action | Expected |
| --- | --- | --- |
| FR-C1 | Start a READY scenario | `RUNNING`; tick advances 1 per second |
| FR-C2 | Pause | `PAUSED`; tick stops, even after waiting several seconds |
| FR-C3 | Resume | `RUNNING`; tick continues from where it paused |
| FR-C4 | Reset while RUNNING or PAUSED | Back to `READY`; progress is cleared |
| FR-C5 | Apply an action while PAUSED or after evaluation | Rejected with `E-STATE-409`; state does not change |
| FR-C6 | Double-click Start/Pause | Exactly one state change; the loser gets `E-STATE-409` |
| FR-C7 | Reach the tick limit without all required actions | Run ends in `FAILED` (or `EVALUATED`) and a score exists |
| FR-C8 | Apply every required action | `RESOLVED` → `EVALUATED`; score visible on the drill page |

### D. Delivery engine and sandbox receiver (observable in the drill log)

| ID | Requirement | Expected result |
| --- | --- | --- |
| FR-D1 | Every delivery has a sequence number and status | `[data-testid="drill-deliveries"]` rows show tick, seq, status |
| FR-D2 | `http500`, `timeout`, `drop` are retried | Attempt 1 fails, retries follow, then `dead_letter` after the third attempt |
| FR-D3 | `duplicate` | Logged as a duplicate; it does not crash or double-count |
| FR-D4 | `out_of_order` | Held, then released in sequence order; the log shows the release |
| FR-D5 | Sequence is stable | No delivery is delivered out of order after the hold |
| FR-D6 | No free-form target | There is no field anywhere that accepts a receiver URL |

Delivery rows are engine output: a wrong status is a product bug, not a flaky UI.

### E. Mitigation actions and feedback

| ID | Requirement | Expected result |
| --- | --- | --- |
| FR-E1 | Correct action | `[data-testid="action-feedback-text"]` says “Correct — … was required.” |
| FR-E2 | Wrong action | Feedback says “Not required. … costs 5 points.”; wrong-action count increments by 1 |
| FR-E3 | Repeat of an already applied action | Feedback says it was already applied; it counts as a wrong action |
| FR-E4 | Progress | `[data-testid="action-feedback-progress"]` reads “n of m required actions done.” |
| FR-E5 | No spoilers | The required-action list is visible as names, but the feedback never adds future steps |
| FR-E6 | Finish | After the last required action: “The drill resolved and was scored.” |
| FR-E7 | Observer | Action buttons are not rendered (not merely disabled) |

### F. Scoring (deterministic)

```
score = 100
      − max(0, MTTA_ticks − 3)
      − 5 × wrongActions
      − 10 × SLA_windows
      − 5 × hintsUsed
```

Grades: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, F < 40. Scores are clamped to 0–100.

| ID | Case | Expected |
| --- | --- | --- |
| FR-F1 | First action at tick 3 | No MTTA penalty |
| FR-F2 | First action at tick 4 | MTTA penalty 1 |
| FR-F3 | One wrong action | −5 in the breakdown, exactly once |
| FR-F4 | Breakdown adds up | base − penalties = total; total matches the score card |
| FR-F5 | Same seed and same actions | Identical score and identical log |
| FR-F6 | Score is never negative | A long incident with many penalties clamps to 0, not below |

The report must print the penalty rows (`breakdown-mtta`, `breakdown-wrong`, `breakdown-sla`,
`breakdown-hint`, `breakdown-total`). A report whose total disagrees with its rows is a failure.

### G. Report as an artifact

| ID | Requirement | Expected result |
| --- | --- | --- |
| FR-G1 | Score and grade | `report-score` / `report-grade` equal the drill's stored score |
| FR-G2 | Breakdown | The four penalty rows plus base and total are present and consistent |
| FR-G3 | MTTA / MTTR | Shown as ticks |
| FR-G4 | Dead letters | Listed with sequence and attempt |
| FR-G5 | Actions taken | Each action with tick and Correct/Wrong |
| FR-G6 | Fix list | Names the real cause: `report-fix-missed-<action>`, `report-fix-wrong`, `report-fix-mtta`, `report-fix-sla`, or `report-fix-clean` when nothing was lost |
| FR-G7 | Unscored drill | `report-not-scored` is shown and no fix list is rendered |
| FR-G8 | Commander re-run | `report-rerun` links to the scenario page |
| FR-G9 | Guest | Read-only badge; no re-run link; no action buttons |

### H. Today (dashboard spine)

| ID | Requirement | Expected result |
| --- | --- | --- |
| FR-H1 | Readiness | `readiness-score` is the mean of the last five graded runs, rounded |
| FR-H2 | Trend | At most six bars, oldest to newest, in `readiness-trend` |
| FR-H3 | Next drill | A READY scenario is recommended; never-graded scenarios come first, then the lowest last score |
| FR-H4 | Start | `today-start` starts the recommended scenario and lands on the drill room |
| FR-H5 | Active drill | When a drill is open, the panel offers `today-open-drill` instead of a start |
| FR-H6 | No READY scenario | `next-none` explains that a scenario must be published |
| FR-H7 | Observer | Sees the recommendation, gets no start button |

### I. Reference solution (scenario verification)

| ID | Requirement | Expected result |
| --- | --- | --- |
| FR-I1 | Verify a winnable scenario | `verify-solvable` is present; the badge reads Winnable |
| FR-I2 | Resolve tick | `verify-resolve` shows “Resolves at tick N of M” |
| FR-I3 | Par score | `verify-par` shows the score and grade of the reference solution |
| FR-I4 | Determinism | Verifying twice returns the same tick and par score |
| FR-I5 | Parity with a real run | A real run can never beat the par score |
| FR-I6 | Read-only | Verifying changes no drill state and writes nothing |

### J. Live view, time, and limits

| ID | Requirement | Expected result |
| --- | --- | --- |
| FR-J1 | Live metrics | Error rate, latency and queue depth update while RUNNING |
| FR-J2 | Refresh | Reloading the drill page restores the same state, tick and log |
| FR-J3 | `?motion=off` | Animation is disabled, content still renders |
| FR-J4 | Reconnect | A failed poll shows “Reconnecting…” and recovers without losing events |
| FR-J5 | Start rate limit | The sixth drill start in a minute returns `E-RATE-429` |
| FR-J6 | Language switch | EN ↔ ID changes all copy; no raw translation keys appear |
| FR-J7 | Mobile | At 360 px there is no horizontal scrolling; the menu opens and closes |
| FR-J8 | No outbound webhooks | The app never calls a user-supplied URL |

---

## 6. Invariants every case must respect

1. **Determinism.** A scenario always has the same seed and the same events. Do not expect different
   numbers from the same action timeline.
2. **One open drill per scenario.** If a scenario already has a RUNNING/PAUSED drill, its card shows
   “Open drill” instead of “Start”. Before reusing a scenario, open the drill and press **Reset**.
3. **Rate limit.** At most five drill starts per minute per account. Space drill-start cases out; a
   sixth start returns `E-RATE-429`.
4. **Ticks are seconds.** A 60-tick scenario takes about a minute of real time. Do not wait for a
   full run unless the case is about the timeout. To finish quickly, apply the required actions.
5. **Test mode may be off in production.** If `[data-testid="advance-tick"]` is not visible, that is
   expected: wait in real time. Never call `/api/test/*` unless the brief explicitly says test mode
   is on and gives a secret.
6. **Never edit seed or curated scenarios** to make a case pass. Curated scenarios are read-only.
7. **Clean up.** After a drill case, reset the drill so the scenario is startable again. Do not delete
   curated scenarios (the UI refuses anyway).
8. **Guests get no controls.** A shared report must never render action buttons, drill controls, or
   the re-run link.

---

## 7. Selector contract

Prefer test ids over text. These are stable across languages.

| Area | Selectors |
| --- | --- |
| Auth | `login-form`, `login-email`, `login-password`, `login-submit`, `signup-form`, `signup-email`, `signup-password`, `signup-submit`, `error-code` |
| Shell | `dashboard-page`, `current-user`, `sign-out`, `lang-toggle`, `mobile-menu-toggle`, `mobile-menu` |
| Today | `today-panel`, `readiness-score`, `readiness-grade`, `readiness-delta`, `readiness-trend`, `trend-bar-0..5`, `next-scenario`, `today-start`, `today-open-drill`, `next-none`, `today-error` |
| Console | `incident-console`, `incident-console-clear`, `console-tick`, `console-mtta`, `console-actions`, `console-breached-ticks`, `console-metric-<key>-value`, `console-feed`, `console-pressure` |
| Scenarios | `scenario-list`, `scenario-item-<id>`, `scenario-name-<id>`, `scenario-status-<id>`, `scenario-start-<id>`, `scenario-open-<id>`, `scenario-form`, `scenario-name`, `scenario-seed`, `scenario-max-ticks`, `scenario-submit`, `scenario-errors`, `publish-scenario`, `start-drill` |
| Verify | `verify-scenario`, `verify-result`, `verify-solvable`, `verify-resolve`, `verify-par`, `verify-side`, `scenario-required-count` |
| Drill room | `drill-detail`, `drill-state`, `drill-tick`, `drill-mtta`, `drill-score`, `required-actions`, `pause-drill`, `resume-drill`, `reset-drill`, `advance-tick` (conditional), `drill-deliveries`, `drill-events`, `action-<action_id>`, `action-feedback`, `action-feedback-text`, `action-feedback-progress` |
| Sharing | `share-link-button`, `share-link-value`, `open-report` |
| Report | `report-page`, `report-score`, `report-grade`, `report-state`, `report-tick`, `report-breakdown`, `breakdown-base`, `breakdown-mtta`, `breakdown-wrong`, `breakdown-sla`, `breakdown-hint`, `breakdown-total`, `report-mtta`, `report-mttr`, `report-dead-letters`, `report-actions`, `report-fix-list`, `report-fix-missed-<action>`, `report-fix-wrong`, `report-fix-mtta`, `report-fix-sla`, `report-fix-clean`, `report-not-scored`, `report-rerun`, `report-timeline` |
| History | `drill-list`, `drill-item-<id>`, `drill-state-<id>`, `drill-filter-all`, `drill-filter-active`, `drill-filter-graded` |
| Public pages | `landing-page`, `demo-page`, `rulebook-coverage-table`, `rulebook-error-table` |

---

## 8. Stable error codes

| Code | When |
| --- | --- |
| `E-AUTH-001` | Wrong credentials |
| `E-AUTH-002` | Invalid email format |
| `E-AUTH-003` | Password shorter than 8 |
| `E-AUTH-004` | Expired session |
| `E-AUTH-005` | Email already registered |
| `E-ROLE-403` | Observer attempted a write |
| `E-STATE-409` | Illegal drill transition or action outside RUNNING |
| `E-BLD-NAME`, `E-BLD-TICKS`, `E-BLD-EVENTS` | Builder limits |
| `E-BLD-JSON`, `E-BLD-PAYLOAD`, `E-BLD-TARGET`, `E-BLD-FAILURE` | Builder content |
| `E-SIG-401` | Bad webhook signature |
| `E-RATE-429` | More than five drill starts per minute |
| `E-INPUT-400` | Malformed input |
| `E-NOT-FOUND-404` | Unknown resource |
| `E-ENV-500`, `E-DB-500` | Server configuration / database |

---

## 9. Out of scope

- Sending real webhooks to third-party URLs (there is no such feature; do not test for it).
- Payments, billing, email delivery, teams/org management.
- Multi-tenant isolation beyond the two roles.
- Native mobile apps; only the responsive web UI.
- Load or performance testing beyond "the page settles within a few seconds".

---

## 10. Coverage priorities

Spend the first cases on P0: they protect the loop that the product is judged on.

| Priority | Families | Example assertion that counts as deep |
| --- | --- | --- |
| P0 | Auth, roles, Today, drill start, actions + feedback, score, report fix list | “Applying `scale_up` at tick 2 shows Correct; applying it again increments Wrong actions by exactly 1 and subtracts 5 from the total.” |
| P0 | Builder boundaries | “A 4097-byte payload is rejected with `E-BLD-PAYLOAD` and the draft is not published.” |
| P1 | State machine, pause/resume, reset, rate limit, reference solution | “Pausing stops the tick for 5 seconds; resuming continues from the same tick.” |
| P1 | Report share, guest restrictions, re-run | “A guest sees the fix list but no `report-rerun` and no action buttons.” |
| P2 | Delivery log details, i18n, mobile, a11y, reconnect | “Queue backpressure shows `dead_letter` for the `drop` event after three attempts.” |

Each family should contain cases that differ in initial state, role, or boundary — not five versions
of the same happy path.

---

## 11. Agent brief (paste into “Anything that helps the AI agent test your app”)

```text
Brownout is a deterministic incident-drill simulator. Base URL: https://brownout-860.netlify.app
Default language is English; keep EN selected.

Accounts:
- Commander: commander@brownout.dev / Brownout123!  (can create scenarios, start drills, act, share)
- Observer:  observer@brownout.dev  / Brownout123!  (read-only)
A guest is anyone not signed in; a shared report link opens for guests.

The product loop you should test first:
1) /app opens on Today: readiness score, a 6-run trend, and one recommended drill.
2) Start it. The drill runs on a virtual clock where 1 tick = 1 real second.
3) Apply mitigation actions. Each click answers immediately in [data-testid="action-feedback-text"]:
   "Correct", "Not required... costs 5 points", or "already applied".
4) The run ends RESOLVED (all required actions) or FAILED (tick limit) and gets a score.
5) A report shows the score breakdown, a "What to fix next" list, and a re-run link for Commanders.
6) A scenario page can replay a reference solution: Winnable, resolve tick, par score.

Hard rules:
- One open drill per scenario. Before reusing a scenario, open the drill and press Reset.
- Max 5 drill starts per minute; the 6th is E-RATE-429.
- Do not wait for a full 60-120 tick run unless the case is about timing out. Apply the required
  actions to finish quickly.
- Test mode may be off. If "advance-tick" is not visible, wait in real time; never call /api/test/*.
- Do not create users unless testing sign-up; a new account is an Observer.
- Never edit curated scenarios or demo users.
- Prefer data-testid selectors over visible text so cases survive EN/ID switching.
- Assert exact numbers and error codes (score, tick, seq, E-*), not just that a heading exists.

Known-good data:
- Expired deploy token: 60 ticks, required rotate_token + restart_worker.
- Queue backpressure: 90 ticks, required scale_up + enable_circuit_breaker.
- Database failover: 120 ticks, required failover_db.
Scoring: 100 − max(0, MTTA−3) − 5×wrong − 10×SLA windows − 5×hints. Grades A≥90 B≥75 C≥60 D≥40 F<40.
```

---

## 12. Definition of a passing run

A case passes only when all of the following hold:

1. The expected UI state is visible **and** the underlying number or code matches the contract.
2. No unexpected console error or unhandled rejection occurs.
3. The app never navigates away from its own origin or calls a third-party URL.
4. State survives a reload where the requirement says it should.
5. A guest context never receives controls or write affordances.

A case that renders the right heading but the wrong score, wrong tick, or wrong error code is a
**failure**, not a partial pass.
