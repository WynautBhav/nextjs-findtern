import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { concurrent, windowEnd } from "./drive-window.ts";

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const w = (s: string, e: string, revoked?: string) => ({ startsAt: at(s), endsAt: at(e), revokedAt: revoked ? at(revoked) : null });
const now = at("2026-11-24").getTime();

test("one drive at a time: overlapping windows clash from now on; back-to-back, ended and closed-early ones don't", () => {
  // Both still to come and overlapping.
  assert.equal(concurrent(w("2026-11-25", "2026-11-30"), w("2026-11-28", "2026-12-05"), now), true);
  // One inside the other.
  assert.equal(concurrent(w("2026-11-25", "2026-12-10"), w("2026-11-28", "2026-11-29"), now), true);
  // Back to back: one ends exactly when the other starts.
  assert.equal(concurrent(w("2026-11-25", "2026-11-28"), w("2026-11-28", "2026-12-01"), now), false);
  // Their dates once overlapped, but one already ended: nothing left to clash.
  assert.equal(concurrent(w("2026-11-18", "2026-11-23"), w("2026-11-20", "2026-11-30"), now), false);
  // Closed early before the other opens.
  assert.equal(concurrent(w("2026-11-20", "2026-12-10", "2026-11-26"), w("2026-11-27", "2026-12-05"), now), false);
  assert.equal(windowEnd(w("2026-11-20", "2026-12-10", "2026-11-26")).toISOString(), at("2026-11-26").toISOString());
});

test("every way into a drive checks it: link/invite join, auto-join, officer invite, create and date edit", () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const join = src("../../app/api/drives/join/route.ts");
  assert.match(join, /lockEmployerDrives\(tx, guard\.session\.uid\)/);
  assert.match(join, /busyDriveFor\(tx, guard\.session\.uid, row\.drive, row\.drive\.id\)/);
  assert.match(join, /status: 409/);
  const auto = src("./campus-lock.ts");
  assert.match(auto, /lockEmployerDrives\(tx, employerId\)/);
  assert.match(auto, /busyDriveFor\(tx, employerId, d, d\.id\)/);
  assert.match(src("../../app/api/college/drives/[id]/invites/route.ts"), /blockedInvites\(tx,/);
  assert.match(src("../../app/api/college/drives/route.ts"), /blockedInvites\(getDb\(\)/);
  const patch = src("../../app/api/college/drives/[id]/route.ts");
  assert.match(patch, /blockedInvites\(getDb\(\)/);
  assert.match(patch, /busyDriveFor\(getDb\(\), e\.id, w, drive\.id\)/);
});
