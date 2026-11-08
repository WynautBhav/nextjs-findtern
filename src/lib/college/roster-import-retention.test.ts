import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ROSTER_IMPORT_RETENTION_DAYS,
  ROSTER_PURGE_BATCH,
  isRosterImportExpired,
  purgeExpiredRosterImports,
  rosterImportExpiry,
  type RosterPurgeStore,
} from "./roster-import-retention.ts";

const DAY = 86_400_000;

/** In-memory store: rows have an id and expiry, the audit log is an array. A transaction that throws restores the rows. */
function fakeStore(rows: { id: string; expiresAt: Date }[], opts: { auditFails?: boolean } = {}) {
  const state = { rows: [...rows], audits: [] as Record<string, unknown>[] };
  const store: RosterPurgeStore = {
    async transaction(fn) {
      const before = [...state.rows];
      const auditsBefore = [...state.audits];
      try {
        return await fn({
          async lockExpiredIds(now, limit) {
            return state.rows
              .filter((r) => r.expiresAt.getTime() <= now.getTime())
              .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
              .slice(0, limit)
              .map((r) => r.id);
          },
          async deleteIds(ids, now) {
            const n = state.rows.length;
            state.rows = state.rows.filter((r) => !(ids.includes(r.id) && r.expiresAt.getTime() <= now.getTime()));
            return n - state.rows.length;
          },
          async audit(meta) {
            if (opts.auditFails) throw new Error("audit down");
            state.audits.push(meta);
          },
        });
      } catch (e) {
        state.rows = before;
        state.audits = auditsBefore;
        throw e;
      }
    },
  };
  return { state, store };
}

const T0 = new Date("2026-11-08T00:00:00Z");

test("expiry is 30 days after the upload", () => {
  assert.equal(ROSTER_IMPORT_RETENTION_DAYS, 30);
  assert.equal(rosterImportExpiry(T0).getTime(), T0.getTime() + 30 * DAY);
});

test("expired means expires_at <= now, boundary included", () => {
  const exp = rosterImportExpiry(T0);
  assert.equal(isRosterImportExpired(exp, new Date(exp.getTime() - 1)), false);
  assert.equal(isRosterImportExpired(exp, exp), true);
});

test("deletes only expired rows, audits counts only", async () => {
  const { state, store } = fakeStore([
    { id: "old", expiresAt: new Date(T0.getTime() - DAY) },
    { id: "edge", expiresAt: T0 },
    { id: "fresh", expiresAt: new Date(T0.getTime() + DAY) },
  ]);
  const r = await purgeExpiredRosterImports(store, { now: T0 });
  assert.deepEqual(r, { deleted: 2, more: false });
  assert.deepEqual(state.rows.map((x) => x.id), ["fresh"]);
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0]?.deleted, 2);
  assert.deepEqual(Object.keys(state.audits[0] ?? {}).sort(), ["batch", "deleted", "expiredBefore", "retentionDays"]);
});

test("fake clock: the same row survives before expiry and goes after", async () => {
  const { state, store } = fakeStore([{ id: "a", expiresAt: rosterImportExpiry(T0) }]);
  assert.equal((await purgeExpiredRosterImports(store, { now: new Date(T0.getTime() + 29 * DAY) })).deleted, 0);
  assert.equal(state.rows.length, 1);
  assert.equal((await purgeExpiredRosterImports(store, { now: new Date(T0.getTime() + 31 * DAY) })).deleted, 1);
  assert.equal(state.rows.length, 0);
});

test("idempotent: a second run deletes nothing and writes no audit row", async () => {
  const { state, store } = fakeStore([{ id: "old", expiresAt: new Date(T0.getTime() - DAY) }]);
  await purgeExpiredRosterImports(store, { now: T0 });
  const again = await purgeExpiredRosterImports(store, { now: T0 });
  assert.deepEqual(again, { deleted: 0, more: false });
  assert.equal(state.audits.length, 1);
});

test("batch-limited: oldest first, more=true until the backlog is gone", async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, expiresAt: new Date(T0.getTime() - (10 - i) * DAY) }));
  const { state, store } = fakeStore(rows);
  const first = await purgeExpiredRosterImports(store, { now: T0, batch: 2 });
  assert.deepEqual(first, { deleted: 2, more: true });
  assert.deepEqual(state.rows.map((r) => r.id), ["r2", "r3", "r4"]);
  await purgeExpiredRosterImports(store, { now: T0, batch: 2 });
  const last = await purgeExpiredRosterImports(store, { now: T0, batch: 2 });
  assert.deepEqual(last, { deleted: 1, more: false });
  assert.equal(state.rows.length, 0);
});

test("default batch is bounded", () => {
  assert.ok(ROSTER_PURGE_BATCH > 0 && ROSTER_PURGE_BATCH <= 1000);
});

test("a failed audit write rolls the deletion back", async () => {
  const { state, store } = fakeStore([{ id: "old", expiresAt: new Date(T0.getTime() - DAY) }], { auditFails: true });
  await assert.rejects(purgeExpiredRosterImports(store, { now: T0 }), /audit down/);
  assert.equal(state.rows.length, 1);
});
