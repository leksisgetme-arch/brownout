import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacHex, sha256, timingSafeEqualHex, toHex } from "#/engine/crypto";

const vectors = [
	"",
	"abc",
	"Brownout",
	"x".repeat(55),
	"x".repeat(56),
	"x".repeat(64),
	"x".repeat(1000),
];

describe("sha256", () => {
	it.each(vectors)("matches node:crypto for %# bytes", (value) => {
		expect(toHex(sha256(new TextEncoder().encode(value)))).toBe(
			createHash("sha256").update(value).digest("hex"),
		);
	});
});

describe("hmacSha256", () => {
	const secrets = ["secret", "a".repeat(64), "b".repeat(100)];
	const messages = ["1.{}", '2.{"a":1}', "", "x".repeat(500)];

	it("matches node:crypto for every secret/message pair", () => {
		for (const secret of secrets) {
			for (const message of messages) {
				expect(hmacHex(secret, message)).toBe(
					createHmac("sha256", secret).update(message).digest("hex"),
				);
			}
		}
	});
});

describe("timingSafeEqualHex", () => {
	it("returns true for identical digests", () => {
		expect(timingSafeEqualHex("abcdef", "abcdef")).toBe(true);
	});

	it("returns false for different digests of equal length", () => {
		expect(timingSafeEqualHex("abcdef", "abcdeg")).toBe(false);
	});

	it("returns false for different lengths", () => {
		expect(timingSafeEqualHex("abc", "abcd")).toBe(false);
	});
});
