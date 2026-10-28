import test from "node:test";
import assert from "node:assert/strict";

import { compareDrives } from "./access.ts";

const now = Date.parse("2026-10-28T12:00:00Z");
const d = (id: string, start: string, end: string, revoked?: string) => ({
  id,
  startsAt: new Date(start),
  endsAt: new Date(end),
  revokedAt: revoked ? new Date(revoked) : null,
});

test("QA-013: live drives first, then upcoming, then closed", () => {
  const drives = [
    d("closed-recent", "2026-10-01", "2026-10-20"),
    d("live", "2026-10-25", "2026-11-04"),
    d("upcoming-later", "2026-12-01", "2026-12-10"),
    d("closed-old", "2026-08-01", "2026-08-10"),
    d("upcoming-soon", "2026-11-10", "2026-11-20"),
    d("revoked", "2026-10-20", "2026-11-30", "2026-10-26"),
  ];
  const order = [...drives].sort((a, b) => compareDrives(a, b, now)).map((x) => x.id);
  assert.deepEqual(order, ["live", "upcoming-soon", "upcoming-later", "revoked", "closed-recent", "closed-old"]);
});
