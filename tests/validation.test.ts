import { describe, expect, it } from "vitest";
import {
  MAX_EVENTS,
  MAX_PAYLOAD_BYTES,
  SANDBOX_RECEIVER_ID,
  validateScenario,
  validateScenarioName,
} from "#/engine";

const validInput = {
  name: "Expired deploy token",
  seed: 1337,
  maxTicks: 60,
  events: [
    { tick: 4, type: "token.expired", payload: { service: "deploy-bot" }, failure: null },
  ],
};

function codes(result: ReturnType<typeof validateScenario>): string[] {
  return result.ok ? [] : result.errors.map((error) => error.code);
}

describe("validateScenarioName", () => {
  it("accepts 3 and 60 characters", () => {
    expect(validateScenarioName("abc")).toBeNull();
    expect(validateScenarioName("a".repeat(60))).toBeNull();
  });

  it("rejects 2 and 61 characters with E-BLD-NAME", () => {
    expect(validateScenarioName("ab")?.code).toBe("E-BLD-NAME");
    expect(validateScenarioName("a".repeat(61))?.code).toBe("E-BLD-NAME");
  });
});

describe("validateScenario", () => {
  it("accepts a valid scenario and normalises it", () => {
    const result = validateScenario(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(1);
      expect(result.value.events[0]?.target).toBe(SANDBOX_RECEIVER_ID);
      expect(result.value.curated).toBe(false);
    }
  });

  it("rejects 9 and 601 ticks with E-BLD-TICKS", () => {
    expect(codes(validateScenario({ ...validInput, maxTicks: 9 }))).toContain("E-BLD-TICKS");
    expect(codes(validateScenario({ ...validInput, maxTicks: 601 }))).toContain("E-BLD-TICKS");
  });

  it("accepts 10 and 600 ticks", () => {
    expect(validateScenario({ ...validInput, maxTicks: 10, events: [] }).ok).toBe(true);
    expect(validateScenario({ ...validInput, maxTicks: 600, events: [] }).ok).toBe(true);
  });

  it("accepts 20 events and rejects 21", () => {
    const twenty = Array.from({ length: MAX_EVENTS }, (_, index) => ({
      tick: index,
      payload: { index },
    }));
    expect(validateScenario({ ...validInput, events: twenty }).ok).toBe(true);

    const twentyOne = [...twenty, { tick: 20, payload: {} }];
    expect(codes(validateScenario({ ...validInput, events: twentyOne }))).toContain("E-BLD-EVENTS");
  });

  it("rejects broken JSON payloads with E-BLD-JSON", () => {
    const result = validateScenario({
      ...validInput,
      events: [{ tick: 1, payload: "{not json" }],
    });
    expect(codes(result)).toContain("E-BLD-JSON");
  });

  it("rejects a payload larger than 4 KB with E-BLD-PAYLOAD", () => {
    const result = validateScenario({
      ...validInput,
      events: [{ tick: 1, payload: { blob: "x".repeat(MAX_PAYLOAD_BYTES + 10) } }],
    });
    expect(codes(result)).toContain("E-BLD-PAYLOAD");
  });

  it("rejects a non-sandbox target with E-BLD-TARGET", () => {
    const result = validateScenario({
      ...validInput,
      events: [{ tick: 1, target: "https://evil.example.com/hook", payload: {} }],
    });
    expect(codes(result)).toContain("E-BLD-TARGET");
  });

  it("rejects an unknown failure mode with E-BLD-FAILURE", () => {
    const result = validateScenario({
      ...validInput,
      events: [{ tick: 1, payload: {}, failure: "explode" }],
    });
    expect(codes(result)).toContain("E-BLD-FAILURE");
  });

  it("keeps markup as inert text", () => {
    const result = validateScenario({
      ...validInput,
      name: "<script>alert(1)</script>",
      events: [{ tick: 1, payload: { note: "<img src=x onerror=alert(1)>" } }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.events[0]?.payload.note).toBe("<img src=x onerror=alert(1)>");
    }
  });

  it("sorts events by tick, preserving input order for ties", () => {
    const result = validateScenario({
      ...validInput,
      events: [
        { tick: 9, type: "c", payload: {} },
        { tick: 2, type: "a", payload: {} },
        { tick: 2, type: "b", payload: {} },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.events.map((event) => event.type)).toEqual(["a", "b", "c"]);
    }
  });

  it("rejects a seed outside the 32-bit range", () => {
    expect(codes(validateScenario({ ...validInput, seed: -1 }))).toContain("E-INPUT-400");
    expect(codes(validateScenario({ ...validInput, seed: 2147483648 }))).toContain("E-INPUT-400");
  });

  it("collects every error instead of stopping at the first", () => {
    const result = validateScenario({ name: "x", seed: 1, maxTicks: 1, events: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
