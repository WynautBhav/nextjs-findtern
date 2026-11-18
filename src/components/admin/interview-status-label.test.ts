import assert from "node:assert/strict";
import { test } from "node:test";

import { humanizeStatus } from "../app/status.ts";
import { toneForStatus } from "../../lib/admin/status-tone.ts";
import { interviewLifecycle } from "../../lib/interview-lifecycle.ts";

// The chip prints humanizeStatus(lifecycle.status): a passed meeting must print "Expired", in the danger tone, never "Scheduled".
const NOW = Date.parse("2026-11-18T10:00:00Z");
const row = (status: string, startOffsetMin: number) => ({ status, slot1: new Date(NOW + startOffsetMin * 60_000), slot2: null, slot3: null, selectedSlot: 1 });

test("the chip text and tone for the owner's two rows and the neighbours", () => {
  const printed = (status: string, off: number) => humanizeStatus(interviewLifecycle(row(status, off), NOW).status);
  assert.equal(printed("scheduled", -330), "Expired"); // Wed 18 Nov 7:45 pm GMT+11 = 14:15 IST, seen at 15:30 IST
  assert.equal(printed("scheduled", -2 * 1440), "Expired"); // Mon 16 Nov
  assert.equal(printed("scheduled", 120), "Scheduled");
  assert.equal(printed("completed", -2 * 1440), "Completed");
  assert.equal(printed("cancelled", -2 * 1440), "Cancelled");
  assert.equal(toneForStatus("expired"), "danger");
});

test("the employer schedule and the lifecycle use the same label", () => {
  assert.equal(interviewLifecycle(row("scheduled", -330), NOW).label, "Expired");
});
