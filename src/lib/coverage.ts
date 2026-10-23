/**
 * Requirement -> test map. The rulebook page and the README both read this, so
 * a claim of coverage can never drift from the suite.
 */
export interface CoverageEntry {
	id: string;
	summary: string;
	testFile: string;
}

export const REQUIREMENT_COVERAGE: readonly CoverageEntry[] = [
	{
		id: "FR-A1",
		summary: "Email + password sign-in with stable auth codes",
		testFile: "tests/auth-rules.test.ts",
	},
	{
		id: "FR-A2",
		summary: "Expired sessions are rejected",
		testFile: "tests/auth-rules.test.ts",
	},
	{
		id: "FR-A3",
		summary: "Observer cannot create or run (E-ROLE-403)",
		testFile: "tests/auth-rules.test.ts",
	},
	{
		id: "FR-B1",
		summary: "Name length 3-60",
		testFile: "tests/fr-b-scenario-builder.test.ts",
	},
	{
		id: "FR-B2",
		summary: "Tick limit 10-600",
		testFile: "tests/fr-b-scenario-builder.test.ts",
	},
	{
		id: "FR-B3",
		summary: "At most 20 events, payload at most 4 KB",
		testFile: "tests/fr-b-scenario-builder.test.ts",
	},
	{
		id: "FR-B4",
		summary: "Allowed failure modes only",
		testFile: "tests/fr-b-scenario-builder.test.ts",
	},
	{
		id: "FR-B5",
		summary: "Sandbox receiver target only (E-BLD-TARGET)",
		testFile: "tests/fr-b-scenario-builder.test.ts",
	},
	{
		id: "FR-B6",
		summary: "Hostile text stored verbatim, never executed",
		testFile: "tests/fr-b-scenario-builder.test.ts",
	},
	{
		id: "FR-B7",
		summary: "DRAFT becomes READY only after validation",
		testFile: "tests/fr-b-scenario-builder.test.ts",
	},
	{
		id: "FR-C",
		summary: "Transition table, E-STATE-409 for anything else",
		testFile: "tests/fr-c-state-machine.test.ts",
	},
	{
		id: "FR-D1",
		summary: "Sequence, Idempotency-Key, HMAC signature over seq.body",
		testFile: "tests/fr-d-delivery.test.ts",
	},
	{
		id: "FR-D2",
		summary: "Three attempts, backoff 1 then 2, then DEAD_LETTER",
		testFile: "tests/fr-d-delivery.test.ts",
	},
	{
		id: "FR-D3",
		summary: "Bad signature rejected with E-SIG-401",
		testFile: "tests/fr-d-delivery.test.ts",
	},
	{
		id: "FR-D4",
		summary: "Repeated Idempotency-Key marked duplicate",
		testFile: "tests/fr-d-delivery.test.ts",
	},
	{
		id: "FR-D5",
		summary: "Out-of-order messages held (max 3) then released in order",
		testFile: "tests/fr-d-delivery.test.ts",
	},
	{
		id: "FR-D6",
		summary: "timeout / http500 surface in the log, never crash",
		testFile: "tests/fr-d-delivery.test.ts",
	},
	{
		id: "FR-E",
		summary: "Five actions, wrong actions recorded and penalised",
		testFile: "tests/fr-e-actions.test.ts",
	},
	{
		id: "FR-F",
		summary: "Scoring weights, grade bands, documented built-in scores",
		testFile: "tests/fr-f-scoring.test.ts",
	},
	{
		id: "FR-H",
		summary: "Same seed and timeline produce an identical log and score",
		testFile: "tests/fr-h-determinism.test.ts",
	},
	{
		id: "FR-I1",
		summary: "No free-form delivery target, no outbound requests",
		testFile: "tests/fr-i-security.test.ts",
	},
	{
		id: "FR-I2",
		summary: "Five drill starts per minute, then E-RATE-429",
		testFile: "tests/fr-i-security.test.ts",
	},
	{
		id: "FR-I3",
		summary: "Payload and event ceilings",
		testFile: "tests/fr-i-security.test.ts",
	},
];
