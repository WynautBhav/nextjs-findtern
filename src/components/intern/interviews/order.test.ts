import assert from "node:assert/strict";
import { test } from "node:test";

import type { InterviewRow } from "../../../lib/journey.ts";
import { splitUpcoming } from "./order.ts";

const row = (id: string, selectedSlot: number | null, ...slots: string[]): InterviewRow =>
  ({ id, selectedSlot, slot1: slots[0] ? new Date(slots[0]) : null, slot2: slots[1] ? new Date(slots[1]) : null, slot3: slots[2] ? new Date(slots[2]) : null }) as unknown as InterviewRow;

test("rounds to pick come first; booked ones follow soonest first by the chosen slot", () => {
  const late = row("late", 1, "2026-11-19T10:00:00Z");
  const pick = row("pick", null, "2026-11-10T10:00:00Z", "2026-11-11T10:00:00Z");
  // Slot 2 chosen: the 9th, though slot 1 is the 30th.
  const soon = row("soon", 2, "2026-11-30T10:00:00Z", "2026-11-09T10:00:00Z");
  const { toPick, booked } = splitUpcoming([late, pick, soon]);
  assert.deepEqual(toPick.map((i) => i.id), ["pick"]);
  assert.deepEqual(booked.map((i) => i.id), ["soon", "late"]);
});
