import assert from "node:assert/strict";
import { test } from "node:test";

import { isoToIstInput, istInputToIso } from "./promo-form-time.ts";

test("a typed date-time is IST wall time, whatever the browser's zone is", () => {
  assert.equal(istInputToIso("2026-11-30T23:59"), "2026-11-30T18:29:00.000Z");
  assert.equal(istInputToIso("2026-12-01T00:00"), "2026-11-30T18:30:00.000Z");
});

test("an end date of 1 Dec 00:00 IST is not read as 30 Nov in any other zone", () => {
  const zones = ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland"];
  for (const tz of zones) {
    const prev = process.env.TZ;
    process.env.TZ = tz;
    try {
      assert.equal(istInputToIso("2026-12-01T00:00"), "2026-11-30T18:30:00.000Z", tz);
      assert.equal(isoToIstInput("2026-11-30T18:30:00.000Z"), "2026-12-01T00:00", tz);
    } finally {
      if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
    }
  }
});

test("round trip, and empty or invalid input", () => {
  assert.equal(isoToIstInput(istInputToIso("2027-02-28T09:05")!), "2027-02-28T09:05");
  assert.equal(istInputToIso(""), null);
  assert.equal(istInputToIso("not a date"), null);
  assert.equal(isoToIstInput(null), "");
  assert.equal(isoToIstInput(new Date("2026-11-30T18:30:00.000Z")), "2026-12-01T00:00");
});
