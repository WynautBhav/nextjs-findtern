import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lastSeenLabel, threadPresence, OFFLINE_AFTER_MS, presenceText, presenceView, PRESENCE_ONLINE } from "./presence-logic.ts";

const NOW = Date.parse("2026-11-08T10:00:00Z");
const ago = (ms: number) => new Date(NOW - ms);
const row = (ms: number, showActivity = true) => ({ showActivity, lastSeenAt: ago(ms) });
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("presenceView: the toggle", () => {
  it("on + fresh heartbeat is online", () => assert.deepEqual(presenceView(row(30_000), NOW), { state: "online" }));
  it("on + stale heartbeat is offline with a timestamp", () => {
    const v = presenceView(row(2 * HOUR), NOW);
    assert.equal(v.state, "offline");
  });
  it("off is hidden, whatever the heartbeat", () => {
    for (const ms of [0, 30_000, 5 * MIN, 3 * DAY, 90 * DAY]) assert.deepEqual(presenceView(row(ms, false), NOW), { state: "hidden" });
  });
  it("hidden carries no timestamp and no online bit", () => {
    const v = presenceView(row(1_000, false), NOW);
    assert.deepEqual(Object.keys(v), ["state"]);
    assert.equal(presenceText(v, NOW), null);
  });
  it("no row, null or garbage timestamps are hidden, indistinguishable from a hide", () => {
    assert.deepEqual(presenceView(null, NOW), { state: "hidden" });
    assert.deepEqual(presenceView(undefined, NOW), { state: "hidden" });
    assert.deepEqual(presenceView({ showActivity: true, lastSeenAt: null }, NOW), { state: "hidden" });
    assert.deepEqual(presenceView({ showActivity: true, lastSeenAt: "garbage" }, NOW), { state: "hidden" });
  });
});

describe("presenceView: expiry", () => {
  it("online up to 90 s, offline after", () => {
    assert.equal(presenceView(row(89_000), NOW).state, "online");
    assert.equal(presenceView(row(91_000), NOW).state, "offline");
  });
  it("a stale session never reads online however it was left", () => {
    assert.equal(presenceView(row(10 * MIN), NOW).state, "offline");
    assert.equal(presenceView(row(40 * DAY), NOW).state, "offline");
  });
  it("accepts ISO strings", () => {
    assert.equal(presenceView({ showActivity: true, lastSeenAt: ago(10_000).toISOString() }, NOW).state, "online");
  });
});

describe("labels", () => {
  it("online reads Active now", () => assert.equal(presenceText({ state: "online" }, NOW), PRESENCE_ONLINE));
  it("is coarse: minutes in fives, then hours, then days", () => {
    assert.equal(lastSeenLabel(ago(2 * MIN), NOW), "Last seen a few minutes ago");
    assert.equal(lastSeenLabel(ago(7 * MIN), NOW), "Last seen 5m ago");
    assert.equal(lastSeenLabel(ago(59 * MIN), NOW), "Last seen 55m ago");
    assert.equal(lastSeenLabel(ago(2 * HOUR + 40 * MIN), NOW), "Last seen 2h ago");
    assert.equal(lastSeenLabel(ago(23 * HOUR), NOW), "Last seen 23h ago");
    assert.equal(lastSeenLabel(ago(3 * DAY + HOUR), NOW), "Last seen 3d ago");
    assert.equal(lastSeenLabel(ago(29 * DAY), NOW), "Last seen 29d ago");
  });
  it("offline for 30 days or more says Offline only", () => {
    assert.equal(lastSeenLabel(ago(OFFLINE_AFTER_MS), NOW), "Offline");
    assert.equal(lastSeenLabel(ago(200 * DAY), NOW), "Offline");
  });
  it("a clock-skewed future time does not throw or go negative", () => {
    assert.equal(lastSeenLabel(new Date(NOW + HOUR), NOW), "Last seen a few minutes ago");
  });
});

describe("threadPresence: who sees what in a thread", () => {
  const online = presenceView(row(10_000), NOW);
  const stale = presenceView(row(3 * HOUR), NOW);
  const hidden = presenceView(row(10_000, false), NOW);

  it("employer viewer gets the candidate's label, or nothing when hidden", () => {
    assert.deepEqual(threadPresence("employer", online, NOW), { online: true, label: PRESENCE_ONLINE });
    assert.deepEqual(threadPresence("employer", stale, NOW), { online: false, label: "Last seen 3h ago" });
    assert.deepEqual(threadPresence("employer", hidden, NOW), { online: false, label: null });
    assert.deepEqual(threadPresence("employer", undefined, NOW), { online: false, label: null });
  });
  it("candidate viewer only ever gets Online / Offline for an employer, never a last-seen label", () => {
    assert.deepEqual(threadPresence("intern", online, NOW), { online: true, label: "Online" });
    for (const v of [stale, hidden, undefined, presenceView(row(40 * DAY), NOW)]) {
      assert.deepEqual(threadPresence("intern", v, NOW), { online: false, label: "Offline" });
    }
  });
});
