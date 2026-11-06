import assert from "node:assert/strict";
import { test } from "node:test";

import { offerTimeline } from "./proposal-timeline.ts";

const fmt = (v: Date | string) => (typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10));
const now = new Date("2026-11-06T12:00:00Z");
const base = { createdAt: new Date("2026-10-28T10:00:00Z"), updatedAt: new Date("2026-10-30T10:00:00Z"), hiredAt: null };
const open = { label: "Waiting on candidate", lapsed: false };
const shape = (steps: ReturnType<typeof offerTimeline>) => steps.map((s) => `${s.state}:${s.label}`);

test("sent offer: the candidate's decision is the current step", () => {
  const steps = offerTimeline({ ...base, status: "sent" }, { startDate: "2026-12-29", fullTime: false }, open, fmt, now);
  assert.deepEqual(shape(steps), ["done:Offer sent", "current:Candidate decides", "todo:You pay to confirm the hire", "todo:Starts"]);
  assert.equal(steps[3].date, "2026-12-29");
});

test("accepted offer: paying is next, and the acceptance carries no invented date", () => {
  const steps = offerTimeline({ ...base, status: "accepted" }, { startDate: "2026-12-01", fullTime: false }, open, fmt, now);
  assert.deepEqual(shape(steps).slice(1, 3), ["done:Accepted by the candidate", "current:You pay to confirm the hire"]);
  assert.equal(steps[1].date, null);
});

test("hired with a past start date: every step done", () => {
  const steps = offerTimeline(
    { ...base, status: "hired", hiredAt: new Date("2026-09-01T10:00:00Z") },
    { startDate: "2026-09-24", fullTime: false },
    open,
    fmt,
    now,
  );
  assert.ok(steps.every((s) => s.state === "done"));
  assert.equal(steps.at(-1)?.label, "Started");
});

test("declined offer ends in a closed step with the pill's label", () => {
  const steps = offerTimeline({ ...base, status: "rejected" }, { startDate: "2026-12-01", fullTime: false }, { label: "Declined", lapsed: false }, fmt, now);
  assert.deepEqual(shape(steps), ["done:Offer sent", "closed:Declined"]);
  assert.equal(steps[1].date, "2026-10-30");
});

test("lapsed offer closes without a date; full-time wording for fee and joining", () => {
  const lapsed = offerTimeline({ ...base, status: "sent" }, { startDate: "2026-11-01", fullTime: false }, { label: "Expired · no reply", lapsed: true }, fmt, now);
  assert.deepEqual(shape(lapsed), ["done:Offer sent", "closed:Expired · no reply"]);
  assert.equal(lapsed[1].date, null);
  const ft = offerTimeline({ ...base, status: "accepted" }, { startDate: "2027-01-10", fullTime: true }, open, fmt, now);
  assert.deepEqual(shape(ft).slice(2), ["current:You pay the hiring fee", "todo:Joins"]);
});
