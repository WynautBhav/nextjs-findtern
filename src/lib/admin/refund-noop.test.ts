import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";

import { placementLedger } from "../dues.ts";
import { companyLedger } from "./company-ledger.ts";
import { companyMoney } from "./company-money.ts";
import { computeReceivables, type ReceivablesInput } from "./receivables.ts";

/**
 * Orders with no refund must produce exactly the figures they produced before refund accounting.
 * The golden file was generated from the branch base (before any refund code); refund-only keys
 * (listed in REFUND_KEYS) are ignored, every other key and value must match to the byte.
 * Regenerate only on purpose: UPDATE_GOLDEN=1 npm test -- is wrong; run this file directly.
 */
const REFUND_KEYS = new Set(["refundedMinor", "refundedInrMinor", "netPaidInrMinor", "refunds", "refundFlags"]);
const strip = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(strip)
    : v instanceof Map ? [...v].map(([k, x]) => [k, strip(x)])
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => !REFUND_KEYS.has(k)).map(([k, x]) => [k, strip(x)]))
    : v;

const hire = (id: string, monthly: number, currency: "INR" | "USD" = "INR", status = "hired") => ({
  id, employerId: "emp1", internId: `intern-${id}`, projectId: "proj1", status, currency, hiredAt: "2026-11-20T10:00:00Z",
  offerDetails: { monthlyAmount: monthly, duration: "3m", startDate: "2026-12-01", perHireCharge: currency === "USD" ? 50 : 5000 },
});
const order = (id: string, amountMinor: number, ids: string[], mode: string, extra: Record<string, unknown> = {}, currency = "INR", paidAt = "2026-11-21T10:00:00Z", status = "paid") => ({
  id, employerId: "emp1", orderId: `order_${id}`, paymentId: `pay_${id}`, status, amountMinor, currency,
  paidAt: new Date(paidAt), createdAt: new Date(paidAt), raw: { notes: { proposalIds: ids, paymentMode: mode, ...extra } },
});
const FEE_ON = { standard: true, skilled: true, assured: true };

const scenarios: Record<string, { hires: ReturnType<typeof hire>[]; orders: ReturnType<typeof order>[] }> = {
  accepted_unpaid: { hires: [hire("h1", 8000, "INR", "accepted")], orders: [] },
  paid_upfront: { hires: [hire("h1", 8000)], orders: [order("o1", 2_900_000, ["h1"], "total", { perHireFeeMinor: { h1: 500_000 } })] },
  monthly_one_paid: { hires: [hire("h1", 5000)], orders: [order("o1", 1_000_000, ["h1"], "monthly", { perHireFeeMinor: { h1: 500_000 } })] },
  postpaid_fee_then_due: { hires: [hire("h1", 15000)], orders: [order("o1", 500_000, ["h1"], "hiring_fee", { firstMonthProposalIds: ["h1"] }), order("o2", 1_500_000, ["h1"], "monthly", { dueProposalIds: ["h1"] }, "INR", "2026-12-20T10:00:00Z")] },
  usd_paid: { hires: [hire("h1", 100, "USD")], orders: [order("o1", 35_000, ["h1"], "total", {}, "USD")] },
  two_hires_one_order: { hires: [hire("h1", 8000), hire("h2", 5000)], orders: [order("o1", 5_400_000, ["h1", "h2"], "total")] },
  promo_monthly: { hires: [hire("h1", 8000)], orders: [Object.assign(order("o1", 1_200_000, ["h1"], "monthly", { perHireFeeMinor: { h1: 500_000 } }), {})] },
  failed_and_created_ignored: { hires: [hire("h1", 8000, "INR", "accepted")], orders: [order("o1", 2_900_000, ["h1"], "total", {}, "INR", "2026-11-21T10:00:00Z", "failed"), order("o2", 2_900_000, ["h1"], "total", {}, "INR", "2026-11-21T10:00:00Z", "created")] },
};

function run(name: string) {
  const { hires, orders } = scenarios[name];
  const input = {
    since: null, until: null, now: new Date("2026-12-15T00:00:00Z"), employerName: () => "Acme", internName: () => "Intern", scoreOf: () => 7,
    activationFeeMinor: 0, proposals: hires, employerPayments: orders, internPayments: [], unpaidProfiles: [],
    payouts: [{ id: "p1", internId: "intern-h1", status: "paid", amountMinor: 800_000, currency: "INR", referenceId: "r1", paidAt: new Date("2026-12-02T05:00:00Z"), createdAt: null, raw: {} }],
    feeSetting: FEE_ON,
  } as unknown as ReceivablesInput;
  return strip({
    placement: hires.map((h) => placementLedger(h as never, orders as never)),
    ledger: companyLedger(hires as never, orders as never, () => 7, FEE_ON),
    money: companyMoney(["emp1"], hires as never, orders as never, () => 7, FEE_ON),
    receivables: computeReceivables(input, { receivables: "both", payables: "both" }),
  });
}

const GOLDEN = new URL("./fixtures/refund-noop.golden.json", import.meta.url);
if (process.env.UPDATE_GOLDEN === "1") {
  writeFileSync(GOLDEN, `${JSON.stringify(Object.fromEntries(Object.keys(scenarios).map((n) => [n, run(n)])), null, 1)}\n`);
}

for (const name of Object.keys(scenarios)) {
  test(`no refund, no change: ${name} matches the pre-refund golden output`, () => {
    assert.ok(existsSync(GOLDEN), "golden file missing");
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8"))[name];
    assert.equal(JSON.stringify(run(name)), JSON.stringify(golden));
  });
}
