import { createServerFn } from "@tanstack/react-start";
import { requireCommanderUser } from "#/server/auth/guards.server";
import { isTestMode } from "#/server/env";
import { failResult } from "#/server/results";
import {
	advanceTick,
	createShareLink,
	evaluateDrill,
	getDrillDetail,
	getDrillSeries,
	getReportByToken,
	listDrills,
	pauseDrill,
	performAction,
	resetDrill,
	resumeDrill,
	startDrill,
} from "./drills.server";

export type {
	ActionView,
	DeliveryView,
	DrillDetail,
	DrillEventView,
	DrillListItem,
	DrillSeries,
} from "./drills.server";

function asId(input: unknown, key = "id"): string {
	const value = (input ?? {}) as Record<string, unknown>;
	const raw = value[key];
	return typeof raw === "string" ? raw : "";
}

export const listDrillsFn = createServerFn({ method: "GET" }).handler(
	async () => listDrills(),
);

export const startDrillFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({ scenarioId: asId(input, "scenarioId") }))
	.handler(async ({ data }) => startDrill(data.scenarioId));

export const getDrillFn = createServerFn({ method: "GET" })
	.validator((input: unknown) => ({ id: asId(input) }))
	.handler(async ({ data }) => getDrillDetail(data.id));

export const getDrillSeriesFn = createServerFn({ method: "GET" })
	.validator((input: unknown) => ({ id: asId(input) }))
	.handler(async ({ data }) => getDrillSeries(data.id));

export const pauseDrillFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({ id: asId(input) }))
	.handler(async ({ data }) => pauseDrill(data.id));

export const resumeDrillFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({ id: asId(input) }))
	.handler(async ({ data }) => resumeDrill(data.id));

export const resetDrillFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({ id: asId(input) }))
	.handler(async ({ data }) => resetDrill(data.id));

export const performActionFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => {
		const value = (input ?? {}) as Record<string, unknown>;
		return {
			id: typeof value.id === "string" ? value.id : "",
			action: typeof value.action === "string" ? value.action : "",
		};
	})
	.handler(async ({ data }) => performAction(data.id, data.action));

export const evaluateDrillFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({ id: asId(input) }))
	.handler(async ({ data }) => evaluateDrill(data.id));

/** Test mode only, and Commanders only: the clock is not operator-driven. */
export const advanceTickFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({ id: asId(input) }))
	.handler(async ({ data }) => {
		await requireCommanderUser();
		if (!isTestMode()) {
			return failResult("E-TEST-401", "Test mode is disabled.");
		}
		return advanceTick(data.id);
	});

export const createShareLinkFn = createServerFn({ method: "POST" })
	.validator((input: unknown) => ({ id: asId(input, "drillId") }))
	.handler(async ({ data }) => createShareLink(data.id));

export const getReportFn = createServerFn({ method: "GET" })
	.validator((input: unknown) => ({ token: asId(input, "token") }))
	.handler(async ({ data }) => getReportByToken(data.token));
