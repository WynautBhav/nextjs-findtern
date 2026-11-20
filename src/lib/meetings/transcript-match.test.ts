import assert from "node:assert/strict";
import test from "node:test";

import { matchTranscript, meetCode, normalizeEventId, type FfMeta, type MeetingCandidate } from "./transcript-match.ts";

const T0 = new Date("2026-11-21T10:00:00Z");
const cand = (id: string, over: Partial<MeetingCandidate> = {}): MeetingCandidate => ({
  interviewId: id, calendarEventId: `ev${id}`, meetingLink: `https://meet.google.com/abc-defg-hi${String.fromCharCode(96 + Number(id.slice(-1)))}`, slotStart: T0, eventTitle: `Findtern meeting ${id.slice(0, 8)}`, ...over,
});
const meta = (over: Partial<FfMeta> = {}): FfMeta => ({ id: "ff1", title: null, calId: null, meetingLink: null, startedAt: null, ...over });

test("normalizeEventId drops Google's suffix and a recurring occurrence tail; meetCode reads the code", () => {
  assert.equal(normalizeEventId("AbC123@google.com"), "abc123");
  assert.equal(normalizeEventId("abc123_20261008T140000Z"), "abc123");
  assert.equal(normalizeEventId("abc123_20261008"), "abc123");
  assert.equal(normalizeEventId(""), null);
  assert.equal(meetCode("https://meet.google.com/ABC-defg-hij?authuser=0"), "abc-defg-hij");
  assert.equal(meetCode("https://zoom.us/j/123"), null);
});

test("calendar event id is the strongest match", () => {
  const r = matchTranscript(meta({ calId: "evi-1@google.com" }), [cand("i-1"), cand("i-2")]);
  assert.deepEqual(r, { interviewId: "i-1", method: "calendar_event" });
});

test("Meet code matches when there is no calendar id", () => {
  const r = matchTranscript(meta({ meetingLink: "https://meet.google.com/abc-defg-hib" }), [cand("i-1"), cand("i-2")]);
  assert.deepEqual(r, { interviewId: "i-2", method: "meet_link" });
});

test("title + time window matches; outside the window or a different title does not", () => {
  const c = cand("abcdef12-0000");
  const title = "Findtern meeting abcdef12";
  assert.deepEqual(matchTranscript(meta({ title, startedAt: new Date(T0.getTime() + 5 * 60_000) }), [c]), { interviewId: "abcdef12-0000", method: "title_time" });
  assert.deepEqual(matchTranscript(meta({ title, startedAt: new Date(T0.getTime() - 20 * 60_000) }), [c]), { interviewId: "abcdef12-0000", method: "title_time" });
  assert.deepEqual(matchTranscript(meta({ title, startedAt: new Date(T0.getTime() + 5 * 3_600_000) }), [c]), { interviewId: null, note: "no_match" });
  assert.deepEqual(matchTranscript(meta({ title: "Team sync", startedAt: T0 }), [c]), { interviewId: null, note: "no_match" });
  assert.deepEqual(matchTranscript(meta({ title }), [c]), { interviewId: null, note: "no_match" }, "no start time = no title match");
});

test("a time window alone never matches (precision over recall)", () => {
  assert.deepEqual(matchTranscript(meta({ title: "Anything", startedAt: T0 }), [cand("i-1")]), { interviewId: null, note: "no_match" });
});

test("two meetings with the same signal are ambiguous, not guessed", () => {
  const r = matchTranscript(meta({ calId: "shared" }), [cand("i-1", { calendarEventId: "shared" }), cand("i-2", { calendarEventId: "shared" })]);
  assert.deepEqual(r, { interviewId: null, note: "ambiguous" });
});

test("a second recording of a meeting that already has one stays unmatched", () => {
  const r = matchTranscript(meta({ calId: "evi-1" }), [cand("i-1")], new Set(["i-1"]));
  assert.deepEqual(r, { interviewId: null, note: "duplicate_meeting" });
});

test("empty candidates -> no_match", () => {
  assert.deepEqual(matchTranscript(meta({ calId: "x" }), []), { interviewId: null, note: "no_match" });
});
