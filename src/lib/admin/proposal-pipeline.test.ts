import test from "node:test";
import assert from "node:assert/strict";

import { offerReplyOf } from "./dashboard-board-pure.ts";
import { PIPELINE_BUCKETS, acceptedPayOf, isPpoOffer, parsePayFilter, parsePipelineType, pipelineByType, pipelinePay, proposalTypeOf, parsePipelineStatus, pipelineCsv, pipelineView, proposalPipelineStatus, type PipelineBucket } from "./proposal-pipeline.ts";

const now = new Date("2026-11-28T12:00:00+05:30");
const future = { startDate: "2099-01-01" };
const past = { startDate: "2026-11-01" };
const p = (status: string, o: { hiredAt?: Date | null; offerDetails?: unknown; hasOpenOrder?: boolean } = {}) => ({
  status,
  hiredAt: o.hiredAt ?? null,
  offerDetails: o.offerDetails ?? future,
  currency: "INR",
  hasOpenOrder: o.hasOpenOrder,
});

test("each proposal lands in one bucket, on the shared rules", () => {
  const cases: [ReturnType<typeof p>, PipelineBucket | null][] = [
    [p("draft"), null],
    [p("sent"), "pending"],
    [p("interview_scheduled"), "pending"],
    [p("sent", { offerDetails: past }), "expired"], // no reply before start, not swept yet
    [p("accepted"), "accepted"],
    [p("processing", { offerDetails: past }), "accepted"], // money in flight never expires
    [p("accepted", { offerDetails: past }), "expired"], // unpaid past start
    [p("accepted", { offerDetails: past, hasOpenOrder: true }), "accepted"], // open order freezes expiry
    [p("hired"), "hired"],
    [p("completed", { offerDetails: past }), "hired"],
    [p("accepted", { hiredAt: new Date("2026-11-02") }), "hired"],
    [p("expired", { hiredAt: new Date("2026-11-02") }), "hired"], // a paid row is a hire whatever the status says
    [p("rejected"), "rejected"],
    [p("withdrawn"), "withdrawn"],
    [p("expired"), "expired"],
  ];
  for (const [row, want] of cases) assert.equal(proposalPipelineStatus(row, now), want, `${row.status} ${JSON.stringify(row.offerDetails)}`);
});

test("hired + accepted is exactly the dashboard's accepted reply", () => {
  const rows = [p("accepted"), p("processing"), p("hired"), p("completed"), p("sent"), p("rejected"), p("accepted", { offerDetails: past })];
  for (const r of rows) {
    const b = proposalPipelineStatus(r, now);
    assert.equal(b === "hired" || b === "accepted", offerReplyOf(r, now) === "accepted");
    if (b !== "hired" && b !== "accepted") assert.equal(b, offerReplyOf(r, now));
  }
});

test("cards are disjoint, add up to the total, and each equals the table it filters", () => {
  const mk = (bucket: PipelineBucket, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${bucket}-${i}`, bucket }));
  const rows = [...mk("pending", 4), ...mk("accepted", 2), ...mk("hired", 3), ...mk("rejected", 1), ...mk("withdrawn", 2), ...mk("expired", 5)];
  const all = pipelineView(rows, "");
  assert.equal(all.total, 17);
  assert.equal(all.rows.length, 17);
  assert.equal(PIPELINE_BUCKETS.reduce((n, b) => n + all.counts[b], 0), all.total);
  for (const b of PIPELINE_BUCKETS) {
    const v = pipelineView(rows, b);
    assert.equal(v.rows.length, all.counts[b], b);
    assert.ok(v.rows.every((r) => r.bucket === b));
    assert.equal(v.total, all.total); // pressing a card never changes the other cards
  }
});

test("status param accepts buckets only", () => {
  assert.equal(parsePipelineStatus("hired"), "hired");
  assert.equal(parsePipelineStatus("sent"), "");
  assert.equal(parsePipelineStatus(undefined), "");
});

test("PPO needs a full-time offer with a base proposal", () => {
  const ft = { fullTimeOffer: { jobTitle: "SDE", annualCtcMinor: 100, baseProposalId: "p1" } };
  assert.equal(isPpoOffer(ft), true);
  assert.equal(isPpoOffer({ fullTimeOffer: { jobTitle: "SDE", annualCtcMinor: 100 } }), false);
  assert.equal(isPpoOffer({ startDate: "2099-01-01" }), false);
});

test("CSV writes the on-screen columns and neutralises formulas", () => {
  const t = pipelineCsv([{ heat: "Hot 82: Starts in 2 days", candidate: "=cmd", employer: "Acme, Inc", project: "Web", type: "Internship proposal", outcome: "Pending", created: "1 Nov 2026", pay: "₹10,000/mo" }]);
  assert.deepEqual(t[0], ["Heat", "Candidate", "Employer", "Project or role", "Type", "Outcome", "Created", "Pay"]);
  assert.equal(t[1][0], "Hot 82: Starts in 2 days");
  assert.equal(t[1][1], "'=cmd");
  assert.equal(t[1][2], '"Acme, Inc"');
});

test("Pay is the intern's stipend (not the employer's monthly amount), or the CTC", () => {
  const a = pipelinePay({ startDate: "2099-01-01", monthlyAmount: 26400, months: 2 }, "INR");
  assert.equal(a.employerMonthly, "₹26,400");
  assert.equal(a.internStipend, "₹13,200");
  assert.equal(a.label, "Stipend ₹13,200/mo");
  const ft = pipelinePay({ fullTimeOffer: { jobTitle: "SDE", annualCtcMinor: 70000000 } }, "INR");
  assert.equal(ft.label, "CTC ₹7,00,000");
  assert.equal(ft.internStipend, null);
});

test("Accepted splits into waiting on payment and payment under way; each part equals its filtered table", () => {
  assert.equal(acceptedPayOf("accepted", "accepted"), "unpaid");
  assert.equal(acceptedPayOf("accepted", "processing"), "processing");
  assert.equal(acceptedPayOf("expired", "accepted"), null); // accepted past start, unpaid: Expired, not waiting
  assert.equal(acceptedPayOf("hired", "hired"), null);
  assert.equal(parsePayFilter("unpaid"), "unpaid");
  assert.equal(parsePayFilter("paid"), "");
  assert.equal(parsePayFilter("processing"), ""); // no longer a filter: ignored
  const rows = [
    ...Array.from({ length: 3 }, (_, i) => ({ id: `u${i}`, bucket: "accepted" as const, pay: "unpaid" as const })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `p${i}`, bucket: "accepted" as const, pay: "processing" as const })),
    { id: "h", bucket: "hired" as const, pay: null },
    { id: "e", bucket: "expired" as const, pay: null },
  ];
  const all = pipelineView(rows, "accepted");
  assert.equal(all.rows.length, 5);
  assert.equal(all.acceptedPay.unpaid + all.acceptedPay.processing, all.counts.accepted);
  const unpaid = pipelineView(rows, "accepted", "unpaid");
  assert.equal(unpaid.rows.length, all.acceptedPay.unpaid); // the tag's count is the rows it shows
  assert.equal(unpaid.rows.length, 3);
  assert.equal(unpaid.counts.accepted, 5); // the Accepted card is not narrowed by the tag
  assert.equal(pipelineView(rows, "hired", "unpaid").rows.length, 1); // pay only narrows Accepted
});

test("type: PPO counts as full-time; segments add up and each equals the cards' total when picked", () => {
  const ft = { fullTimeOffer: { jobTitle: "SDE", annualCtcMinor: 70000000 } };
  const ppo = { fullTimeOffer: { jobTitle: "SDE", annualCtcMinor: 70000000, baseProposalId: "p1" } };
  const intern = { startDate: "2099-01-01", monthlyAmount: 26400 };
  assert.equal(proposalTypeOf(ft), "fulltime");
  assert.equal(proposalTypeOf(ppo), "fulltime");
  assert.equal(proposalTypeOf(intern), "internship");
  assert.equal(parsePipelineType("fulltime"), "fulltime");
  assert.equal(parsePipelineType("full_time"), "");
  const rows = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `i${i}`, type: proposalTypeOf(intern), bucket: (i % 2 ? "pending" : "hired") as "pending" | "hired" })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `f${i}`, type: proposalTypeOf(ft), bucket: "pending" as const })),
    { id: "ppo", type: proposalTypeOf(ppo), bucket: "hired" as const },
  ];
  const all = pipelineByType(rows, "");
  assert.deepEqual(all.counts, { all: 7, internship: 4, fulltime: 3 });
  for (const t of ["internship", "fulltime"] as const) {
    const picked = pipelineByType(rows, t);
    const cards = pipelineView(picked.rows, "");
    assert.equal(cards.total, all.counts[t]);
    assert.equal(picked.counts.all, 7); // picking a type never changes the segments
    assert.equal(pipelineView(picked.rows, "pending").rows.length, cards.counts.pending);
  }
  assert.equal(pipelineView(pipelineByType(rows, "fulltime").rows, "hired").rows.length, 1); // the PPO
});
