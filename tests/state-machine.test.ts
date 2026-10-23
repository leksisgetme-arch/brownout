import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  canAcceptAction,
  DEFAULT_TRANSITION_CONTEXT,
  isActive,
  isTerminal,
  transition,
  type TransitionContext,
} from "#/engine";

const satisfied: TransitionContext = {
  tick: 0,
  maxTicks: 60,
  validationPassed: true,
  requiredActionsSatisfied: true,
};

describe("allowed transitions", () => {
  it("moves DRAFT to READY when validation passed", () => {
    const result = transition("DRAFT", "READY", satisfied);
    expect(result.ok).toBe(true);
  });

  it("moves READY to RUNNING", () => {
    expect(transition("READY", "RUNNING", satisfied).ok).toBe(true);
  });

  it("pauses and resumes", () => {
    expect(transition("RUNNING", "PAUSED", satisfied).ok).toBe(true);
    expect(transition("PAUSED", "RUNNING", satisfied).ok).toBe(true);
  });

  it("resolves when required actions are complete", () => {
    expect(transition("RUNNING", "RESOLVED", satisfied).ok).toBe(true);
  });

  it("fails once the tick limit is exceeded", () => {
    expect(transition("RUNNING", "FAILED", { ...satisfied, tick: 61 }).ok).toBe(true);
  });

  it("resets a running drill back to READY", () => {
    expect(transition("RUNNING", "READY", satisfied).ok).toBe(true);
    expect(transition("PAUSED", "READY", satisfied).ok).toBe(true);
  });

  it("evaluates resolved and failed drills", () => {
    expect(transition("RESOLVED", "EVALUATED", satisfied).ok).toBe(true);
    expect(transition("FAILED", "EVALUATED", satisfied).ok).toBe(true);
  });
});

describe("rejected transitions", () => {
  it("rejects DRAFT to RUNNING with E-STATE-409", () => {
    const result = transition("DRAFT", "RUNNING", satisfied);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("E-STATE-409");
  });

  it("rejects DRAFT to READY when validation has not passed", () => {
    const result = transition("DRAFT", "READY", { ...satisfied, validationPassed: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("E-STATE-409");
  });

  it("rejects RESOLVED without required actions", () => {
    const result = transition("RUNNING", "RESOLVED", {
      ...satisfied,
      requiredActionsSatisfied: false,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects FAILED at exactly the tick limit", () => {
    const result = transition("RUNNING", "FAILED", { ...satisfied, tick: 60, maxTicks: 60 });
    expect(result.ok).toBe(false);
  });

  it("allows nothing out of EVALUATED", () => {
    expect(ALLOWED_TRANSITIONS.EVALUATED).toHaveLength(0);
    expect(transition("EVALUATED", "RUNNING", satisfied).ok).toBe(false);
  });

  it("rejects skipping EVALUATED", () => {
    expect(transition("RESOLVED", "READY", satisfied).ok).toBe(false);
  });

  it("uses an empty context by default", () => {
    expect(transition("DRAFT", "READY").ok).toBe(false);
    expect(DEFAULT_TRANSITION_CONTEXT.validationPassed).toBe(false);
  });
});

describe("helpers", () => {
  it("only accepts actions while RUNNING", () => {
    expect(canAcceptAction("RUNNING")).toBe(true);
    expect(canAcceptAction("PAUSED")).toBe(false);
    expect(canAcceptAction("RESOLVED")).toBe(false);
  });

  it("knows active and terminal states", () => {
    expect(isActive("RUNNING")).toBe(true);
    expect(isActive("PAUSED")).toBe(true);
    expect(isActive("READY")).toBe(false);
    expect(isTerminal("EVALUATED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(false);
  });
});
