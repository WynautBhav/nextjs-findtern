import test from "node:test";
import assert from "node:assert/strict";

import { offerBreakdown, offerPlace } from "./offer-breakdown.ts";
import { splitGst } from "./gst.ts";

const rajasthan = offerPlace({ state: "Rajasthan", country: "India" }, "INR");
const karnataka = offerPlace({ state: "Karnataka", country: "India" }, "INR");
const keys = (b: ReturnType<typeof offerBreakdown>) => b.lines.map((l) => l.key);

test("INR, same state as Findtern: rate x hours, monthly, GST backed out, fee", () => {
  const b = offerBreakdown({ currency: "INR", hourlyRateMinor: 20000, hours: 176, perHireMinor: 500000, place: rajasthan });
  assert.equal(b.monthlyMinor, 3_520_000);
  assert.equal(b.gstMinor, splitGst(3_520_000, rajasthan!).cgstMinor + splitGst(3_520_000, rajasthan!).sgstMinor);
  assert.equal(b.gstMinor, 536_949); // 3,520,000 - round(3,520,000 / 1.18)
  assert.deepEqual(keys(b), ["rate", "monthly", "gst", "fee"]);
  assert.match(b.lines[0].value, /200\/hr × 176 h$/);
  assert.equal(b.lines[1].label, "Monthly (incl. GST)");
  assert.equal(b.lines[2].label, "of which GST");
});

test("INR, another state: the same 18% total, as IGST", () => {
  const a = offerBreakdown({ currency: "INR", hourlyRateMinor: 20000, hours: 176, place: rajasthan });
  const b = offerBreakdown({ currency: "INR", hourlyRateMinor: 20000, hours: 176, place: karnataka });
  assert.equal(b.gstMinor, a.gstMinor);
  assert.equal(splitGst(b.monthlyMinor!, karnataka!).mode, "inter");
  assert.equal(splitGst(a.monthlyMinor!, rajasthan!).mode, "intra");
});

test("USD is an export: no GST line, plain Monthly label", () => {
  const place = offerPlace({ country: "United States" }, "USD");
  const b = offerBreakdown({ currency: "USD", hourlyRateMinor: 200, hours: 176, perHireMinor: 5000, place });
  assert.equal(b.gstMinor, 0);
  assert.deepEqual(keys(b), ["rate", "monthly", "fee"]);
  assert.equal(b.lines[1].label, "Monthly");
});

test("zero hours: monthly is free, no rate or GST line", () => {
  const b = offerBreakdown({ currency: "INR", hourlyRateMinor: 20000, hours: 0, place: rajasthan });
  assert.equal(b.monthlyMinor, 0);
  assert.deepEqual(keys(b), ["monthly"]);
  assert.equal(b.lines[0].label, "Monthly");
});

test("unknown tax place leaves the GST line out; a stored monthly wins over rate x hours", () => {
  const b = offerBreakdown({ currency: "INR", hourlyRateMinor: 20000, hours: 176, monthlyMinor: 3_000_000, place: null });
  assert.equal(b.monthlyMinor, 3_000_000);
  assert.deepEqual(keys(b), ["rate", "monthly"]);
});

test("no rate on file reads as a dash, not a zero", () => {
  const b = offerBreakdown({ currency: "INR", hourlyRateMinor: null, hours: null, place: rajasthan });
  assert.equal(b.lines[0].value, "-");
});
