/**
 * The two money crons over HTTP against a real server, the real database and the Razorpay stub:
 *   GET /api/cron/email-outbox     auth, retry/backoff bookkeeping, no re-claim of a row that is backing off
 *   GET /api/cron/refund-reconcile auth, initiated -> refunded/failed from the stub, audit rows, idempotency,
 *                                  the age threshold, flags, a concurrent pair, and "reads only" towards Razorpay.
 *
 * Run through e2e/run.mjs (E2E_SPECS=money-crons): it starts the stub, sets CRON_SECRET and REFUND_RECONCILE=1,
 * and MAIL_MODE=log. Nothing here reaches Razorpay or sends mail.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { baseUrl, testDatabaseUrl } from "./lib/env.mjs";
import { closeDb, one, rows } from "./lib/db.mjs";
import { STUB_KEY_ID, STUB_KEY_SECRET, stubControl } from "./lib/razorpay-stub.mjs";

testDatabaseUrl();
const BASE = baseUrl();
const SECRET = process.env.E2E_CRON_SECRET;
const STUB = process.env.E2E_STUB_URL;
const stub = stubControl(STUB);
const RUN = Date.now().toString(36);
const auth = { authorization: `Bearer ${SECRET}` };

const cron = (path, headers = auth) => fetch(`${BASE}/api/cron/${path}`, { headers });
const refundCron = async () => (await cron("refund-reconcile")).json();

/** A refund entity made at the stub, the way Razorpay would have when the admin initiated it. */
async function stubRefund(paymentId, amount, receipt) {
  const res = await fetch(`${STUB}/v1/payments/${paymentId}/refund`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${STUB_KEY_ID}:${STUB_KEY_SECRET}`).toString("base64")}` },
    body: JSON.stringify({ amount, receipt }),
  });
  return res.json();
}

let seq = 0;
/** A paid intern payment + a refund row stuck in 'initiated'. */
async function stuckRefund({ gatewayRefundId, minutesOld = 120, amount = 250000, label, entity, entityAmount, byReceipt = false }) {
  const n = ++seq;
  const payId = `pay_e2e${RUN}${n}`;
  const [pay] = await rows(
    `INSERT INTO intern_payments (intern_id, gateway, order_id, payment_id, amount_minor, status, paid_at)
     VALUES ($1,'razorpay',$2,$3,$4,'paid', now() - interval '3 days') RETURNING id`,
    [`e2e-money-${RUN}-${n}`, `order_e2e${RUN}${n}`, payId, amount],
  );
  const key = `refund:${pay.id}:1`;
  // The entity Razorpay would hold for it: same payment id, same amount (unless a test says otherwise), receipt = the key.
  const g = entity ? await stubRefund(payId, entityAmount ?? amount, key.slice(0, 40)) : null;
  if (g && !byReceipt) gatewayRefundId = g.id;
  const [ref] = await rows(
    `INSERT INTO payment_refunds (intern_payment_id, amount_minor, status, gateway_refund_id, idempotency_key, reason, actor, initiated_at)
     VALUES ($1,$2,'initiated',$3,$4,$5,'e2e', now() - ($6 || ' minutes')::interval) RETURNING id`,
    [pay.id, amount, gatewayRefundId ?? null, key, `e2e ${label}`, String(minutesOld)],
  );
  return { id: ref.id, payId, payRowId: pay.id, key, amount, gateway: g };
}
const state = (id) => one(`SELECT status, amount_minor, gateway_refund_id, settled_at, raw FROM payment_refunds WHERE id = $1`, [id]);
const audits = (id) => rows(`SELECT admin_id, action, meta FROM admin_audit_log WHERE action = 'refund.reconcile' AND target_id = $1 ORDER BY created_at`, [id]);
const nonGetCalls = async () => (await stub.calls()).filter((c) => c.method !== "GET").length;

before(async () => {
  assert.ok(SECRET && STUB, "run through e2e/run.mjs: needs E2E_CRON_SECRET and E2E_STUB_URL");
  await stub.reset();
});
after(async () => {
  await rows(`DELETE FROM email_outbox WHERE campaign_id = $1`, [`e2e-money-${RUN}`]);
  await closeDb();
});

test("both crons refuse a missing, wrong or look-alike bearer", async () => {
  for (const path of ["email-outbox", "refund-reconcile"]) {
    for (const headers of [{}, { authorization: "Bearer wrong" }, { authorization: "Bearer undefined" }, { authorization: "Bearer " }, { authorization: SECRET }]) {
      const res = await cron(path, headers);
      assert.equal(res.status, 401, `${path} ${JSON.stringify(headers)}`);
    }
  }
});

test("email outbox: a failing row is tried once, records its error and backs off; a second tick does not re-claim it", async () => {
  const campaign = `e2e-money-${RUN}`;
  const [row] = await rows(
    `INSERT INTO email_outbox (campaign_id, entry_id, to_email, template, payload, idempotency_key) VALUES ($1,'entry-1','nobody@e2e.invalid','no_such_template','{}','${campaign}:entry-1:v0') RETURNING id`,
    [campaign],
  );
  const res = await cron("email-outbox");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.skipped, false);
  assert.ok(body.retried >= 1 && body.batches >= 1, JSON.stringify(body));
  const after1 = await one(`SELECT status, attempts, last_error, next_at > now() AS backing_off FROM email_outbox WHERE id = $1`, [row.id]);
  assert.equal(after1.status, "queued");
  assert.equal(after1.attempts, 1);
  assert.match(after1.last_error, /Unsupported outbox row/);
  assert.equal(after1.backing_off, true);
  await cron("email-outbox");
  assert.equal((await one(`SELECT attempts FROM email_outbox WHERE id = $1`, [row.id])).attempts, 1, "no second attempt while backing off");
});

test("refund reconcile: processed at Razorpay -> refunded, audited once with the gateway answer; repeat run changes nothing", async () => {
  const r = await stuckRefund({ entity: true, label: "processed" });
  const g = r.gateway;
  const posts = await nonGetCalls();
  const out = await refundCron();
  assert.equal(out.skipped, false, JSON.stringify(out));
  const s = await state(r.id);
  assert.equal(s.status, "refunded");
  assert.equal(s.amount_minor, 250000);
  assert.ok(s.settled_at);
  const a = await audits(r.id);
  assert.equal(a.length, 1);
  assert.equal(a[0].admin_id, "system:refund-reconcile");
  assert.deepEqual([a[0].meta.from, a[0].meta.to, a[0].meta.gatewayRefundId, a[0].meta.gatewayStatus], ["initiated", "refunded", g.id, "processed"]);
  await refundCron();
  assert.equal((await audits(r.id)).length, 1, "no second audit row");
  assert.equal((await state(r.id)).status, "refunded");
  assert.equal(await nonGetCalls(), posts, "reconcile only reads from Razorpay");
});

test("refund reconcile: pending stays initiated; once Razorpay says failed -> failed (and a failed row is final)", async () => {
  await stub.mode("pending");
  const r = await stuckRefund({ entity: true, label: "pending" });
  const g = r.gateway;
  await stub.mode("processed");
  await refundCron();
  const s1 = await state(r.id);
  assert.equal(s1.status, "initiated");
  assert.equal(s1.raw.reconcile.outcome, "pending");
  assert.equal((await audits(r.id)).length, 0);
  await stub.settle(g.id, "failed");
  await refundCron();
  assert.equal((await state(r.id)).status, "failed");
  assert.equal((await audits(r.id)).length, 1);
  await stub.settle(g.id, "processed");
  await refundCron();
  assert.equal((await state(r.id)).status, "failed", "a final row is never moved again");
});

test("refund reconcile: a refund younger than the threshold is left to its webhook", async () => {
  const r = await stuckRefund({ entity: true, minutesOld: 2, label: "young" });
  await refundCron();
  assert.equal((await state(r.id)).status, "initiated");
  assert.equal((await audits(r.id)).length, 0);
});

test("refund reconcile: unknown at Razorpay (404) or amount differing -> flagged once, row and amount untouched", async () => {
  const missing = await stuckRefund({ gatewayRefundId: `rfnd_e2e_missing_${RUN}`, label: "404" });
  const wrong = await stuckRefund({ entity: true, amount: 250000, entityAmount: 111, label: "amount" });
  await refundCron();
  await refundCron();
  for (const [r, flag] of [[missing, "not_found_at_gateway"], [wrong, "amount_mismatch"]]) {
    const s = await state(r.id);
    assert.equal(s.status, "initiated");
    assert.equal(s.amount_minor, 250000);
    assert.equal(s.raw.reconcile.flag, flag);
    const a = await audits(r.id);
    assert.equal(a.length, 1, `${flag} audited once across two runs`);
    assert.equal(a[0].meta.flag, flag);
  }
});

test("refund reconcile: no gateway id is found by receipt (the idempotency key) and its id recorded", async () => {
  const r = await stuckRefund({ entity: true, byReceipt: true, label: "by receipt" });
  const g = r.gateway;
  assert.equal((await state(r.id)).gateway_refund_id, null);
  await refundCron();
  const s = await state(r.id);
  assert.equal(s.status, "refunded");
  assert.equal(s.gateway_refund_id, g.id);
});

test("refund reconcile: Razorpay holding a different payment id than ours is flagged, not settled", async () => {
  const r = await stuckRefund({ label: "payment mismatch" });
  const g = await stubRefund(`pay_other${RUN}`, 250000, r.key.slice(0, 40));
  await rows(`UPDATE payment_refunds SET gateway_refund_id = $2 WHERE id = $1`, [r.id, g.id]);
  await refundCron();
  const s = await state(r.id);
  assert.equal(s.status, "initiated");
  assert.equal(s.raw.reconcile.flag, "payment_mismatch");
});

test("refund reconcile: two runs at once settle a refund once and write one audit row", async () => {
  const r = await stuckRefund({ entity: true, label: "concurrent" });
  const [a, b] = await Promise.all([refundCron(), refundCron()]);
  assert.equal(a.skipped || b.skipped, false);
  assert.equal((await state(r.id)).status, "refunded");
  assert.equal((await audits(r.id)).length, 1);
});

test("refund reconcile: a gateway read that throws (here: an id the client refuses to request) leaves the row alone", async () => {
  const r = await stuckRefund({ gatewayRefundId: `rfnd_not-valid/..${RUN}`, label: "bad id" }); // refused before any request is made
  const out = await refundCron();
  assert.ok(out.errors >= 1, JSON.stringify(out));
  const s = await state(r.id);
  assert.equal(s.status, "initiated");
  assert.equal(s.raw.reconcile.outcome, "error");
  assert.equal((await audits(r.id)).length, 0);
});
