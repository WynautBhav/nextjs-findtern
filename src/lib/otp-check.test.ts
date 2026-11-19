import { test } from "node:test";
import assert from "node:assert/strict";

import { otpVerdict } from "./otp-check.ts";
import { RateLimiter, hashOtp } from "./security/rate-limit.ts";

const EMAIL = "a@x.in";
const NOW = new Date("2026-11-19T10:00:00Z");
// What send-otp writes: a live code for a new address, an expired never-matching row for a registered one.
const newRow = (id: string) => ({ id, otpHash: hashOtp("123456", EMAIL), expiresAt: new Date(NOW.getTime() + 600_000) });
const existingRow = (id: string) => ({ id, otpHash: hashOtp("654321", EMAIL), expiresAt: new Date(0) });

function sequence(row: ReturnType<typeof newRow>, wrongCodes: number): string[] {
  const guess = new RateLimiter(4, 15 * 60_000, { bypassable: false });
  return Array.from({ length: wrongCodes }, () => otpVerdict(row, "000000", EMAIL, (id) => guess.take(id), NOW));
}

test("B-55: a registered email's wrong-code sequence is identical to a new email's, including the 429", () => {
  const fresh = sequence(newRow("r-new"), 7);
  const registered = sequence(existingRow("r-reg"), 7);
  assert.deepEqual(registered, fresh);
  assert.ok(fresh.includes("locked"), "the limit is reached at all");
  assert.equal(fresh[0], "invalid");
});

test("a correct code on a live row passes; the same code once expired does not, and counts no guess", () => {
  const take = () => { throw new Error("no guess is taken for a correct code"); };
  assert.equal(otpVerdict(newRow("r"), "123456", EMAIL, take, NOW), "ok");
  assert.equal(otpVerdict({ ...newRow("r"), expiresAt: new Date(NOW.getTime() - 1) }, "123456", EMAIL, take, NOW), "invalid");
});

test("no row at all is a plain invalid", () => {
  assert.equal(otpVerdict(undefined, "123456", EMAIL, () => true, NOW), "invalid");
});
