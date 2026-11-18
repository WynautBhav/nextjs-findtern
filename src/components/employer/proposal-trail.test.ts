import assert from "node:assert/strict";
import { test } from "node:test";

import { daysUntil, stageTrail } from "./proposal-trail.ts";

const fmt = (v: Date | string) => (typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10));
const now = new Date("2026-11-06T12:00:00Z");
const base = { createdAt: new Date("2026-10-28T10:00:00Z"), hiredAt: null };
const shape = (s: ReturnType<typeof stageTrail>) => s.map((x) => `${x.state}:${x.label}`);

test("daysUntil counts India calendar days and goes negative once the start has begun", () => {
  assert.equal(daysUntil("2026-11-09", now), 3);
  assert.equal(daysUntil("2026-11-06", now), 0);
  assert.equal(daysUntil("2026-11-04", now), -2);
  assert.equal(daysUntil(null, now), null);
  assert.equal(daysUntil("soon", now), null);
  // 8:00 pm UTC is already the next day in India.
  assert.equal(daysUntil("2026-11-07", new Date("2026-11-06T20:00:00Z")), 0);
});

test("a sent offer waits on the candidate; its start date is the last stage", () => {
  const t = stageTrail({ ...base, status: "sent" }, { startDate: "2026-12-15" }, { closed: false }, fmt, now);
  assert.deepEqual(shape(t), ["done:Sent", "current:Accepted", "todo:Paid", "todo:Starts"]);
  assert.equal(t[0].date, "2026-10-28");
  assert.equal(t[3].date, "2026-12-15");
});

test("accepted: paying is next and the acceptance carries no invented date", () => {
  const t = stageTrail({ ...base, status: "accepted" }, { startDate: "2026-12-01" }, { closed: false }, fmt, now);
  assert.deepEqual(shape(t), ["done:Sent", "done:Accepted", "current:Paid", "todo:Starts"]);
  assert.equal(t[1].date, null);
});

test("hired before the start date: paid is done and the start is still ahead", () => {
  const t = stageTrail({ ...base, status: "hired", hiredAt: new Date("2026-11-01T10:00:00Z") }, { startDate: "2027-02-03" }, { closed: false }, fmt, now);
  assert.deepEqual(shape(t), ["done:Sent", "done:Accepted", "done:Paid", "current:Starts"]);
  assert.equal(t[2].date, "2026-11-01");
});

test("hired and started reads Started", () => {
  const t = stageTrail({ ...base, status: "hired", hiredAt: new Date("2026-10-30T10:00:00Z") }, { startDate: "2026-11-02" }, { closed: false }, fmt, now);
  assert.deepEqual(shape(t), ["done:Sent", "done:Accepted", "done:Paid", "done:Started"]);
});

test("payment in progress is labelled Paying", () => {
  const t = stageTrail({ ...base, status: "processing" }, { startDate: "2026-12-01" }, { closed: false }, fmt, now);
  assert.equal(t[2].label, "Paying");
  assert.equal(t[2].state, "current");
});

test("closed: declined never reached Accepted; expired-unpaid did", () => {
  const declined = stageTrail({ ...base, status: "rejected" }, { startDate: "2026-12-01" }, { closed: true }, fmt, now);
  assert.deepEqual(shape(declined), ["done:Sent", "closed:Accepted", "closed:Paid", "closed:Starts"]);
  const unpaid = stageTrail({ ...base, status: "accepted" }, { startDate: "2026-11-01" }, { closed: true, acceptedBeforeClose: true }, fmt, now);
  assert.deepEqual(shape(unpaid), ["done:Sent", "done:Accepted", "closed:Paid", "closed:Starts"]);
});
