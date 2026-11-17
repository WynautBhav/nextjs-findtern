import { test } from "node:test";
import assert from "node:assert/strict";

import { hireFlowFrom, proposalBucket, proposalCounts } from "./proposal-bucket.ts";

const row = (status: string, lapsed = false) => ({ status, lapsed });

test("two proposals in any one state are counted somewhere other than zero", () => {
  const where = (status: string, lapsed = false) => {
    const c = proposalCounts([row(status, lapsed), row(status, lapsed)]);
    return c;
  };
  assert.equal(where("sent").awaiting, 2);
  assert.equal(where("interview_scheduled").awaiting, 2);
  assert.equal(where("draft").drafts, 2);
  assert.equal(where("accepted").accepted, 2);
  assert.equal(where("processing").accepted, 2);
  assert.equal(where("hired").hired, 2);
  for (const s of ["rejected", "withdrawn", "expired"]) assert.equal(where(s).closed, 2);
  // Unanswered past the start date: the Proposals tabs close it, so does every counter.
  assert.equal(where("sent", true).closed, 2);
  assert.equal(where("sent", true).awaiting, 0);
  // A status nobody planned for is still counted, never silently dropped.
  assert.equal(where("pending").other, 2);
});

test("legacy spellings land in the same bucket as the canonical status", () => {
  for (const s of ["Sent", " SENT ", "Interview Scheduled", "interview-scheduled"]) assert.equal(proposalBucket(s, false), "open", s);
  assert.equal(proposalBucket("Accepted", false), "accepted");
  assert.equal(proposalBucket("Hired", false), "hired");
  assert.equal(proposalBucket("Rejected", false), "closed");
  assert.equal(proposalBucket("Draft", false), "draft");
  assert.equal(proposalBucket("pending", false), null);
  assert.equal(proposalBucket(null as unknown as string, false), null);
});

test("drafts are unsent: their own bucket, not 'waiting on the candidate'", () => {
  assert.equal(proposalBucket("draft", false), "draft");
  const c = proposalCounts([row("draft"), row("sent")]);
  assert.deepEqual([c.awaiting, c.drafts], [1, 1]);
});

test("every proposal is in exactly one group; total is everything not closed", () => {
  const rows = [row("sent"), row("sent", true), row("draft"), row("accepted"), row("processing"), row("hired"), row("rejected"), row("withdrawn"), row("expired"), row("weird")];
  const c = proposalCounts(rows);
  assert.equal(c.all, rows.length);
  assert.equal(c.awaiting + c.drafts + c.accepted + c.hired + c.closed + c.other, c.all);
  assert.equal(c.total, c.all - c.closed);
  assert.deepEqual(c, { all: 10, total: 6, awaiting: 1, drafts: 1, accepted: 2, hired: 1, closed: 4, other: 1 });
});

test("no proposals: all zeros, not NaN", () => {
  assert.deepEqual(proposalCounts([]), { all: 0, total: 0, awaiting: 0, drafts: 0, accepted: 0, hired: 0, closed: 0, other: 0 });
});

test("the hire strip agrees with the Proposals tabs for the same rows", () => {
  const rows = [
    { internId: "a", status: "sent", lapsed: false },
    { internId: "b", status: "sent", lapsed: true }, // lapsed: closed on the tabs, so not 'awaiting' on the strip
    { internId: "c", status: "Sent", lapsed: false }, // legacy capital
    { internId: "d", status: "draft", lapsed: false },
    { internId: "e", status: "accepted", lapsed: false },
    { internId: "f", status: "hired", lapsed: false },
    { internId: "g", status: "rejected", lapsed: false },
  ];
  const flow = hireFlowFrom({ cartInternIds: ["a", "g", "z"], proposals: rows, toPay: 1 });
  const tabs = proposalCounts(rows);
  assert.equal(flow.awaitingReply, tabs.awaiting);
  assert.equal(flow.awaitingReply, 2);
  assert.equal(flow.hired, tabs.hired);
  assert.equal(flow.proposals, tabs.total);
  // 'a' has a live proposal, so only 'g' (declined: back in play) and 'z' remain shortlisted.
  assert.equal(flow.shortlisted, 2);
  assert.equal(flow.toPay, 1);
});

test("two accepted proposals: 'Proposals' total says 2 even though nothing awaits a reply", () => {
  const flow = hireFlowFrom({ cartInternIds: [], proposals: [{ internId: "a", status: "accepted", lapsed: false }, { internId: "b", status: "accepted", lapsed: false }], toPay: 2 });
  assert.equal(flow.awaitingReply, 0);
  assert.equal(flow.proposals, 2);
  assert.equal(flow.toPay, 2);
});

test("hired counts people, as before; a lapsed shortlisted candidate is still held by their offer", () => {
  const flow = hireFlowFrom({
    cartInternIds: ["a"],
    proposals: [
      { internId: "f", status: "hired", lapsed: false },
      { internId: "f", status: "hired", lapsed: false },
      { internId: "a", status: "sent", lapsed: true },
    ],
    toPay: 0,
  });
  assert.equal(flow.hired, 1);
  assert.equal(flow.shortlisted, 0);
});
