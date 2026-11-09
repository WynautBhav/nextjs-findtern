import { test } from "node:test";
import assert from "node:assert/strict";

import { buildActivity, buildFunnel, buildProjectStats, mondayOf, untilLabel, type DashBucket, type DashProposal } from "./employer-dashboard.ts";

const BUCKET: Record<string, DashBucket | null> = { draft: "open", sent: "open", interview_scheduled: "open", accepted: "accepted", processing: "accepted", hired: "hired", rejected: "closed", withdrawn: "closed", expired: "closed" };
const prop = (internId: string, status: string, extra: Partial<DashProposal> = {}): DashProposal => ({
  internId,
  projectId: "p1",
  status,
  bucket: BUCKET[status] ?? null,
  createdAt: null,
  hiredAt: null,
  ...extra,
});
const counts = (f: ReturnType<typeof buildFunnel>) => f.stages.map((s) => s.count);

test("funnel: nothing yet is empty, not four zero bars", () => {
  const f = buildFunnel({ proposals: [], shortlistInternIds: [], metInternIds: [] });
  assert.equal(f.hasData, false);
  assert.deepEqual(counts(f), [0, 0, 0, 0]);
  assert.deepEqual(f.stages.map((s) => s.conversionPct), [null, null, null, null]);
});

test("funnel: counts unique interns per stage and nests them", () => {
  const f = buildFunnel({
    proposals: [
      prop("a", "hired"),
      prop("a", "rejected"), // same intern twice: still one
      prop("b", "accepted"),
      prop("c", "processing"),
      prop("d", "sent"),
      prop("e", "interview_scheduled"),
      prop("f", "rejected"),
      prop("g", "expired"),
    ],
    shortlistInternIds: ["h", "i", "a"],
    metInternIds: ["j", "d"],
  });
  assert.deepEqual(counts(f), [10, 7, 3, 1]);
  assert.equal(f.hasData, true);
});

test("funnel: hired <= accepted <= offered <= pipeline for any mix", () => {
  const statuses = ["draft", "sent", "interview_scheduled", "accepted", "processing", "hired", "rejected", "withdrawn", "expired", "weird"];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let round = 0; round < 200; round += 1) {
    const ids = Array.from({ length: 12 }, (_, i) => `i${i}`);
    const proposals = Array.from({ length: Math.floor(rnd() * 20) }, () => prop(ids[Math.floor(rnd() * ids.length)], statuses[Math.floor(rnd() * statuses.length)]));
    const pick = () => ids.filter(() => rnd() < 0.3);
    const [pipeline, offered, accepted, hired] = counts(buildFunnel({ proposals, shortlistInternIds: pick(), metInternIds: pick() }));
    assert.ok(hired <= accepted && accepted <= offered && offered <= pipeline, `${hired} ${accepted} ${offered} ${pipeline}`);
  }
});

test("funnel: a lapsed offer (closed bucket, status still sent) is offered but not live", () => {
  const f = buildFunnel({ proposals: [prop("a", "sent", { bucket: "closed" }), prop("b", "sent")], shortlistInternIds: [], metInternIds: [] });
  const offered = f.stages[1];
  assert.equal(offered.count, 2);
  assert.equal(offered.lost, 1);
  assert.equal(offered.sub, "1 awaiting a reply");
});

test("funnel: a declined offer next to a live one is not lost; drafts are not offered", () => {
  const f = buildFunnel({ proposals: [prop("a", "rejected"), prop("a", "sent"), prop("b", "draft")], shortlistInternIds: [], metInternIds: [] });
  assert.equal(f.stages[1].count, 1);
  assert.equal(f.stages[1].lost, 0);
  assert.equal(f.stages[0].count, 2); // the draft intern is still in the pipeline
});

test("funnel: conversion is against the previous stage, null when that is 0", () => {
  const f = buildFunnel({
    proposals: [prop("a", "hired"), prop("b", "accepted"), prop("c", "sent"), prop("d", "sent"), prop("e", "rejected")],
    shortlistInternIds: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
    metInternIds: [],
  });
  assert.deepEqual(counts(f), [10, 5, 2, 1]);
  assert.deepEqual(f.stages.map((s) => s.conversionPct), [null, 50, 40, 50]);
  assert.deepEqual(f.stages.map((s) => s.conversionOf), [null, "of in pipeline", "of offered", "of accepted"]);
  // Nothing offered yet: 0% of the pipeline, then "—" because the previous stage is 0.
  const g = buildFunnel({ proposals: [], shortlistInternIds: ["a"], metInternIds: [] });
  assert.deepEqual(g.stages.map((s) => s.conversionPct), [null, 0, null, null]);
  assert.equal(g.stages[0].count, 1);
});

test("funnel: sub-lines say what is waiting, with plurals", () => {
  const f = buildFunnel({
    proposals: [prop("a", "sent"), prop("b", "sent"), prop("c", "accepted"), prop("d", "processing"), prop("e", "hired"), prop("f", "rejected")],
    shortlistInternIds: ["x", "f"],
    metInternIds: ["y", "x"],
  });
  assert.equal(f.stages[0].sub, "3 candidates waiting for an offer"); // x, y, f (declined: back in play)
  assert.equal(f.stages[1].sub, "2 awaiting a reply");
  assert.equal(f.stages[2].sub, "2 to pay");
  assert.equal(f.stages[3].sub, null);
  const one = buildFunnel({ proposals: [], shortlistInternIds: ["x"], metInternIds: [] });
  assert.equal(one.stages[0].sub, "1 candidate waiting for an offer");
});

test("funnel: each stage links to its Proposals tab", () => {
  const f = buildFunnel({ proposals: [prop("a", "sent")], shortlistInternIds: [], metInternIds: [] });
  assert.deepEqual(f.stages.map((s) => s.href), ["/employer/cart", "/employer/proposals?status=open", "/employer/proposals?status=accepted", "/employer/proposals?status=hired"]);
});

test("mondayOf: Monday-start", () => {
  assert.equal(mondayOf("2026-11-09"), "2026-11-09"); // Monday
  assert.equal(mondayOf("2026-11-15"), "2026-11-09"); // Sunday belongs to the week before it
  assert.equal(mondayOf("2026-11-16"), "2026-11-16");
  assert.equal(mondayOf("2026-03-01"), "2026-02-23");
});

test("activity: eight Monday-start weeks, current last, IST boundaries", () => {
  const now = new Date("2026-11-09T10:00:00+05:30"); // Monday
  const a = buildActivity(
    [
      { status: "sent", createdAt: new Date("2026-11-09T00:10:00+05:30"), hiredAt: null }, // Mon 00:10 IST = Sun 18:40 UTC: this week
      { status: "sent", createdAt: new Date("2026-11-08T23:50:00+05:30"), hiredAt: null }, // Sun 23:50 IST: last week
      { status: "hired", createdAt: new Date("2026-10-01T12:00:00+05:30"), hiredAt: new Date("2026-11-03T12:00:00+05:30") },
      { status: "draft", createdAt: new Date("2026-11-09T09:00:00+05:30"), hiredAt: null }, // drafts are not sent
      { status: "sent", createdAt: new Date("2026-01-01T09:00:00+05:30"), hiredAt: null }, // outside the 8 weeks
    ],
    now,
  );
  assert.equal(a.weeks.length, 8);
  assert.equal(a.weeks[0].start, "2026-09-21");
  assert.equal(a.weeks[7].start, "2026-11-09");
  assert.deepEqual(a.weeks.map((w) => w.current), [false, false, false, false, false, false, false, true]);
  assert.equal(a.weeks[7].sent, 1);
  assert.equal(a.weeks[6].sent, 1);
  assert.equal(a.weeks[6].hires, 1);
  assert.equal(a.weeks[1].start, "2026-09-28");
  assert.deepEqual([a.weeks[0].label, a.weeks[7].label], ["21 Sep", "9 Nov"]);
  assert.equal(a.weeks[1].sent, 1); // Thu 1 Oct belongs to the week of Mon 28 Sep
  assert.equal(a.totalSent, 3);
  assert.equal(a.totalHires, 1);
  assert.equal(a.activeWeeks, 3);
});

test("activity: nothing sent is all zeros, 0 active weeks", () => {
  const a = buildActivity([], new Date("2026-11-09T10:00:00+05:30"));
  assert.equal(a.totalSent, 0);
  assert.equal(a.activeWeeks, 0);
});

test("activity: ignores unparsable dates", () => {
  const a = buildActivity([{ status: "sent", createdAt: "not a date", hiredAt: null }], new Date("2026-11-09T10:00:00+05:30"));
  assert.equal(a.totalSent, 0);
});

test("project stats: hired, open, declined, to pay per project", () => {
  const m = buildProjectStats([
    prop("a", "hired", { projectId: "p1" }),
    prop("b", "sent", { projectId: "p1" }),
    prop("c", "accepted", { projectId: "p1" }),
    prop("d", "rejected", { projectId: "p1" }),
    prop("e", "processing", { projectId: "p2" }),
  ]);
  assert.deepEqual(m.get("p1"), { hired: 1, open: 2, declined: 1, toPay: 1 });
  assert.deepEqual(m.get("p2"), { hired: 0, open: 1, declined: 0, toPay: 1 });
  assert.equal(m.get("p3"), undefined);
});

test("untilLabel: minutes, hours and minutes, days, now", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  const at = (min: number) => new Date(now.getTime() + min * 60000);
  assert.equal(untilLabel(at(-5), now), "starting now");
  assert.equal(untilLabel(at(0), now), "starting now");
  assert.equal(untilLabel(at(45), now), "in 45 m");
  assert.equal(untilLabel(at(135), now), "in 2 h 15 m");
  assert.equal(untilLabel(at(120), now), "in 2 h");
  assert.equal(untilLabel(at(3 * 24 * 60 + 30), now), "in 3 d");
});
