import assert from "node:assert/strict";
import { test } from "node:test";

import { billableWorkingDays, buildOffer, internStipendInrMinor, parseOffer, scheduledMonthlyHours, weeklyScheduleOf } from "./offer.ts";
import { lineCharge } from "./checkout.ts";
import { monthlyDues } from "./dues.ts";

// A row exactly as the legacy send-proposal page writes it (major units).
const legacyRow = {
  roleTitle: "Frontend intern",
  mode: "remote",
  currency: "INR",
  duration: "3m",
  monthlyHours: 120,
  monthlyAmount: 12000,
  totalPrice: 36000,
  hourlyRate: 100,
  perHireCharge: 0,
  paidLeavesPerMonth: 2,
};

test("parseOffer reads legacy major units as minor units", () => {
  const o = parseOffer(legacyRow, "INR");
  assert.equal(o.monthlyMinor, 1_200_000);
  assert.equal(o.totalMinor, 3_600_000);
  assert.equal(o.hourlyRateMinor, 10_000);
  assert.equal(o.perHireMinor, 0);
  assert.equal(o.months, 3);
});

test("missing money stays null, never a made-up default", () => {
  const o = parseOffer({ roleTitle: "x" }, "INR");
  assert.equal(o.monthlyMinor, null);
  assert.equal(internStipendInrMinor(o), null);
});

test("intern stipend is half the employer's monthly amount, in INR, USD converted at 100", () => {
  assert.equal(internStipendInrMinor(parseOffer({ monthlyAmount: 120 }, "USD")), 600_000);
  assert.equal(internStipendInrMinor(parseOffer({ monthlyAmount: 12001 }, "INR")), 600_050);
});

test("no stipend for a scored candidate below 6; unscored is not penalised", () => {
  const o = parseOffer({ monthlyAmount: 12000 }, "INR");
  assert.equal(internStipendInrMinor(o, 5.9), 0);
  assert.equal(internStipendInrMinor(o, 6), 600_000);
  assert.equal(internStipendInrMinor(o, 0), 600_000);
  assert.equal(internStipendInrMinor(o, null), 600_000);
});

test("buildOffer writes the legacy shape and round-trips", () => {
  const raw = buildOffer({
    currency: "INR",
    roleTitle: "Data intern",
    mode: "hybrid",
    location: "Jaipur",
    startDate: "2026-11-01",
    duration: "2m",
    monthlyHours: 100,
    hourlyRateMinor: 15_000,
    perHireMinor: 0,
  });
  assert.equal(raw.monthlyAmount, 15_000);
  assert.equal(raw.totalPrice, 30_000);
  const o = parseOffer(raw, "INR");
  assert.equal(o.monthlyMinor, 1_500_000);
  assert.equal(o.location, "Jaipur");
});

test("checkout: upfront is the whole engagement plus the one-time hiring fee, no discount", () => {
  const c = lineCharge(parseOffer(legacyRow, "INR"), 7);
  assert.equal(c.perHireMinor, 500_000);
  assert.equal(c.baseMinor, 3_600_000 + 500_000);
  assert.equal(c.discountMinor, 0);
  assert.equal(c.totalMinor, 3_600_000 + 500_000);
  assert.equal(c.monthlyBlocked, null);
});

test("checkout: below 6 pays flat per-hire, no discount, no monthly", () => {
  const c = lineCharge(parseOffer({ monthlyAmount: 0, duration: "1m" }, "INR"), 4);
  assert.equal(c.totalMinor, 500_000);
  assert.ok(c.monthlyBlocked);
});

test("checkout: monthly mode is one month of the stipend, the hiring fee only on the first", () => {
  assert.equal(lineCharge(parseOffer(legacyRow, "INR"), 8, "monthly").totalMinor, 1_200_000 + 500_000);
  assert.equal(lineCharge(parseOffer(legacyRow, "INR"), 8, "monthly", { firstPayment: false }).totalMinor, 1_200_000);
});

test("checkout: a fee already inside the stored total is not charged twice", () => {
  const c = lineCharge(parseOffer({ monthlyAmount: 10000, duration: "1m", totalPrice: 15000, perHireCharge: 5000 }, "INR"), 4);
  assert.equal(c.totalMinor, 1_500_000);
  assert.equal(c.perHireMinor, 500_000);
});

test("checkout: a legacy-edited offer (fee inside the total, no perHireCharge) is not charged twice", () => {
  // Live shape: score below 6, no stipend, the ₹5,000 fee is the whole total.
  const feeOnly = lineCharge(parseOffer({ monthlyAmount: 0, duration: "2m", totalPrice: 5000 }, "INR"), 4);
  assert.equal(feeOnly.totalMinor, 500_000);
  assert.equal(feeOnly.perHireMinor, 500_000);
  const withStipend = lineCharge(parseOffer({ monthlyAmount: 10000, duration: "2m", totalPrice: 25000 }, "INR"), 8);
  assert.equal(withStipend.totalMinor, 2_500_000);
  // A total equal to the engagement carried no fee: the standard one is added.
  const noFee = lineCharge(parseOffer({ monthlyAmount: 32000, duration: "1m", totalPrice: 32000 }, "INR"), 8);
  assert.equal(noFee.totalMinor, 3_200_000 + 500_000);
});

test("offer edit: a legacy fee (no perHireCharge) survives a change of months", () => {
  // ₹10,000 a month for 2 months, ₹22,000 total: the fee is ₹2,000.
  const stored = { monthlyAmount: 10000, duration: "2m", totalPrice: 22000 };
  const before = parseOffer(stored, "INR");
  assert.equal(before.perHireMinor, 200_000);
  // Re-inferred from the new months and the old total, the fee moves.
  assert.equal(parseOffer({ ...stored, duration: "1m" }, "INR").perHireMinor, 1_200_000);
  assert.equal(parseOffer({ ...stored, duration: "3m" }, "INR").perHireMinor, null);
  // The edit route writes the fee from before the edit, so it holds.
  for (const duration of ["1m", "3m"]) {
    assert.equal(parseOffer({ ...stored, duration, perHireCharge: before.perHireMinor! / 100 }, "INR").perHireMinor, 200_000);
  }
});

test("checkout: full-time offer is 8.33% of CTC", () => {
  const c = lineCharge(parseOffer({ fullTimeOffer: { annualCtc: 600000 } }, "INR"), 8);
  assert.equal(c.totalMinor, Math.round(60_000_000 * 0.0833));
});


test("monthly dues: one of three months paid leaves the next month due", () => {
  const dues = monthlyDues(
    [{ id: "p1", status: "hired", offerDetails: { duration: "3m" } }],
    [
      { status: "paid", raw: { notes: { proposalIds: ["p1"], paymentMode: "monthly" } } },
      { status: "paid", raw: { notes: { proposalIds: ["p1"], paymentMode: "upfront" } } },
    ],
  );
  assert.deepEqual(dues, [{ proposalId: "p1", monthsPaid: 1, months: 3 }]);
});

test("an offer lapses on its start date (IST), not before", async () => {
  const { offerPastStart, todayIst } = await import("./offer.ts");
  // 20:00 UTC on 18 Oct is already 19 Oct in India.
  const now = new Date(Date.UTC(2026, 9, 18, 20, 0));
  assert.equal(todayIst(now), "2026-10-19");
  assert.equal(offerPastStart("2026-10-19", now), true);
  assert.equal(offerPastStart("2026-10-20", now), false);
  assert.equal(offerPastStart(null, now), false);
});

test("hours follow the working week less paid leave, at 8 h a day (legacy composer)", () => {
  assert.equal(scheduledMonthlyHours("mon_fri", 0), 176);
  assert.equal(scheduledMonthlyHours("mon_fri", 2), 160);
  assert.equal(scheduledMonthlyHours("mon_sat", 1.5), 196);
  assert.equal(scheduledMonthlyHours("sun_thu", 3), 152);
  assert.equal(weeklyScheduleOf("bogus"), "mon_fri");
  assert.equal(parseOffer({ weeklySchedule: "mon_sat" }, "INR").weeklySchedule, "mon_sat");
});

test("hours are a flat month: 22 or 26 working days, whatever the calendar says (owner, 28 Oct)", () => {
  // Legacy employer-send-proposal.tsx:533 and the marketing calculator bill
  // {mon_fri: 22, mon_sat: 26, sun_thu: 22} days × 8 h, less paid leave.
  assert.equal(billableWorkingDays("mon_fri"), 22);
  assert.equal(billableWorkingDays("mon_sat"), 26);
  assert.equal(billableWorkingDays("sun_thu"), 22);
  assert.equal(scheduledMonthlyHours("mon_fri", 0), 176);
  assert.equal(scheduledMonthlyHours("mon_sat", 0), 208);
  assert.equal(scheduledMonthlyHours("mon_sat", 2), 192);
  assert.equal(scheduledMonthlyHours("mon_fri", 1.5), 164);
  assert.equal(scheduledMonthlyHours("mon_fri", -3), 176, "negative leave never adds hours");
});

test("buildOffer prices the month as rate × hours, with no override", () => {
  const raw = buildOffer({
    currency: "INR",
    roleTitle: "Ops intern",
    mode: "remote",
    startDate: "2026-11-01",
    duration: "3m",
    monthlyHours: scheduledMonthlyHours("mon_fri", 2),
    weeklySchedule: "mon_fri",
    hourlyRateMinor: 10_000,
    perHireMinor: 0,
  });
  assert.equal(raw.monthlyHours, 160);
  assert.equal(raw.monthlyAmount, 16_000);
  assert.equal(raw.totalPrice, 48_000);
  assert.equal(raw.weeklySchedule, "mon_fri");
});

test("hybrid split is written under the legacy keys and read from either (EMH-02)", async () => {
  const { hybridDaysOf } = await import("./offer.ts");
  const raw = buildOffer({
    currency: "INR", roleTitle: "Ops intern", mode: "hybrid", city: "Pune", state: "Maharashtra",
    officeDays: 3, homeDays: 2, startDate: "2026-12-01", duration: "2m", monthlyHours: 160,
    hourlyRateMinor: 10_000, perHireMinor: 500_000,
  });
  assert.equal(raw.workFromOfficeDays, 3);
  assert.equal(raw.workFromHomeDays, 2);
  assert.equal(raw.location, "Pune, Maharashtra");
  assert.equal("wfoDays" in raw, false);
  assert.deepEqual(hybridDaysOf({ wfoDays: 4, wfhDays: 1 }), { officeDays: 4, homeDays: 1 });
  const o = parseOffer(raw, "INR");
  assert.equal(o.officeDays, 3);
  assert.equal(o.homeDays, 2);
});

test("laptop: legacy 'candidate' is written; the new app's old 'intern' reads as candidate (EMH-04)", async () => {
  const { laptopLabel } = await import("./offer.ts");
  assert.equal(parseOffer({ laptop: "intern" }).laptop, "candidate");
  assert.equal(parseOffer({ laptop: "yes" }).laptop, "company");
  assert.equal(laptopLabel("intern"), "Candidate's own laptop");
  const raw = buildOffer({
    currency: "INR", roleTitle: "x", mode: "remote", startDate: "2026-12-01", duration: "1m",
    monthlyHours: 160, hourlyRateMinor: 10_000, perHireMinor: 0, laptop: "intern",
  });
  assert.equal(raw.laptop, "candidate");
  assert.equal(raw.workFromOfficeDays, 0);
});

test("job description: stored as paragraph HTML for legacy, read back as text (EMH-28, EMH-44)", async () => {
  const { jdToHtml, jdToText } = await import("./offer.ts");
  assert.equal(jdToHtml("Build <APIs>.\nShip weekly.\n\nOwn the dashboard."), "<p>Build &lt;APIs&gt;.<br>Ship weekly.</p><p>Own the dashboard.</p>");
  assert.equal(jdToText("<p>Build &lt;APIs&gt;.<br>Ship weekly.</p><p>Own the dashboard.</p>"), "Build <APIs>.\nShip weekly.\nOwn the dashboard.");
  // An old Quill row reads without tags.
  assert.equal(parseOffer({ jd: "<p><strong>Role</strong></p><ul><li>React</li><li>Node</li></ul>" }).jd, "Role\n• React\n• Node");
  assert.equal(parseOffer({ jd: "Plain text\nstays" }).jd, "Plain text\nstays");
  const raw = buildOffer({
    currency: "INR", roleTitle: "x", mode: "remote", startDate: "2026-12-01", duration: "1m",
    monthlyHours: 160, hourlyRateMinor: 10_000, perHireMinor: 0, jd: "Line one\nLine two",
  });
  assert.equal(raw.jd, "<p>Line one<br>Line two</p>");
  assert.equal(parseOffer(raw).jd, "Line one\nLine two");
});

test("legacy 'City, State' location splits for editing (DB-10)", () => {
  const o = parseOffer({ mode: "onsite", location: "Navi Mumbai, Maharashtra" });
  assert.equal(o.city, "Navi Mumbai");
  assert.equal(o.state, "Maharashtra");
  assert.equal(parseOffer({ mode: "remote", location: "Remote" }).city, "");
  assert.equal(parseOffer({ mode: "onsite", city: "Jaipur", state: "Rajasthan", location: "x" }).state, "Rajasthan");
});

test("flexible hours are stored as empty times plus a flag, read back as flexible (DB-19)", () => {
  const raw = buildOffer({
    currency: "INR", roleTitle: "x", mode: "remote", startDate: "2026-12-01", duration: "1m",
    monthlyHours: 160, hourlyRateMinor: 10_000, perHireMinor: 0, shiftFrom: "flexible", shiftTo: "flexible",
  });
  assert.equal(raw.shiftFrom, "");
  assert.equal(raw.flexibleHours, true);
  assert.equal(parseOffer(raw).shiftFrom, "flexible");
  // Rows the new app wrote before keep reading as flexible.
  assert.equal(parseOffer({ shiftFrom: "flexible", shiftTo: "flexible" }).shiftTo, "flexible");
  assert.equal(parseOffer({ shiftFrom: "09:00", shiftTo: "18:00" }).shiftFrom, "09:00");
});
