import assert from "node:assert/strict";
import { test } from "node:test";

import { proposalTimeline } from "./proposal-timeline.ts";

const base = { status: "sent", createdAt: new Date("2026-11-01T05:00:00Z"), updatedAt: new Date("2026-11-01T05:00:00Z"), hiredAt: null, offerDetails: {} };

test("a fresh offer has one step", () => {
  assert.deepEqual(proposalTimeline(base).map((s) => s.key), ["sent"]);
});

test("an expired unpaid offer reads sent, accepted, expired in date order, with the reason", () => {
  const t = proposalTimeline({ ...base, status: "expired", offerDetails: { acceptedAt: "2026-11-03T05:00:00Z", expiredReason: "unpaid_past_start", expiredAt: "2026-11-20T18:30:00.000Z" } });
  assert.deepEqual(t.map((s) => s.key), ["sent", "accepted", "expired"]);
  assert.equal(t[2].label, "Expired: not paid before start");
});

test("an interview step comes first when it is known; a bad stamp is dropped, not shown as a date", () => {
  const t = proposalTimeline({ ...base, interviewAt: "2026-10-30T05:00:00Z", offerDetails: { acceptedAt: "nonsense" } });
  assert.deepEqual(t.map((s) => s.key), ["interview", "sent"]);
});

test("withdrawn with no stamp uses the last update; hired shows the payment date", () => {
  assert.deepEqual(proposalTimeline({ ...base, status: "withdrawn", updatedAt: new Date("2026-11-05T05:00:00Z") }).map((s) => s.key), ["sent", "ended"]);
  assert.deepEqual(proposalTimeline({ ...base, status: "hired", hiredAt: new Date("2026-11-06T05:00:00Z") }).map((s) => s.key), ["sent", "hired"]);
});
