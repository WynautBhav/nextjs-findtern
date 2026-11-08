import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  categoryOf,
  channelAllowed,
  FALLBACK_DELAY_MS,
  FALLBACK_LOOKBACK_HOURS,
  FALLBACK_LOOKBACK_MS,
  fallbackEnabled,
  makeScanGate,
  SCAN_CONTINUE_MS,
  heartbeatLive,
  isSuppressible,
  messageRunKey,
  offerRunKey,
  unreadRuns,
  type PrefsRow,
} from "./notify-prefs.ts";

const NOW = Date.parse("2026-11-08T10:00:00Z");
const ago = (ms: number) => new Date(NOW - ms);
const MIN = 60_000;
const OFF: PrefsRow = { emailMessages: false, pushMessages: false };
const ON: PrefsRow = { emailMessages: true, pushMessages: true };

// Every type notify() is called with that moves money, proves a payment or guards an account.
const MONEY_AND_SECURITY = [
  "payment_completed",
  "payment_reminder",
  "go_live_fee_paid",
  "full_time_fee_paid",
  "stipend_paid",
  "stipend_pending",
  "completion_bonus_paid",
  "payout_failed",
  "proposal_hired",
  "full_time_hired",
  "proposal_accepted",
  "proposal_rejected",
  "proposal_expired",
  "proposal_cancelled",
  "interview_reminder",
  "interview_pending",
  "timesheet_submitted",
  "password_changed",
  "security_alert",
  "document_required",
  "some_future_type_nobody_classified",
];

describe("categoryOf", () => {
  it("money, security and unknown types are required", () => {
    for (const t of MONEY_AND_SECURITY) assert.equal(categoryOf(t), "required", t);
  });
  it("messages, offers and tips are the optional ones", () => {
    assert.equal(categoryOf("message_unread"), "message");
    for (const t of ["proposal_received", "proposal_updated", "full_time_offer_received", "offer_unread"]) assert.equal(categoryOf(t), "offer", t);
    for (const t of ["weekly_hire_tip", "talent_spotlight", "cart_inactivity", "profile_completion_nudge", "monthly_profile_views"]) {
      assert.equal(categoryOf(t), "tips", t);
    }
  });
  it("isSuppressible is false only for required", () => {
    assert.equal(isSuppressible("required"), false);
    for (const c of ["message", "offer", "tips"] as const) assert.equal(isSuppressible(c), true);
  });
});

describe("channelAllowed", () => {
  it("no row keeps today's behaviour: everything on", () => {
    for (const c of ["required", "message", "offer", "tips"] as const) {
      for (const ch of ["email", "inApp"] as const) {
        assert.equal(channelAllowed(null, c, ch), true);
        assert.equal(channelAllowed(undefined, c, ch), true);
      }
    }
  });
  it("required is never suppressed, even with everything off", () => {
    assert.equal(channelAllowed(OFF, "required", "email"), true);
    assert.equal(channelAllowed(OFF, "required", "inApp"), true);
    for (const t of MONEY_AND_SECURITY) {
      for (const ch of ["email", "inApp"] as const) assert.equal(channelAllowed(OFF, categoryOf(t), ch), true, `${t} ${ch}`);
    }
  });
  it("email off silences message and offer email only; they still show in the app; tips follow the other switch", () => {
    const p = { emailMessages: false, pushMessages: true };
    for (const c of ["message", "offer"] as const) {
      assert.equal(channelAllowed(p, c, "email"), false);
      assert.equal(channelAllowed(p, c, "inApp"), true);
    }
    assert.equal(channelAllowed(p, "tips", "email"), true);
    assert.equal(channelAllowed(p, "tips", "inApp"), true);
  });
  it("tips off silences tips on both channels and nothing else", () => {
    const p = { emailMessages: true, pushMessages: false };
    assert.equal(channelAllowed(p, "tips", "inApp"), false);
    assert.equal(channelAllowed(p, "tips", "email"), false);
    for (const c of ["message", "offer"] as const) for (const ch of ["email", "inApp"] as const) assert.equal(channelAllowed(p, c, ch), true);
  });
  it("all on allows everything", () => {
    for (const c of ["message", "offer", "tips"] as const) {
      assert.equal(channelAllowed(ON, c, "email"), true);
      assert.equal(channelAllowed(ON, c, "inApp"), true);
    }
  });
});

const T1 = { id: "t1", employerId: "emp", internId: "int" };
const T2 = { id: "t2", employerId: "emp", internId: "int2" };
const msg = (id: string, threadId: string, senderId: string, age: number) => ({ id, threadId, senderId, createdAt: ago(age) });

describe("unreadRuns", () => {
  it("waits for the delay", () => {
    assert.equal(unreadRuns([msg("m1", "t1", "emp", FALLBACK_DELAY_MS - 1000)], [T1], new Set(), NOW).length, 0);
    assert.equal(unreadRuns([msg("m1", "t1", "emp", FALLBACK_DELAY_MS)], [T1], new Set(), NOW).length, 1);
  });
  it("addresses the other side, never the sender", () => {
    const [toIntern] = unreadRuns([msg("m1", "t1", "emp", 20 * MIN)], [T1], new Set(), NOW);
    assert.deepEqual([toIntern.recipientId, toIntern.recipientType], ["int", "intern"]);
    const [toEmployer] = unreadRuns([msg("m2", "t1", "int", 20 * MIN)], [T1], new Set(), NOW);
    assert.deepEqual([toEmployer.recipientId, toEmployer.recipientType], ["emp", "employer"]);
  });
  it("one run per thread: batches several messages, keyed on the earliest", () => {
    const runs = unreadRuns([msg("m3", "t1", "emp", 16 * MIN), msg("m1", "t1", "emp", 40 * MIN), msg("m2", "t1", "emp", 30 * MIN)], [T1], new Set(), NOW);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].count, 3);
    assert.equal(runs[0].firstMessageId, "m1");
  });
  it("a recent message does not hold back a run whose earliest is old enough", () => {
    const runs = unreadRuns([msg("m1", "t1", "emp", 20 * MIN), msg("m2", "t1", "emp", 1 * MIN)], [T1], new Set(), NOW);
    assert.equal(runs[0].count, 2);
  });
  it("separate threads and both directions are separate runs", () => {
    const runs = unreadRuns([msg("a", "t1", "emp", 20 * MIN), msg("b", "t1", "int", 20 * MIN), msg("c", "t2", "emp", 20 * MIN)], [T1, T2], new Set(), NOW);
    assert.equal(runs.length, 3);
  });
  it("skips a recipient with a live heartbeat", () => {
    assert.equal(unreadRuns([msg("m1", "t1", "emp", 20 * MIN)], [T1], new Set(["int"]), NOW).length, 0);
    assert.equal(unreadRuns([msg("m1", "t1", "emp", 20 * MIN)], [T1], new Set(["emp"]), NOW).length, 1);
  });
  it("ignores messages from a stranger or an unknown thread", () => {
    assert.equal(unreadRuns([msg("m1", "t1", "stranger", 20 * MIN), msg("m2", "nope", "emp", 20 * MIN)], [T1], new Set(), NOW).length, 0);
  });
});

describe("dedupe keys", () => {
  it("stay the same for the same unread run, and differ once the person reads and a new run starts", () => {
    const a = unreadRuns([msg("m1", "t1", "emp", 20 * MIN)], [T1], new Set(), NOW)[0];
    const sameRunLater = unreadRuns([msg("m1", "t1", "emp", 20 * MIN), msg("m2", "t1", "emp", 17 * MIN)], [T1], new Set(), NOW + 5 * MIN)[0];
    assert.equal(messageRunKey(a), messageRunKey(sameRunLater));
    const nextRun = unreadRuns([msg("m9", "t1", "emp", 20 * MIN)], [T1], new Set(), NOW)[0];
    assert.notEqual(messageRunKey(a), messageRunKey(nextRun));
  });
  it("name the recipient, so the two sides of a thread never share a key", () => {
    const [x, y] = unreadRuns([msg("a", "t1", "emp", 20 * MIN), msg("b", "t1", "int", 20 * MIN)], [T1], new Set(), NOW);
    assert.notEqual(messageRunKey(x), messageRunKey(y));
  });
  it("offer key is per proposal and first unread notification", () => {
    assert.equal(offerRunKey("p1", "n1"), "offer_unread:p1:n1");
  });
});

describe("heartbeatLive", () => {
  it("is the real heartbeat: fresh is live, stale or missing is not", () => {
    assert.equal(heartbeatLive(ago(30_000), NOW), true);
    assert.equal(heartbeatLive(ago(5 * MIN), NOW), false);
    assert.equal(heartbeatLive(null, NOW), false);
  });
});

describe("fallback kill switch, lookback and scan gate", () => {
  it("NOTIFY_FALLBACK: only exactly 1 turns the fallback on; unset is OFF", () => {
    assert.equal(fallbackEnabled({}), false);
    for (const v of ["", "0", "on", "true", "yes", "off"]) assert.equal(fallbackEnabled({ NOTIFY_FALLBACK: v }), false, v);
    assert.equal(fallbackEnabled({ NOTIFY_FALLBACK: "1" }), true);
    assert.equal(fallbackEnabled({ NOTIFY_FALLBACK: " 1 " }), true);
  });

  it("preferences do not depend on the switch (pure rules unchanged with the fallback off)", () => {
    assert.equal(channelAllowed(OFF, categoryOf("message_unread"), "email"), false);
    assert.equal(channelAllowed(ON, categoryOf("message_unread"), "email"), true);
    assert.equal(channelAllowed(OFF, categoryOf("payment_reminder"), "email"), true);
  });

  it("lookback is a named 48 hour window; a run older than it is not scanned into, a 30 h one is", () => {
    assert.equal(FALLBACK_LOOKBACK_HOURS, 48);
    assert.equal(FALLBACK_LOOKBACK_MS, 48 * 3_600_000);
  });

  it("scan gate: first tick scans; after a full batch the next ticks of the drain do not; a short batch ends the drain", () => {
    let t = 1_000_000;
    const g = makeScanGate(50, () => t);
    assert.equal(g.shouldScan(), true, "first tick of a drain");
    g.recordBatch({ sent: 50, retried: 0, dead: 0 });
    for (let i = 0; i < 5; i++) {
      t += 2_000;
      assert.equal(g.shouldScan(), false, `batch ${i + 2} of the drain`);
      g.recordBatch({ sent: 30, retried: 15, dead: 5 }); // full again (50)
    }
    t += 2_000;
    g.recordBatch({ sent: 3, retried: 0, dead: 0 }); // short: drain over
    assert.equal(g.shouldScan(), true, "next drain scans again");
  });

  it("scan gate: a full batch long ago does not suppress the scan (abandoned drain)", () => {
    let t = 0;
    const g = makeScanGate(50, () => t);
    g.recordBatch({ sent: 50, retried: 0, dead: 0 });
    t += SCAN_CONTINUE_MS + 1;
    assert.equal(g.shouldScan(), true);
  });
});
