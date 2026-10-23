/** Pure domain types. No I/O, no clock, no ambient randomness. */

/** JSON-safe values. Server functions can serialise these without a cast. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
	| JsonPrimitive
	| JsonValue[]
	| { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const DRILL_STATES = [
	"DRAFT",
	"READY",
	"RUNNING",
	"PAUSED",
	"RESOLVED",
	"FAILED",
	"EVALUATED",
] as const;

export type DrillState = (typeof DRILL_STATES)[number];

export const SCENARIO_STATUSES = ["DRAFT", "READY"] as const;
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];

export const FAILURE_MODES = [
	"http500",
	"timeout",
	"duplicate",
	"out_of_order",
	"drop",
] as const;
export type FailureMode = (typeof FAILURE_MODES)[number];

export const ACTION_TYPES = [
	"restart_worker",
	"scale_up",
	"rotate_token",
	"enable_circuit_breaker",
	"failover_db",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ROLES = ["commander", "observer"] as const;
export type Role = (typeof ROLES)[number];

/** The only receiver a scenario may target. There is no free-form URL by design. */
export const SANDBOX_RECEIVER_ID = "sandbox://brownout/receiver";

export interface ScenarioEvent {
	tick: number;
	type: string;
	target: string;
	payload: JsonObject;
	failure: FailureMode | null;
}

export interface ScenarioMetrics {
	errorRate: number;
	latencyMs: number;
	queueDepth: number;
}

export interface ScenarioDefinition {
	schemaVersion: 1;
	seed: number;
	maxTicks: number;
	metrics: ScenarioMetrics;
	requiredActions: ActionType[];
	events: ScenarioEvent[];
	/** Seeded demo content is curated; the UI must label it. */
	curated?: boolean;
}

export function isDrillState(value: unknown): value is DrillState {
	return (
		typeof value === "string" &&
		(DRILL_STATES as readonly string[]).includes(value)
	);
}

export function isRole(value: unknown): value is Role {
	return (
		typeof value === "string" && (ROLES as readonly string[]).includes(value)
	);
}

export function isFailureMode(value: unknown): value is FailureMode {
	return (
		typeof value === "string" &&
		(FAILURE_MODES as readonly string[]).includes(value)
	);
}
