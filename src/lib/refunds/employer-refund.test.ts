import assert from "node:assert/strict";
import test from "node:test";

import { orderRefunds } from "../refund-accounting.ts";
import { recordEmployerRefund, type EmployerRefundEvent } from "./employer-refund.ts";

/** A one-table fake of employer_payments: enough SQL to prove the order of operations, with no database. */
function fakeClient(rows: Record<string, { id: string; status: string; amount_minor: number; currency: string; raw: Record<string, unknown> }>) {
  const log: string[] = [];
  return {
    log,
    rows,
    async query(sql: string, params: unknown[] = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      log.push(q.split(" ")[0]);
      if (q.startsWith("SELECT")) {
        assert.match(q, /FOR UPDATE/, "the order row is locked before the refund list is read");
        const r = Object.values(rows).find((x) => (x as { payment_id?: string }).payment_id === params[0]);
        return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
      }
      if (q.startsWith("UPDATE")) {
        assert.doesNotMatch(q, /status\s*=/, "the order's status label is not rewritten: the payment stays as recorded");
        const r = rows[String(params[0])];
        r.raw = JSON.parse(String(params[1]));
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected ${q}`);
    },
  };
}
const order = (amount = 2_900_000) => ({ "o1": { id: "o1", payment_id: "pay_1", status: "paid", amount_minor: amount, currency: "INR", raw: { notes: { proposalIds: ["h1"] } } } }) as never;
const ev = (over: Partial<EmployerRefundEvent> = {}): EmployerRefundEvent => ({ id: "rfnd_1", payment_id: "pay_1", amount: 1_000_000, status: "processed", created_at: 1_790_000_000, ...over });

test("a processed refund event is stored on the order's refund list", async () => {
  const c = fakeClient(order());
  assert.equal(await recordEmployerRefund(c, ev()), "recorded");
  assert.equal(orderRefunds({ status: "paid", amountMinor: 2_900_000, currency: "INR", raw: c.rows.o1.raw }).refundedMinor, 1_000_000);
});

test("the same event delivered twice counts once", async () => {
  const c = fakeClient(order());
  assert.equal(await recordEmployerRefund(c, ev()), "recorded");
  assert.equal(await recordEmployerRefund(c, ev()), "duplicate");
  assert.equal(orderRefunds({ status: "paid", amountMinor: 2_900_000, currency: "INR", raw: c.rows.o1.raw }).refundedMinor, 1_000_000);
  assert.equal(c.log.filter((x) => x === "UPDATE").length, 1);
});

test("a refund larger than what was paid is refused and nothing is written", async () => {
  const c = fakeClient(order(500_000));
  assert.equal(await recordEmployerRefund(c, ev()), "over_paid");
  assert.equal(c.log.includes("UPDATE"), false);
});

test("a refund for a payment that is not an employer order, or a failed event, is not recorded", async () => {
  assert.equal(await recordEmployerRefund(fakeClient(order()), ev({ payment_id: "pay_other" })), "not_employer");
  assert.equal(await recordEmployerRefund(fakeClient(order()), ev({ status: "failed" })), "ignored");
  assert.equal(await recordEmployerRefund(fakeClient(order()), ev({ payment_id: undefined })), "not_employer");
});
