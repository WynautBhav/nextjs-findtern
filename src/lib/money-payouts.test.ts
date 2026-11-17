import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { buildOffer, internStipendInrMinor, parseOffer } from "./offer.ts";
import { formatMoney } from "./format.ts";
import { addMonthsIso, owedMinor, payoutCapMinor, payoutRefusal, stipendDues, type StipendDue } from "./admin/stipend-dues.ts";
import { buildPayoutRun, istDayKey, type RunPlacement } from "./admin/payout-run.ts";
import { postpaidAnchor, stipendMonthDates } from "./billing-plan.ts";

/**
 * Intern payouts: the amounts ₹8,000 / ₹5,000 / ₹15,000 through the real pure
 * functions, from the offer the employer sends to the figure the admin Payouts
 * page prints, plus dates and pending / due / overdue. Each test prints
 * expected vs actual. The SQL in loadPayouts / loadPlacementDues is not run
 * here (no database); see the report for the SELECTs to run.
 *
 * Where the numbers come from (read from lib/offer.ts):
 *   - fixed stipend by score band: 6-8 -> ₹8,000, 8+ -> ₹15,000, below 6 -> ₹0;
 *   - older offers (no fixed stipend): half the employer's monthly amount, so ₹5,000 is half of ₹10,000;
 *   - ₹5,000 is also the one-time hiring fee the EMPLOYER pays (not a stipend).
 */

register("./admin/test-support/route-hooks.mjs", import.meta.url);
const { duesTotals } = (await import("./admin/payout-list.ts")) as typeof import("./admin/payout-list.ts");

const inr = (minor: number) => formatMoney(minor, "INR", { zeroLabel: "₹0" });
const row = (what: string, expected: unknown, actual: unknown) => console.log(`${what}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);

const sentOffer = (score: number | undefined, extra: Record<string, unknown> = {}) =>
  buildOffer({
    currency: "INR",
    roleTitle: "Designer",
    mode: "remote",
    startDate: "2026-12-01",
    duration: "3m",
    monthlyHours: 168,
    hourlyRateMinor: 10_000, // ₹100/hr
    perHireMinor: 500_000,
    candidateScore: score,
    ...extra,
  });
const hired = (id: string, offer: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id,
  status: "hired",
  employerId: "e1",
  offerDetails: offer,
  currency: "INR",
  ...extra,
});

/* ── 1. The amount: stored value -> display ─────────────────────────── */

test("positive control: score 7 -> ₹8,000, score 9 -> ₹15,000, score 5 -> ₹0, shown as ₹8,000 / ₹15,000", () => {
  for (const [score, expectedMinor, shown] of [
    [7, 800_000, "₹8,000"],
    [6, 800_000, "₹8,000"],
    [9, 1_500_000, "₹15,000"],
    [8, 1_500_000, "₹15,000"],
    [5, 0, "₹0"],
  ] as const) {
    const offer = parseOffer(sentOffer(score), "INR");
    const share = internStipendInrMinor(offer, score);
    row(`score ${score}`, { minor: expectedMinor, shown }, { minor: share, shown: inr(share ?? -1) });
    assert.equal(share, expectedMinor);
    assert.equal(inr(share!), shown);
  }
});

test("a legacy offer of ₹10,000 / month pays the intern half: ₹5,000; ₹16,000 -> ₹8,000; ₹30,000 -> ₹15,000", () => {
  for (const [monthly, expectedShare] of [[10_000, 500_000], [16_000, 800_000], [30_000, 1_500_000]] as const) {
    const offer = parseOffer({ monthlyAmount: monthly, duration: "3m" }, "INR");
    const share = internStipendInrMinor(offer, 7);
    row(`employer pays ₹${monthly}`, expectedShare, share);
    assert.equal(share, expectedShare);
  }
});

test("a legacy USD offer ($100/month) pays ₹5,000 (₹100 = $1, half of $100 = ₹5,000), never $50 or ₹50", () => {
  const offer = parseOffer({ monthlyAmount: 100, duration: "1m" }, "USD");
  const share = internStipendInrMinor(offer, 7);
  row("$100 legacy", 500_000, share);
  assert.equal(share, 500_000);
  assert.equal(inr(share!), "₹5,000");
});

test("paise survive the trip: ₹7,999.99 and ₹12,345.67 come out as typed, no float drift", () => {
  for (const [major, shown] of [[7999.99, "₹7,999.99"], [12345.67, "₹12,345.67"], [8000.05, "₹8,000.05"], [14999.99, "₹14,999.99"]] as const) {
    const offer = parseOffer({ internStipendMonthly: major, monthlyAmount: 30000, duration: "1m" }, "INR");
    row(`stored ${major}`, shown, inr(offer.internStipendMinor!));
    assert.equal(inr(offer.internStipendMinor!), shown);
  }
});

test("every paise value of ₹8,000.xx, ₹5,000.xx, ₹15,000.xx round-trips through the 'Create payout' form (Number(text) * 100)", () => {
  // components/admin/intern-payout-tools.tsx:144 parses the typed amount with Math.round(Number(text) * 100),
  // and :132 pre-fills it with String(minor / 100). Both are checked for all 100 paise values.
  const bad: string[] = [];
  for (const base of [8000, 5000, 15000, 7999, 12345]) {
    for (let p = 0; p < 100; p++) {
      const minor = base * 100 + p;
      const prefill = String(minor / 100);
      if (Math.round(Number(prefill) * 100) !== minor) bad.push(`${prefill} -> ${Math.round(Number(prefill) * 100)}`);
    }
  }
  row("round trip failures", [], bad);
  assert.deepEqual(bad, []);
});

test("the payout cap prints exactly: 8,000 share, 3 months, nothing paid -> cap ₹8,000, total ₹24,000", () => {
  const [d] = stipendDues([hired("p1", sentOffer(7))], [], 7);
  row("dues", { share: "₹8,000", total: "₹24,000", remaining: "₹24,000", cap: "₹8,000" }, { share: inr(d.monthlyShareMinor), total: inr(d.totalShareMinor), remaining: inr(d.remainingMinor), cap: inr(payoutCapMinor(d)) });
  assert.equal(inr(d.monthlyShareMinor), "₹8,000");
  assert.equal(inr(d.totalShareMinor), "₹24,000");
  assert.equal(inr(payoutCapMinor(d)), "₹8,000");
});

test("a score-9 intern: ₹15,000 x 3 = ₹45,000; one paid -> ₹30,000 left, 'paid of total' adds up", () => {
  const [d] = stipendDues([hired("p1", sentOffer(9))], [{ status: "paid", raw: { proposalId: "p1" }, amountMinor: 1_500_000, currency: "INR" }], 9);
  row("score 9, one month paid", { paid: "₹15,000", remaining: "₹30,000", total: "₹45,000", short: 0 }, { paid: inr(d.paidMinor), remaining: inr(d.remainingMinor), total: inr(d.totalShareMinor), short: d.shortMinor });
  assert.equal(d.paidMinor + d.remainingMinor + d.shortMinor, d.totalShareMinor);
  assert.equal(inr(d.remainingMinor), "₹30,000");
});

/* ── 2. Guard: the amount an admin may create ───────────────────────── */

test("payoutRefusal: exactly the share is allowed, a paisa more is refused, ₹15,000 against an ₹8,000 share is refused", () => {
  const [d] = stipendDues([hired("p1", sentOffer(7))], [], 7);
  assert.equal(payoutRefusal(d, 800_000), null);
  assert.match(payoutRefusal(d, 800_001) ?? "", /more than one month's stipend/);
  assert.match(payoutRefusal(d, 1_500_000) ?? "", /at most ₹8,000/);
  assert.match(payoutRefusal(d, 0) ?? "", /greater than zero/);
  assert.match(payoutRefusal(d, 500_000.5) ?? "", /greater than zero/);
  // The same 8,000 payout is fine for a smaller amount (₹5,000) too.
  assert.equal(payoutRefusal(d, 500_000), null);
});

test("the last month is capped by what is left: 3rd month of 8,000 share with a short part-payment before it", () => {
  const [d] = stipendDues(
    [hired("p1", sentOffer(7))],
    [
      { status: "paid", raw: { proposalId: "p1" }, amountMinor: 800_000, currency: "INR" },
      { status: "paid", raw: { proposalId: "p1" }, amountMinor: 500_000, currency: "INR" }, // 5,000 against an 8,000 month
    ],
    7,
  );
  row("two payouts (8,000 and 5,000)", { paidMonths: 2, paid: "₹13,000", remaining: "₹8,000", short: "₹3,000" }, { paidMonths: d.paidMonths, paid: inr(d.paidMinor), remaining: inr(d.remainingMinor), short: inr(d.shortMinor) });
  assert.equal(d.paidMonths, 2);
  assert.equal(d.shortMinor, 300_000, "the 3,000 not paid in month 2 is shown as 'short', not lost");
  assert.equal(d.paidMinor + d.remainingMinor + d.shortMinor, d.totalShareMinor);
});

/* ── 3. Dates ───────────────────────────────────────────────────────── */

test("pay dates: start + k months, clamped to month end (Jan 31 -> Feb 28 / 29), month rollover Dec -> Jan", () => {
  const cases: [string, number, string][] = [
    ["2026-01-31", 1, "2026-02-28"],
    ["2028-01-31", 1, "2028-02-29"],
    ["2026-01-31", 2, "2026-03-31"],
    ["2026-11-30", 3, "2027-02-28"],
    ["2026-12-31", 2, "2027-02-28"],
    ["2026-12-15", 1, "2027-01-15"],
    ["2026-08-31", 1, "2026-09-30"],
  ];
  for (const [start, k, want] of cases) {
    const got = stipendMonthDates(start, 12, k)?.internPayOn;
    row(`${start} + ${k} month`, want, got);
    assert.equal(got, want);
    assert.equal(addMonthsIso(start, k), want, "the two helpers agree");
  }
});

test("employer due is 2 days before the intern's pay day (month boundary: 1 Mar pay -> 27 Feb employer)", () => {
  const d = stipendMonthDates("2026-01-31", 3, 1)!;
  row("start 31 Jan, month 1", { internPayOn: "2026-02-28", employerDueOn: "2026-02-26" }, d);
  assert.equal(d.employerDueOn, "2026-02-26");
  assert.equal(stipendMonthDates("2026-02-01", 3, 1)!.employerDueOn, "2026-02-27");
  assert.equal(stipendMonthDates("2026-02-01", 3, 4), null, "month 4 of 3 does not exist");
});

test("IST day boundary: 2026-11-30T19:00Z is 1 Dec in India (anchor and 'today'), 18:29Z is still 30 Nov", () => {
  row("19:00Z", "2026-12-01", istDayKey(new Date("2026-11-30T19:00:00Z")));
  assert.equal(istDayKey(new Date("2026-11-30T19:00:00Z")), "2026-12-01");
  assert.equal(istDayKey(new Date("2026-11-30T18:29:59Z")), "2026-11-30");
  // A hire with no start date is anchored on the IST day it was paid.
  assert.equal(postpaidAnchor(null, "2026-11-30T19:00:00Z"), "2026-12-01");
  const [d] = stipendDues([hired("p1", { monthlyAmount: 16000, duration: "2m" }, { hiredAt: "2026-11-30T19:00:00Z" })], [], 7);
  row("hire paid 1 Dec IST, no start date", "2027-01-01", d.nextDate);
  assert.equal(d.nextDate, "2027-01-01");
});

/* ── 4. Pending / due / overdue ─────────────────────────────────────── */

const placement = (over: Partial<RunPlacement> = {}): RunPlacement => ({
  internId: "i1",
  nextDate: "2026-12-01",
  monthlyShareMinor: 800_000,
  remainingMinor: 2_400_000,
  totalShareMinor: 2_400_000,
  paidMinor: 0,
  employer: null,
  ...over,
});

test("overdue boundary: due today is NOT overdue, due yesterday IS; the amount is one month (₹8,000), not the whole balance", () => {
  const today = "2026-12-01";
  const dueToday = buildPayoutRun([placement({ nextDate: "2026-12-01" })], today);
  const dueYesterday = buildPayoutRun([placement({ nextDate: "2026-11-30" })], today);
  row("due today", { overdue: 0, next: "₹8,000" }, { overdue: dueToday.overdue.amountMinor, next: inr(dueToday.next?.amountMinor ?? 0) });
  row("due yesterday", { overdue: "₹8,000", next: null }, { overdue: inr(dueYesterday.overdue.amountMinor), next: dueYesterday.next });
  assert.equal(dueToday.overdue.amountMinor, 0);
  assert.equal(dueToday.next?.amountMinor, 800_000);
  assert.equal(dueYesterday.overdue.amountMinor, 800_000);
  assert.equal(dueYesterday.next, null);
});

test("run desk sums three interns on one day: ₹8,000 + ₹15,000 + ₹5,000 = ₹28,000, 3 interns; total owed is the sum of remaining", () => {
  const rows = [
    placement({ internId: "a", monthlyShareMinor: 800_000, remainingMinor: 2_400_000, totalShareMinor: 2_400_000 }),
    placement({ internId: "b", monthlyShareMinor: 1_500_000, remainingMinor: 4_500_000, totalShareMinor: 4_500_000 }),
    placement({ internId: "c", monthlyShareMinor: 500_000, remainingMinor: 500_000, totalShareMinor: 1_500_000, paidMinor: 1_000_000 }),
  ];
  const run = buildPayoutRun(rows, "2026-11-20");
  row("one day", { amount: "₹28,000", count: 3, flowDue: "₹74,000" }, { amount: inr(run.days[0].amountMinor), count: run.days[0].count, flowDue: inr(run.flow.dueMinor) });
  assert.equal(run.days[0].amountMinor, 2_800_000);
  assert.equal(run.days[0].count, 3);
  assert.equal(run.flow.dueMinor, 7_400_000);
  assert.equal(run.weeks.reduce((n, w) => n + w.amountMinor, 0) + run.later.amountMinor + run.overdue.amountMinor, 2_800_000, "every dated rupee is in exactly one bucket");
});

test("a pending payout makes the placement 'pending' and refuses another; a paid one moves the next date a month on", () => {
  const props = [hired("p1", sentOffer(7))];
  const pend = stipendDues(props, [{ id: "x1", status: "pending", raw: { proposalId: "p1" } }], 7)[0];
  assert.equal(pend.pending, true);
  assert.match(payoutRefusal(pend, 800_000) ?? "", /already pending/);
  const first = stipendDues(props, [], 7)[0];
  const second = stipendDues(props, [{ status: "paid", raw: { proposalId: "p1" }, amountMinor: 800_000, currency: "INR" }], 7)[0];
  row("next date after one paid", { before: "2027-01-01", after: "2027-02-01" }, { before: first.nextDate, after: second.nextDate });
  assert.equal(first.nextDate, "2027-01-01", "start 1 Dec 2026, paid at the end of the month worked");
  assert.equal(second.nextDate, "2027-02-01");
});

test("a failed payout is not 'paid' and not 'pending': the month stays owed and can be re-created", () => {
  const [d] = stipendDues([hired("p1", sentOffer(7))], [{ status: "failed", raw: { proposalId: "p1" }, amountMinor: 800_000, currency: "INR" }], 7);
  assert.equal(d.paidMonths, 0);
  assert.equal(d.pending, false);
  assert.equal(payoutRefusal(d, 800_000), null);
});

/* ── 5. Totals vs visible rows ──────────────────────────────────────── */

test("duesTotals = sum of the visible rows (owed, paid, total) and total = paid + owed + short on every row", () => {
  const dues = stipendDues(
    [hired("p1", sentOffer(7)), hired("p2", sentOffer(9)), hired("p3", { monthlyAmount: 10_000, duration: "2m", startDate: "2026-12-01" })],
    [
      { status: "paid", raw: { proposalId: "p1" }, amountMinor: 800_000, currency: "INR" },
      { status: "paid", raw: { proposalId: "p2" }, amountMinor: 1_500_000, currency: "INR" },
    ],
    7,
  ).map((d) => ({ ...d, internId: "i", internName: "n", companyName: "c", projectName: "p" }));
  const t = duesTotals(dues);
  const sum = (f: (d: StipendDue) => number) => dues.reduce((n, d) => n + f(d), 0);
  row("totals", { owed: sum((d) => d.remainingMinor), paid: sum((d) => d.paidMinor), total: sum((d) => d.totalShareMinor) }, { owed: t.dueMinor, paid: t.paidMinor, total: t.totalMinor });
  assert.equal(t.dueMinor, sum((d) => d.remainingMinor));
  assert.equal(t.paidMinor, sum((d) => d.paidMinor));
  assert.equal(t.totalMinor, t.paidMinor + t.dueMinor + sum((d) => d.shortMinor));
  assert.equal(owedMinor(dues, 0), t.dueMinor, "the Interns table's 'left to pay' equals the Payouts page 'owed'");
});

test("OBSERVATION: a paid payout with no placement link counts against a month only when amount AND month date match", () => {
  // Rows with no proposalId (legacy) are matched by amount and date (ADP-18). A payout paid for the right amount but
  // scheduled a few days off the month date is not matched, so 'Owed to interns' stays at the full balance although
  // the money has gone out. Behaviour, not changed here; recommended default: show unmatched paid payouts on the row.
  const props = [hired("p1", sentOffer(7))];
  const exact = stipendDues(props, [{ status: "paid", raw: { scheduledFor: "2027-01-01" }, amountMinor: 800_000, currency: "INR" }], 7)[0];
  const offByThree = stipendDues(props, [{ status: "paid", raw: { scheduledFor: "2027-01-04" }, amountMinor: 800_000, currency: "INR" }], 7)[0];
  row("exact date vs 3 days off", { exact: "₹16,000 left", offByThree: "₹24,000 left (unmatched)" }, { exact: `${inr(exact.remainingMinor)} left`, offByThree: `${inr(offByThree.remainingMinor)} left` });
  assert.equal(exact.remainingMinor, 1_600_000);
  assert.equal(offByThree.remainingMinor, 2_400_000);
});

test("OPEN QUESTION: an unlinked paid payout with no scheduled date is dated by its UTC day, not its IST day (legacy parity unknown)", () => {
  // paid 01:30 IST on 1 Dec = 2026-11-30T20:00Z. The month it stands for falls on 2026-12-01 (start 1 Nov + 1 month).
  // payoutDateKey() slices the UTC date (30 Nov), so the payout does not match the 1 Dec month and the month stays owed.
  // Not changed: the key is documented as legacy's, and legacy's own day rule is not in this repo.
  const offer = { monthlyAmount: 16000, duration: "2m", startDate: "2026-11-01" };
  const payout = { status: "paid", raw: {}, amountMinor: 800_000, currency: "INR", paidAt: new Date("2026-11-30T20:00:00Z") };
  const sameDayUtc = { ...payout, paidAt: new Date("2026-12-01T05:00:00Z") };
  const late = stipendDues([hired("p1", offer)], [payout], 7)[0];
  const ok = stipendDues([hired("p1", offer)], [sameDayUtc], 7)[0];
  row("paid 01:30 IST 1 Dec vs 10:30 IST 1 Dec", { late: "₹8,000 left", ok: "₹8,000 left" }, { late: `${inr(late.remainingMinor)} left`, ok: `${inr(ok.remainingMinor)} left` });
  assert.equal(ok.remainingMinor, 800_000, "control: the same IST day, later in the day, matches");
  assert.equal(late.remainingMinor, 1_600_000, "documents today's behaviour: the early-morning IST payment is not matched");
});
