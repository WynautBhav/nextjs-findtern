import assert from "node:assert/strict";
import { test } from "node:test";

import { refundedInrMinorWithin } from "./refund-window.ts";

const order = (over: Record<string, unknown>) => ({ status: "paid", amountMinor: 100_000, currency: "INR", paidAt: "2026-11-01T05:00:00Z", raw: {}, ...over }) as never;
const refund = (id: string, amountMinor: number, at: string | null) => ({ id, amountMinor, status: "processed", at });
const NOV = { since: new Date("2026-11-10T18:30:00Z"), until: new Date("2026-11-17T18:30:00Z") };

test("a refund counts in the window of the day it was made, not the day the order was paid", () => {
  const o = order({ raw: { refunds: [refund("r1", 25_000, "2026-11-15T10:00:00Z")] } });
  assert.equal(refundedInrMinorWithin([o], NOV), 25_000);
  assert.equal(refundedInrMinorWithin([o], { since: new Date("2026-11-16T00:00:00Z"), until: null }), 0);
  assert.equal(refundedInrMinorWithin([o], {}), 25_000);
});

test("window bounds are [since, until): a refund exactly at until is the next window's", () => {
  const o = order({ raw: { refunds: [refund("r1", 100, "2026-11-17T18:30:00Z")] } });
  assert.equal(refundedInrMinorWithin([o], NOV), 0);
  assert.equal(refundedInrMinorWithin([o], { since: NOV.until }), 100);
});

test("USD refunds convert at ₹100/$ and add to INR ones", () => {
  const usd = order({ currency: "USD", amountMinor: 35_000, raw: { refunds: [refund("r1", 10_000, "2026-11-15T10:00:00Z")] } });
  const inr = order({ raw: { refunds: [refund("r2", 5_000, "2026-11-15T10:00:00Z")] } });
  assert.equal(refundedInrMinorWithin([usd, inr], NOV), 1_000_000 + 5_000);
});

test("refunds beyond what was paid are capped at paid; unprocessed ones are not money back", () => {
  const o = order({ amountMinor: 10_000, raw: { refunds: [refund("r1", 8_000, "2026-11-12T00:00:00Z"), refund("r2", 8_000, "2026-11-13T00:00:00Z"), { id: "r3", amountMinor: 500, status: "pending", at: "2026-11-13T00:00:00Z" }] } });
  assert.equal(refundedInrMinorWithin([o], {}), 10_000);
});

test("a refund with no date falls back to the order's paid date; a label-only refund counts fully at paid date", () => {
  const dated = order({ paidAt: "2026-11-12T05:00:00Z", raw: { refunds: [refund("r1", 700, null)] } });
  assert.equal(refundedInrMinorWithin([dated], NOV), 700);
  const label = order({ status: "refunded", amountMinor: 4_000, paidAt: "2026-11-12T05:00:00Z" });
  assert.equal(refundedInrMinorWithin([label], NOV), 4_000);
});

test("orders that were never paid contribute nothing", () => {
  assert.equal(refundedInrMinorWithin([order({ status: "created", raw: { refunds: [refund("r1", 500, "2026-11-12T00:00:00Z")] } })], {}), 0);
});
