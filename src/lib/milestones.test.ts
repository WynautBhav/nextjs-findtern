import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

import { MILESTONE_DAYS, currentMilestone, milestoneEvents, milestonesFor, noteGuardScript, type MilestoneEvents, type MilestoneSource } from "./milestones.ts";

const DAY = 86_400_000;
const NOW = new Date("2026-11-13T06:00:00Z");
const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY - extraMs);

test("no events gives no milestones", () => {
  assert.deepEqual(milestonesFor({}, NOW), []);
  assert.deepEqual(milestonesFor({ profileSubmittedAt: null, score: null, firstOffer: null, firstApprovedHours: null, firstPayout: null }, NOW), []);
});

const offerAt = (at: Date): MilestoneEvents => ({
  firstOffer: { at, proposalId: "p1", company: "Acme Robotics", role: "Product Intern", stage: "open" },
});

test("day 6 shows, day 8 does not, and the week ends at 7 days", () => {
  assert.equal(milestonesFor(offerAt(ago(0)), NOW).length, 1, "same day");
  assert.equal(milestonesFor(offerAt(ago(6, 3_600_000)), NOW).length, 1, "6 days 1 h ago");
  assert.equal(milestonesFor(offerAt(ago(7, -1)), NOW).length, 1, "1 ms short of 7 days");
  assert.equal(milestonesFor(offerAt(ago(MILESTONE_DAYS)), NOW).length, 0, "exactly 7 days");
  assert.equal(milestonesFor(offerAt(ago(8)), NOW).length, 0, "8 days");
});

test("an event dated in the future is not shown", () => {
  assert.equal(milestonesFor(offerAt(new Date(NOW.getTime() + 60_000)), NOW).length, 0);
});

test("each note carries the stored fact with its date and one next step that is an app route", () => {
  const m = milestonesFor(offerAt(ago(2)), NOW)[0];
  assert.equal(m.fact, "Your first offer, for Product Intern at Acme Robotics, arrived on 11 Nov 2026.");
  assert.deepEqual(m.next, { label: "Read the offer", href: "/intern/proposals/p1" });
  assert.equal(m.id, "offer:p1");
  assert.ok(!m.fact.includes("!"), "no exclamation marks");
});

const everything = (at: Date): MilestoneEvents => ({
  profileSubmittedAt: at,
  score: { at, overall: 7.25 },
  firstOffer: { at, proposalId: "p1", company: "the company", role: "Product Intern", stage: "hired" },
  firstApprovedHours: { at, timesheetId: "t1", hours: 160, period: "18 Oct to 17 Nov" },
  firstPayout: { at, payoutId: "r1", amountMinor: 1_500_000, currency: "INR" },
});

test("every kind reads as one fact and one next step", () => {
  const facts = milestonesFor(everything(ago(1)), NOW).map((m) => [m.kind, m.fact, m.next.href]);
  assert.deepEqual(facts, [
    ["payout", "A stipend payment of ₹15,000 reached your account on 12 Nov 2026.", "/intern/earnings"],
    ["hours", "160 hours for 18 Oct to 17 Nov were approved on 12 Nov 2026.", "/intern/timesheets"],
    ["offer", "Your first offer, for Product Intern at the company, arrived on 12 Nov 2026.", "/intern/timesheets"],
    ["score", "Your Findtern Score of 7.3/10 was published on 12 Nov 2026.", "/intern/record"],
    ["profile", "You submitted your profile on 12 Nov 2026.", "/intern/profile"],
  ]);
});

test("one note at a time, in a fixed priority: payout, hours, offer, score, profile", () => {
  const all = milestonesFor(everything(ago(1)), NOW);
  assert.equal(currentMilestone(all, [])?.kind, "payout");
  // Dismissing the top one lets the next in line show, still only one.
  assert.equal(currentMilestone(all, ["payout:r1"])?.kind, "hours");
  assert.equal(currentMilestone(all, new Set(["payout:r1", "hours:t1"]))?.kind, "offer");
  assert.equal(currentMilestone(all, ["payout:r1", "hours:t1", "offer:p1", "score"])?.kind, "profile");
  // Priority beats recency: an older payout still leads a newer offer.
  const mixed = milestonesFor({ ...everything(ago(1)), firstPayout: { at: ago(5), payoutId: "r1", amountMinor: 100, currency: "INR" }, firstOffer: { at: ago(0), proposalId: "p1", company: "x", role: "y", stage: "open" } }, NOW);
  assert.equal(mixed[0].kind, "payout");
});

test("dismissed ids are respected, and nothing is left once all are dismissed", () => {
  const all = milestonesFor(offerAt(ago(1)), NOW);
  assert.equal(currentMilestone(all, ["offer:p1"]), null);
  assert.equal(currentMilestone(all, []), all[0]);
  assert.equal(currentMilestone([], []), null);
  // A different offer is a different note.
  assert.equal(currentMilestone(all, ["offer:other"]), all[0]);
});

test("a score without a stored date gets no note", () => {
  assert.deepEqual(milestonesFor({ score: { at: null, overall: 8 } }, NOW), []);
});

/* ── From rows ─────────────────────────────────────────────────────────── */

const proposal = (over: Record<string, unknown> = {}) => ({
  id: "p1", employerId: "e1", internId: "u", projectId: "pr", skills: [], interviewId: null, flowType: "direct",
  status: "sent", currency: "INR", offerDetails: { roleTitle: "Product Intern" }, aiRatings: null,
  createdAt: ago(2), hiredAt: null, ...over,
});
const sheet = (over: Record<string, unknown> = {}) => ({
  id: "t1", proposalId: "p1", periodStart: new Date("2026-10-18T00:00:00Z"), periodEnd: new Date("2026-10-18T00:00:00Z"),
  status: "approved", entries: [{ date: "2026-10-18", hours: 6, status: "Present" }], submittedAt: ago(4), approvedAt: ago(3),
  rejectedAt: null, managerNote: null, internNote: null, createdAt: ago(10), ...over,
});
const payout = (over: Record<string, unknown> = {}) => ({
  id: "r1", amountMinor: 1_500_000, currency: "INR", status: "paid", referenceId: "ref", notes: null, kind: "stipend",
  paidAt: ago(1), createdAt: ago(2), ...over,
});
const source = (over: Partial<Record<keyof MilestoneSource, unknown>> = {}): MilestoneSource =>
  ({ proposals: [], timesheets: [], payouts: [], extra: {}, names: { e1: "Acme Robotics" }, score: null, ...over }) as MilestoneSource;

test("rows with no events give none, and so do rows that are not events", () => {
  assert.deepEqual(milestonesFor(milestoneEvents(source()), NOW), []);
  assert.deepEqual(
    milestonesFor(
      milestoneEvents(
        source({
          proposals: [proposal({ status: "rejected" }), proposal({ id: "p2", status: "withdrawn" }), proposal({ id: "p3", status: "expired" }), proposal({ id: "p4", status: "interview_scheduled" })],
          timesheets: [sheet({ status: "submitted", approvedAt: null }), sheet({ id: "t2", status: "draft", approvedAt: null })],
          payouts: [payout({ status: "pending", paidAt: null }), payout({ id: "r2", status: "failed", paidAt: null })],
        }),
      ),
      NOW,
    ),
    [],
  );
});

test("the first of each is the earliest, from rows", () => {
  const ev = milestoneEvents(
    source({
      proposals: [proposal({ id: "late", createdAt: ago(1) }), proposal({ id: "early", createdAt: ago(5) })],
      timesheets: [sheet({ id: "tb", approvedAt: ago(1) }), sheet({ id: "ta", approvedAt: ago(4) })],
      payouts: [payout({ id: "rb", paidAt: ago(1) }), payout({ id: "ra", paidAt: ago(3) })],
      extra: { profileSubmittedAt: ago(6).toISOString() },
      score: { overall: 8, at: ago(2) },
    }),
  );
  assert.equal(ev.firstOffer?.proposalId, "early");
  assert.equal(ev.firstApprovedHours?.timesheetId, "ta");
  assert.equal(ev.firstPayout?.payoutId, "ra");
  assert.equal(ev.firstApprovedHours?.hours, 6);
  assert.equal(ev.profileSubmittedAt?.getTime(), ago(6).getTime());
  assert.equal(milestonesFor(ev, NOW).length, 5);
});

test("a hidden company reads as 'the company' (masking holds)", () => {
  const ev = milestoneEvents(source({ proposals: [proposal()], names: { e1: "Hidden company" } }));
  assert.match(milestonesFor(ev, NOW)[0].fact, /at the company,/);
  assert.doesNotMatch(milestonesFor(ev, NOW)[0].fact, /Hidden company/);
});

test("the activation payment is never a milestone", () => {
  // Activation is an intern_payments row; the source has no field for it and milestoneEvents never reads one.
  const withActivation = source({ payouts: [], extra: { payment: { isPaid: true, paidAt: ago(1).toISOString(), finalAmountMinor: 249900 } } });
  assert.deepEqual(milestonesFor(milestoneEvents(withActivation), NOW), []);
  // Even if one were smuggled in as a payout row or a stray event field, it is ignored.
  assert.deepEqual(milestonesFor(milestoneEvents(source({ payouts: [payout({ kind: "activation" })] })), NOW), []);
  assert.deepEqual(milestonesFor(milestoneEvents(source({ payouts: [payout({ kind: "completion_bonus" })] })), NOW), []);
  const stray = { activationPaidAt: ago(1), activation: { at: ago(1), amountMinor: 249900 }, payment: { at: ago(1) } } as unknown as MilestoneEvents;
  assert.deepEqual(milestonesFor(stray, NOW), []);
  for (const m of milestonesFor(everything(ago(1)), NOW)) assert.doesNotMatch(m.fact, /activation|2,499|2499/i);
});

test("an accepted offer that is not yet paid points at the offer, a hired one at Timesheets", () => {
  const accepted = milestonesFor(milestoneEvents(source({ proposals: [proposal({ status: "accepted" })] })), NOW)[0];
  assert.deepEqual(accepted.next, { label: "Open the offer", href: "/intern/proposals/p1" });
  const hired = milestonesFor(milestoneEvents(source({ proposals: [proposal({ status: "hired", hiredAt: ago(1) })] })), NOW)[0];
  assert.deepEqual(hired.next, { label: "Open Timesheets", href: "/intern/timesheets" });
});

// The guard goes into a <script>, where "<" is escaped as \u003c: it must still parse and behave, and must not need "<".
function runGuard(stored: string | null, ids: string[]) {
  const code = noteGuardScript("findtern:milestones:u1", "Milestone");
  assert.ok(!code.includes("<"), "no < in the script");
  const notes = ids.map((id, i) => {
    const classes = new Set(i > 0 ? ["hidden"] : []);
    return { id, style: { display: "" }, classes, getAttribute: () => id, classList: { remove: (c: string) => classes.delete(c) } };
  });
  const sandbox = {
    localStorage: { getItem: (k: string) => (k === "findtern:milestones:u1" ? stored : null) },
    document: { querySelectorAll: (sel: string) => (sel === 'section[data-note-for="Milestone"]' ? notes : []) },
  };
  vm.runInNewContext(code.replace(/</g, "\\u003c"), sandbox);
  return notes.filter((n) => n.style.display !== "none" && !n.classes.has("hidden")).map((n) => n.id);
}

test("the guard keeps the first note that is not dismissed, whatever is in storage", () => {
  assert.deepEqual(runGuard(null, ["a", "b", "c"]), ["a"]);
  assert.deepEqual(runGuard('["a"]', ["a", "b", "c"]), ["b"]);
  assert.deepEqual(runGuard('["a","b"]', ["a", "b", "c"]), ["c"]);
  assert.deepEqual(runGuard('["a","b","c"]', ["a", "b", "c"]), []);
  assert.deepEqual(runGuard('["b"]', ["a", "b", "c"]), ["a"]);
  assert.deepEqual(runGuard("not json", ["a", "b"]), ["a"], "broken storage shows the first note");
  assert.deepEqual(runGuard('{"a":1}', ["a", "b"]), ["a"], "a non-array shows the first note");
});
