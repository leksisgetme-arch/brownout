import { hmacHex, timingSafeEqualHex } from "./crypto";
import type { FailureMode, ScenarioDefinition } from "./types";

export const MAX_ATTEMPTS = 3;
/** Delay before attempt 2 and attempt 3, in virtual ticks. */
export const RETRY_DELAY_TICKS = [1, 2] as const;
export const MAX_HELD_MESSAGES = 3;
export const FIRST_SEQ = 1;
/** A message flagged out_of_order lands this many ticks after its event. */
export const OUT_OF_ORDER_DELAY_TICKS = 2;

export const SIGNATURE_HEADER = "X-Brownout-Signature";
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export type DeliveryStatus = "PENDING" | "RETRY" | "DELIVERED" | "DEAD_LETTER";

export interface RetryPlan {
	status: "RETRY" | "DEAD_LETTER";
	attempt: number;
	nextAttemptTick: number | null;
}

/**
 * attempt is the attempt that just failed. Attempts are 1-based.
 * 1 fails -> retry after 1 tick; 2 fails -> retry after 2 ticks; 3 fails -> dead letter.
 */
export function planRetry(attempt: number, failedAtTick: number): RetryPlan {
	if (attempt >= MAX_ATTEMPTS) {
		return { status: "DEAD_LETTER", attempt, nextAttemptTick: null };
	}
	const delay =
		RETRY_DELAY_TICKS[Math.max(0, attempt - 1)] ?? RETRY_DELAY_TICKS[0];
	return {
		status: "RETRY",
		attempt: attempt + 1,
		nextAttemptTick: failedAtTick + delay,
	};
}

export type AcceptStatus =
	| "processed"
	| "held"
	| "duplicate"
	| "stale"
	| "overflow";

export interface AcceptResult {
	status: AcceptStatus;
	/** Sequence numbers released to the application, in order. */
	released: number[];
	heldCount: number;
}

/**
 * Reordering buffer. Messages that arrive early are held until the gap closes.
 * At most MAX_HELD_MESSAGES are buffered; beyond that the message overflows and
 * must be rejected rather than silently dropped.
 */
export class ReceiverWindow {
	private expected: number;
	private readonly held = new Map<number, string>();
	private readonly seenKeys = new Set<string>();

	constructor(startSeq: number = FIRST_SEQ) {
		this.expected = startSeq;
	}

	accept(seq: number, idempotencyKey: string): AcceptResult {
		if (this.seenKeys.has(idempotencyKey)) {
			return { status: "duplicate", released: [], heldCount: this.held.size };
		}

		if (seq < this.expected) {
			this.seenKeys.add(idempotencyKey);
			return { status: "stale", released: [], heldCount: this.held.size };
		}

		if (seq === this.expected) {
			this.seenKeys.add(idempotencyKey);
			const released = [seq];
			this.expected += 1;
			while (this.held.has(this.expected)) {
				released.push(this.expected);
				this.held.delete(this.expected);
				this.expected += 1;
			}
			return { status: "processed", released, heldCount: this.held.size };
		}

		if (this.held.size >= MAX_HELD_MESSAGES) {
			return { status: "overflow", released: [], heldCount: this.held.size };
		}

		this.held.set(seq, idempotencyKey);
		return { status: "held", released: [], heldCount: this.held.size };
	}

	get expectedSeq(): number {
		return this.expected;
	}

	get heldCount(): number {
		return this.held.size;
	}

	hasSeen(idempotencyKey: string): boolean {
		return this.seenKeys.has(idempotencyKey);
	}
}

/** A webhook body plus the headers the receiver needs. FR-D1. */
export interface DeliveryMessage {
	seq: number;
	idempotencyKey: string;
	body: string;
}

/** FR-D1: the signature covers "sequence.body", so a replayed seq cannot reuse it. */
export function signaturePayload(seq: number, body: string): string {
	return `${seq}.${body}`;
}

export function signDelivery(
	secret: string,
	seq: number,
	body: string,
): string {
	return hmacHex(secret, signaturePayload(seq, body));
}

/** FR-D3: constant-time comparison, so a wrong signature is never accepted. */
export function verifyDeliverySignature(
	secret: string,
	seq: number,
	body: string,
	signature: string,
): boolean {
	return timingSafeEqualHex(signDelivery(secret, seq, body), signature);
}

/** Transport failures the sandbox receiver can simulate (FR-D6). */
export function isTransportFailure(
	failure: FailureMode | null,
): failure is Extract<FailureMode, "http500" | "timeout" | "drop"> {
	return failure === "http500" || failure === "timeout" || failure === "drop";
}

export type DeliveryOutcome =
	| {
			status: "delivered";
			seq: number;
			attempt: number;
			tick: number;
			released: number[];
	  }
	| {
			status: "held";
			seq: number;
			attempt: number;
			tick: number;
			heldCount: number;
	  }
	| {
			status: "duplicate" | "stale" | "overflow";
			seq: number;
			attempt: number;
			tick: number;
	  }
	| {
			status: "rejected";
			code: "E-SIG-401";
			seq: number;
			attempt: number;
			tick: number;
	  }
	| {
			status: "failed";
			seq: number;
			attempt: number;
			tick: number;
			failure: FailureMode;
			retry: RetryPlan;
	  };

export interface DeliverRequest {
	message: DeliveryMessage;
	signature: string;
	attempt: number;
	tick: number;
	/** Simulated receiver failure for this attempt, or null. */
	failure?: FailureMode | null;
}

/**
 * One delivery attempt against the sandbox receiver.
 *
 * A transport failure short-circuits before the signature check: the request
 * never produced a response, so there is nothing to authenticate. FR-D6.
 */
export function deliver(
	request: DeliverRequest,
	receiver: ReceiverWindow,
	secret: string,
): DeliveryOutcome {
	const { message, signature, attempt, tick, failure = null } = request;

	if (isTransportFailure(failure)) {
		return {
			status: "failed",
			seq: message.seq,
			attempt,
			tick,
			failure,
			retry: planRetry(attempt, tick),
		};
	}

	if (!verifyDeliverySignature(secret, message.seq, message.body, signature)) {
		return {
			status: "rejected",
			code: "E-SIG-401",
			seq: message.seq,
			attempt,
			tick,
		};
	}

	const accepted = receiver.accept(message.seq, message.idempotencyKey);

	switch (accepted.status) {
		case "processed":
			return {
				status: "delivered",
				seq: message.seq,
				attempt,
				tick,
				released: accepted.released,
			};
		case "held":
			return {
				status: "held",
				seq: message.seq,
				attempt,
				tick,
				heldCount: accepted.heldCount,
			};
		default:
			return { status: accepted.status, seq: message.seq, attempt, tick };
	}
}

export type ScheduleReason = "initial" | "duplicate_resend";

/** A single planned attempt. scheduleDeliveries never touches the clock. */
export interface ScheduledAttempt {
	tick: number;
	seq: number;
	eventIndex: number;
	type: string;
	idempotencyKey: string;
	body: string;
	failure: FailureMode | null;
	reason: ScheduleReason;
	attempt: number;
}

export function deliveryBody(
	seq: number,
	type: string,
	payload: Record<string, unknown>,
): string {
	return JSON.stringify({ seq, type, payload });
}

export function idempotencyKeyFor(seq: number): string {
	return `evt-${seq}`;
}

/**
 * Turns a scenario definition into a deterministic list of attempts.
 *
 * - A duplicate event is sent twice with the same Idempotency-Key (FR-D4).
 * - An out_of_order event is delivered after its successor, so the receiver
 *   must hold it until the gap closes (FR-D5).
 * - Retries are not pre-scheduled: they depend on where the failure lands, so
 *   the run loop asks planRetry instead.
 */
export function scheduleDeliveries(
	definition: ScenarioDefinition,
): ScheduledAttempt[] {
	const attempts: ScheduledAttempt[] = [];

	definition.events.forEach((event, eventIndex) => {
		const seq = eventIndex + 1;
		const idempotencyKey = idempotencyKeyFor(seq);
		const body = deliveryBody(seq, event.type, event.payload);

		let sendAtTick = event.tick;
		if (event.failure === "out_of_order") {
			const next = definition.events[eventIndex + 1];
			sendAtTick = next
				? Math.max(next.tick, event.tick) + 1
				: event.tick + OUT_OF_ORDER_DELAY_TICKS;
		}

		attempts.push({
			tick: sendAtTick,
			seq,
			eventIndex,
			type: event.type,
			idempotencyKey,
			body,
			failure: event.failure,
			reason: "initial",
			attempt: 1,
		});

		if (event.failure === "duplicate") {
			attempts.push({
				tick: sendAtTick + 1,
				seq,
				eventIndex,
				type: event.type,
				idempotencyKey,
				body,
				failure: null,
				reason: "duplicate_resend",
				attempt: 2,
			});
		}
	});

	return attempts.sort((left, right) => {
		if (left.tick !== right.tick) return left.tick - right.tick;
		if (left.seq !== right.seq) return left.seq - right.seq;
		return left.attempt - right.attempt;
	});
}
