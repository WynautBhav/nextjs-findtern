import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/**
 * redeemWaiverInTx, the step settlement runs on its own transaction for a full-waiver order, against a recording fake of that
 * transaction. Proves: each refusal throws (so settlement rolls the whole claim back), the use is consumed once,
 * the audit row is distinct and never holds the code text, and an ordinary order is not touched at all.
 * The SQL (row lock, ON CONFLICT, the guarded counter bump) is proved against Postgres in the browser pass.
 */
register("./test-support/route-hooks.mjs", import.meta.url);
const { redeemWaiverInTx, WaiverRefused } = (await import("../full-waiver-settle.ts")) as typeof import("../full-waiver-settle.ts");

type Step = { op: string; value?: unknown };
/** Each awaited query takes the next queued answer; every insert/update is recorded. */
function fakeTx(answers: unknown[][]) {
  const steps: Step[] = [];
  const queue = [...answers];
  const chain = (op: string): unknown =>
    new Proxy({}, {
      get: (_t, prop) => {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(queue.shift() ?? []);
        if (prop === "values") return (v: unknown) => (steps.push({ op: `${op}.values`, value: v }), chain(op));
        if (prop === "set") return (v: unknown) => (steps.push({ op: `${op}.set`, value: v }), chain(op));
        return () => chain(op);
      },
    });
  const tx = { select: () => chain("select"), insert: () => chain("insert"), update: () => chain("update") };
  return { tx: tx as never, steps };
}

const NOW = Date.now();
const row = { id: "p1", code: "FREE-ABCD-EFGH-JKMN", discountType: "full_waiver", discountValue: 100, maxUsages: 2, usedCount: 0, isActive: true, validFrom: null, validUntil: new Date(NOW + 86_400_000), appliesTo: "employer" };
const flaggedRaw = { promo: { promoCode: row.code, fullWaiver: true, promoCodeId: "p1", waivedMinor: 7_500_000, discountMinor: 7_500_000 } };
const order: { kind: "employer" | "intern"; paymentRowId: string; orderId: string; accountId: string; currency: string; raw: unknown } = { kind: "employer", paymentRowId: "pay1", orderId: "waiver_x", accountId: "emp1", currency: "INR", raw: flaggedRaw };

// answers in call order: [lock the code row, prior use by this account, insert usage returning, bump counter returning]
const happy = () => [[row], [], [{ id: "u1" }], [{ id: "p1" }]];

test("success: one usage row, the counter bumped once, one audit row with the distinct action", async () => {
  const { tx, steps } = fakeTx(happy());
  await redeemWaiverInTx(tx, order);
  const inserts = steps.filter((s) => s.op === "insert.values").map((s) => s.value as Record<string, unknown>);
  const usage = inserts.find((v) => "promoCodeId" in v);
  assert.deepEqual({ promoCodeId: usage?.promoCodeId, userId: usage?.userId, orderId: usage?.orderId, discountAppliedMinor: usage?.discountAppliedMinor }, { promoCodeId: "p1", userId: "emp1", orderId: "waiver_x", discountAppliedMinor: 7_500_000 });
  assert.equal(steps.filter((s) => s.op === "update.set").length, 1, "the counter is bumped once");
  const audit = inserts.find((v) => v.action === "promo.full_waiver_redeemed") as { meta: Record<string, unknown>; targetId: string } | undefined;
  assert.ok(audit, "an audit row is written in the same transaction");
  assert.equal(audit.targetId, "pay1");
  assert.deepEqual({ ...audit.meta }, { orderId: "waiver_x", promoCodeId: "p1", codeTail: "JKMN", accountId: "emp1", audience: "employer", amountWaivedMinor: 7_500_000, currency: "INR" });
  assert.ok(!JSON.stringify(inserts).includes(row.code), "no row written holds the code text");
});

const refused = async (answers: unknown[][], over: Partial<typeof order> = {}) => {
  const { tx, steps } = fakeTx(answers);
  await assert.rejects(() => redeemWaiverInTx(tx, { ...order, ...over }), WaiverRefused);
  return steps;
};

test("refused (so settlement rolls back): disabled, expired, exhausted, wrong audience, second use by the account, a lost race", async () => {
  await refused([[{ ...row, isActive: false }], []]);
  await refused([[{ ...row, validUntil: new Date(NOW - 1000) }], []]);
  await refused([[{ ...row, usedCount: 2 }], []]);
  await refused([[{ ...row, appliesTo: "intern" }], []]);
  await refused([[row], [{ id: "earlier" }]]);
  await refused([[row], [], []], {}); // the insert hit the unique (code, account) index: nothing returned
  await refused([[row], [], [{ id: "u1" }], []]); // the counter guard found no free use
  await refused([[]]); // the code row is gone
});

test("a refusal before the insert writes nothing at all", async () => {
  const steps = await refused([[{ ...row, isActive: false }], []]);
  assert.equal(steps.filter((s) => s.op.startsWith("insert") || s.op.startsWith("update")).length, 0);
});

test("a waiver mark with no code id is refused; an ordinary order is a no-op that does not even read", async () => {
  await refused([], { raw: { promo: { fullWaiver: true, waivedMinor: 5 } } });
  const { tx, steps } = fakeTx([]);
  await redeemWaiverInTx(tx, { ...order, raw: { promo: { promoCode: "LAUNCH25", discountMinor: 5 } } });
  assert.equal(steps.length, 0);
});

test("an intern activation is checked against the intern audience", async () => {
  const { tx } = fakeTx([[{ ...row, appliesTo: "intern" }], [], [{ id: "u" }], [{ id: "p1" }]]);
  await redeemWaiverInTx(tx, { ...order, kind: "intern", raw: { fullWaiver: true, promoCodeId: "p1", waivedMinor: 49_900 } });
  await refused([[row], []], { kind: "intern", raw: { fullWaiver: true, promoCodeId: "p1", waivedMinor: 49_900 } }); // an employer-only code on the intern fee
});
