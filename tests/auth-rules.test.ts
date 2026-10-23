import { describe, expect, it } from "vitest";
import {
  canCreateScenario,
  canRunDrill,
  isSessionExpired,
  PASSWORD_MIN_LENGTH,
  requireCommander,
  validateEmail,
  validatePassword,
} from "#/server/auth/rules";

describe("FR-A1 email validation", () => {
  it("normalises case and surrounding whitespace", () => {
    const result = validateEmail("  Commander@Brownout.DEV ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("commander@brownout.dev");
  });

  it.each(["", "no-at-sign", "a@b", "a b@c.dev", "a@b c.dev", "@b.dev", "a@.dev"])(
    "rejects %j with E-AUTH-002",
    (value) => {
      const result = validateEmail(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("E-AUTH-002");
    },
  );

  it("rejects an email longer than 254 characters", () => {
    const result = validateEmail(`${"a".repeat(250)}@b.dev`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("E-AUTH-002");
  });
});

describe("FR-A1 password validation", () => {
  it("accepts exactly the minimum length", () => {
    const result = validatePassword("a".repeat(PASSWORD_MIN_LENGTH));
    expect(result.ok).toBe(true);
  });

  it("rejects one character below the minimum with E-AUTH-003", () => {
    const result = validatePassword("a".repeat(PASSWORD_MIN_LENGTH - 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("E-AUTH-003");
  });

  it("rejects passwords above the maximum length", () => {
    const result = validatePassword("a".repeat(129));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("E-AUTH-003");
  });
});

describe("FR-A3 role rules", () => {
  it("allows a commander to create and run", () => {
    expect(canCreateScenario("commander")).toBe(true);
    expect(canRunDrill("commander")).toBe(true);
    expect(requireCommander("commander").ok).toBe(true);
  });

  it("blocks an observer with E-ROLE-403", () => {
    expect(canCreateScenario("observer")).toBe(false);
    expect(canRunDrill("observer")).toBe(false);
    const result = requireCommander("observer");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("E-ROLE-403");
  });
});

describe("FR-A2 session expiry", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("treats the exact expiry instant as expired", () => {
    expect(isSessionExpired(now, now)).toBe(true);
  });

  it("keeps a session one millisecond before expiry", () => {
    expect(isSessionExpired(now + 1, now)).toBe(false);
  });

  it("accepts Date instances", () => {
    expect(isSessionExpired(new Date(now - 1), now)).toBe(true);
  });
});
