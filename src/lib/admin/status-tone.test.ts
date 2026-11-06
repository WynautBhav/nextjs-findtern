import assert from "node:assert/strict";
import { test } from "node:test";

import { TONE_BY_STATUS, toneForStatus } from "./status-tone.ts";

test("the owner's three: scheduled is yellow, completed green, applied its own colour", () => {
  assert.equal(toneForStatus("interview_scheduled"), "warning");
  assert.equal(toneForStatus("completed"), "success");
  assert.equal(toneForStatus("applied"), "info");
});

test("other statuses from the plan", () => {
  for (const s of ["scheduled", "pending", "waiting", "sent"]) assert.equal(toneForStatus(s), "warning", s);
  for (const s of ["hired", "approved", "paid", "accepted"]) assert.equal(toneForStatus(s), "success", s);
  for (const s of ["expired", "rejected", "declined", "withdrawn", "failed", "void"]) assert.equal(toneForStatus(s), "danger", s);
  for (const s of ["not_applied", "draft"]) assert.equal(toneForStatus(s), "neutral", s);
});

test("unknown, empty and null are neutral", () => {
  assert.equal(toneForStatus("something else"), "neutral");
  assert.equal(toneForStatus(""), "neutral");
  assert.equal(toneForStatus(null), "neutral");
  assert.equal(toneForStatus(undefined), "neutral");
});

test("case and spaces do not matter", () => {
  assert.equal(toneForStatus("Interview Scheduled"), "warning");
  assert.equal(toneForStatus("  COMPLETED "), "success");
  assert.equal(toneForStatus("Not Applied"), "neutral");
  assert.equal(toneForStatus("full-time"), "info");
});

test("every mapped key is already in normal form", () => {
  for (const k of Object.keys(TONE_BY_STATUS)) assert.equal(k, k.toLowerCase().replace(/[\s-]+/g, "_"));
});
