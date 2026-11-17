// Scenario matrix for the owner's question: "a candidate who was there 6 months and never landed an internship,
// how does his refund work". Pure functions only; each test pins what the code does TODAY (no new policy).
import test from "node:test";
import assert from "node:assert/strict";
import { eligibility, GATEWAY_REFUND_WINDOW_DAYS } from "./refunds.ts";
import { planScan, type ScanRow } from "./refunds-plan.ts";
import { GUARANTEE_MONTHS, guaranteeEnded, guaranteeMisses } from "../guarantee.ts";
import { computeAmounts, validateOrderInput } from "../college/drive-order.ts";

const DAY = 86_400_000;
const FEE_INR = 249_900; // ₹2,499 in paise
const FEE_USD = 2_900; // $29 in cents (a USD fee row; the scan never looks at currency)
// Paid 00:30 IST on 2026-01-10 = 19:00 UTC on 2026-01-09: the IST calendar day and the UTC day differ.
const paidAt = new Date("2026-01-09T19:00:00Z");
const redeemedAt = new Date(paidAt.getTime() + 60_000); // a drive code redeemed a minute after paying
const dayN = (n: number) => new Date(paidAt.getTime() + n * DAY);

const payment = (over: Partial<Parameters<typeof eligibility>[0]["payment"]> = {}) => ({
  id: "p1", gateway: "razorpay", status: "paid", amountMinor: FEE_INR, paymentId: "pay_ABC", paidAt, ...over,
});
const elig = (now: Date, over = {}) => eligibility({ payment: payment(over), entitlement: { redeemedAt }, existingRefunds: [], now });

test("A: eligibility by age of the payment (24h blocks, not IST calendar days): 180 days is the last refundable day", () => {
  const rows = [0, 30, 90, 180, 181, 364, 365, 366].map((d) => [d, elig(dayN(d))] as const);
  for (const [d, e] of rows) {
    if (d <= 180) assert.deepEqual(e, { eligible: true, amountMinor: FEE_INR }, `day ${d}`);
    else assert.deepEqual(e, { eligible: false, reason: "outside_refund_window" }, `day ${d}`);
  }
  assert.equal(GATEWAY_REFUND_WINDOW_DAYS, 180);
});

test("A: the 180-day gateway window closes before a 6-calendar-month guarantee window can (every start day of 2026)", () => {
  // The guarantee window is GUARANTEE_MONTHS from the AI interview, refund paid after it closes. The payment is
  // made at or before the interview, so the payment is always >= the window length old when a refund is due.
  assert.equal(GUARANTEE_MONTHS, 6);
  let min = Infinity;
  for (let d = 0; d < 365; d++) {
    const start = new Date(Date.UTC(2026, 0, 1 + d));
    const end = new Date(Date.UTC(2026, 0 + 6, 1 + d));
    min = Math.min(min, Math.round((end.getTime() - start.getTime()) / DAY));
  }
  assert.ok(min >= 181, `shortest 6-month window is ${min} days`);
  // So at the first moment a guarantee refund is due the payment is already > 180 days old: the existing
  // eligibility() would answer outside_refund_window. (Razorpay: "normal refund not possible for a payment
  // more than 6 months old".) Pinned here as the open question, not as a verdict.
  assert.deepEqual(elig(dayN(181)), { eligible: false, reason: "outside_refund_window" });
});

test("A: paid by a college code (waiver row, amount 0) or a full-waiver promo is never refundable", () => {
  assert.deepEqual(elig(dayN(10), { gateway: "college_drive", amountMinor: 0 }), { eligible: false, reason: "waiver_row" });
  assert.deepEqual(elig(dayN(10), { gateway: "promo_full_waiver", amountMinor: 0 }), { eligible: false, reason: "wrong_gateway" });
  assert.deepEqual(elig(dayN(10), { gateway: "free", amountMinor: 0 }), { eligible: false, reason: "wrong_gateway" });
  assert.deepEqual(elig(dayN(10), { amountMinor: 0 }), { eligible: false, reason: "no_amount" });
});

test("A: unpaid, no gateway id, already refunded, or paid after the entitlement: excluded", () => {
  assert.deepEqual(elig(dayN(1), { status: "created" }), { eligible: false, reason: "not_paid" });
  assert.deepEqual(elig(dayN(1), { paymentId: null }), { eligible: false, reason: "no_gateway_payment" });
  assert.deepEqual(elig(dayN(1), { paidAt: new Date(redeemedAt.getTime() + 1) }), { eligible: false, reason: "paid_after_redemption" });
  const again = eligibility({ payment: payment(), entitlement: { redeemedAt }, existingRefunds: [{ internPaymentId: "p1", status: "refunded" }], now: dayN(1) });
  assert.deepEqual(again, { eligible: false, reason: "refund_exists" });
  const retryAfterFail = eligibility({ payment: payment(), entitlement: { redeemedAt }, existingRefunds: [{ internPaymentId: "p1", status: "failed" }], now: dayN(1) });
  assert.equal(retryAfterFail.eligible, true);
});

test("A: USD fee row has no special case: same rules, amount is the paid minor units", () => {
  assert.deepEqual(elig(dayN(5), { amountMinor: FEE_USD }), { eligible: true, amountMinor: FEE_USD });
});

const scan = (over: Partial<ScanRow> = {}): ScanRow => ({
  paymentRowId: "p1", gateway: "razorpay", status: "paid", amountMinor: FEE_INR, gatewayPaymentId: "pay_ABC",
  paidAt, redeemedAt, interviewStatus: "pending", failedAttempts: 0, hasLiveRefund: false, ...over,
});

test("A: planner: AI interview taken (consumed) -> review, not eligible; untouched -> eligible; amount is always the full fee", () => {
  const plan = planScan([scan(), scan({ paymentRowId: "p2", interviewStatus: "completed" })], "admin", dayN(30));
  assert.deepEqual(plan.map((p) => [p.row.internPaymentId, p.status, p.reason, p.row.amountMinor]), [
    ["p1", "eligible", "drive_entitlement_after_payment", FEE_INR],
    ["p2", "review", "interview_consumed", FEE_INR],
  ]);
});

test("A: planner has no input for proposals, offers, interviews or profile verification: they cannot change the outcome", () => {
  const keys = Object.keys(scan()).sort();
  assert.deepEqual(keys, ["amountMinor", "failedAttempts", "gateway", "gatewayPaymentId", "hasLiveRefund", "interviewStatus", "paidAt", "paymentRowId", "redeemedAt", "status"]);
});

test("A: 6-month unplaced candidate with no drive entitlement has no ScanRow at all: the planner returns nothing", () => {
  assert.deepEqual(planScan([], "admin", dayN(180)), []);
});

// --- guarantee bookkeeping (not money): what "never placed" looks like to guaranteeMisses ---
const now = dayN(180);
test("A: zero proposals ever: 0 misses, guarantee intact", () => {
  const m = guaranteeMisses([], now);
  assert.deepEqual(m, { declined: 0, lapsed: 0, total: 0 });
  assert.equal(guaranteeEnded({}, m), false);
});

test("A: proposals sent but never answered, start date still ahead: no miss; start date passed: a lapse (counts)", () => {
  const ahead = { status: "sent", offerDetails: { startDate: "2026-12-01" } };
  const past = { status: "sent", offerDetails: { startDate: "2026-02-01" } };
  assert.equal(guaranteeMisses([ahead, ahead], now).total, 0);
  assert.equal(guaranteeMisses([past], now).lapsed, 1);
  assert.equal(guaranteeEnded({}, guaranteeMisses([past, past, past, past], now)), true);
});

test("A: accepted but never paid/expired offer is not a miss; interviews alone are not offers", () => {
  const accepted = { status: "accepted", offerDetails: { startDate: "2026-02-01" } };
  const expired = { status: "expired", offerDetails: { startDate: "2026-02-01" } };
  const interview = { status: "interview_scheduled", offerDetails: { startDate: "2026-02-01" } };
  assert.equal(guaranteeMisses([accepted, expired, interview], now).total, 0);
});

// --- B: college drive-order arithmetic (the only college money rule in code) ---
test("B: drive order payable = slots x fee - credit; credit above total and non-integers are refused", () => {
  assert.deepEqual(computeAmounts(300, 80_000, 5_000_000), { amountMinor: 24_000_000, creditMinor: 5_000_000, payableMinor: 19_000_000 });
  const future = new Date(Date.now() + 30 * DAY);
  const bad = validateOrderInput({ slots: 10, feePerStudentMinor: 80_000, creditMinor: 800_001, codeValidUntil: future }, new Date());
  assert.deepEqual(bad, { ok: false, errors: ["Credit cannot exceed the order amount"] });
  const ok = validateOrderInput({ slots: 10, feePerStudentMinor: 80_000, creditMinor: 800_000, codeValidUntil: future }, new Date());
  assert.equal(ok.ok && ok.value.payableMinor, 0);
});
