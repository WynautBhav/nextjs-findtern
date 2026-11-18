import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  categoryOf,
  channelAllowed,
  FALLBACK_LOOKBACK_HOURS,
  FALLBACK_LOOKBACK_MS,
  fallbackEnabled,
  makeScanGate,
  SCAN_CONTINUE_MS,
  heartbeatLive,
  isSuppressible,
  offerRunKey,
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
  it("a removed message_unread type is no longer optional: unclassified is required (fail closed)", () => {
    assert.equal(categoryOf("message_unread"), "required");
  });
  it("offers and tips are the optional ones", () => {
    for (const t of ["proposal_updated", "offer_unread"]) assert.equal(categoryOf(t), "offer", t);
    for (const t of ["weekly_hire_tip", "talent_spotlight", "cart_inactivity", "profile_completion_nudge", "monthly_profile_views"]) {
      assert.equal(categoryOf(t), "tips", t);
    }
  });
  it("the first proposal and full-time offer emails are required: the email switch cannot silence them", () => {
    for (const t of ["proposal_received", "full_time_offer_received"]) {
      assert.equal(categoryOf(t), "required", t);
      for (const ch of ["email", "inApp"] as const) {
        assert.equal(channelAllowed({ emailMessages: false, pushMessages: false }, categoryOf(t), ch), true, `${t} ${ch}`);
      }
    }
  });
  it("isSuppressible is false only for required", () => {
    assert.equal(isSuppressible("required"), false);
    for (const c of ["offer", "tips"] as const) assert.equal(isSuppressible(c), true);
  });
});

describe("channelAllowed", () => {
  it("no row keeps today's behaviour: everything on", () => {
    for (const c of ["required", "offer", "tips"] as const) {
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
  it("email off silences offer email only; it still shows in the app; tips follow the other switch", () => {
    const p = { emailMessages: false, pushMessages: true };
    for (const c of ["offer"] as const) {
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
    for (const c of ["offer"] as const) for (const ch of ["email", "inApp"] as const) assert.equal(channelAllowed(p, c, ch), true);
  });
  it("all on allows everything", () => {
    for (const c of ["offer", "tips"] as const) {
      assert.equal(channelAllowed(ON, c, "email"), true);
      assert.equal(channelAllowed(ON, c, "inApp"), true);
    }
  });
});

describe("dedupe keys", () => {
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
    assert.equal(channelAllowed(OFF, categoryOf("offer_unread"), "email"), false);
    assert.equal(channelAllowed(ON, categoryOf("offer_unread"), "email"), true);
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
