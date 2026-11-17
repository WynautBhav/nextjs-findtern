import { test } from "node:test";
import assert from "node:assert/strict";

import { CLOSED_LABEL, closedBreakdown, closedReasonOf, hireFlowFrom, proposalBucket, proposalCounts, type ProposalRow } from "./proposal-bucket.ts";

/**
 * WP4: Verifying and Expired join the counter. Two promises are pinned here:
 *  1. with no CGPA flag and no expiry, every output is byte-identical to the module before this change (frozen below,
 *     produced by running the pre-change module over the same matrix: 14 statuses x lapsed x viewOnly);
 *  2. every proposal sits in exactly one visible state, so a tab can never read 0 while "All" reads 2 for rows that
 *     only sit in another tab (owner bug 5a).
 */

const STATUSES = ["draft", "sent", "interview_scheduled", "accepted", "processing", "hired", "rejected", "withdrawn", "expired", "weird", "Sent", "Accepted", " HIRED ", "Interview Scheduled"];
const matrix = () => {
  let i = 0;
  const rows: (ProposalRow & { internId: string })[] = [];
  for (const status of STATUSES) for (const lapsed of [false, true]) for (const v of [false, true]) rows.push({ status, lapsed, ...(v ? { viewOnly: true } : {}), internId: `i${i++ % 9}` });
  return rows;
};
const FROZEN = {"n": 56, "buckets": ["draft", "draft", "draft", "draft", "open", "open", "closed", "closed", "open", "open", "closed", "closed", "accepted", "accepted", "closed", "closed", "accepted", "accepted", "closed", "closed", "hired", "hired", "closed", "closed", "closed", "closed", "closed", "closed", "closed", "closed", "closed", "closed", "closed", "closed", "closed", "closed", null, null, "closed", "closed", "open", "open", "closed", "closed", "accepted", "accepted", "closed", "closed", "hired", "hired", "closed", "closed", "open", "open", "closed", "closed"], "counts": {"all": 56, "total": 24, "awaiting": 4, "drafts": 4, "accepted": 3, "hired": 4, "closed": 32, "other": 2, "viewOnly": 7}, "flow": {"shortlisted": 1, "awaitingReply": 4, "toPay": 4, "hired": 3, "proposals": 24}};

test("frozen: with no CGPA flag and no expiry the buckets and counts are byte-identical to before", () => {
  const rows = matrix();
  assert.equal(rows.length, FROZEN.n);
  assert.deepEqual(rows.map((r) => proposalBucket(r.status, r.lapsed)), FROZEN.buckets);
  assert.deepEqual(proposalCounts(rows), FROZEN.counts);
  assert.equal(JSON.stringify(proposalCounts(rows)), JSON.stringify(FROZEN.counts));
});

test("frozen: the hire strip is identical, plus the new verifying key at 0", () => {
  const flow = hireFlowFrom({ cartInternIds: ["i1", "i2", "zz"], proposals: matrix(), toPay: 4 });
  const { verifying, ...rest } = flow;
  assert.equal(verifying, 0);
  assert.equal(JSON.stringify(rest), JSON.stringify(FROZEN.flow));
});

const row = (status: string, extra: Partial<ProposalRow> = {}): ProposalRow => ({ status, lapsed: false, ...extra });

test("accepted + CGPA gate pending/overdue/incorrect is Verifying, not To pay", () => {
  assert.equal(proposalBucket("accepted", false, { verifying: true }), "verifying");
  assert.equal(proposalBucket("accepted", false, { verifying: false }), "accepted");
  const c = proposalCounts([row("accepted", { verifying: true }), row("accepted", { verifying: true }), row("accepted")]);
  assert.equal(c.verifying, 2);
  assert.equal(c.accepted, 1);
  assert.equal(c.total, 3, "verifying is still in the Proposals total");
  assert.equal(c.all, 3);
});

test("the verifying key appears only when there is one (shape unchanged otherwise)", () => {
  assert.equal("verifying" in proposalCounts([row("accepted"), row("sent")]), false);
  assert.equal("verifying" in proposalCounts([row("accepted", { verifying: true })]), true);
});

test("processing and hired are never verifying, whatever the flag says (money in flight or settled)", () => {
  assert.equal(proposalBucket("processing", false, { verifying: true }), "accepted");
  assert.equal(proposalBucket("hired", false, { verifying: true }), "hired");
});

test("accepted and unpaid past its start day is Closed (expired), never To pay or Verifying", () => {
  assert.equal(proposalBucket("accepted", false, { expiredReason: "unpaid_past_start" }), "closed");
  assert.equal(proposalBucket("accepted", false, { expiredReason: "unpaid_past_start", verifying: true }), "closed");
  const c = proposalCounts([row("accepted", { expiredReason: "unpaid_past_start" }), row("accepted")]);
  assert.deepEqual([c.closed, c.accepted, c.total], [1, 1, 1]);
});

test("a taken-down project's verifying offer is View only, like its other open offers", () => {
  const c = proposalCounts([row("accepted", { verifying: true, viewOnly: true }), row("accepted", { verifying: true })]);
  assert.equal(c.viewOnly, 1);
  assert.equal(c.verifying, 1);
  assert.equal(c.total, 2);
});

test("every proposal is in exactly one group, across every state at once", () => {
  const rows: ProposalRow[] = [
    row("draft"),
    row("sent"),
    row("interview_scheduled"),
    row("sent", { lapsed: true }),
    row("accepted", { verifying: true }),
    row("accepted"),
    row("processing"),
    row("hired"),
    row("accepted", { expiredReason: "unpaid_past_start" }),
    row("expired", { expiredReason: "no_reply_past_start" }),
    row("expired"),
    row("rejected"),
    row("withdrawn"),
    row("sent", { viewOnly: true }),
    row("weird"),
  ];
  const c = proposalCounts(rows);
  assert.equal(c.awaiting + c.drafts + c.accepted + c.hired + c.closed + c.other + (c.viewOnly ?? 0) + (c.verifying ?? 0), c.all);
  assert.equal(c.total, c.all - c.closed);
  assert.deepEqual(c, { all: 15, total: 9, awaiting: 2, drafts: 1, accepted: 2, hired: 1, closed: 6, other: 1, viewOnly: 1, verifying: 1 });
});

test("bug 5a: two accepted offers read 0 under Waiting and 2 elsewhere, and the strip says where", () => {
  const rows = [row("accepted"), row("accepted", { verifying: true })];
  const c = proposalCounts(rows);
  assert.equal(c.all, 2);
  assert.equal(c.awaiting, 0);
  assert.equal(c.accepted + (c.verifying ?? 0), 2, "the two are counted, under To pay and Verifying CGPA");
  const flow = hireFlowFrom({ cartInternIds: [], proposals: rows.map((r, i) => ({ ...r, internId: `x${i}` })), toPay: 1 });
  assert.deepEqual([flow.awaitingReply, flow.verifying, flow.toPay, flow.hired, flow.proposals], [0, 1, 1, 0, 2]);
});

test("closed reasons: each closed proposal has exactly one, and a non-closed one has none", () => {
  const cases: [string, boolean, ProposalRow["expiredReason"], string | null][] = [
    ["rejected", false, undefined, "declined"],
    ["withdrawn", false, undefined, "withdrawn"],
    ["sent", true, undefined, "expired_no_reply"],
    ["interview_scheduled", true, undefined, "expired_no_reply"],
    ["accepted", false, "unpaid_past_start", "expired_unpaid"],
    ["expired", false, "unpaid_past_start", "expired_unpaid"],
    ["expired", false, "no_reply_past_start", "expired_no_reply"],
    ["expired", false, "admin_closed", "admin_closed"],
    ["expired", false, "accepted_elsewhere", "accepted_elsewhere"],
    ["expired", false, undefined, "accepted_elsewhere"],
    ["expired", false, null, "accepted_elsewhere"],
    ["sent", false, undefined, null],
    ["accepted", false, undefined, null],
    ["hired", false, undefined, null],
    ["draft", false, undefined, null],
  ];
  for (const [status, lapsed, expiredReason, want] of cases) assert.equal(closedReasonOf(status, lapsed, { expiredReason }), want, `${status}/${lapsed}/${expiredReason}`);
  assert.equal(CLOSED_LABEL.expired_unpaid, "Expired · not paid before start");
  assert.equal(CLOSED_LABEL.expired_no_reply, "Expired · no reply before start");
});

test("closedBreakdown counts per reason in a fixed order and agrees with the Closed count", () => {
  const rows: ProposalRow[] = [row("withdrawn"), row("rejected"), row("rejected"), row("accepted", { expiredReason: "unpaid_past_start" }), row("sent", { lapsed: true }), row("expired"), row("sent")];
  const b = closedBreakdown(rows);
  assert.deepEqual(b, [
    { reason: "declined", count: 2 },
    { reason: "withdrawn", count: 1 },
    { reason: "expired_unpaid", count: 1 },
    { reason: "expired_no_reply", count: 1 },
    { reason: "accepted_elsewhere", count: 1 },
  ]);
  assert.equal(b.reduce((s, x) => s + x.count, 0), proposalCounts(rows).closed);
  assert.deepEqual(closedBreakdown([row("sent")]), []);
});
