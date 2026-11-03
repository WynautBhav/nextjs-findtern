import { test } from "node:test";
import assert from "node:assert/strict";

import { badgeFor, formatBadge, settleCount } from "./queue-badge.ts";

test("settleCount returns the number, or null when the query fails (never 0)", async () => {
  assert.equal(await settleCount(async () => 4), 4);
  assert.equal(await settleCount(async () => "7"), 7);
  assert.equal(await settleCount(async () => 0), 0);
  assert.equal(await settleCount(async () => Promise.reject(new Error("db down"))), null);
  assert.equal(await settleCount(() => { throw new Error("sync"); }), null);
  assert.equal(await settleCount(async () => undefined), null);
  assert.equal(await settleCount(async () => "abc"), null);
  assert.equal(await settleCount(async () => -2), null);
});

test("badgeFor shows only a known non-zero count", () => {
  assert.equal(badgeFor(3), 3);
  assert.equal(badgeFor(0), undefined);
  assert.equal(badgeFor(null), undefined);
  assert.equal(badgeFor(undefined), undefined);
  assert.equal(badgeFor(Number.NaN), undefined);
});

test("formatBadge caps at 99+", () => {
  assert.equal(formatBadge(9), "9");
  assert.equal(formatBadge(99), "99");
  assert.equal(formatBadge(100), "99+");
});
