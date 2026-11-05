import assert from "node:assert/strict";
import test from "node:test";

import { istDay } from "./billing-plan.ts";
import { emails } from "./emails.ts";
import { REMINDER_LEAD_DAYS, REMINDER_OFFSETS, reminderDue, reminderEmail, reminderKey } from "./payment-reminders.ts";

const fee = (id: string) => ({ status: "paid", paidAt: "2026-09-01T00:00:00Z", raw: { notes: { proposalIds: [id], paymentMode: "hiring_fee" } } });
const month = (id: string, at: string) => ({ status: "paid", paidAt: at, raw: { notes: { proposalIds: [id], dueProposalIds: [id], paymentMode: "total" } } });
const hire = () => ({ id: "p1", status: "hired", offerDetails: { startDate: "2026-10-01", duration: "3m", monthlyAmount: 10000, currency: "INR" }, hiredAt: "2026-09-30T00:00:00Z" });
// month 1 = Oct 1..Oct 31; the intern is paid 1 Nov, so the employer owes it on 30 Oct
const none = new Set<string>();
const at = (d: string, o = [fee("p1")], sent = none, h = hire()) => reminderDue(h, o, sent, d);

const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

test("schedule: days -15, -12, -9, -6, then -3, -2, -1, the due day, then overdue from day +3", () => {
  assert.equal(REMINDER_LEAD_DAYS, 15);
  assert.deepEqual([...REMINDER_OFFSETS], [-15, -12, -9, -6, -3, -2, -1, 0]);
  const due = "2026-10-30";
  // Walk every day with a daily cron that remembers what it sent: exactly one mail on each scheduled day, none between.
  const sent = new Set<string>();
  const sendDays: [number, string][] = [];
  for (let n = -20; n <= 10; n++) {
    const r = at(shift(due, n), [fee("p1")], sent);
    if (!r) continue;
    assert.equal(r.dueOn, due);
    assert.equal(r.k, 1);
    sent.add(reminderKey("p1", r.k, r.type, r.offset));
    sendDays.push([n, r.type]);
  }
  assert.deepEqual(sendDays, [
    [-15, "upcoming"], [-12, "upcoming"], [-9, "upcoming"], [-6, "upcoming"],
    [-3, "upcoming"], [-2, "upcoming"], [-1, "upcoming"], [0, "due"], [3, "overdue"],
  ]);
});

test("stage reached on a day: between scheduled days the latest one is what is owed", () => {
  assert.equal(at("2026-10-14"), null); // day -16
  assert.deepEqual([at("2026-10-15")!.type, at("2026-10-15")!.offset], ["upcoming", -15]);
  assert.equal(at("2026-10-16")!.offset, -15); // nothing new: the -15 key dedupes it
  assert.equal(at("2026-10-18")!.offset, -12);
  assert.equal(at("2026-10-29")!.offset, -1);
  assert.equal(at("2026-10-30")!.type, "due");
  assert.equal(at("2026-11-01")!.type, "due");
  assert.equal(at("2026-11-02")!.type, "overdue");
  assert.ok(at("2026-10-15")!.amountMinor > 0);
});

test("idempotent per day per hire: a cron re-run on the same day sends nothing; a missed run catches up with one mail", () => {
  const sent = new Set([reminderKey("p1", 1, "upcoming", -12)]);
  assert.equal(at("2026-10-18", [fee("p1")], sent), null);
  assert.equal(at("2026-10-19", [fee("p1")], sent), null); // day -11: still the -12 stage
  assert.equal(at("2026-10-21", [fee("p1")], sent)!.offset, -9);
  // cron down from day -15 to day -2: one mail, for -2, not a burst for -12, -9, -6, -3
  assert.equal(at("2026-10-28", [fee("p1")], new Set([reminderKey("p1", 1, "upcoming", -15)]))!.offset, -2);
  // keys differ by day, and the due/overdue keys are unchanged from before
  assert.equal(reminderKey("p1", 1, "upcoming", -3), "payment_reminder:p1:1:upcoming:-3");
  assert.equal(reminderKey("p1", 1, "due"), "payment_reminder:p1:1:due");
  assert.equal(reminderKey("p1", 1, "overdue", 3), "payment_reminder:p1:1:overdue");
  assert.equal(at("2026-10-30", [fee("p1")], new Set([reminderKey("p1", 1, "due")])), null);
});

test("paid month moves on to the next month; all paid is silent", () => {
  const paid1 = [fee("p1"), month("p1", "2026-10-29T00:00:00Z")];
  assert.equal(at("2026-11-02", paid1), null); // month 2 due 29 Nov (intern paid 1 Dec): window opens 14 Nov
  assert.equal(at("2026-11-13", paid1), null);
  const r = at("2026-11-14", paid1)!;
  assert.deepEqual([r.k, r.dueOn, r.offset], [2, "2026-11-29", -15]);
  const all = [fee("p1"), month("p1", "2026-10-31"), month("p1", "2026-11-30"), month("p1", "2026-12-31")];
  assert.equal(at("2027-01-05", all), null);
});

test("grandfathered, upfront and unpaid hires get none", () => {
  const mk = (mode: string) => [{ status: "paid", paidAt: "2026-09-01T00:00:00Z", raw: { notes: { proposalIds: ["p1"], paymentMode: mode } } }];
  assert.equal(at("2026-11-05", mk("monthly")), null);
  assert.equal(at("2026-11-05", mk("total")), null);
  assert.equal(at("2026-11-05", []), null);
  assert.equal(at("2026-11-05", [fee("p1")], none, { ...hire(), status: "accepted" }), null);
});

test("IST boundary: 18:30 UTC on 14 Oct is already 15 Oct (day -15) in India", () => {
  assert.equal(istDay(new Date("2026-10-14T17:59:00Z")), "2026-10-14");
  assert.equal(at(istDay(new Date("2026-10-14T17:59:00Z"))!), null);
  assert.equal(at(istDay(new Date("2026-10-14T18:30:00Z"))!)!.type, "upcoming");
});

test("the due email says 'due today' only on the due day, 'was due on <date>' after it", () => {
  assert.equal(at("2026-10-30")!.dueToday, true);
  assert.equal(at("2026-11-01")!.dueToday, false);
  const base = { name: "Acme", type: "due" as const, k: 1, amount: "₹10,000", dueOn: "31 Oct 2026", intern: "Asha Rao" };
  process.env.PUBLIC_ORIGIN = "http://localhost:3000";
  const onDay = emails.paymentReminder({ ...base, dueToday: true });
  assert.match(onDay.heading, /is due today/);
  assert.match(onDay.lines[0], /is due today/);
  const late = emails.paymentReminder({ ...base, dueToday: false });
  assert.match(late.heading, /was due on 31 Oct 2026/);
  assert.match(late.lines[0], /was due on 31 Oct 2026 and is still unpaid/);
  assert.doesNotMatch(`${late.subject} ${late.heading} ${late.lines.join(" ")} ${late.status}`, /today/i);
});

test("reminders follow the billing plan, not the current score: a post-paid hire is chased whatever the score", () => {
  const stipend = at("2026-10-28")!.amountMinor;
  assert.equal(at("2026-10-28")!.offset, -2);
  for (const score of [0, 3, 5.9, 10]) {
    const r = reminderDue({ ...hire(), score } as ReturnType<typeof hire>, [fee("p1")], none, "2026-10-28")!;
    assert.equal(r.type, "upcoming", `score ${score}`);
    assert.equal(r.amountMinor, stipend, `score ${score}`);
  }
  assert.equal(stipend, 1_000_000); // 10000 rupees, in minor units
});

test("reminder mails and their in-app copy show 'due on 8 Nov 2026' and ₹16,000, never the ISO day", () => {
  process.env.PUBLIC_ORIGIN = "http://localhost:3000";
  const base = { k: 2, offset: 0, dueOn: "2026-11-08", dueToday: false, amountMinor: 1_600_000, currency: "INR" };
  for (const type of ["upcoming", "due", "overdue"] as const) {
    const m = reminderEmail({ ...base, type }, { name: "Acme", intern: "Asha Rao" });
    const text = `${m.subject} ${m.heading} ${m.lines.join(" ")} ${(m.facts ?? []).flat().join(" ")}`;
    assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}/, type);
    assert.match(text, /₹16,000/, type);
    assert.match(text, /8 Nov 2026/, type);
  }
  const up = reminderEmail({ ...base, type: "upcoming", offset: -15 }, { name: "Acme", intern: "Asha Rao" });
  assert.match(up.lines[0], /stipend of ₹16,000 for Asha Rao falls due on 8 Nov 2026\. You can pay it now\./);
  assert.match(up.lines[1], /Asha Rao's stipend for this month is paid out of this payment, so we would be grateful if you could pay by 8 Nov 2026/);
  assert.equal(up.cta?.url, "http://localhost:3000/employer/checkout"); // payable through the whole reminder window
  assert.match(reminderEmail({ ...base, type: "due", amountMinor: 1_234_550 }, { name: "Acme", intern: "A" }).heading, /₹12,345\.50/);
});
