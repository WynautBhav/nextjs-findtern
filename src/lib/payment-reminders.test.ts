import assert from "node:assert/strict";
import test from "node:test";

import { istDay } from "./billing-plan.ts";
import { emails } from "./emails.ts";
import { reminderDue, reminderKey } from "./payment-reminders.ts";

const fee = (id: string) => ({ status: "paid", paidAt: "2026-09-01T00:00:00Z", raw: { notes: { proposalIds: [id], paymentMode: "hiring_fee" } } });
const month = (id: string, at: string) => ({ status: "paid", paidAt: at, raw: { notes: { proposalIds: [id], dueProposalIds: [id], paymentMode: "total" } } });
const hire = () => ({ id: "p1", status: "hired", offerDetails: { startDate: "2026-10-01", duration: "3m", monthlyAmount: 10000, currency: "INR" }, hiredAt: "2026-09-30T00:00:00Z" });
// month 1 = Oct 1..Oct 31, due 2026-10-31
const none = new Set<string>();
const at = (d: string, o = [fee("p1")], sent = none, h = hire()) => reminderDue(h, o, sent, d);

test("3 days before, due day, 3 days after", () => {
  assert.equal(at("2026-10-27"), null);
  const up = at("2026-10-28")!;
  assert.deepEqual([up.type, up.k, up.dueOn], ["upcoming", 1, "2026-10-31"]);
  assert.ok(up.amountMinor > 0);
  assert.equal(at("2026-10-31")!.type, "due");
  assert.equal(at("2026-11-02")!.type, "due");
  assert.equal(at("2026-11-03")!.type, "overdue");
});

test("already sent is skipped; later stage still goes out", () => {
  assert.equal(at("2026-10-28", [fee("p1")], new Set([reminderKey("p1", 1, "upcoming")])), null);
  assert.equal(at("2026-10-31", [fee("p1")], new Set([reminderKey("p1", 1, "upcoming")]))!.type, "due");
});

test("paid month moves on to the next month; all paid is silent", () => {
  assert.equal(at("2026-11-03", [fee("p1"), month("p1", "2026-10-31T00:00:00Z")]), null);
  assert.equal(at("2026-11-27", [fee("p1"), month("p1", "2026-10-31T00:00:00Z")])!.k, 2);
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

test("IST boundary: 19:00 UTC on 27 Oct is already 28 Oct in India", () => {
  assert.equal(istDay(new Date("2026-10-27T17:59:00Z")), "2026-10-27");
  assert.equal(at(istDay(new Date("2026-10-27T17:59:00Z"))!), null);
  assert.equal(at(istDay(new Date("2026-10-27T18:30:00Z"))!)!.type, "upcoming");
});

test("the due email says 'due today' only on the due day, 'was due on <date>' after it", () => {
  assert.equal(at("2026-10-31")!.dueToday, true);
  assert.equal(at("2026-11-02")!.dueToday, false);
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
  for (const score of [0, 3, 5.9, 10]) {
    const r = reminderDue({ ...hire(), score } as ReturnType<typeof hire>, [fee("p1")], none, "2026-10-28")!;
    assert.equal(r.type, "upcoming", `score ${score}`);
    assert.equal(r.amountMinor, stipend, `score ${score}`);
  }
  assert.equal(stipend, 1_000_000); // 10000 rupees, in minor units
});
