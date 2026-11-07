import test from "node:test";
import assert from "node:assert/strict";

import { applyThreadEvent, badgeText, failSent, groupByDay, markMineRead, mergeMessages, reconcileSent, relativeTime, statusText, truncatePreview, type Msg, type ThreadRow } from "./ui-logic.ts";

const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();
const th = (id: string, unread = 0, at: string | null = null): ThreadRow => ({ id, proposalId: null, counterpartId: "x", counterpartOnline: false, lastMessage: null, lastMessageAt: at, unread });
const msg = (id: string, createdAt: string, extra: Partial<Msg> = {}): Msg => ({ id, mine: true, body: "hi", createdAt, deliveredAt: null, readAt: null, ...extra });

test("relative time", () => {
  assert.equal(relativeTime(new Date(NOW - 10_000).toISOString(), NOW), "now");
  assert.equal(relativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW), "5m");
  assert.equal(relativeTime(new Date(NOW - 3 * 3600_000).toISOString(), NOW), "3h");
  assert.equal(relativeTime(new Date(NOW - 2 * 86400_000).toISOString(), NOW), "2d");
  assert.equal(relativeTime("garbage", NOW), "");
  assert.equal(relativeTime(null, NOW), "");
});

test("preview truncation is plain, single line and safe", () => {
  assert.equal(truncatePreview("a\n\n b   c"), "a b c");
  assert.equal(truncatePreview("x".repeat(100), 10).length, 10);
  assert.ok(truncatePreview("x".repeat(100), 10).endsWith("…"));
  assert.equal(truncatePreview("<b>hi</b>"), "<b>hi</b>"); // rendered as text by React, never as HTML
});

test("badge caps at 99+", () => {
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
});

test("day grouping", () => {
  const g = groupByDay(
    [msg("1", new Date(2026, 10, 5, 9).toISOString()), msg("2", new Date(2026, 10, 6, 9).toISOString()), msg("3", new Date(2026, 10, 7, 8).toISOString()), msg("4", new Date(2026, 10, 7, 9).toISOString())],
    NOW,
  );
  assert.deepEqual(g.map((x) => x.items.length), [1, 1, 2]);
  assert.deepEqual(g.slice(1).map((x) => x.label), ["Yesterday", "Today"]);
});

test("unread merge from events", () => {
  const list = [th("a", 1, "2026-01-01T00:00:00Z"), th("b", 0, "2026-02-01T00:00:00Z")];
  const r = applyThreadEvent(list, { type: "message.new", data: { threadId: "a", createdAt: "2026-03-01T00:00:00Z" } });
  assert.equal(r.threads[0].id, "a");
  assert.equal(r.threads[0].unread, 2);
  const open = applyThreadEvent(list, { type: "message.new", data: { threadId: "a" } }, "a");
  assert.equal(open.threads.find((t) => t.id === "a")!.unread, 1);
  assert.equal(applyThreadEvent(list, { type: "message.new", data: { threadId: "zzz" } }).refetch, true);
  assert.equal(applyThreadEvent(list, { type: "message.new", data: null }).threads, list);
});

test("optimistic reconcile, rollback and read marks", () => {
  const temp = msg("tmp", "2026-01-01T00:00:00Z", { pending: true });
  const server = msg("srv", "2026-01-01T00:00:01Z");
  assert.deepEqual(reconcileSent([temp], "tmp", server).map((m) => m.id), ["srv"]);
  assert.deepEqual(reconcileSent([temp, server], "tmp", server).map((m) => m.id), ["srv"]);
  assert.equal(failSent([temp], "tmp")[0].failed, true);
  assert.equal(statusText(failSent([temp], "tmp")[0]), "Not sent");
  assert.equal(statusText(server), "Sent");
  const read = markMineRead([server, temp]);
  assert.equal(statusText(read[0]), "Read");
  assert.equal(read[1].readAt, null);
  assert.equal(mergeMessages([server], [server, msg("n", "2026-01-01T00:00:00Z")]).map((m) => m.id).join(), "n,srv");
});

import { counterpartIdentity, senderRuns } from "./ui-logic.ts";

test("counterpart identity is a stable masked mark", () => {
  const a = counterpartIdentity("employer", "abc-12gv9");
  assert.equal(a.label, "Candidate 2GV9");
  assert.equal(a.initials, "C2");
  assert.equal(counterpartIdentity("intern", "x").label, "Company X");
  assert.equal(counterpartIdentity("intern", "").code, "----");
});

test("sender runs break on sender change and long gaps", () => {
  const m = (mine: boolean, min: number) => ({ mine, createdAt: new Date(NOW + min * 60_000).toISOString() });
  const runs = senderRuns([m(true, 0), m(true, 2), m(false, 3), m(false, 30), m(false, 31)]);
  assert.deepEqual(runs.map((r) => r.items.length), [2, 1, 2]);
});
