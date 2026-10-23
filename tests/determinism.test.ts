import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRng, normaliseSeed } from "#/engine";

const ENGINE_DIR = join(process.cwd(), "src", "engine");

function engineSources(): Array<{ file: string; source: string }> {
  return readdirSync(ENGINE_DIR)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file, source: readFileSync(join(ENGINE_DIR, file), "utf8") }));
}

describe("seeded rng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRng(1337);
    const b = createRng(1337);
    const left = Array.from({ length: 12 }, () => a.next());
    const right = Array.from({ length: 12 }, () => b.next());
    expect(left).toEqual(right);
  });

  it("produces a different sequence for a different seed", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("stays inside [0, 1)", () => {
    const rng = createRng(99);
    for (let index = 0; index < 200; index += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("normalises seeds to unsigned 32-bit integers", () => {
    expect(normaliseSeed(-1)).toBe(4294967295);
    expect(normaliseSeed(1.9)).toBe(1);
    expect(normaliseSeed(Number.NaN)).toBe(0);
  });

  it("picks deterministically", () => {
    const items = ["a", "b", "c", "d"] as const;
    expect(createRng(7).pick(items)).toBe(createRng(7).pick(items));
  });
});

describe("engine purity", () => {
  it.each(engineSources())("$file has no wall clock or ambient randomness", ({ source }) => {
    expect(source).not.toMatch(/Date\.now/);
    expect(source).not.toMatch(/Math\.random/);
    expect(source).not.toMatch(/performance\.now/);
    expect(source).not.toMatch(/new Date\(/);
  });
});
