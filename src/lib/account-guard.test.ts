import { test } from "node:test";
import assert from "node:assert/strict";

import { CHANNEL, NOTICE_AFTER_MS, POLL_MS, SHARE_MS, disabledSignalApplies, shouldPoll, statusVerdict } from "./account-guard.ts";

test("hidden tabs never poll, even when forced", () => {
  assert.equal(shouldPoll({ now: 100_000, lastClaim: null, visible: false }), false);
  assert.equal(shouldPoll({ now: 100_000, lastClaim: null, visible: false, force: true }), false);
});

test("a visible tab polls unless another tab asked within the share window", () => {
  assert.equal(shouldPoll({ now: 100_000, lastClaim: null, visible: true }), true);
  assert.equal(shouldPoll({ now: 100_000, lastClaim: 100_000 - SHARE_MS + 1, visible: true }), false);
  assert.equal(shouldPoll({ now: 100_000, lastClaim: 100_000 - SHARE_MS, visible: true }), true);
  assert.equal(shouldPoll({ now: 100_000, lastClaim: 200_000, visible: true }), true, "a claim from the future (clock skew) does not block");
});

test("focus / becoming visible asks at once, whoever asked last", () => {
  assert.equal(shouldPoll({ now: 100_000, lastClaim: 99_999, visible: true, force: true }), true);
});

test("timing: one tab always keeps polling going, and the kick-out is within about a poll", () => {
  assert.ok(SHARE_MS < POLL_MS);
  assert.ok(POLL_MS <= 15_000);
  assert.ok(NOTICE_AFTER_MS >= 3_000);
  assert.equal(CHANNEL, "ft-account");
});

test("only 403 + ACCOUNT_DISABLED means disabled; 401 and failures do nothing", () => {
  assert.equal(statusVerdict(200, { ok: true }), "ok");
  assert.equal(statusVerdict(403, { error: "x", code: "ACCOUNT_DISABLED" }), "disabled");
  assert.equal(statusVerdict(403, { code: "terms_required" }), "unknown");
  assert.equal(statusVerdict(401, { code: "SESSION_EXPIRED" }), "unknown");
  assert.equal(statusVerdict(500, null), "unknown");
  assert.equal(statusVerdict(403, null), "unknown");
});

test("another tab's disabled signal counts only for the same role and only when recent", () => {
  const now = 1_000_000;
  const raw = JSON.stringify({ role: "employer", at: now - 5_000 });
  assert.equal(disabledSignalApplies(raw, "employer", now), true);
  assert.equal(disabledSignalApplies(raw, "intern", now), false);
  assert.equal(disabledSignalApplies(JSON.stringify({ role: "employer", at: now - 120_000 }), "employer", now), false);
  assert.equal(disabledSignalApplies("not json", "employer", now), false);
  assert.equal(disabledSignalApplies(null, "employer", now), false);
});
