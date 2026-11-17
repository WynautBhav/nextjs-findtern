import assert from "node:assert/strict";
import test from "node:test";

import { payoutPatchAudit } from "./payout-patch.ts";
import { AUDIT_ACTIONS } from "./audit.ts";
import { stipendDues, payoutDateKey } from "./stipend-dues.ts";

/**
 * Package U (money out): audit trail for every payout edit, and the IST day for legacy payouts.
 * The route handlers run SQL, so the transitions are decided by pure functions tested here and the
 * rows they write are checked against a real database in e2e/payouts-money.e2e.mjs.
 */

/* ── payoutPatchAudit: what the audit row says about a PATCH ─────────── */

const base = { internId: "i1", status: "pending", referenceId: null as string | null, raw: {} as Record<string, unknown> };

test("a pending payout marked failed is audited with from -> to", () => {
  const meta = payoutPatchAudit(base, { status: "failed" });
  assert.deepEqual(meta, { internId: "i1", statusFrom: "pending", statusTo: "failed" });
});

test("a failed payout reopened to pending is audited", () => {
  const meta = payoutPatchAudit({ ...base, status: "failed" }, { status: "pending" });
  assert.deepEqual(meta, { internId: "i1", statusFrom: "failed", statusTo: "pending" });
});

test("rewriting the bank reference of a PAID payout is audited with the old and the new reference", () => {
  const meta = payoutPatchAudit({ ...base, status: "paid", referenceId: "UTR123" }, { referenceId: "UTR999" });
  assert.deepEqual(meta, { internId: "i1", referenceFrom: "UTR123", referenceTo: "UTR999" });
});

test("clearing a reference is audited as a change to null", () => {
  const meta = payoutPatchAudit({ ...base, status: "failed", referenceId: "X1" }, { referenceId: "  " });
  assert.deepEqual(meta, { internId: "i1", referenceFrom: "X1", referenceTo: null });
});

test("an ops-note edit is audited as a flag, never with the note text", () => {
  const meta = payoutPatchAudit(base, { opsNote: "bank returned: invalid account" });
  assert.deepEqual(meta, { internId: "i1", noteChanged: true });
  assert.ok(!JSON.stringify(meta).includes("invalid account"));
});

test("a PATCH that changes nothing writes no audit row", () => {
  assert.equal(payoutPatchAudit({ ...base, referenceId: "A" }, { referenceId: "A" }), null);
  assert.equal(payoutPatchAudit(base, { status: "pending" }), null);
  assert.equal(payoutPatchAudit({ ...base, raw: { opsNote: "same" } }, { opsNote: "same" }), null);
});

test("the legacy `notes` alias counts as a note edit", () => {
  assert.deepEqual(payoutPatchAudit(base, { notes: "hello" }), { internId: "i1", noteChanged: true });
});

test("payout.update has a label, so the audit log page can name it", () => {
  assert.ok(AUDIT_ACTIONS["payout.update"]);
});

/* ── legacy unlinked payouts: the IST day, and the currency ──────────── */

const offer = { monthlyAmount: 16000, duration: "2m", startDate: "2026-11-01", internStipendMonthly: 8000 };
const hired = { id: "p1", status: "hired", employerId: "e1", offerDetails: offer, currency: "INR" };
const inr = (minor: number) => ({ status: "paid", raw: {}, amountMinor: minor, currency: "INR" });

test("payoutDateKey dates a timestamp by its IST day: 01:30 IST on 1 Dec (= 30 Nov 20:00Z) is 1 Dec", () => {
  assert.equal(payoutDateKey({ status: "paid", raw: {}, paidAt: new Date("2026-11-30T20:00:00Z") }), "2026-12-01");
  assert.equal(payoutDateKey({ status: "paid", raw: {}, paidAt: new Date("2026-12-01T05:00:00Z") }), "2026-12-01");
  // 23:59 IST is still the same IST day; 00:00 IST rolls over.
  assert.equal(payoutDateKey({ status: "paid", raw: {}, paidAt: new Date("2026-12-01T18:29:59Z") }), "2026-12-01");
  assert.equal(payoutDateKey({ status: "paid", raw: {}, paidAt: new Date("2026-12-01T18:30:00Z") }), "2026-12-02");
});

test("a calendar day string is kept as typed (scheduledFor is already an IST day)", () => {
  assert.equal(payoutDateKey({ status: "paid", raw: { scheduledFor: "2026-12-01" } }), "2026-12-01");
  // A scheduled timestamp is read in IST too: the admin's IST midnight of 1 Dec, as a browser would have written it.
  assert.equal(payoutDateKey({ status: "paid", raw: { scheduledFor: "2026-11-30T18:30:00.000Z" } }), "2026-12-01");
});

test("an unlinked ₹8,000 payout paid at 01:30 IST on the month date counts that month paid (was: left owed, so the month could be paid twice)", () => {
  const early = { ...inr(800_000), paidAt: new Date("2026-11-30T20:00:00Z") };
  const due = stipendDues([hired], [early], 7)[0];
  assert.equal(due.paidMonths, 1);
  assert.equal(due.remainingMinor, 800_000);
});

test("an unlinked payout in another currency is never matched to an INR month by its bare number", () => {
  // 800000 USD cents = $8,000: not the ₹8,000 share. Only its INR value may match.
  const usd = { status: "paid", raw: { scheduledFor: "2026-12-01" }, amountMinor: 800_000, currency: "USD" };
  const due = stipendDues([hired], [usd], 7)[0];
  assert.equal(due.paidMonths, 0);
  assert.equal(due.remainingMinor, 1_600_000);
});
