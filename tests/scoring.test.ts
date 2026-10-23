import { describe, expect, it } from "vitest";
import { clampScore, gradeFor, computeScore } from "#/engine";

const base = { firstActionTick: 3, maxTicks: 60, wrongActions: 0, slaBreachWindows: 0, hintsUsed: 0 };

describe("computeScore", () => {
  it("awards 100 and an A for an action on the grace tick", () => {
    const score = computeScore(base);
    expect(score.total).toBe(100);
    expect(score.grade).toBe("A");
    expect(score.mttaPenalty).toBe(0);
  });

  it("charges one point per tick after tick 3", () => {
    const score = computeScore({ ...base, firstActionTick: 10 });
    expect(score.mttaPenalty).toBe(7);
    expect(score.total).toBe(93);
  });

  it("treats a missing action as the tick limit", () => {
    const score = computeScore({ ...base, firstActionTick: null, maxTicks: 60 });
    expect(score.mttaTicks).toBe(60);
    expect(score.mttaPenalty).toBe(57);
    expect(score.total).toBe(43);
  });

  it("applies five points per wrong action", () => {
    const score = computeScore({ ...base, wrongActions: 3 });
    expect(score.wrongActionPenalty).toBe(15);
    expect(score.total).toBe(85);
  });

  it("applies ten points per SLA breach window", () => {
    const score = computeScore({ ...base, slaBreachWindows: 2 });
    expect(score.slaPenalty).toBe(20);
    expect(score.total).toBe(80);
  });

  it("applies five points per hint", () => {
    const score = computeScore({ ...base, hintsUsed: 4 });
    expect(score.hintPenalty).toBe(20);
    expect(score.total).toBe(80);
  });

  it("never drops below zero", () => {
    const score = computeScore({
      firstActionTick: 60,
      maxTicks: 60,
      wrongActions: 20,
      slaBreachWindows: 10,
      hintsUsed: 10,
    });
    expect(score.total).toBe(0);
    expect(score.grade).toBe("F");
  });

  it("is deterministic for the same inputs", () => {
    const input = { firstActionTick: 17, maxTicks: 120, wrongActions: 2, slaBreachWindows: 1, hintsUsed: 1 };
    expect(computeScore(input)).toEqual(computeScore(input));
  });
});

describe("gradeFor", () => {
  it.each([
    [100, "A"],
    [90, "A"],
    [89, "B"],
    [75, "B"],
    [74, "C"],
    [60, "C"],
    [59, "D"],
    [40, "D"],
    [39, "F"],
    [0, "F"],
  ] as const)("maps %i to %s", (total, grade) => {
    expect(gradeFor(total)).toBe(grade);
  });
});

describe("clampScore", () => {
  it("rounds and clamps to 0..100", () => {
    expect(clampScore(100.4)).toBe(100);
    expect(clampScore(-3)).toBe(0);
    expect(clampScore(Number.NaN)).toBe(0);
  });
});
