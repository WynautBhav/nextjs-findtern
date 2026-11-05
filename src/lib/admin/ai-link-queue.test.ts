import test from "node:test";
import assert from "node:assert/strict";

import { aiLinkState, daysWaiting, linkNoticeKey, pickQueue, validateAiLink, type AiLinkRow } from "./ai-link-queue.ts";

const row = (id: string, o: Partial<AiLinkRow> = {}): AiLinkRow => ({ interviewId: id, internId: `u${id}`, status: "waiting", meetingLink: null, createdAt: "2026-11-01T00:00:00Z", paid: true, ...o });

test("queue: paid + waiting + no link, oldest first; link, completed, closed and unpaid excluded", () => {
  const { waiting, unpaid } = pickQueue([
    row("new", { createdAt: "2026-11-04T00:00:00Z" }),
    row("old", { createdAt: "2026-11-01T00:00:00Z", status: "pending" }),
    row("linked", { meetingLink: "https://x.incruiter.com/a", status: "scheduled" }),
    row("done", { status: "completed" }),
    row("gone", { status: "cancelled" }),
    row("free", { paid: false }),
  ]);
  assert.deepEqual(waiting.map((r) => r.interviewId), ["old", "new"]);
  assert.equal(unpaid, 1);
});

test("state and days waiting", () => {
  assert.equal(aiLinkState({ status: "scheduled", meetingLink: " https://a.b " }), "sent");
  assert.equal(aiLinkState({ status: "Completed", meetingLink: null }), "completed");
  assert.equal(daysWaiting("2026-11-01T00:00:00Z", new Date("2026-11-04T12:00:00Z")), 3);
  assert.equal(daysWaiting(null, new Date()), 0);
});

test("link validation: https only, soft warning off incruiter", () => {
  for (const bad of ["", "http://x.incruiter.com/a", "javascript:alert(1)", "//x.com", "https://", "https://a b"]) assert.equal(validateAiLink(bad).ok, false, bad);
  const ok = validateAiLink(" https://app.incruiter.com/i/1 ");
  assert.deepEqual(ok, { ok: true, link: "https://app.incruiter.com/i/1", warning: null });
  const other = validateAiLink("https://example.com/i");
  assert.ok(other.ok && other.warning?.includes("example.com"));
  const spoof = validateAiLink("https://incruiter.com.evil.io/i");
  assert.ok(spoof.ok && spoof.warning);
});

test("notify once: first link and each changed link, never a resave", () => {
  assert.equal(linkNoticeKey("i1", null, "https://a.b/1"), "ai_interview_link:i1:https://a.b/1");
  assert.equal(linkNoticeKey("i1", "https://a.b/1", " https://a.b/1 "), null);
  assert.equal(linkNoticeKey("i1", "https://a.b/1", "https://a.b/2"), "ai_interview_link:i1:https://a.b/2");
  assert.equal(linkNoticeKey("i1", "https://a.b/1", ""), null);
});
