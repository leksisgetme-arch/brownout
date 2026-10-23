import { describe, expect, it } from "vitest";
import {
	deliver,
	deliveryBody,
	IDEMPOTENCY_HEADER,
	idempotencyKeyFor,
	MAX_ATTEMPTS,
	MAX_HELD_MESSAGES,
	OUT_OF_ORDER_DELAY_TICKS,
	ReceiverWindow,
	SANDBOX_SIGNING_SECRET,
	scheduleDeliveries,
	SIGNATURE_HEADER,
	signDelivery,
	signaturePayload,
	verifyDeliverySignature,
} from "#/engine";
import { runScenario } from "#/engine/run";
import type { ScenarioDefinition } from "#/engine/types";
import { validateScenario } from "#/engine/validate-scenario";

function definition(
	overrides: Partial<{
		seed: number;
		maxTicks: number;
		events: Array<{
			tick: number;
			type: string;
			payload?: Record<string, unknown>;
			failure?: string | null;
		}>;
		requiredActions: string[];
	}> = {},
): ScenarioDefinition {
	const result = validateScenario({
		name: "Delivery fixture",
		seed: overrides.seed ?? 11,
		maxTicks: overrides.maxTicks ?? 40,
		metrics: { errorRate: 0.01, latencyMs: 100, queueDepth: 1 },
		requiredActions: overrides.requiredActions ?? ["scale_up"],
		events: overrides.events ?? [
			{ tick: 2, type: "a", payload: { n: 1 } },
			{ tick: 3, type: "b", payload: { n: 2 } },
		],
	});
	if (!result.ok) throw new Error(JSON.stringify(result.errors));
	return result.value;
}

const SECRET = SANDBOX_SIGNING_SECRET;

function messageFor(seq: number, body = deliveryBody(seq, "x", { seq })) {
	return { seq, idempotencyKey: idempotencyKeyFor(seq), body };
}

describe("FR-D1 webhook envelope", () => {
	it("signs the sequence number together with the body", () => {
		expect(signaturePayload(4, '{"a":1}')).toBe('4.{"a":1}');
		expect(signDelivery(SECRET, 4, '{"a":1}')).toHaveLength(64);
	});

	it("publishes the header names the receiver expects", () => {
		expect(SIGNATURE_HEADER).toBe("X-Brownout-Signature");
		expect(IDEMPOTENCY_HEADER).toBe("Idempotency-Key");
	});

	it("rejects a signature that was minted for another sequence", () => {
		const body = deliveryBody(1, "x", {});
		const stolen = signDelivery(SECRET, 2, body);
		expect(verifyDeliverySignature(SECRET, 1, body, stolen)).toBe(false);
	});

	it("rejects a signature that was minted with another secret", () => {
		const body = deliveryBody(1, "x", {});
		expect(
			verifyDeliverySignature(SECRET, 1, body, signDelivery("other", 1, body)),
		).toBe(false);
	});

	it("accepts a signature it produced", () => {
		const body = deliveryBody(7, "x", { a: true });
		expect(
			verifyDeliverySignature(SECRET, 7, body, signDelivery(SECRET, 7, body)),
		).toBe(true);
	});
});

describe("FR-D2 retry ladder", () => {
	it("retries at +1 then +2 ticks and dead-letters the third failure", () => {
		const attempts: number[] = [];
		const receiver = new ReceiverWindow();
		let attempt = 1;
		let tick = 5;

		while (attempt <= MAX_ATTEMPTS) {
			const outcome = deliver(
				{
					message: messageFor(1),
					signature: signDelivery(SECRET, 1, messageFor(1).body),
					attempt,
					tick,
					failure: "http500",
				},
				receiver,
				SECRET,
			);
			if (outcome.status !== "failed") throw new Error("expected a failure");
			attempts.push(tick);
			if (outcome.retry.status === "DEAD_LETTER") {
				expect(outcome.retry.nextAttemptTick).toBeNull();
				break;
			}
			tick = outcome.retry.nextAttemptTick as number;
			attempt = outcome.retry.attempt;
		}

		expect(attempts).toEqual([5, 6, 8]);
	});

	it("never schedules a fourth attempt", () => {
		const outcome = deliver(
			{
				message: messageFor(1),
				signature: signDelivery(SECRET, 1, messageFor(1).body),
				attempt: MAX_ATTEMPTS,
				tick: 9,
				failure: "timeout",
			},
			new ReceiverWindow(),
			SECRET,
		);
		expect(outcome).toMatchObject({ status: "failed" });
		if (outcome.status === "failed") {
			expect(outcome.retry.status).toBe("DEAD_LETTER");
		}
	});

	it("dead-letters a failing event during a real run", () => {
		const run = runScenario({
			definition: definition({
				events: [{ tick: 2, type: "boom", failure: "http500" }],
			}),
			actions: [],
		});

		expect(run.deadLetters).toEqual([1]);
		const failures = run.log.filter(
			(entry) => entry.kind === "delivery" && entry.status === "failed",
		);
		expect(failures.map((entry) => entry.tick)).toEqual([2, 3, 5]);
	});
});

describe("FR-D3 signature rejection", () => {
	it("rejects a tampered body with E-SIG-401 and records it", () => {
		const receiver = new ReceiverWindow();
		const message = messageFor(1);
		const signature = signDelivery(SECRET, 1, message.body);

		const outcome = deliver(
			{ message: { ...message, body: '{"tampered":true}' }, signature, attempt: 1, tick: 1 },
			receiver,
			SECRET,
		);

		expect(outcome).toMatchObject({ status: "rejected", code: "E-SIG-401" });
		expect(receiver.expectedSeq).toBe(1);
		expect(receiver.hasSeen(message.idempotencyKey)).toBe(false);
	});

	it("accepts the message once the signature is corrected", () => {
		const receiver = new ReceiverWindow();
		const message = messageFor(1);
		const rejected = deliver(
			{ message, signature: "deadbeef", attempt: 1, tick: 1 },
			receiver,
			SECRET,
		);
		expect(rejected.status).toBe("rejected");

		const accepted = deliver(
			{
				message,
				signature: signDelivery(SECRET, 1, message.body),
				attempt: 2,
				tick: 2,
			},
			receiver,
			SECRET,
		);
		expect(accepted).toMatchObject({ status: "delivered", released: [1] });
	});
});

describe("FR-D4 idempotency", () => {
	it("does not process the same key twice and marks it duplicate", () => {
		const receiver = new ReceiverWindow();
		const message = messageFor(1);
		const signature = signDelivery(SECRET, 1, message.body);

		expect(
			deliver({ message, signature, attempt: 1, tick: 1 }, receiver, SECRET).status,
		).toBe("delivered");
		expect(
			deliver({ message, signature, attempt: 2, tick: 2 }, receiver, SECRET).status,
		).toBe("duplicate");
		expect(receiver.expectedSeq).toBe(2);
	});

	it("marks the resent attempt as duplicate in the run log", () => {
		const run = runScenario({
			definition: definition({
				events: [{ tick: 2, type: "dup", failure: "duplicate" }],
			}),
			actions: [],
		});
		const deliveries = run.log.filter((entry) => entry.kind === "delivery");
		expect(deliveries.map((entry) => entry.status)).toEqual([
			"delivered",
			"duplicate",
		]);
	});
});

describe("FR-D5 out-of-order handling", () => {
	it("holds early messages and releases them in order", () => {
		const receiver = new ReceiverWindow();
		expect(receiver.accept(3, "k3").status).toBe("held");
		expect(receiver.accept(2, "k2").status).toBe("held");
		const released = receiver.accept(1, "k1");
		expect(released.released).toEqual([1, 2, 3]);
		expect(released.heldCount).toBe(0);
	});

	it("holds at most three messages and rejects the fourth", () => {
		const receiver = new ReceiverWindow();
		receiver.accept(2, "k2");
		receiver.accept(3, "k3");
		receiver.accept(4, "k4");
		expect(receiver.heldCount).toBe(MAX_HELD_MESSAGES);
		expect(receiver.accept(5, "k5").status).toBe("overflow");
	});

	it("sends an out_of_order event after its successor", () => {
		const planned = scheduleDeliveries(
			definition({
				events: [
					{ tick: 4, type: "a" },
					{ tick: 6, type: "b", failure: "out_of_order" },
					{ tick: 8, type: "c" },
				],
			}),
		);
		const b = planned.find((attempt) => attempt.seq === 2);
		const c = planned.find((attempt) => attempt.seq === 3);
		expect(b?.tick).toBeGreaterThan(c?.tick as number);
	});

	it("delays a trailing out_of_order event by the fixed offset", () => {
		const planned = scheduleDeliveries(
			definition({ events: [{ tick: 4, type: "a", failure: "out_of_order" }] }),
		);
		expect(planned[0]?.tick).toBe(4 + OUT_OF_ORDER_DELAY_TICKS);
	});

	it("reports held and released messages in the run log", () => {
		const run = runScenario({
			definition: definition({
				events: [
					{ tick: 2, type: "a" },
					{ tick: 4, type: "b", failure: "out_of_order" },
					{ tick: 5, type: "c" },
				],
			}),
			actions: [],
		});
		const deliveries = run.log.filter((entry) => entry.kind === "delivery");
		const held = deliveries.find((entry) => entry.status === "held");
		expect(held).toBeDefined();
		const released = deliveries.find(
			(entry) => entry.status === "delivered" && entry.released.length > 1,
		);
		expect(released?.released).toEqual([2, 3]);
	});
});

describe("FR-D6 transport failures never crash", () => {
	it.each(["http500", "timeout", "drop"] as const)(
		"returns a failed outcome for %s",
		(failure) => {
			const message = messageFor(1);
			const outcome = deliver(
				{
					message,
					signature: signDelivery(SECRET, 1, message.body),
					attempt: 1,
					tick: 1,
					failure,
				},
				new ReceiverWindow(),
				SECRET,
			);
			expect(outcome).toMatchObject({ status: "failed", failure });
		},
	);

	it("keeps the run going and surfaces failures in the log", () => {
		const run = runScenario({
			definition: definition({
				events: [
					{ tick: 2, type: "slow", failure: "timeout" },
					{ tick: 3, type: "boom", failure: "http500" },
				],
			}),
			actions: [],
		});
		expect(run.finalState).toBe("EVALUATED");
		const failed = run.log.filter(
			(entry) => entry.kind === "delivery" && entry.status === "failed",
		);
		expect(failed).toHaveLength(6);
		expect(run.deadLetters).toEqual([1, 2]);
	});
});

describe("scheduleDeliveries determinism", () => {
	it("produces the same plan twice", () => {
		const source = definition({});
		expect(scheduleDeliveries(source)).toEqual(scheduleDeliveries(source));
	});

	it("orders attempts by tick, then sequence", () => {
		const planned = scheduleDeliveries(
			definition({
				events: [
					{ tick: 9, type: "late" },
					{ tick: 2, type: "early" },
				],
			}),
		);
		expect(planned.map((attempt) => attempt.tick)).toEqual([2, 9]);
	});
});
