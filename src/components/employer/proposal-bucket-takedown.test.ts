import { test } from "node:test";
import assert from "node:assert/strict";

import { hireFlowFrom, proposalBucket, proposalCounts } from "./proposal-bucket.ts";

/**
 * A taken-down project's proposals are a "View only" group: still counted in the totals (the counters keep counting what
 * exists) but out of the "Waiting" and "To pay" action groups. With no project taken down nothing changes at all.
 */

const row = (status: string, viewOnly = false, lapsed = false) => ({ status, lapsed, ...(viewOnly ? { viewOnly } : {}) });

test("a taken-down project's sent and accepted offers move out of Waiting / To pay into View only, and stay in the totals", () => {
  const c = proposalCounts([row("sent", true), row("interview_scheduled", true), row("accepted", true), row("sent"), row("accepted")]);
  assert.equal(c.awaiting, 1, "only the live one is waiting");
  assert.equal(c.accepted, 1, "only the live one is to pay");
  assert.equal(c.viewOnly, 3);
  assert.equal(c.all, 5);
  assert.equal(c.total, 5, "total still counts everything not closed");
  assert.equal(c.awaiting + c.drafts + c.accepted + c.hired + c.other + (c.viewOnly ?? 0), c.total, "every open proposal is in exactly one group");
});

test("hired, draft and closed proposals of a taken-down project are counted where they are today", () => {
  const c = proposalCounts([row("hired", true), row("draft", true), row("rejected", true), row("withdrawn", true)]);
  assert.equal(c.hired, 1);
  assert.equal(c.drafts, 1);
  assert.equal(c.closed, 2);
  assert.equal(c.viewOnly, undefined);
});

test("the hire strip: a taken-down project's offers are not 'awaiting reply'", () => {
  const f = hireFlowFrom({
    cartInternIds: [],
    proposals: [
      { internId: "a", status: "sent", lapsed: false, viewOnly: true },
      { internId: "b", status: "sent", lapsed: false },
    ],
    toPay: 0,
  });
  assert.equal(f.awaitingReply, 1);
  assert.equal(f.proposals, 2);
});

test("with no project taken down the output has exactly the old shape: no viewOnly key, same numbers", () => {
  const rows = [row("sent"), row("sent", false, true), row("draft"), row("accepted"), row("processing"), row("hired"), row("rejected"), row("weird")];
  const c = proposalCounts(rows);
  assert.deepEqual(Object.keys(c), ["all", "total", "awaiting", "drafts", "accepted", "hired", "closed", "other"]);
  assert.deepEqual(c, { all: 8, total: 6, awaiting: 1, drafts: 1, accepted: 2, hired: 1, closed: 2, other: 1 });
});

test("proposalBucket is unchanged (the flag is a count-time overlay, not a new bucket)", () => {
  for (const [s, b] of [["sent", "open"], ["accepted", "accepted"], ["hired", "hired"], ["draft", "draft"], ["rejected", "closed"]] as const) {
    assert.equal(proposalBucket(s, false), b);
  }
});

test("byte-identical to the pre-change module on every no-takedown fixture (all status/lapsed combinations)", () => {
  const statuses = ["draft", "sent", "interview_scheduled", "accepted", "processing", "hired", "rejected", "withdrawn", "expired", "weird", "Sent", " SENT ", "Interview Scheduled"];
  const rows = statuses.flatMap((status) => [{ status, lapsed: false }, { status, lapsed: true }]);
  const withIds = rows.map((r, i) => ({ ...r, internId: i % 4 === 0 ? "a" : `x${i}` }));
  const mine = JSON.stringify([proposalCounts(rows), hireFlowFrom({ cartInternIds: ["a", "b", "c"], proposals: withIds, toPay: 3 })]);
  // Frozen from the module as it was on master before the View-only group existed.
  const BEFORE = '[{"all":26,"total":11,"awaiting":5,"drafts":2,"accepted":2,"hired":1,"closed":15,"other":1},{"shortlisted":2,"awaitingReply":5,"toPay":3,"hired":1,"proposals":11}]';
  assert.equal(mine, BEFORE);
});
