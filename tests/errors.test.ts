import { describe, expect, it } from "vitest";
import { AppError, ERROR_STATUS, isErrorCode, statusForError } from "#/lib/errors";

describe("error registry", () => {
  it("maps auth codes to their documented HTTP status", () => {
    expect(statusForError("E-AUTH-001")).toBe(401);
    expect(statusForError("E-AUTH-002")).toBe(422);
    expect(statusForError("E-AUTH-003")).toBe(422);
    expect(statusForError("E-AUTH-004")).toBe(401);
  });

  it("maps role, state and rate-limit codes", () => {
    expect(statusForError("E-ROLE-403")).toBe(403);
    expect(statusForError("E-STATE-409")).toBe(409);
    expect(statusForError("E-RATE-429")).toBe(429);
    expect(statusForError("E-SIG-401")).toBe(401);
  });

  it("only accepts registered codes", () => {
    expect(isErrorCode("E-AUTH-001")).toBe(true);
    expect(isErrorCode("E-AUTH-999")).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });

  it("builds a typed AppError", () => {
    const error = new AppError("E-ROLE-403");
    expect(error.status).toBe(403);
    expect(error.code).toBe("E-ROLE-403");
    expect(Object.keys(ERROR_STATUS).length).toBeGreaterThan(15);
  });
});
