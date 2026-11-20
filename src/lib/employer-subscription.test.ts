import assert from "node:assert/strict";
import { test } from "node:test";

import { splitGst } from "./gst.ts";
import { chargeLine } from "./subscription/view.ts";

import {
  SUBSCRIPTION_DEFAULTS,
  isSubscriptionOrderRaw,
  parseSubscriptionConfig,
  parseSubscriptionOverrides,
  subscriptionChargeMinor,
  subscriptionPriceMinor,
  subscriptionState,
} from "./employer-subscription.ts";

const DAY = 86_400_000;
const NOW = new Date("2026-11-17T10:00:00.000Z");
const ago = (days: number, from: Date = NOW) => new Date(from.getTime() - days * DAY);
const ahead = (days: number, from: Date = NOW) => new Date(from.getTime() + days * DAY);
const pay = (paidAt: Date | null, over: Record<string, unknown> = {}, status = "paid") => ({
  status,
  paidAt,
  raw: { kind: "employer_subscription", periodDays: 365, currency: "INR", ...over },
});
const NONE = { active: false, status: "none", endsAt: null, daysLeft: null };

/* ── config and price ──────────────────────────────────────────────── */

test("defaults: Rs 10,000, 365 days, on", () => {
  assert.deepEqual(SUBSCRIPTION_DEFAULTS, { priceInrMinor: 1_000_000, durationDays: 365, enabled: true });
});

test("parseSubscriptionConfig: nothing or garbage is the defaults", () => {
  for (const v of [null, undefined, "x", 5, [], {}, { priceInrMinor: "lots" }]) assert.deepEqual(parseSubscriptionConfig(v), SUBSCRIPTION_DEFAULTS, JSON.stringify(v));
});

test("parseSubscriptionConfig: valid fields are taken, each bad one falls back alone", () => {
  assert.deepEqual(parseSubscriptionConfig({ priceInrMinor: 2_500_000, durationDays: 180, enabled: false }), { priceInrMinor: 2_500_000, durationDays: 180, enabled: false });
  assert.deepEqual(parseSubscriptionConfig({ priceInrMinor: 0, durationDays: 90, enabled: "no" }), { priceInrMinor: 1_000_000, durationDays: 90, enabled: true });
  assert.deepEqual(parseSubscriptionConfig({ priceInrMinor: -5, durationDays: 0 }), SUBSCRIPTION_DEFAULTS);
  assert.deepEqual(parseSubscriptionConfig({ priceInrMinor: Number.NaN, durationDays: 99999 }), SUBSCRIPTION_DEFAULTS);
  assert.equal(parseSubscriptionConfig({ durationDays: 30.4 }).durationDays, 30);
  assert.equal(parseSubscriptionConfig({ priceInrMinor: 999.6 }).priceInrMinor, 1000);
});

test("subscriptionPriceMinor: INR as set, USD through the Rs 100 = $1 rule ($100 for Rs 10,000)", () => {
  assert.equal(subscriptionPriceMinor(SUBSCRIPTION_DEFAULTS, "INR"), 1_000_000);
  assert.equal(subscriptionPriceMinor(SUBSCRIPTION_DEFAULTS, "USD"), 10_000);
  assert.equal(subscriptionPriceMinor({ ...SUBSCRIPTION_DEFAULTS, priceInrMinor: 2_500_000 }, "USD"), 25_000);
});

test("isSubscriptionOrderRaw: only raw.kind employer_subscription", () => {
  assert.equal(isSubscriptionOrderRaw({ kind: "employer_subscription" }), true);
  assert.equal(isSubscriptionOrderRaw({ kind: "employer_subscription", periodDays: 365 }), true);
  for (const v of [null, undefined, {}, "employer_subscription", { kind: "hire" }, { kind: "Employer_Subscription" }, [], 3, { proposalIds: ["p1"] }]) {
    assert.equal(isSubscriptionOrderRaw(v), false, JSON.stringify(v));
  }
});

test("parseSubscriptionOverrides: keeps only readable entries", () => {
  const ok = { grantedUntil: "2027-01-01T00:00:00.000Z", by: "admin-1", note: "pilot" };
  assert.deepEqual(parseSubscriptionOverrides({ e1: ok, e2: "x", e3: null, e4: { revokedAt: "nope", by: "a", note: "n" } }), { e1: ok, e4: { by: "a", note: "n" } });
  assert.deepEqual(parseSubscriptionOverrides(null), {});
  assert.deepEqual(parseSubscriptionOverrides([1, 2]), {});
});

/* ── state ─────────────────────────────────────────────────────────── */

test("no payments, no override: none", () => {
  assert.deepEqual(subscriptionState({ payments: [], override: null, now: NOW }), NONE);
  assert.deepEqual(subscriptionState({ payments: [], override: undefined }), NONE);
});

test("one paid subscription is active for its period", () => {
  const s = subscriptionState({ payments: [pay(ago(10))], override: null, now: NOW });
  assert.deepEqual(s, { active: true, status: "active", endsAt: ahead(355).toISOString(), daysLeft: 355 });
});

test("only paid subscription orders count: created, failed, unpaid, other kinds and hire orders are ignored", () => {
  const payments = [
    pay(ago(1), {}, "created"),
    pay(ago(1), {}, "failed"),
    pay(null),
    { status: "paid", paidAt: ago(1), raw: { proposalIds: ["p1"] } },
    { status: "paid", paidAt: ago(1), raw: null },
    { status: "paid", paidAt: ago(1), raw: { kind: "other" } },
  ];
  assert.deepEqual(subscriptionState({ payments, override: null, now: NOW }), NONE);
});

test("expiring: 30 days or fewer left; exactly 30 days is expiring, a moment more is active", () => {
  const exactly = subscriptionState({ payments: [pay(ago(335))], override: null, now: NOW });
  assert.equal(exactly.status, "expiring");
  assert.equal(exactly.active, true);
  assert.equal(exactly.daysLeft, 30);
  const more = subscriptionState({ payments: [pay(new Date(ago(335).getTime() + 1))], override: null, now: NOW });
  assert.equal(more.status, "active");
  assert.equal(more.daysLeft, 31);
  const last = subscriptionState({ payments: [pay(ago(364.5))], override: null, now: NOW });
  assert.equal(last.status, "expiring");
  assert.equal(last.daysLeft, 1, "part of a day left rounds up");
});

test("expired: the period has ended; active false, the end date kept for display", () => {
  const s = subscriptionState({ payments: [pay(ago(400))], override: null, now: NOW });
  assert.deepEqual(s, { active: false, status: "expired", endsAt: ahead(-35).toISOString(), daysLeft: null });
  const edge = subscriptionState({ payments: [pay(ago(365))], override: null, now: NOW });
  assert.equal(edge.status, "expired", "the end moment itself is expired");
});

test("the period is the order's periodDays; a missing or unreadable one falls back to the configured, then the default, length", () => {
  const p = (raw: Record<string, unknown>) => ({ status: "paid", paidAt: ago(10), raw: { kind: "employer_subscription", ...raw } });
  assert.equal(subscriptionState({ payments: [p({ periodDays: 30 })], override: null, now: NOW }).endsAt, ahead(20).toISOString());
  assert.equal(subscriptionState({ payments: [p({})], override: null, now: NOW }).endsAt, ahead(355).toISOString());
  assert.equal(subscriptionState({ payments: [p({ periodDays: 0 })], override: null, now: NOW }).endsAt, ahead(355).toISOString());
  assert.equal(subscriptionState({ payments: [p({ periodDays: "x" })], override: null, now: NOW }).endsAt, ahead(355).toISOString());
  assert.equal(subscriptionState({ payments: [p({})], override: null, now: NOW, config: { ...SUBSCRIPTION_DEFAULTS, durationDays: 100 } }).endsAt, ahead(90).toISOString());
});

test("paying while active extends from the current end, not from the payment date", () => {
  const first = ago(200);
  const second = ago(100); // still inside the first year
  const s = subscriptionState({ payments: [pay(first), pay(second)], override: null, now: NOW });
  assert.equal(s.endsAt, new Date(first.getTime() + 730 * DAY).toISOString());
  assert.equal(s.daysLeft, 730 - 200);
  assert.equal(s.status, "active");
});

test("stacking does not depend on the order the payments arrive in", () => {
  const a = pay(ago(200));
  const b = pay(ago(100));
  const c = pay(ago(10));
  const expected = new Date(ago(200).getTime() + 3 * 365 * DAY).toISOString();
  for (const payments of [[a, b, c], [c, b, a], [b, c, a]]) assert.equal(subscriptionState({ payments, override: null, now: NOW }).endsAt, expected);
});

test("paying after the old period ended starts a fresh period from the payment date", () => {
  const s = subscriptionState({ payments: [pay(ago(500)), pay(ago(10))], override: null, now: NOW });
  assert.equal(s.endsAt, ahead(355).toISOString());
  assert.equal(s.active, true);
});

test("paying the very moment the old period ends does not double count", () => {
  const first = ago(365);
  const s = subscriptionState({ payments: [pay(first), pay(NOW)], override: null, now: NOW });
  assert.equal(s.endsAt, ahead(365).toISOString());
});

test("grant: gives access until the date with no payment", () => {
  const s = subscriptionState({ payments: [], override: { grantedUntil: ahead(40).toISOString(), by: "admin-1", note: "pilot" }, now: NOW });
  assert.deepEqual(s, { active: true, status: "active", endsAt: ahead(40).toISOString(), daysLeft: 40 });
  assert.equal(subscriptionState({ payments: [], override: { grantedUntil: ahead(10).toISOString(), by: "a", note: "n" }, now: NOW }).status, "expiring");
  assert.equal(subscriptionState({ payments: [], override: { grantedUntil: ago(3).toISOString(), by: "a", note: "n" }, now: NOW }).status, "expired");
});

test("grant: extends a shorter paid period but never shortens a longer one", () => {
  const paid = [pay(ago(300))]; // ends in 65 days
  const longer = subscriptionState({ payments: paid, override: { grantedUntil: ahead(200).toISOString(), by: "a", note: "n" }, now: NOW });
  assert.equal(longer.endsAt, ahead(200).toISOString());
  const shorter = subscriptionState({ payments: paid, override: { grantedUntil: ahead(5).toISOString(), by: "a", note: "n" }, now: NOW });
  assert.equal(shorter.endsAt, ahead(65).toISOString());
});

test("revoke: payments made before it no longer count", () => {
  const s = subscriptionState({ payments: [pay(ago(10))], override: { revokedAt: ago(2).toISOString(), by: "admin-1", note: "chargeback" }, now: NOW });
  assert.deepEqual(s, { active: false, status: "revoked", endsAt: null, daysLeft: null });
});

test("revoke: a payment made after it counts, from its own date", () => {
  const s = subscriptionState({ payments: [pay(ago(10)), pay(ago(1))], override: { revokedAt: ago(2).toISOString(), by: "a", note: "n" }, now: NOW });
  assert.equal(s.active, true);
  assert.equal(s.endsAt, ahead(364).toISOString());
});

test("revoke with nothing ever bought is still revoked, and a future revoke date is not yet in force", () => {
  assert.equal(subscriptionState({ payments: [], override: { revokedAt: ago(1).toISOString(), by: "a", note: "n" }, now: NOW }).status, "revoked");
  const s = subscriptionState({ payments: [pay(ago(10))], override: { revokedAt: ahead(1).toISOString(), by: "a", note: "n" }, now: NOW });
  assert.equal(s.status, "active");
});

test("revoke beats an older grant; a grant made after the revoke (grantedAt) applies again", () => {
  const base = { by: "a", note: "n", revokedAt: ago(5).toISOString(), grantedUntil: ahead(30).toISOString() };
  assert.equal(subscriptionState({ payments: [], override: base, now: NOW }).status, "revoked");
  assert.equal(subscriptionState({ payments: [], override: { ...base, grantedAt: ago(8).toISOString() }, now: NOW }).status, "revoked");
  const regranted = subscriptionState({ payments: [], override: { ...base, grantedAt: ago(1).toISOString() }, now: NOW });
  assert.equal(regranted.active, true);
  assert.equal(regranted.endsAt, ahead(30).toISOString());
});

test("enabled=false: inactive whatever was paid or granted", () => {
  const config = { ...SUBSCRIPTION_DEFAULTS, enabled: false };
  assert.deepEqual(subscriptionState({ payments: [pay(ago(10))], override: null, now: NOW, config }), NONE);
  assert.deepEqual(subscriptionState({ payments: [], override: { grantedUntil: ahead(40).toISOString(), by: "a", note: "n" }, now: NOW, config }), NONE);
  assert.equal(subscriptionState({ payments: [pay(ago(10))], override: null, now: NOW, config: SUBSCRIPTION_DEFAULTS }).active, true);
});

test("a garbled override is ignored, never throws", () => {
  for (const override of ["x", 5, [], {}, { grantedUntil: "not a date" }, { revokedAt: 7 }, { grantedUntil: null }]) {
    assert.equal(subscriptionState({ payments: [pay(ago(10))], override, now: NOW }).status, "active", JSON.stringify(override));
  }
  assert.deepEqual(subscriptionState({ payments: [], override: { grantedUntil: "not a date" }, now: NOW }), NONE);
});

test("now defaults to the present", () => {
  const s = subscriptionState({ payments: [pay(new Date(Date.now() - DAY))], override: null });
  assert.equal(s.active, true);
});

test("subscriptionChargeMinor: INR is the base plus 18% GST on top, USD (export) is the converted base with no GST", () => {
  assert.deepEqual(subscriptionChargeMinor(SUBSCRIPTION_DEFAULTS, "INR"), { baseMinor: 1_000_000, gstMinor: 180_000, totalMinor: 1_180_000 });
  assert.deepEqual(subscriptionChargeMinor(SUBSCRIPTION_DEFAULTS, "USD"), { baseMinor: 10_000, gstMinor: 0, totalMinor: 10_000 });
  // Whole paise, half rounds up: 123_457 x 18% = 22_222.26 -> 22_222; 5 x 18% = 0.9 -> 1; 25 x 18% = 4.5 -> 5.
  assert.deepEqual(subscriptionChargeMinor({ ...SUBSCRIPTION_DEFAULTS, priceInrMinor: 123_457 }, "INR"), { baseMinor: 123_457, gstMinor: 22_222, totalMinor: 145_679 });
  assert.equal(subscriptionChargeMinor({ ...SUBSCRIPTION_DEFAULTS, priceInrMinor: 5 }, "INR").gstMinor, 1);
  assert.equal(subscriptionChargeMinor({ ...SUBSCRIPTION_DEFAULTS, priceInrMinor: 25 }, "INR").gstMinor, 5);
  assert.deepEqual(subscriptionChargeMinor({ ...SUBSCRIPTION_DEFAULTS, priceInrMinor: 4_990_000 }, "USD"), { baseMinor: 49_900, gstMinor: 0, totalMinor: 49_900 });
});

test("an exclusive-built total splits back through the invoice's inclusive splitGst to exactly the base and the GST charged", () => {
  const bases = [1_000_000, 123_457, 999_999, 1, 5, 25, 99, 100, 4_990_000, 1_250_050, 100_000_000, 777_777, 1_000_001];
  for (let b = 1_000; b < 1_000 + 3_000; b += 7) bases.push(b * 13);
  for (const b of bases) {
    const c = subscriptionChargeMinor({ ...SUBSCRIPTION_DEFAULTS, priceInrMinor: b }, "INR");
    for (const place of [{ kind: "india", stateCode: "08", stateName: "Rajasthan" }, { kind: "india", stateCode: "29", stateName: "Karnataka" }] as const) {
      const s = splitGst(c.totalMinor, place);
      assert.equal(s.baseMinor, c.baseMinor, `base ${b}`);
      assert.equal(s.cgstMinor + s.sgstMinor + s.igstMinor, c.gstMinor, `gst ${b}`);
      assert.equal(s.totalMinor, c.totalMinor);
    }
  }
  const s = splitGst(1_180_000, { kind: "india", stateCode: "08", stateName: "Rajasthan" });
  assert.deepEqual([s.baseMinor, s.cgstMinor, s.sgstMinor, s.igstMinor, s.mode], [1_000_000, 90_000, 90_000, 0, "intra"]);
  const i = splitGst(1_180_000, { kind: "india", stateCode: "29", stateName: "Karnataka" });
  assert.deepEqual([i.baseMinor, i.cgstMinor, i.sgstMinor, i.igstMinor, i.mode], [1_000_000, 0, 0, 180_000, "inter"]);
});

test("chargeLine says the price plainly: India base + 18% GST (total), USD no GST", () => {
  assert.equal(chargeLine(subscriptionChargeMinor(SUBSCRIPTION_DEFAULTS, "INR"), "INR"), "₹10,000 + 18% GST (₹11,800)");
  assert.equal(chargeLine(subscriptionChargeMinor(SUBSCRIPTION_DEFAULTS, "USD"), "USD"), "$100 (no GST)");
});
