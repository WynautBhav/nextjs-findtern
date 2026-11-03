import assert from "node:assert/strict";
import test from "node:test";

import { activePeriod, formatPercentDelta, funnelRows, monthlyFlows, percentChange, previousWindow } from "./reports-shape.ts";
import { computeReceivables, type ReceivablesInput } from "./receivables.ts";

test("previousWindow is the equal span before the period; null for all time", () => {
  const now = new Date("2026-11-04T00:00:00Z");
  const w = previousWindow({ since: new Date("2026-10-05T00:00:00Z"), until: null }, now)!;
  assert.equal(w.until?.toISOString(), "2026-10-05T00:00:00.000Z");
  assert.equal(w.since?.toISOString(), "2026-09-05T00:00:00.000Z");
  assert.equal(previousWindow({ since: null, until: null }, now), null);
  const closed = previousWindow({ since: new Date("2026-10-01T00:00:00Z"), until: new Date("2026-10-11T00:00:00Z") }, now)!;
  assert.equal(closed.since?.toISOString(), "2026-09-21T00:00:00.000Z");
});

test("percentChange needs a base; formatPercentDelta uses a real minus", () => {
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(50, 100), -50);
  assert.equal(percentChange(5, 0), null);
  assert.equal(formatPercentDelta(-3), "\u22123%");
  assert.equal(formatPercentDelta(12), "+12%");
  assert.equal(formatPercentDelta(0), "0%");
  assert.equal(formatPercentDelta(null), "");
});

test("funnelRows: shares, step loss and the single biggest drop", () => {
  const rows = funnelRows([
    { label: "Viewed", count: 58 },
    { label: "Shortlisted", count: 58 },
    { label: "Interviewed", count: 53 },
    { label: "Offer", count: 53 },
    { label: "Hired", count: 12 },
  ]);
  assert.deepEqual(rows.map((r) => r.ofFirst), [100, 100, 91, 91, 21]);
  assert.deepEqual(rows.map((r) => r.lost), [0, 0, 5, 0, 41]);
  assert.deepEqual(rows.map((r) => r.biggestDrop), [false, false, false, false, true]);
  assert.equal(rows[4].ofPrevious, 23);
  assert.equal(rows[0].ofPrevious, null);
  assert.equal(funnelRows([{ label: "a", count: 0 }, { label: "b", count: 0 }]).some((r) => r.biggestDrop), false);
  assert.deepEqual(funnelRows([]), []);
});

test("monthlyFlows counts only received and paid cash, zero-filling gaps", () => {
  const pts = monthlyFlows(
    [
      { date: "2026-08-30", status: "received", inrMinor: 100 },
      { date: "2026-10-02", status: "received", inrMinor: 50 },
      { date: "2026-10-09", status: "due", inrMinor: 999 },
    ],
    [
      { date: "2026-09-10", status: "paid", inrMinor: 30 },
      { date: "2026-11-01", status: "pending", inrMinor: 999 },
    ],
  );
  assert.deepEqual(pts.map((p) => [p.key, p.inMinor, p.outMinor]), [["2026-08", 100, 0], ["2026-09", 0, 30], ["2026-10", 50, 0]]);
  assert.equal(pts[0].label, "Aug 26");
  assert.deepEqual(monthlyFlows([], []), []);
  assert.equal(monthlyFlows([{ date: "2024-01-05", status: "received", inrMinor: 1 }, { date: "2026-10-05", status: "received", inrMinor: 1 }], [], 6).length, 6);
});

test("activePeriod: custom wins, then the URL value, then the page default", () => {
  assert.equal(activePeriod({ from: "2026-01-01" }, "all"), "custom");
  assert.equal(activePeriod({ period: "30d" }, "all"), "30d");
  assert.equal(activePeriod({}, "all"), "all");
});

// The money-page bug: "last 30 days" must cut at the instant, not at the start of the calendar day.
test("computeReceivables: received total is exact to the instant of the period start (925000 vs 800000 bug)", () => {
  const since = new Date("2026-10-05T10:00:00Z");
  const pay = (id: string, at: string, amountMinor: number) => ({ id, employerId: "e", orderId: id, paymentId: id, status: "paid", amountMinor, currency: "INR", paidAt: new Date(at), createdAt: new Date(at), raw: null });
  const input: ReceivablesInput = {
    since,
    until: null,
    employerName: () => "Co",
    internName: () => "Intern",
    scoreOf: () => 0,
    activationFeeMinor: 0,
    proposals: [],
    employerPayments: [pay("early", "2026-10-05T02:00:00Z", 12_500_000), pay("in", "2026-10-05T11:00:00Z", 80_000_000)],
    internPayments: [],
    unpaidProfiles: [],
    payouts: [],
  };
  const r = computeReceivables(input, { receivables: "both", payables: "both" });
  assert.equal(r.totals.receivedMinor, 80_000_000);
  assert.equal(r.receivables.length, 1);
  // Upper bound is exclusive too.
  const closed = computeReceivables({ ...input, since: null, until: new Date("2026-10-05T11:00:00Z") }, { receivables: "both", payables: "both" });
  assert.equal(closed.totals.receivedMinor, 12_500_000);
});
