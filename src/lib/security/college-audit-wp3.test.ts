import assert from "node:assert/strict";
import test from "node:test";

import type { PgClient } from "../db/pg-tx.ts";
import { deriveDriveCode } from "../drives/code-derive.ts";
import { redeemDriveCode, RedeemRefused } from "../drives/redeem-db.ts";

/**
 * WP3 (college audit): a student the placement officer DENIED must not come back through a drive code.
 * college_denials has a trigger that refuses the membership write, but that surfaces as a raw database error
 * (a 500) after the code and the fee waiver were touched; the redeem must refuse first, with the same neutral
 * 403 as a code from another college. A student whose leave was approved (membership ended, no denial) may redeem.
 */
const secret = "s".repeat(40);
const code = deriveDriveCode("code-1", secret);
const input = { code, internId: "u1", secret, now: new Date("2026-11-07T00:00:00Z"), consentNotice: "n", declaredAdult: true };

function fakeClient(opts: { denied: boolean }) {
  const log: string[] = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      log.push(sql);
      const r = (rows: Record<string, unknown>[] = [], rowCount = rows.length) => ({ rows, rowCount });
      if (sql.includes("FROM college_denials")) {
        assert.deepEqual(params, ["c1", "u1"]);
        return r(opts.denied ? [{ "?column?": 1 }] : []);
      }
      if (sql.includes("FOR UPDATE OF c")) return r([{ code_id: "k1", entry_id: "e1", intern_id: null }]);
      if (sql.includes("FROM college_memberships")) return r(); // left or never joined: no live membership
      if (sql.startsWith("SELECT id, order_id")) return r([{ id: "k1", order_id: "o1", status: "issued", valid_until: "2027-01-01" }]);
      if (sql.includes("FROM college_drive_orders WHERE id")) return r([{ id: "o1", college_id: "c1", status: "paid" }]);
      if (sql.startsWith("UPDATE drive_codes") || sql.startsWith("UPDATE college_drive_orders")) return r([], 1);
      if (sql.includes("INSERT INTO drive_entitlements")) return r([{ id: "ent1" }]);
      if (sql.includes("FROM intern_payments")) return r();
      if (sql.includes("INSERT INTO intern_payments")) return r([{ id: "pay1" }]);
      if (sql.includes("INSERT INTO college_consents")) return r([{ id: "con1" }]);
      if (sql.includes("FROM college_drive_orders o")) return r([{ college_name: "NIT", drive_title: null }]);
      return r([], 1);
    },
  };
  return { client: client as unknown as PgClient, log };
}

test("WP3-redeem: a student the college denied is refused 403 before any membership or payment write", async () => {
  const { client, log } = fakeClient({ denied: true });
  await assert.rejects(redeemDriveCode(client, input), (e) => e instanceof RedeemRefused && e.status === 403 && /not valid for your college/.test(e.publicMessage));
  assert.ok(!log.some((s) => s.includes("INSERT INTO college_memberships")), "the membership was written");
  assert.ok(!log.some((s) => s.includes("INSERT INTO intern_payments")), "a fee waiver was written");
});

test("WP3-redeem: a student whose leave ended (no denial) may redeem and gets a fresh verified membership", async () => {
  const { client, log } = fakeClient({ denied: false });
  const out = await redeemDriveCode(client, input);
  assert.equal(out.collegeId, "c1");
  assert.ok(log.some((s) => s.includes("INSERT INTO college_memberships") && s.includes("left_at = NULL")));
});
