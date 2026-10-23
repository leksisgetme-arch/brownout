import { describe, expect, it } from "vitest";
import { checkEnv } from "#/server/env";

const base = {
  DATABASE_URL: "postgresql://user:pass@ep-test-pooler.eu.aws.neon.tech/brownout?sslmode=require",
};

describe("checkEnv", () => {
  it("accepts the minimum valid environment", () => {
    const result = checkEnv(base);
    expect(result.ok).toBe(true);
    if (result.ok && result.env) expect(result.env.TEST_MODE).toBe("false");
  });

  it("reports every missing variable in one message", () => {
    const result = checkEnv({});
    expect(result.ok).toBe(false);
    expect(result.message).toContain("E-ENV-500");
    expect(result.message).toContain("DATABASE_URL");
  });

  it("rejects a non-postgres URL", () => {
    const result = checkEnv({ DATABASE_URL: "https://example.com" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("postgres://");
  });

  it("requires TEST_SECRET when TEST_MODE is on", () => {
    const result = checkEnv({ ...base, TEST_MODE: "true" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("TEST_SECRET");
  });

  it("rejects a short TEST_SECRET", () => {
    const result = checkEnv({ ...base, TEST_MODE: "true", TEST_SECRET: "short" });
    expect(result.ok).toBe(false);
  });

  it("accepts test mode with a long secret", () => {
    const result = checkEnv({ ...base, TEST_MODE: "true", TEST_SECRET: "a".repeat(32) });
    expect(result.ok).toBe(true);
    if (result.ok && result.env) expect(result.env.TEST_MODE).toBe("true");
  });

  it("rejects an unknown TEST_MODE value", () => {
    const result = checkEnv({ ...base, TEST_MODE: "yes" });
    expect(result.ok).toBe(false);
  });

  it("never echoes secret values in the failure message", () => {
    const result = checkEnv({ ...base, TEST_MODE: "true", TEST_SECRET: "leaky-value" });
    expect(result.message).not.toContain("leaky-value");
  });
});
