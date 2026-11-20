import assert from "node:assert/strict";
import test from "node:test";

import { expiries, purgeExpired, type PurgeStore } from "./retention.ts";
import type { Flag } from "./review-types.ts";

const DAY = 86_400_000;
const T = new Date("2026-11-01T00:00:00Z");
const flag = (): Flag => ({ rule: "phone_number", severity: "high", snippet: "call me on 98765 43210", offsetSec: 12, speaker: "A", line: 3 });

test("text and summary live 90 days; flagged evidence 1 year; an unflagged transcript keeps nothing longer than the text", () => {
  const flagged = expiries(T, [flag()]);
  assert.equal(flagged.textExpiresAt.getTime(), T.getTime() + 90 * DAY);
  assert.equal(flagged.evidenceExpiresAt.getTime(), T.getTime() + 365 * DAY);
  const clean = expiries(T, []);
  assert.equal(clean.evidenceExpiresAt.getTime(), clean.textExpiresAt.getTime());
});

type Row = { id: string; textExp: Date; evExp: Date; text: string | null; summary: string | null; flags: Flag[] | null; textPurgedAt?: Date; evPurgedAt?: Date };
function store(rows: Row[]): PurgeStore {
  return {
    async purgeText(now, limit) {
      const hit = rows.filter((r) => r.textExp <= now && !r.textPurgedAt).slice(0, limit);
      for (const r of hit) { r.text = null; r.summary = null; r.textPurgedAt = now; }
      return hit.length;
    },
    async purgeEvidence(now, limit) {
      const hit = rows.filter((r) => r.evExp <= now && !r.evPurgedAt).slice(0, limit);
      for (const r of hit) { r.flags = null; r.evPurgedAt = now; }
      return hit.length;
    },
  };
}

test("purge deletes text at day 90 but keeps flagged evidence until day 365, and is idempotent", async () => {
  const e = expiries(T, [flag()]);
  const row: Row = { id: "a", textExp: e.textExpiresAt, evExp: e.evidenceExpiresAt, text: "full text", summary: "sum", flags: [flag()] };
  const s = store([row]);
  assert.deepEqual(await purgeExpired(s, new Date(T.getTime() + 89 * DAY)), { text: 0, evidence: 0 });
  assert.equal(row.text, "full text");
  assert.deepEqual(await purgeExpired(s, new Date(T.getTime() + 91 * DAY)), { text: 1, evidence: 0 });
  assert.equal(row.text, null);
  assert.equal(row.summary, null);
  assert.equal(row.flags?.length, 1, "evidence kept");
  assert.deepEqual(await purgeExpired(s, new Date(T.getTime() + 91 * DAY)), { text: 0, evidence: 0 }, "second run does nothing");
  assert.deepEqual(await purgeExpired(s, new Date(T.getTime() + 366 * DAY)), { text: 0, evidence: 1 });
  assert.equal(row.flags, null);
});

test("purge honours the batch limit", async () => {
  const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({ id: String(i), textExp: T, evExp: T, text: "x", summary: null, flags: null }));
  const s = store(rows);
  assert.deepEqual(await purgeExpired(s, new Date(T.getTime() + DAY), 2), { text: 2, evidence: 2 });
  assert.deepEqual(await purgeExpired(s, new Date(T.getTime() + DAY), 2), { text: 2, evidence: 2 });
});
