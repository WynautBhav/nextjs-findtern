import assert from "node:assert/strict";
import test from "node:test";

import type { PgClient } from "../db/pg-tx.ts";
import { deriveDriveCode, hashDriveCode } from "./code-derive.ts";
import { entryBindingDecision, redeemDriveCode, RedeemRefused } from "./redeem-db.ts";

const secret = "s".repeat(40);
const code = deriveDriveCode("code-1", secret);

test("entry binding", () => {
  assert.equal(entryBindingDecision(null, "u1"), "bind");
  assert.equal(entryBindingDecision("u1", "u1"), "same");
  assert.equal(entryBindingDecision("u2", "u1"), "refuse");
});

function fakeClient(opts: { entryIntern: string | null; codeStatus?: string; paid?: boolean; orderStatus?: string }) {
  const log: string[] = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      log.push(sql);
      const r = (rows: Record<string, unknown>[] = [], rowCount = rows.length) => ({ rows, rowCount });
      if (sql.includes("FOR UPDATE OF c")) return r([{ code_id: "k1", entry_id: "e1", intern_id: opts.entryIntern }]);
      if (sql.includes("FROM college_memberships")) return r();
      if (sql.startsWith("SELECT id, order_id")) {
        assert.equal(params[0], hashDriveCode(code, secret));
        return r([{ id: "k1", order_id: "o1", status: opts.codeStatus ?? "issued", valid_until: "2027-01-01" }]);
      }
      if (sql.includes("FROM college_drive_orders WHERE id")) return r([{ id: "o1", college_id: "c1", status: opts.orderStatus ?? "paid" }]);
      if (sql.startsWith("UPDATE drive_codes") || sql.startsWith("UPDATE college_drive_orders")) return r([], 1);
      if (sql.includes("INSERT INTO drive_entitlements")) return r([{ id: "ent1" }]);
      if (sql.includes("FROM intern_payments")) return r(opts.paid ? [{ "?column?": 1 }] : []);
      if (sql.includes("INSERT INTO intern_payments")) return r([{ id: "pay1" }]);
      if (sql.includes("INSERT INTO college_consents")) return r([{ id: "con1" }]);
      if (sql.includes("FROM college_drive_orders o")) return r([{ college_name: "NIT", drive_title: null }]);
      return r([], 1);
    },
  };
  return { client: client as unknown as PgClient, log };
}
const input = { code, internId: "u1", secret, now: new Date("2026-11-07T00:00:00Z"), consentNotice: "n", declaredAdult: true };

test("someone else's entry is refused 403 before anything is written", async () => {
  const { client, log } = fakeClient({ entryIntern: "u2" });
  await assert.rejects(redeemDriveCode(client, input), (e) => e instanceof RedeemRefused && e.status === 403);
  assert.ok(!log.some((s) => s.startsWith("UPDATE") || s.startsWith("INSERT")));
});

test("success writes a waiver row without an invoice number, binds the entry, verifies membership", async () => {
  const { client, log } = fakeClient({ entryIntern: null });
  const out = await redeemDriveCode(client, input);
  assert.equal(out.collegeName, "NIT");
  assert.equal(out.driveTitle, undefined);
  const pay = log.find((s) => s.includes("INSERT INTO intern_payments"))!;
  assert.ok(!/invoice/i.test(pay));
  assert.ok(log.some((s) => s.startsWith("UPDATE drive_roster_entries")));
  assert.ok(log.some((s) => s.includes("'drive_code'")));
});

test("already redeemed is 409; an already-activated student is 409; no 18+ tick is 400", async () => {
  await assert.rejects(redeemDriveCode(fakeClient({ entryIntern: "u1", codeStatus: "redeemed" }).client, input), (e) => e instanceof RedeemRefused && e.status === 409);
  await assert.rejects(redeemDriveCode(fakeClient({ entryIntern: null, paid: true }).client, input), (e) => e instanceof RedeemRefused && e.status === 409);
  await assert.rejects(redeemDriveCode(fakeClient({ entryIntern: null }).client, { ...input, declaredAdult: false }), (e) => e instanceof RedeemRefused && e.status === 400);
});

test("a drive whose order is not paid refuses with 402 and writes no payment, consent or membership", async () => {
  for (const orderStatus of ["pending", "failed", "refunded"]) {
    const { client, log } = fakeClient({ entryIntern: null, orderStatus });
    await assert.rejects(redeemDriveCode(client, input), (e) => e instanceof RedeemRefused && e.status === 402 && /not active/.test(e.publicMessage), orderStatus);
    assert.ok(!log.some((s) => s.startsWith("INSERT")), `${orderStatus}: no insert ran`);
    assert.ok(!log.some((s) => s.startsWith("UPDATE drive_roster_entries")), `${orderStatus}: the entry stayed unbound`);
  }
});
