import type { ScenarioDefinition } from "./types";
import { type ScenarioInput, validateScenario } from "./validate-scenario";

/**
 * Curated demo content. Every scenario is marked curated so the UI can label
 * it. Tests and the seed script read this list, so they can never drift apart.
 */
export const BUILTIN_SCENARIO_INPUTS: readonly ScenarioInput[] = [
	{
		name: "Expired deploy token",
		seed: 1337,
		maxTicks: 60,
		metrics: { errorRate: 0.02, latencyMs: 180, queueDepth: 4 },
		requiredActions: ["rotate_token", "restart_worker"],
		curated: true,
		events: [
			{
				tick: 4,
				type: "token.expired",
				payload: { service: "deploy-bot", tokenId: "tok_demo_01" },
				failure: null,
			},
			{
				tick: 12,
				type: "deploy.requested",
				payload: { service: "deploy-bot", release: "2026.10.1" },
				failure: "http500",
			},
			{
				tick: 26,
				type: "worker.heartbeat",
				payload: { worker: "deploy-worker-2" },
				failure: "timeout",
			},
		],
	},
	{
		name: "Queue backpressure",
		seed: 2024,
		maxTicks: 90,
		metrics: { errorRate: 0.08, latencyMs: 940, queueDepth: 1800 },
		requiredActions: ["scale_up", "enable_circuit_breaker"],
		curated: true,
		events: [
			{
				tick: 6,
				type: "queue.depth",
				payload: { queue: "jobs-default", depth: 1200 },
				failure: null,
			},
			{
				tick: 18,
				type: "queue.depth",
				payload: { queue: "jobs-default", depth: 2400 },
				failure: "duplicate",
			},
			{
				tick: 33,
				type: "consumer.lag",
				payload: { consumer: "worker-a", lagTicks: 9 },
				failure: "out_of_order",
			},
			{
				tick: 48,
				type: "consumer.lag",
				payload: { consumer: "worker-b", lagTicks: 14 },
				failure: "drop",
			},
		],
	},
	{
		name: "Database failover",
		seed: 777,
		maxTicks: 120,
		metrics: { errorRate: 0.21, latencyMs: 2200, queueDepth: 320 },
		requiredActions: ["failover_db"],
		curated: true,
		events: [
			{
				tick: 8,
				type: "db.primary.latency",
				payload: { region: "ap-southeast-1", p99Ms: 2200 },
				failure: null,
			},
			{
				tick: 21,
				type: "db.replica.lag",
				payload: { replica: "replica-1", lagSeconds: 18 },
				failure: "timeout",
			},
			{
				tick: 44,
				type: "db.connection",
				payload: { pool: "primary", open: 98 },
				failure: "http500",
			},
		],
	},
];

export interface BuiltinScenario {
	name: string;
	definition: ScenarioDefinition;
}

function build(): BuiltinScenario[] {
	return BUILTIN_SCENARIO_INPUTS.map((input) => {
		const result = validateScenario(input);
		if (!result.ok) {
			throw new Error(
				`E-BLD-INPUT Built-in scenario "${input.name}" is invalid: ${result.errors
					.map((error) => `${error.code} ${error.message}`)
					.join("; ")}`,
			);
		}
		return { name: input.name.trim(), definition: result.value };
	});
}

export const BUILTIN_SCENARIOS: readonly BuiltinScenario[] = build();

export function builtinScenarioByName(
	name: string,
): BuiltinScenario | undefined {
	return BUILTIN_SCENARIOS.find((scenario) => scenario.name === name);
}
