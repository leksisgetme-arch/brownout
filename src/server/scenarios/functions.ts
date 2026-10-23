import { createServerFn } from "@tanstack/react-start";
import {
	createScenario,
	deleteScenario,
	getScenario,
	listScenarios,
	publishScenario,
	updateScenario,
	verifyScenario,
} from "./scenarios.server";

export type {
	CreateScenarioInput,
	ScenarioDetail,
	ScenarioListItem,
	ScenarioVerification,
} from "./scenarios.server";

export const listScenariosFn = createServerFn({ method: "GET" }).handler(
	async () => listScenarios(),
);

export const getScenarioFn = createServerFn({ method: "GET" })
	.validator((input: unknown) => {
		const value = (input ?? {}) as { id?: unknown };
		return { id: typeof value.id === "string" ? value.id : "" };
	})
	.handler(async ({ data }) => getScenario(data.id));

/** Metrics and required actions are optional, but when present they must be
 * the right shape: the server filters unknown actions itself. */
function readBuilderFields(value: Record<string, unknown>) {
	const rawMetrics = (value.metrics ?? {}) as Record<string, unknown>;
	const metric = (key: string) =>
		typeof rawMetrics[key] === "number" && Number.isFinite(rawMetrics[key])
			? (rawMetrics[key] as number)
			: Number.NaN;
	return {
		name: typeof value.name === "string" ? value.name : "",
		seed: typeof value.seed === "number" ? value.seed : Number.NaN,
		maxTicks: typeof value.maxTicks === "number" ? value.maxTicks : Number.NaN,
		eventsJson: typeof value.eventsJson === "string" ? value.eventsJson : "",
		metrics: {
			errorRate: metric("errorRate"),
			latencyMs: metric("latencyMs"),
			queueDepth: metric("queueDepth"),
		},
		requiredActions: Array.isArray(value.requiredActions)
			? value.requiredActions.filter(
					(action): action is string => typeof action === "string",
				)
			: [],
	};
}

export const createScenarioFn = createServerFn({ method: "POST" })
	.validator((input: unknown) =>
		readBuilderFields((input ?? {}) as Record<string, unknown>),
	)
	.handler(async ({ data }) => createScenario(data));

export const updateScenarioFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const value = (input ?? {}) as Record<string, unknown>;
		return {
			id: typeof value.id === "string" ? value.id : "",
			...readBuilderFields(value),
		};
	})
	.handler(async ({ data }) => updateScenario(data.id, data));

export const publishScenarioFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const value = (input ?? {}) as { id?: unknown };
		return { id: typeof value.id === "string" ? value.id : "" };
	})
	.handler(async ({ data }) => publishScenario(data.id));

export const deleteScenarioFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const value = (input ?? {}) as { id?: unknown };
		return { id: typeof value.id === "string" ? value.id : "" };
	})
	.handler(async ({ data }) => deleteScenario(data.id));

export const verifyScenarioFn = createServerFn({ method: "GET" })
	.validator((input: unknown) => {
		const value = (input ?? {}) as { id?: unknown };
		return { id: typeof value.id === "string" ? value.id : "" };
	})
	.handler(async ({ data }) => verifyScenario(data.id));
