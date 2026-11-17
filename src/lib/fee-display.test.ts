import test from "node:test";
import assert from "node:assert/strict";

import { feeDisplay } from "./fee-display.ts";
import { hireFeeMinor, lineCharge, PER_HIRE_MINOR } from "./checkout.ts";
import { acceptedLineCharge } from "./accepted-charge.ts";
import { PER_HIRE_FEE_DEFAULT, type PerHireFeeSetting } from "./per-hire-fee.ts";
import { offerBreakdown } from "./offer-breakdown.ts";
import { parseOffer, buildOffer } from "./offer.ts";

test("a charged fee shows as the plain amount, never as FREE", () => {
  assert.deepEqual(feeDisplay({ currency: "INR", chargedMinor: 500_000 }), { kind: "charged", amountMinor: 500_000 });
});

test("a waived fee shows the list amount struck through: 5,000 for INR, $50 for USD", () => {
  assert.deepEqual(feeDisplay({ currency: "INR", chargedMinor: 0 }), { kind: "free", listMinor: 500_000 });
  assert.deepEqual(feeDisplay({ currency: "USD", chargedMinor: 0 }), { kind: "free", listMinor: 5_000 });
});

test("a rate-card list amount wins over the standard one", () => {
  assert.deepEqual(feeDisplay({ currency: "INR", chargedMinor: 0, listMinor: 750_000 }), { kind: "free", listMinor: 750_000 });
});

test("where no hiring fee applies (full-time, a later month, settled) nothing is shown", () => {
  assert.deepEqual(feeDisplay({ currency: "INR", chargedMinor: 0, applicable: false }), { kind: "none" });
});

test("the breakdown line carries the struck amount and (FREE) only for a waived fee", () => {
  const free = offerBreakdown({ currency: "INR", hourlyRateMinor: 20000, hours: 100, place: null, fee: feeDisplay({ currency: "INR", chargedMinor: 0 }) });
  const line = free.lines.find((l) => l.key === "fee");
  assert.ok(line);
  assert.equal(line.struck, "₹5,000");
  assert.equal(line.value, "(FREE)");
  assert.equal(free.feeMinor, 0);

  const charged = offerBreakdown({ currency: "USD", hourlyRateMinor: 200, hours: 100, place: null, fee: feeDisplay({ currency: "USD", chargedMinor: 5_000 }) });
  const cl = charged.lines.find((l) => l.key === "fee");
  assert.ok(cl);
  assert.equal(cl.struck, undefined);
  assert.equal(cl.value, "$50");
  assert.equal(charged.feeMinor, 5_000);

  // Callers that pass nothing keep the old behaviour: a zero fee prints no line.
  assert.equal(offerBreakdown({ currency: "INR", hourlyRateMinor: 20000, hours: 100, place: null, perHireMinor: 0 }).lines.some((l) => l.key === "fee"), false);
});

/** The money rule: whatever the display decides must match what billing charges under the same setting. */
test("display matches billing for every band, setting and currency", () => {
  const settings: PerHireFeeSetting[] = [
    PER_HIRE_FEE_DEFAULT,
    { standard: true, skilled: true, assured: true },
    { standard: false, skilled: false, assured: false },
    { standard: false, skilled: true, assured: false },
  ];
  for (const currency of ["INR", "USD"] as const) {
    for (const score of [3, 5.9, 6, 7.5, 8, 9.5]) {
      for (const setting of settings) {
        const offer = parseOffer(
          buildOffer({
            roleTitle: "Intern", jd: "x", mode: "remote", location: "", city: "", state: "", startDate: "2027-01-05", duration: "3m",
            monthlyHours: 160, weeklySchedule: "mon_fri", shiftFrom: "09:00", shiftTo: "17:00", timezone: "Asia/Kolkata", laptop: "company",
            paidLeavesPerMonth: 0, currency, hourlyRateMinor: currency === "INR" ? 20000 : 200, perHireMinor: PER_HIRE_MINOR[currency], candidateScore: score,
          } as Parameters<typeof buildOffer>[0]),
          currency,
        );
        const opts = { feeSetting: setting, bandScore: score };
        const billed = Math.max(lineCharge(offer, score, "upfront", opts).perHireMinor, acceptedLineCharge(offer, "postpaid", opts).perHireMinor);
        const shown = feeDisplay({ currency, chargedMinor: billed, listMinor: hireFeeMinor(offer) });
        if (billed > 0) assert.deepEqual(shown, { kind: "charged", amountMinor: billed }, `${currency} ${score}`);
        else assert.deepEqual(shown, { kind: "free", listMinor: PER_HIRE_MINOR[currency] }, `${currency} ${score}`);
      }
    }
  }
});
