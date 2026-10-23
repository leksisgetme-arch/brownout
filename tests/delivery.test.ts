import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  MAX_HELD_MESSAGES,
  planRetry,
  ReceiverWindow,
} from "#/engine";

describe("planRetry", () => {
  it("retries the first failure after one tick", () => {
    expect(planRetry(1, 5)).toEqual({ status: "RETRY", attempt: 2, nextAttemptTick: 6 });
  });

  it("retries the second failure after two ticks", () => {
    expect(planRetry(2, 5)).toEqual({ status: "RETRY", attempt: 3, nextAttemptTick: 7 });
  });

  it("dead-letters the third failure", () => {
    expect(planRetry(3, 5)).toEqual({
      status: "DEAD_LETTER",
      attempt: MAX_ATTEMPTS,
      nextAttemptTick: null,
    });
  });

  it("stays dead-lettered beyond the third attempt", () => {
    expect(planRetry(4, 5).status).toBe("DEAD_LETTER");
  });
});

describe("ReceiverWindow", () => {
  it("processes messages in order", () => {
    const window = new ReceiverWindow();
    expect(window.accept(1, "k1")).toMatchObject({ status: "processed", released: [1] });
    expect(window.accept(2, "k2")).toMatchObject({ status: "processed", released: [2] });
    expect(window.expectedSeq).toBe(3);
  });

  it("ignores a repeated idempotency key", () => {
    const window = new ReceiverWindow();
    window.accept(1, "same-key");
    expect(window.accept(1, "same-key").status).toBe("duplicate");
    expect(window.accept(2, "same-key").status).toBe("duplicate");
  });

  it("marks an already-consumed sequence as stale", () => {
    const window = new ReceiverWindow();
    window.accept(1, "k1");
    window.accept(2, "k2");
    expect(window.accept(1, "k1-again").status).toBe("stale");
  });

  it("holds out-of-order messages, then releases them in sequence", () => {
    const window = new ReceiverWindow();
    expect(window.accept(3, "k3")).toMatchObject({ status: "held", heldCount: 1 });
    expect(window.accept(2, "k2")).toMatchObject({ status: "held", heldCount: 2 });
    expect(window.accept(1, "k1")).toMatchObject({
      status: "processed",
      released: [1, 2, 3],
      heldCount: 0,
    });
  });

  it("rejects overflow past the held-message limit", () => {
    const window = new ReceiverWindow();
    window.accept(2, "k2");
    window.accept(3, "k3");
    window.accept(4, "k4");
    expect(window.heldCount).toBe(MAX_HELD_MESSAGES);
    expect(window.accept(5, "k5").status).toBe("overflow");
    expect(window.accept(1, "k1").released).toEqual([1, 2, 3, 4]);
  });

  it("supports a non-default starting sequence", () => {
    const window = new ReceiverWindow(10);
    expect(window.accept(10, "k10").status).toBe("processed");
    expect(window.expectedSeq).toBe(11);
  });
});
