import { describe, expect, it } from "vitest";
import { ERROR_STATUS } from "#/lib/errors";
import { errorMessage, messages, t } from "#/lib/i18n/messages";

describe("dictionary", () => {
  it("has identical keys in English and Indonesian", () => {
    expect(Object.keys(messages.id).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it("has no empty strings", () => {
    for (const [locale, table] of Object.entries(messages)) {
      for (const [key, value] of Object.entries(table)) {
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
      }
    }
  });

  it("interpolates named variables", () => {
    expect(t("en", "common.tickOf", { tick: 4, total: 60 })).toBe("tick 4 of 60");
    expect(t("id", "common.tickOf", { tick: 4, total: 60 })).toBe("tick 4 dari 60");
    expect(t("id", "common.tick")).toBe("Tick");
  });

  it("falls back to English for an unknown locale value", () => {
    expect(t("en", "nav.dashboard")).toBe("Dashboard");
  });
});

describe("error messages", () => {
  it("covers every stable error code in both locales", () => {
    for (const code of Object.keys(ERROR_STATUS)) {
      expect(errorMessage("en", code), code).not.toBe(messages.en["error.unknown"]);
      expect(errorMessage("id", code), code).not.toBe(messages.id["error.unknown"]);
    }
  });

  it("falls back for unknown codes", () => {
    expect(errorMessage("en", "E-NOPE-000")).toBe(messages.en["error.unknown"]);
  });
});
