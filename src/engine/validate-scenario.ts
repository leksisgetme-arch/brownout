import {
	ACTION_TYPES,
	type ActionType,
	FAILURE_MODES,
	type FailureMode,
	type JsonObject,
	SANDBOX_RECEIVER_ID,
	type ScenarioDefinition,
	type ScenarioEvent,
	type ScenarioMetrics,
} from "./types";

export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 60;
export const TICKS_MIN = 10;
export const TICKS_MAX = 600;
export const MAX_EVENTS = 20;
export const MAX_PAYLOAD_BYTES = 4096;
export const SEED_MAX = 2147483647;

export type BuildErrorCode =
	| "E-BLD-NAME"
	| "E-BLD-TICKS"
	| "E-BLD-EVENTS"
	| "E-BLD-JSON"
	| "E-BLD-PAYLOAD"
	| "E-BLD-TARGET"
	| "E-BLD-FAILURE"
	| "E-INPUT-400";

export interface ScenarioValidationError {
	code: BuildErrorCode;
	field: string;
	message: string;
}

export interface ScenarioEventInput {
	tick: number;
	type?: string;
	target?: string;
	payload?: unknown;
	failure?: string | null;
}

export interface ScenarioInput {
	name: string;
	seed: number;
	maxTicks: number;
	events: ReadonlyArray<ScenarioEventInput>;
	metrics?: Partial<ScenarioMetrics>;
	requiredActions?: ReadonlyArray<string>;
	curated?: boolean;
}

export type ScenarioValidationResult =
	| { ok: true; value: ScenarioDefinition }
	| { ok: false; errors: ScenarioValidationError[] };

export function validateScenarioName(
	raw: string,
): ScenarioValidationError | null {
	const name = raw.trim();
	if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
		return {
			code: "E-BLD-NAME",
			field: "name",
			message: `Name must be ${NAME_MIN_LENGTH} to ${NAME_MAX_LENGTH} characters`,
		};
	}
	return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayload(
	raw: unknown,
	field: string,
):
	| { ok: true; value: JsonObject }
	| { ok: false; error: ScenarioValidationError } {
	let parsed: unknown = raw;

	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (trimmed === "") return { ok: true, value: {} };
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			return {
				ok: false,
				error: {
					code: "E-BLD-JSON",
					field,
					message: "Payload must be valid JSON",
				},
			};
		}
	}

	if (!isPlainObject(parsed)) {
		return {
			ok: false,
			error: {
				code: "E-BLD-PAYLOAD",
				field,
				message: "Payload must be a JSON object",
			},
		};
	}

	const bytes = new TextEncoder().encode(JSON.stringify(parsed)).length;
	if (bytes > MAX_PAYLOAD_BYTES) {
		return {
			ok: false,
			error: {
				code: "E-BLD-PAYLOAD",
				field,
				message: `Payload must be at most ${MAX_PAYLOAD_BYTES} bytes`,
			},
		};
	}

	return { ok: true, value: parsed as JsonObject };
}

export function validateScenario(
	input: ScenarioInput,
): ScenarioValidationResult {
	const errors: ScenarioValidationError[] = [];

	const nameError = validateScenarioName(input.name);
	if (nameError) errors.push(nameError);

	if (
		!Number.isInteger(input.maxTicks) ||
		input.maxTicks < TICKS_MIN ||
		input.maxTicks > TICKS_MAX
	) {
		errors.push({
			code: "E-BLD-TICKS",
			field: "maxTicks",
			message: `Tick limit must be an integer between ${TICKS_MIN} and ${TICKS_MAX}`,
		});
	}

	if (
		!Number.isInteger(input.seed) ||
		input.seed < 0 ||
		input.seed > SEED_MAX
	) {
		errors.push({
			code: "E-INPUT-400",
			field: "seed",
			message: `Seed must be an integer between 0 and ${SEED_MAX}`,
		});
	}

	if (input.events.length > MAX_EVENTS) {
		errors.push({
			code: "E-BLD-EVENTS",
			field: "events",
			message: `A scenario holds at most ${MAX_EVENTS} events`,
		});
	}

	const events: ScenarioEvent[] = [];

	input.events.forEach((event, index) => {
		const field = `events.${index}`;

		if (
			!Number.isInteger(event.tick) ||
			event.tick < 0 ||
			event.tick > input.maxTicks
		) {
			errors.push({
				code: "E-BLD-EVENTS",
				field: `${field}.tick`,
				message: "Event tick must be inside the scenario tick limit",
			});
		}

		const target = event.target ?? SANDBOX_RECEIVER_ID;
		if (target !== SANDBOX_RECEIVER_ID) {
			errors.push({
				code: "E-BLD-TARGET",
				field: `${field}.target`,
				message: `Events must target ${SANDBOX_RECEIVER_ID}`,
			});
		}

		let failure: FailureMode | null = null;
		if (
			event.failure !== undefined &&
			event.failure !== null &&
			event.failure !== ""
		) {
			if (!(FAILURE_MODES as readonly string[]).includes(event.failure)) {
				errors.push({
					code: "E-BLD-FAILURE",
					field: `${field}.failure`,
					message: `Failure must be one of ${FAILURE_MODES.join(", ")}`,
				});
			} else {
				failure = event.failure as FailureMode;
			}
		}

		const payload = parsePayload(event.payload ?? {}, `${field}.payload`);
		if (!payload.ok) {
			errors.push(payload.error);
		}

		events.push({
			tick: event.tick,
			type: (event.type ?? "webhook").slice(0, 60),
			target,
			payload: payload.ok ? payload.value : {},
			failure,
		});
	});

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	const metrics: ScenarioMetrics = {
		errorRate: Number.isFinite(input.metrics?.errorRate)
			? Number(input.metrics?.errorRate)
			: 0,
		latencyMs: Number.isFinite(input.metrics?.latencyMs)
			? Number(input.metrics?.latencyMs)
			: 0,
		queueDepth: Number.isFinite(input.metrics?.queueDepth)
			? Number(input.metrics?.queueDepth)
			: 0,
	};

	const requiredActions = (input.requiredActions ?? []).filter(
		(action): action is ActionType =>
			(ACTION_TYPES as readonly string[]).includes(action),
	);

	const ordered = events
		.map((event, index) => ({ event, index }))
		.sort((a, b) =>
			a.event.tick === b.event.tick
				? a.index - b.index
				: a.event.tick - b.event.tick,
		)
		.map(({ event }) => event);

	return {
		ok: true,
		value: {
			schemaVersion: 1,
			seed: input.seed,
			maxTicks: input.maxTicks,
			metrics,
			requiredActions,
			events: ordered,
			curated: input.curated ?? false,
		},
	};
}
