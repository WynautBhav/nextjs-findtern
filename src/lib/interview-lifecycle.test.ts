import assert from "node:assert/strict";
import { test } from "node:test";

import { INTERVIEW_EXPIRED_REASON, INVITE_EXPIRED_REASON, interviewLifecycle, interviewExpiredNow, SWEEPABLE_STATUSES } from "./interview-lifecycle.ts";

const NOW = Date.parse("2026-11-18T10:00:00Z");
const MIN = 60_000;
const at = (offsetMin: number) => new Date(NOW + offsetMin * MIN);

type Iv = Parameters<typeof interviewLifecycle>[0];
const booked = (startOffsetMin: number, status = "scheduled", extra: Partial<Iv> = {}): Iv => ({
  status,
  slot1: at(startOffsetMin),
  slot2: at(startOffsetMin + 1440),
  slot3: null,
  selectedSlot: 1,
  ...extra,
});
const invite = (offsets: (number | null)[], status = "pending", extra: Partial<Iv> = {}): Iv => ({
  status,
  slot1: offsets[0] == null ? null : at(offsets[0]),
  slot2: offsets[1] == null ? null : at(offsets[1]),
  slot3: offsets[2] == null ? null : at(offsets[2]),
  selectedSlot: null,
  ...extra,
});

const cases: [string, Iv, { state: string; status: string; label: string; expired: boolean }][] = [
  ["future booked meeting", booked(120), { state: "upcoming", status: "scheduled", label: "Scheduled", expired: false }],
  ["in progress (started 10 min ago)", booked(-10), { state: "live", status: "scheduled", label: "Happening now", expired: false }],
  ["just ended (30 min + 1 s ago)", { ...booked(-30), slot1: new Date(NOW - 30 * MIN - 1000) }, { state: "expired", status: "expired", label: "Expired", expired: true }],
  ["exactly at the end (start + 30 min)", booked(-30), { state: "expired", status: "expired", label: "Expired", expired: true }],
  ["one second before the end", { ...booked(-30), slot1: new Date(NOW - 30 * MIN + 1000) }, { state: "live", status: "scheduled", label: "Happening now", expired: false }],
  ["ended 3 days ago", booked(-3 * 1440), { state: "expired", status: "expired", label: "Expired", expired: true }],
  ["invite, every slot passed", invite([-2880, -1440, -60]), { state: "expired", status: "expired", label: "Expired", expired: true }],
  ["invite, one slot still ahead", invite([-2880, -1440, 60]), { state: "awaiting_pick", status: "pending", label: "Waiting on candidate", expired: false }],
  ["invite, all slots ahead", invite([60, 120, 180]), { state: "awaiting_pick", status: "pending", label: "Waiting on candidate", expired: false }],
  ["invite with no slots left (cleared by a reschedule)", invite([null, null, null]), { state: "awaiting_pick", status: "pending", label: "Waiting on candidate", expired: false }],
  ["waiting invite, all slots passed", invite([-60], "waiting"), { state: "expired", status: "expired", label: "Expired", expired: true }],
  ["completed, however old", booked(-3 * 1440, "completed"), { state: "completed", status: "completed", label: "Completed", expired: false }],
  ["cancelled in the past", booked(-1440, "cancelled"), { state: "cancelled", status: "cancelled", label: "Cancelled", expired: false }],
  ["cancelled invite", invite([-1440], "cancelled"), { state: "cancelled", status: "cancelled", label: "Cancelled", expired: false }],
  ["declined", invite([-1440], "declined"), { state: "declined", status: "declined", label: "Declined", expired: false }],
  ["rescheduled", invite([-1440], "rescheduled"), { state: "rescheduled", status: "rescheduled", label: "Rescheduled", expired: false }],
  ["missed keeps its meaning", booked(-1440, "missed"), { state: "missed", status: "missed", label: "Missed", expired: false }],
  ["already persisted as expired, with a slot ahead (never un-expires)", booked(600, "expired"), { state: "expired", status: "expired", label: "Expired", expired: true }],
  ["status in other case", booked(-1440, "Scheduled"), { state: "expired", status: "expired", label: "Expired", expired: true }],
  ["scheduled with a picked slot number but that slot empty: falls back to the offered slots", { status: "scheduled", slot1: at(-60), slot2: null, slot3: null, selectedSlot: 2 }, { state: "expired", status: "expired", label: "Expired", expired: true }],
  ["scheduled with no slots at all: nothing to compare, stays scheduled", { status: "scheduled", slot1: null, slot2: null, slot3: null, selectedSlot: null }, { state: "upcoming", status: "scheduled", label: "Scheduled", expired: false }],
];

for (const [name, iv, want] of cases) {
  test(`lifecycle: ${name}`, () => {
    const l = interviewLifecycle(iv, NOW);
    assert.deepEqual({ state: l.state, status: l.status, label: l.label, expired: l.expired }, want);
  });
}

test("reasons: a booked meeting that ended unmarked, an invite nobody picked", () => {
  assert.equal(INTERVIEW_EXPIRED_REASON, "Time passed, not marked complete");
  assert.equal(interviewLifecycle(booked(-1440), NOW).reason, INTERVIEW_EXPIRED_REASON);
  assert.equal(interviewLifecycle(invite([-60]), NOW).reason, INVITE_EXPIRED_REASON);
  assert.equal(interviewLifecycle(booked(60), NOW).reason, null);
  assert.equal(interviewLifecycle(booked(-1440, "completed"), NOW).reason, null);
});

test("accepts ISO strings and compares UTC instants, whatever zone the slot is shown in", () => {
  const start = "2026-11-18T08:45:00.000Z"; // 7:45 pm GMT+11 = 14:15 IST; ended 09:15Z, before NOW (10:00Z)
  assert.equal(interviewLifecycle({ status: "scheduled", slot1: start, slot2: null, slot3: null, selectedSlot: 1 }, NOW).expired, true);
  assert.equal(interviewLifecycle({ status: "scheduled", slot1: "2026-11-18T09:45:00.000Z", slot2: null, slot3: null, selectedSlot: 1 }, NOW).state, "live");
  assert.equal(interviewLifecycle({ status: "scheduled", slot1: "not a date", slot2: null, slot3: null, selectedSlot: 1 }, NOW).expired, false);
});

test("the AI interview has its own expiry and is never expired here", () => {
  assert.equal(interviewLifecycle(booked(-1440, "scheduled", { employerId: "admin" }), NOW).expired, false);
  assert.equal(interviewLifecycle(booked(-1440, "scheduled", { isAi: true }), NOW).status, "scheduled");
  assert.equal(interviewExpiredNow(booked(-1440, "scheduled", { employerId: "admin" }), NOW), false);
});

test("interviewExpiredNow is the sweep's predicate: only an open status that reads expired", () => {
  assert.deepEqual([...SWEEPABLE_STATUSES].sort(), ["pending", "proposed", "scheduled", "waiting"]);
  assert.equal(interviewExpiredNow(booked(-1440), NOW), true);
  assert.equal(interviewExpiredNow(booked(-1440, "expired"), NOW), false, "already expired: nothing to change");
  assert.equal(interviewExpiredNow(booked(-1440, "completed"), NOW), false);
  assert.equal(interviewExpiredNow(booked(-1440, "cancelled"), NOW), false);
  assert.equal(interviewExpiredNow(booked(-10), NOW), false, "in progress");
  assert.equal(interviewExpiredNow(booked(60), NOW), false, "future");
  assert.equal(interviewExpiredNow(invite([-60]), NOW), true);
  assert.equal(interviewExpiredNow(invite([-60, 60]), NOW), false);
});

test("an unpicked offer lapses at its respond-by even while a slot is still ahead (meetings v1)", () => {
  const now = Date.parse("2026-11-20T06:00:00Z");
  const iv = { status: "pending", slot1: new Date(now + 10 * 3_600_000), slot2: null, slot3: null, respondBy: new Date(now + 8 * 3_600_000) };
  assert.equal(interviewLifecycle(iv, now + 7 * 3_600_000).expired, false);
  assert.equal(interviewLifecycle(iv, now + 9 * 3_600_000).expired, true);
  // rows from before the migration have no respondBy and keep the old rule
  assert.equal(interviewLifecycle({ ...iv, respondBy: null }, now + 9 * 3_600_000).expired, false);
  // a booked meeting is not an offer: respondBy never lapses it
  assert.equal(interviewLifecycle({ ...iv, status: "scheduled", selectedSlot: 1 }, now + 9 * 3_600_000).expired, false);
});
