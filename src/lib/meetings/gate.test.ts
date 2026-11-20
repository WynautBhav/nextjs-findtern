import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkGateStart, DISCLAIMER, DISCLAIMER_VERSION, ipHash, maskMeetingLink, MIN_ELAPSED_MS, needsGate, signGateStart, STAMP_MAX_AGE_MS } from "./gate.ts";

const SECRET = "test-secret-at-least-32-characters-long!!";
const who = { token: "tok123", role: "intern" as const, uid: "u1", version: DISCLAIMER_VERSION };
const T0 = Date.parse("2026-11-20T06:00:00Z");

describe("gate stamp: the server enforces the wait", () => {
  const stamp = signGateStart(SECRET, who, T0);
  it("refuses an acceptance sooner than the minimum, accepts exactly at it", () => {
    assert.deepEqual(checkGateStart(SECRET, who, stamp, T0), { ok: false, reason: "too_early" });
    assert.deepEqual(checkGateStart(SECRET, who, stamp, T0 + MIN_ELAPSED_MS - 1), { ok: false, reason: "too_early" });
    assert.deepEqual(checkGateStart(SECRET, who, stamp, T0 + MIN_ELAPSED_MS), { ok: true });
    assert.deepEqual(checkGateStart(SECRET, who, stamp, T0 + 10_000), { ok: true });
  });
  it("is stale after the max age", () => {
    assert.equal(checkGateStart(SECRET, who, stamp, T0 + STAMP_MAX_AGE_MS).ok, true);
    assert.deepEqual(checkGateStart(SECRET, who, stamp, T0 + STAMP_MAX_AGE_MS + 1), { ok: false, reason: "stale" });
  });
  it("cannot be forged, back-dated or moved to another meeting, person or version", () => {
    const [, sig] = stamp.split(".");
    assert.equal(checkGateStart(SECRET, who, `${T0 - 60_000}.${sig}`, T0 + 5_000).ok, false, "back-dated start");
    assert.equal(checkGateStart(SECRET, who, `${T0}.${"A".repeat(sig.length)}`, T0 + 20_000).ok, false, "bad signature");
    assert.equal(checkGateStart("another-secret-another-secret-123456", who, stamp, T0 + 20_000).ok, false, "other key");
    for (const other of [{ ...who, token: "tok999" }, { ...who, uid: "u2" }, { ...who, role: "employer" as const }, { ...who, version: "old" }]) {
      assert.deepEqual(checkGateStart(SECRET, other, stamp, T0 + 20_000), { ok: false, reason: "invalid" });
    }
  });
  it("rejects malformed and future stamps", () => {
    for (const bad of [undefined, null, 5, "", "x", "1.2.3", `${T0}`, `${T0}.`, `abc.def`]) assert.deepEqual(checkGateStart(SECRET, who, bad, T0 + 20_000), { ok: false, reason: "invalid" }, String(bad));
    const future = signGateStart(SECRET, who, T0 + 60_000);
    assert.deepEqual(checkGateStart(SECRET, who, future, T0), { ok: false, reason: "invalid" });
  });
});

describe("needsGate: acceptance is per disclaimer version", () => {
  it("reuses an acceptance of the current version, forces the gate again for a new one", () => {
    assert.equal(needsGate([], DISCLAIMER_VERSION), true);
    assert.equal(needsGate([DISCLAIMER_VERSION], DISCLAIMER_VERSION), false);
    assert.equal(needsGate(["2026-01-01.1"], DISCLAIMER_VERSION), true);
    assert.equal(needsGate([DISCLAIMER_VERSION], "next.2"), true);
    assert.equal(needsGate([]), true);
  });
});

describe("ipHash", () => {
  it("is salted, stable, never the address; unknown gives null", () => {
    const h = ipHash(SECRET, "203.0.113.9");
    assert.ok(h && h.length === 32 && !h.includes("203"));
    assert.equal(h, ipHash(SECRET, " 203.0.113.9 "));
    assert.notEqual(h, ipHash("another-secret-another-secret-123456", "203.0.113.9"));
    assert.notEqual(h, ipHash(SECRET, "203.0.113.10"));
    assert.equal(ipHash(SECRET, "unknown"), null);
    assert.equal(ipHash(SECRET, ""), null);
    assert.equal(ipHash(SECRET, null), null);
  });
});

describe("disclaimer + mask", () => {
  it("says the things the brief requires, once, in one place", () => {
    const text = [DISCLAIMER.intro, ...DISCLAIMER.rules, DISCLAIMER.recorded, DISCLAIMER.consequence, DISCLAIMER.agree].join(" ");
    for (const must of [/Findtern platform meeting/, /personal contact details/, /off Findtern/, /payment outside Findtern/, /recorded/, /Fireflies/, /appear as a participant/, /warning/, /on hold/, /you agree/]) assert.match(text, must);
  });
  it("masks a link without leaking it", () => {
    assert.equal(maskMeetingLink(null), null);
    assert.equal(maskMeetingLink("  "), null);
    assert.ok(!maskMeetingLink("https://meet.google.com/abc-defg-hij")!.includes("abc-defg"));
  });
});
