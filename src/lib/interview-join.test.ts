import assert from "node:assert/strict";
import test from "node:test";

import { JOIN_CLOSE_AFTER_START_MINUTES, JOIN_OPENS_BEFORE_MINUTES, joinState, safeMeetingHref, serializeJoinInput } from "./interview-join.ts";

const START = Date.parse("2026-11-20T10:00:00Z"); // 3:30 PM IST
const at = (minutesFromStart: number) => START + minutesFromStart * 60_000;
const LINK = "https://meet.google.com/abc-defg-hij";

const iv = (over: Record<string, unknown> = {}) => ({
  status: "scheduled",
  selectedSlot: 2,
  slot1: new Date(START - 86_400_000),
  slot2: new Date(START),
  slot3: new Date(START + 86_400_000),
  meetingLink: LINK,
  ...over,
});

test("window constants: opens 15 min before, closes 60 min after the start (end + grace)", () => {
  assert.equal(JOIN_OPENS_BEFORE_MINUTES, 15);
  assert.equal(JOIN_CLOSE_AFTER_START_MINUTES, 60);
});

test("too early: disabled, says when it opens and in how many minutes (IST)", () => {
  const r = joinState(at(-45), iv());
  assert.equal(r.state, "too_early");
  assert.equal(r.opensAt, at(-15));
  assert.equal(r.href, null);
  assert.equal(r.label, "Join opens at 3:15 PM IST (in 30 min)");
});

test("too early by more than two hours reads in hours, then days", () => {
  assert.match(joinState(at(-3 * 60 - 15), iv()).label, /\(in 3 h\)$/);
  assert.match(joinState(at(-2 * 1440 - 15), iv()).label, /\(in 2 days\)$/);
  assert.match(joinState(at(-16), iv()).label, /\(in 1 min\)$/);
});

test("opens at exactly 15 minutes before the start", () => {
  assert.equal(joinState(at(-15) - 1, iv()).state, "too_early");
  const r = joinState(at(-15), iv());
  assert.equal(r.state, "open");
  assert.equal(r.href, LINK);
  assert.equal(r.label, "Join meeting");
});

test("open mid-interview and until the end plus grace", () => {
  assert.equal(joinState(at(10), iv()).state, "open");
  assert.equal(joinState(at(30), iv()).state, "open");
  assert.equal(joinState(at(60), iv()).state, "open");
  assert.equal(joinState(at(60) + 1, iv()).state, "ended");
});

test("ended: no button, says it is over", () => {
  const r = joinState(at(120), iv());
  assert.equal(r.state, "ended");
  assert.equal(r.href, null);
  assert.equal(r.label, "This interview has ended");
});

test("no link yet: waiting for the company, before and during the window", () => {
  for (const link of [null, "", "   "]) {
    for (const m of [-600, -5, 10]) {
      const r = joinState(at(m), iv({ meetingLink: link }));
      assert.equal(r.state, "no_link", `${String(link)} @${m}`);
      assert.equal(r.label, "Waiting for the company to share a meeting link");
      assert.equal(r.href, null);
    }
  }
});

test("a link that is not https is never offered", () => {
  for (const link of ["http://meet.example.com/x", "javascript:alert(1)", "ftp://x.y/z", "data:text/html,hi", "//evil.example/x", "https://"]) {
    assert.equal(joinState(at(0), iv({ meetingLink: link })).state, "no_link", link);
  }
});

test("a link typed without a scheme opens as https", () => {
  const r = joinState(at(0), iv({ meetingLink: "meet.google.com/abc-defg-hij" }));
  assert.equal(r.state, "open");
  assert.equal(r.href, "https://meet.google.com/abc-defg-hij");
});

test("cancelled, completed, missed, expired, pending, draft are unavailable even with a link inside the window", () => {
  for (const status of ["cancelled", "completed", "missed", "expired", "pending", "draft", "waiting", null]) {
    const r = joinState(at(0), iv({ status }));
    assert.equal(r.state, "unavailable", String(status));
    assert.equal(r.href, null);
  }
});

test("no selected slot: unavailable (nothing is booked)", () => {
  assert.equal(joinState(at(0), iv({ selectedSlot: null })).state, "unavailable");
  assert.equal(joinState(at(0), iv({ selectedSlot: 0 })).state, "unavailable");
  // the selected slot column is empty: nothing to time against
  assert.equal(joinState(at(0), iv({ selectedSlot: 3, slot3: null })).state, "unavailable");
});

test("the selected slot decides the time, not the first slot", () => {
  const r = joinState(at(0), iv({ selectedSlot: 3 }));
  assert.equal(r.state, "too_early");
  assert.equal(r.opensAt, START + 86_400_000 - 15 * 60_000);
});

test("employer no-show (booked, 30 min past, employer never joined) is unavailable", () => {
  const created = new Date("2026-11-15T00:00:00Z");
  assert.equal(joinState(at(31), iv({ createdAt: created })).state, "unavailable");
  assert.equal(joinState(at(31), iv({ createdAt: created, employerJoinedAt: new Date(at(-2)) })).state, "open");
});

test("viewer timezone: the opening time is shown in the zone given, IST by default", () => {
  assert.equal(joinState(at(-45), iv(), { zone: "America/New_York" }).label, "Join opens at 4:45 AM EST (in 30 min)");
  assert.equal(joinState(at(-45), iv(), { zone: null }).label, "Join opens at 3:15 PM IST (in 30 min)");
});

test("accepts a Date or ISO strings for now and the slots", () => {
  const input = serializeJoinInput(iv());
  assert.equal(typeof input.slot2, "string");
  assert.equal(joinState(new Date(at(5)), input).state, "open");
  assert.equal(joinState(at(5), input).state, "open");
});

test("unreadable slot is unavailable, not a crash", () => {
  assert.equal(joinState(at(0), iv({ slot2: "not a date" })).state, "unavailable");
});

test("safeMeetingHref: https only", () => {
  assert.equal(safeMeetingHref(LINK), LINK);
  assert.equal(safeMeetingHref("  zoom.us/j/123  "), "https://zoom.us/j/123");
  assert.equal(safeMeetingHref("http://zoom.us/j/123"), null);
  assert.equal(safeMeetingHref("javascript:alert(1)"), null);
  assert.equal(safeMeetingHref("https://user:pw@evil.example/x"), null);
  assert.equal(safeMeetingHref(null), null);
  assert.equal(safeMeetingHref(undefined), null);
});
