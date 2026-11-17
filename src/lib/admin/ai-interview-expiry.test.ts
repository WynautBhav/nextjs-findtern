import assert from "node:assert/strict";
import { test } from "node:test";

import { aiExpiryLabel, aiInterviewExpired, aiTabOf, daysSince, linkSentAtOf, type AiExpiryInput } from "./ai-interview-expiry.ts";
import { aiLinkState } from "./ai-link-queue.ts";

const SENT = new Date("2026-11-01T10:00:00Z");
const DAY = 86_400_000;
const link = "https://app.incruiter.com/i/1";
const row = (over: Partial<AiExpiryInput> = {}): AiExpiryInput => ({ status: "scheduled", meetingLink: link, linkSentAt: SENT, updatedAt: SENT, ...over });
const at = (days: number, extraMs = 0) => new Date(SENT.getTime() + days * DAY + extraMs);

test("link sent, not completed: expires at exactly N days, not a millisecond before", () => {
  assert.equal(aiInterviewExpired(row(), at(7, -1), 7).expired, false);
  const r = aiInterviewExpired(row(), at(7), 7);
  assert.equal(r.expired, true);
  assert.equal(r.reason, "link_expired");
  assert.equal(r.at?.getTime(), at(7).getTime());
  assert.equal(aiInterviewExpired(row(), at(30), 7).expired, true);
});

test("the day count is the setting, not a constant", () => {
  assert.equal(aiInterviewExpired(row(), at(3), 3).expired, true);
  assert.equal(aiInterviewExpired(row(), at(3), 5).expired, false);
  // A broken setting falls back to 7, never to "expire immediately".
  assert.equal(aiInterviewExpired(row(), at(1), 0).expired, false);
  assert.equal(aiInterviewExpired(row(), at(1), Number.NaN).expired, false);
  assert.equal(aiInterviewExpired(row(), at(7), Number.NaN).expired, true);
});

test("completed is never expired, however old", () => {
  for (const status of ["completed", "Completed"]) assert.equal(aiInterviewExpired(row({ status }), at(400), 7).expired, false, status);
});

test("missed, cancelled, no_show are expired at once, with or without a link", () => {
  const now = at(1);
  const cases: [string, string][] = [["missed", "missed"], ["cancelled", "cancelled"], ["canceled", "cancelled"], ["no_show", "no_show"], ["Missed", "missed"]];
  for (const [status, reason] of cases) {
    const r = aiInterviewExpired(row({ status, meetingLink: null }), now, 7);
    assert.equal(r.expired, true, status);
    assert.equal(r.reason, reason, status);
  }
});

test("a closed interview expires when it was closed (updatedAt), else when the link went out", () => {
  const closed = new Date("2026-11-03T08:00:00Z");
  assert.equal(aiInterviewExpired(row({ status: "missed", updatedAt: closed }), at(5), 7).at?.getTime(), closed.getTime());
  assert.equal(aiInterviewExpired(row({ status: "missed", updatedAt: null }), at(5), 7).at?.getTime(), SENT.getTime());
});

test("no link yet, or a blank one: waiting for a link is not expiry", () => {
  for (const meetingLink of [null, "", "   "]) assert.equal(aiInterviewExpired(row({ meetingLink }), at(90), 7).expired, false, String(meetingLink));
  assert.equal(aiInterviewExpired(row({ linkSentAt: null }), at(90), 7).expired, false);
});

test("link sent time: the audit row, else updatedAt, else createdAt", () => {
  const audit = new Date("2026-11-02T00:00:00Z");
  const upd = new Date("2026-11-03T00:00:00Z");
  const cre = new Date("2026-10-30T00:00:00Z");
  assert.equal(linkSentAtOf({ auditAt: audit, updatedAt: upd, createdAt: cre })?.getTime(), audit.getTime());
  assert.equal(linkSentAtOf({ auditAt: null, updatedAt: upd, createdAt: cre })?.getTime(), upd.getTime());
  assert.equal(linkSentAtOf({ auditAt: null, updatedAt: null, createdAt: cre })?.getTime(), cre.getTime());
  assert.equal(linkSentAtOf({ auditAt: null, updatedAt: null, createdAt: null }), null);
  assert.equal(linkSentAtOf({ auditAt: "2026-11-02T00:00:00Z", updatedAt: null, createdAt: null })?.getTime(), audit.getTime());
});

test("labels name the days", () => {
  assert.equal(aiExpiryLabel("link_expired", 7), "Link expired: not completed in 7 days");
  assert.equal(aiExpiryLabel("link_expired", 1), "Link expired: not completed in 1 day");
  assert.equal(aiExpiryLabel("missed", 7), "Missed");
  assert.equal(aiExpiryLabel("cancelled", 7), "Cancelled");
  assert.equal(aiExpiryLabel("no_show", 7), "No-show");
});

test("days since expiry floors and never goes negative", () => {
  assert.equal(daysSince(SENT, at(0, 3 * 3_600_000)), 0);
  assert.equal(daysSince(SENT, at(3, 1)), 3);
  assert.equal(daysSince(at(2), SENT), 0);
  assert.equal(daysSince(null, SENT), null);
});

test("tab: an expired row is never also 'sent'; the other tabs are as before", () => {
  const now = at(8);
  assert.equal(aiTabOf(row(), at(3), 7), "sent");
  assert.equal(aiTabOf(row(), now, 7), "expired");
  assert.equal(aiTabOf(row({ status: "completed" }), now, 7), "completed");
  assert.equal(aiTabOf(row({ meetingLink: null, status: "pending" }), now, 7), "waiting");
  assert.equal(aiTabOf(row({ status: "missed" }), at(1), 7), "expired");
  // Every row lands in exactly one tab.
  const rows = [row(), row({ status: "completed" }), row({ meetingLink: null, status: "pending" }), row({ status: "cancelled" }), row({ linkSentAt: at(6) })];
  const tabs = rows.map((r) => aiTabOf(r, now, 7));
  assert.deepEqual(tabs, ["expired", "completed", "waiting", "expired", "sent"]);
});

test("the queue's own state treats no_show as closed (it used to read as 'sent')", () => {
  assert.equal(aiLinkState({ status: "no_show", meetingLink: link }), "closed");
  assert.equal(aiLinkState({ status: "scheduled", meetingLink: link }), "sent");
  assert.equal(aiLinkState({ status: "pending", meetingLink: null }), "waiting");
});
