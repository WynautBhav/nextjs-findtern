import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET ||= "test-session-secret-at-least-32-chars-long";

const { driveWindow, compareDrives } = await import("../college/access.ts");
const { toLocalInput, fromLocalInput } = await import("../college/ist.ts");
const { shortDateTime } = await import("../format.ts");

const IST = "Asia/Kolkata";
const fmt = (d: Date) => shortDateTime(d, { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const at = (iso: string) => new Date(iso).getTime();

// T1: a drive that ends at 23:59 IST and one that starts at 00:00 IST the next day.
const ends2359 = { startsAt: new Date("2026-11-20T04:30:00Z"), endsAt: new Date("2026-11-23T18:29:00Z"), revokedAt: null }; // 10:00 IST 20 Nov to 23:59 IST 23 Nov
const starts0000 = { startsAt: new Date("2026-11-23T18:30:00Z"), endsAt: new Date("2026-11-30T18:30:00Z"), revokedAt: null }; // 00:00 IST 24 Nov

test("T1 active/past split follows the instant, at 23:58 IST, 00:01 IST and 05:31 IST (UTC midnight)", () => {
  // 23:58 IST on 23 Nov = 18:28Z
  assert.equal(driveWindow(ends2359, at("2026-11-23T18:28:00Z")), "live");
  assert.equal(driveWindow(starts0000, at("2026-11-23T18:28:00Z")), "upcoming");
  // 00:01 IST on 24 Nov = 18:31Z
  assert.equal(driveWindow(ends2359, at("2026-11-23T18:31:00Z")), "ended");
  assert.equal(driveWindow(starts0000, at("2026-11-23T18:31:00Z")), "live");
  // 05:31 IST on 24 Nov = 00:01Z on 24 Nov: UTC midnight has passed, nothing changes
  assert.equal(driveWindow(ends2359, at("2026-11-24T00:01:00Z")), "ended");
  assert.equal(driveWindow(starts0000, at("2026-11-24T00:01:00Z")), "live");
  // 18:29:00Z exactly: the first drive has ended (ends are exclusive), the second not yet begun; 18:30:00Z: live
  assert.equal(driveWindow(ends2359, at("2026-11-23T18:29:00Z")), "ended");
  assert.equal(driveWindow(starts0000, at("2026-11-23T18:29:30Z")), "upcoming");
  assert.equal(driveWindow(starts0000, at("2026-11-23T18:30:00Z")), "live");
});

test("T1 list order at the boundary: live first, then the one that just ended", () => {
  const now = at("2026-11-23T18:31:00Z");
  const sorted = [ends2359, starts0000].sort((a, b) => compareDrives(a, b, now));
  assert.equal(sorted[0], starts0000);
});

test("T1 the times shown are IST wall clock at both ends of the IST day", () => {
  assert.equal(fmt(ends2359.endsAt), "23 Nov, 11:59 pm");
  assert.equal(fmt(starts0000.startsAt), "24 Nov, 12:00 am");
  assert.equal(fmt(new Date("2026-11-24T00:01:00Z")), "24 Nov, 5:31 am");
});

test("T1 builder input: typed IST wall time round-trips across IST midnight", () => {
  assert.equal(fromLocalInput("2026-11-23T23:59"), "2026-11-23T18:29:00.000Z");
  assert.equal(fromLocalInput("2026-11-24T00:00"), "2026-11-23T18:30:00.000Z");
  assert.equal(toLocalInput(new Date("2026-11-23T18:30:00Z")), "2026-11-24T00:00");
  assert.equal(toLocalInput(new Date("2026-11-23T18:29:00Z")), "2026-11-23T23:59");
  for (const v of ["2026-12-31T23:59", "2027-01-01T00:00", "2026-03-29T02:30"]) assert.equal(toLocalInput(new Date(fromLocalInput(v))), v);
});

// Every college date that is formatted in a client component or on a server must name its zone, else the server's and the
// browser's zone disagree (React #418) or the day is wrong in the evening. Found on the leave requests table; was open
// as a REQUEST to WP5 (src/components/college/leave-requests-table.tsx:13). Fixed in INT-06 (ist.ts: istDay).
import { readFileSync } from "node:fs";
test("T1 no college screen formats a date without the IST zone (INT-06)", () => {
  const offenders: string[] = [];
  for (const f of ["src/components/college/leave-requests-table.tsx", "src/app/college/drive-dashboard.tsx"]) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/toLocale(?:Date|Time)String\(("en-IN"|"en-GB"|undefined)?(?:,\s*\{[^}]*\})?\)/g)) if (!/timeZone/.test(m[0])) offenders.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(offenders, []);
});

import { istDay } from "../college/ist.ts";
test("INT-06 istDay shows the IST day whatever the host zone is (20:00 UTC on 23 Nov is already 24 Nov in IST)", () => {
  assert.equal(istDay("2026-11-23T20:00:00Z"), "24 Nov 2026");
  assert.equal(istDay("2026-11-23T18:29:00Z"), "23 Nov 2026");
  assert.equal(istDay("2026-11-23T20:00:00Z", "numeric"), "24/11/2026");
});
