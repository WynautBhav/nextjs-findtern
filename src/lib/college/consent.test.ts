import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { NOTICE_HASH, NOTICE_TEXT, NOTICE_VERSION } from "./consent.ts";

test("the notice is a bullet list that points to the support address", () => {
  const [title, ...points] = NOTICE_TEXT.split("\n");
  assert.ok(title.includes(NOTICE_VERSION));
  assert.ok(points.length >= 5);
  assert.ok(points.every((line) => line.startsWith("• ")));
  assert.ok(NOTICE_TEXT.includes("communicate@findtern.in"));
  assert.ok(!NOTICE_TEXT.includes("grievance@"));
});

test("the stored hash is the hash of the exact text shown", () => {
  assert.equal(NOTICE_HASH, createHash("sha256").update(NOTICE_TEXT, "utf8").digest("hex"));
});
