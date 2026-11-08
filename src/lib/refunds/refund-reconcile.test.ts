import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MIN_AGE_MINUTES, mapGatewayStatus, minAgeMinutes, reconcileRefunds,
  type GatewayRefund, type ReconcileStore, type RefundStatusGateway, type StampInfo, type StuckRefund,
} from "./refund-reconcile.ts";
import { runRefundReconcile } from "./refund-reconcile-db.ts";
import { refundReceipt } from "../razorpay.ts";

const NOW = new Date("2026-11-08T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

type Row = StuckRefund & { status: string; raw: StampInfo | null; amountBefore: number };
type Audit = { kind: "settle" | "flag"; refundId: string; to?: string; flag?: string };

/** In-memory store with the same compare-and-set rule as the SQL: settle only changes a row that is still 'initiated'. */
function fakeStore(rows: Row[]) {
  const audits: Audit[] = [];
  const stamps: { id: string; info: StampInfo }[] = [];
  const asked: { olderThan: Date; limit: number }[] = [];
  const store: ReconcileStore = {
    async findStuck(o) {
      asked.push(o);
      return rows.filter((r) => r.status === "initiated" && (r.initiatedAt ?? NOW) <= o.olderThan).slice(0, o.limit).map((r) => ({ ...r }));
    },
    async settle(refund, to, g) {
      await Promise.resolve(); // yield so concurrent runs interleave between "read" and "write"
      const row = rows.find((r) => r.id === refund.id)!;
      if (row.status !== "initiated") return false;
      row.status = to;
      row.gatewayRefundId ??= g.id;
      audits.push({ kind: "settle", refundId: row.id, to });
      return true;
    },
    async stamp(id, info) {
      const row = rows.find((r) => r.id === id)!;
      if (row.status !== "initiated") return { flagChanged: false };
      const flagChanged = info.flag !== undefined && row.raw?.flag !== info.flag;
      row.raw = info;
      stamps.push({ id, info });
      return { flagChanged };
    },
    async auditFlag(refund, flag) {
      audits.push({ kind: "flag", refundId: refund.id, flag });
    },
  };
  return { store, audits, stamps, asked };
}

const mkRow = (id: string, o: Partial<Row> = {}): Row => ({
  id, internPaymentId: `ip-${id}`, amountMinor: 250000, gatewayRefundId: `rfnd_${id}`, idempotencyKey: `refund:ip-${id}:1`,
  gatewayPaymentId: `pay_${id}`, initiatedAt: minutesAgo(120), status: "initiated", raw: null, amountBefore: 250000, ...o,
});

function fakeGateway(entities: Record<string, Partial<GatewayRefund> | "404" | "throw">, lists: Record<string, GatewayRefund[]> = {}) {
  const calls: string[] = [];
  const gateway: RefundStatusGateway = {
    async getRefund(id) {
      calls.push(`GET refund ${id}`);
      const e = entities[id];
      if (e === "throw") throw new Error("Razorpay GET failed (503): rzp_live_abcdefghij1234567890ABCD down");
      if (e === undefined || e === "404") return null;
      return { id, status: "processed", amountMinor: 250000, paymentId: null, receipt: null, ...e };
    },
    async listPaymentRefunds(paymentId) {
      calls.push(`LIST ${paymentId}`);
      return lists[paymentId] ?? [];
    },
  };
  return { gateway, calls };
}

const run = (store: ReconcileStore, gateway: RefundStatusGateway, o: Partial<Parameters<typeof reconcileRefunds>[0]> = {}) =>
  reconcileRefunds({ store, gateway, now: () => NOW, minAgeMinutes: 30, ...o });

test("initiated -> refunded when Razorpay says processed; audited once with who/what", async () => {
  const rows = [mkRow("a")];
  const { store, audits } = fakeStore(rows);
  const { gateway } = fakeGateway({ rfnd_a: { status: "processed" } });
  const s = await run(store, gateway);
  assert.equal(rows[0].status, "refunded");
  assert.equal(rows[0].amountMinor, 250000);
  assert.deepEqual(audits, [{ kind: "settle", refundId: "a", to: "refunded" }]);
  assert.equal(s.refunded, 1);
  assert.equal(s.errors, 0);
});

test("initiated -> failed when Razorpay says failed", async () => {
  const rows = [mkRow("a")];
  const { store, audits } = fakeStore(rows);
  const { gateway } = fakeGateway({ rfnd_a: { status: "failed" } });
  const s = await run(store, gateway);
  assert.equal(rows[0].status, "failed");
  assert.deepEqual(audits, [{ kind: "settle", refundId: "a", to: "failed" }]);
  assert.equal(s.failed, 1);
});

test("pending at Razorpay: stays initiated, stamped, no audit", async () => {
  const rows = [mkRow("a")];
  const { store, audits, stamps } = fakeStore(rows);
  const s = await run(store, fakeGateway({ rfnd_a: { status: "pending" } }).gateway);
  assert.equal(rows[0].status, "initiated");
  assert.equal(audits.length, 0);
  assert.equal(stamps[0].info.outcome, "pending");
  assert.equal(s.pending, 1);
});

test("final states are never read, never touched (refunded, failed, eligible, review, pending)", async () => {
  const rows = ["refunded", "failed", "eligible", "review", "pending"].map((st, i) => mkRow(`f${i}`, { status: st }));
  const { store, audits } = fakeStore(rows);
  const { gateway, calls } = fakeGateway({});
  const s = await run(store, gateway);
  assert.equal(s.checked, 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(rows.map((r) => r.status), ["refunded", "failed", "eligible", "review", "pending"]);
  assert.equal(audits.length, 0);
});

test("a refund that is final by the time we write is a no-op: no audit, status kept (webhook won the race)", async () => {
  const rows = [mkRow("a")];
  const { store, audits } = fakeStore(rows);
  const racing: RefundStatusGateway = {
    async getRefund(id) {
      rows[0].status = "refunded"; // the webhook lands while we wait on the gateway
      return { id, status: "failed", amountMinor: 250000, paymentId: null, receipt: null };
    },
    listPaymentRefunds: async () => [],
  };
  const s = await run(store, racing);
  assert.equal(rows[0].status, "refunded", "never moves a final row, even to a different final state");
  assert.equal(audits.length, 0);
  assert.equal(s.noop, 1);
});

test("two runs at once settle each refund exactly once and audit it exactly once", async () => {
  const rows = [mkRow("a"), mkRow("b"), mkRow("c", { gatewayRefundId: "rfnd_c" })];
  const { store, audits } = fakeStore(rows);
  const { gateway } = fakeGateway({ rfnd_a: { status: "processed" }, rfnd_b: { status: "failed" }, rfnd_c: { status: "processed" } });
  const [x, y] = await Promise.all([run(store, gateway), run(store, gateway)]);
  assert.deepEqual(rows.map((r) => r.status), ["refunded", "failed", "refunded"]);
  assert.equal(audits.filter((a) => a.kind === "settle").length, 3);
  assert.equal(x.refunded + y.refunded, 2);
  assert.equal(x.failed + y.failed, 1);
  assert.equal(x.noop + y.noop, 3, "the loser of each race saw a no-op");
  // A later run finds nothing to do.
  const later = await run(store, gateway);
  assert.equal(later.checked, 0);
  assert.equal(audits.length, 3);
});

test("gateway error: state untouched, no audit, error counted, key redacted from the stamp, other rows still processed", async () => {
  const rows = [mkRow("a"), mkRow("b")];
  const { store, audits, stamps } = fakeStore(rows);
  const { gateway } = fakeGateway({ rfnd_a: "throw", rfnd_b: { status: "processed" } });
  const s = await run(store, gateway);
  assert.equal(rows[0].status, "initiated");
  assert.equal(rows[1].status, "refunded");
  assert.equal(s.errors, 1);
  assert.equal(audits.filter((a) => a.refundId === "a").length, 0);
  const err = stamps.find((x) => x.id === "a")!.info;
  assert.equal(err.outcome, "error");
  assert.ok(!err.error!.includes("rzp_live_"), err.error);
});

test("a store stamp failing after a gateway error does not abort the run", async () => {
  const rows = [mkRow("a"), mkRow("b")];
  const { store } = fakeStore(rows);
  store.stamp = async () => {
    throw new Error("db down");
  };
  const s = await run(store, fakeGateway({ rfnd_a: "throw", rfnd_b: { status: "processed" } }).gateway);
  assert.equal(s.errors, 1);
  assert.equal(rows[1].status, "refunded");
});

test("gateway 404 and unknown statuses are flagged for a human and leave the row initiated; the flag is audited once, not every run", async () => {
  const rows = [mkRow("a"), mkRow("b")];
  const { store, audits } = fakeStore(rows);
  const { gateway } = fakeGateway({ rfnd_a: "404", rfnd_b: { status: "weird" } });
  await run(store, gateway);
  await run(store, gateway);
  await run(store, gateway);
  assert.deepEqual(rows.map((r) => r.status), ["initiated", "initiated"]);
  assert.deepEqual(audits, [{ kind: "flag", refundId: "a", flag: "not_found_at_gateway" }, { kind: "flag", refundId: "b", flag: "unknown_status" }]);
});

test("amount or payment differing at the gateway is flagged; the stored amount is never changed and nothing settles", async () => {
  const rows = [mkRow("a"), mkRow("b")];
  const { store, audits } = fakeStore(rows);
  const { gateway } = fakeGateway({ rfnd_a: { status: "processed", amountMinor: 100 }, rfnd_b: { status: "processed", paymentId: "pay_other" } });
  const s = await run(store, gateway);
  assert.deepEqual(rows.map((r) => r.status), ["initiated", "initiated"]);
  assert.deepEqual(rows.map((r) => r.amountMinor), [250000, 250000]);
  assert.deepEqual(audits.map((a) => a.flag), ["amount_mismatch", "payment_mismatch"]);
  assert.equal(s.flagged, 2);
});

test("a gateway answering with a different refund id than asked for is flagged, not trusted", async () => {
  const rows = [mkRow("a")];
  const { store, audits } = fakeStore(rows);
  const odd: RefundStatusGateway = { getRefund: async () => ({ id: "rfnd_zzz", status: "processed", amountMinor: 250000, paymentId: null, receipt: null }), listPaymentRefunds: async () => [] };
  await run(store, odd);
  assert.equal(rows[0].status, "initiated");
  assert.deepEqual(audits.map((a) => a.flag), ["id_mismatch"]);
});

test("no gateway refund id: matched only by the echoed receipt, exactly one match; the id is then recorded by settle", async () => {
  const rows = [mkRow("a", { gatewayRefundId: null })];
  const { store, audits } = fakeStore(rows);
  const receipt = refundReceipt("refund:ip-a:1");
  const other = { id: "rfnd_other", status: "processed", amountMinor: 250000, paymentId: "pay_a", receipt: "refund:someone-else:1" };
  const mine = { id: "rfnd_mine", status: "processed", amountMinor: 250000, paymentId: "pay_a", receipt };
  const { gateway, calls } = fakeGateway({}, { pay_a: [other, mine] });
  await run(store, gateway);
  assert.deepEqual(calls, ["LIST pay_a"]);
  assert.equal(rows[0].status, "refunded");
  assert.equal(rows[0].gatewayRefundId, "rfnd_mine");
  assert.equal(audits.length, 1);
});

test("no gateway refund id and no match (or several): flagged, never marked failed, never guessed", async () => {
  const rows = [mkRow("a", { gatewayRefundId: null }), mkRow("b", { gatewayRefundId: null }), mkRow("c", { gatewayRefundId: null, gatewayPaymentId: null })];
  const { store, audits } = fakeStore(rows);
  const e = (id: string) => ({ id, status: "processed", amountMinor: 250000, paymentId: "pay_b", receipt: refundReceipt("refund:ip-b:1") });
  const { gateway } = fakeGateway({}, { pay_a: [], pay_b: [e("rfnd_1"), e("rfnd_2")] });
  await run(store, gateway);
  assert.deepEqual(rows.map((r) => r.status), ["initiated", "initiated", "initiated"]);
  assert.deepEqual(audits.map((a) => a.flag), ["no_gateway_refund", "ambiguous_receipt", "no_gateway_payment"]);
});

test("N-minute threshold: only rows older than N minutes are asked for; a fresh one is left to its webhook", async () => {
  const rows = [mkRow("old", { initiatedAt: minutesAgo(31) }), mkRow("edge", { initiatedAt: minutesAgo(30) }), mkRow("fresh", { initiatedAt: minutesAgo(29) })];
  const { store, asked } = fakeStore(rows);
  const { gateway, calls } = fakeGateway({ rfnd_old: {}, rfnd_edge: {}, rfnd_fresh: {} });
  await run(store, gateway, { minAgeMinutes: 30 });
  assert.equal(asked[0].olderThan.getTime(), minutesAgo(30).getTime());
  assert.deepEqual(rows.map((r) => r.status), ["refunded", "refunded", "initiated"]);
  assert.deepEqual(calls, ["GET refund rfnd_old", "GET refund rfnd_edge"]);
});

test("minAgeMinutes parses env: default, floor of 5, cap of 7 days, junk ignored", () => {
  assert.equal(minAgeMinutes(undefined), DEFAULT_MIN_AGE_MINUTES);
  assert.equal(minAgeMinutes(""), DEFAULT_MIN_AGE_MINUTES);
  assert.equal(minAgeMinutes("abc"), DEFAULT_MIN_AGE_MINUTES);
  assert.equal(minAgeMinutes("-3"), DEFAULT_MIN_AGE_MINUTES);
  assert.equal(minAgeMinutes("1.5"), DEFAULT_MIN_AGE_MINUTES);
  assert.equal(minAgeMinutes("1"), 5);
  assert.equal(minAgeMinutes("90"), 90);
  assert.equal(minAgeMinutes("999999"), 7 * 24 * 60);
});

test("batch limit and time budget are respected", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => mkRow(`r${i}`));
  const { store, asked } = fakeStore(rows);
  const ents = Object.fromEntries(rows.map((r) => [r.gatewayRefundId!, {}]));
  const s = await run(store, fakeGateway(ents).gateway, { limit: 4 });
  assert.equal(asked[0].limit, 4);
  assert.equal(s.checked, 4);
  let t = NOW.getTime();
  const slow = fakeGateway(ents).gateway;
  const rows2 = Array.from({ length: 10 }, (_, i) => mkRow(`s${i}`));
  const s2 = await reconcileRefunds({
    store: fakeStore(rows2).store,
    gateway: { ...slow, getRefund: async (id) => ((t += 15_000), { id, status: "processed", amountMinor: 250000, paymentId: null, receipt: null }) },
    now: () => new Date(t), budgetMs: 40_000, minAgeMinutes: 30,
  });
  assert.equal(s2.stoppedBy, "budget");
  assert.ok(s2.checked < 10);
});

test("status mapping: only processed/failed are final", () => {
  assert.equal(mapGatewayStatus("processed"), "refunded");
  assert.equal(mapGatewayStatus("failed"), "failed");
  assert.equal(mapGatewayStatus("pending"), "pending");
  assert.equal(mapGatewayStatus("created"), null);
  assert.equal(mapGatewayStatus(""), null);
});

test("the job only ever reads: the gateway interface has no create/refund method", () => {
  const { gateway } = fakeGateway({});
  assert.deepEqual(Object.keys(gateway).sort(), ["getRefund", "listPaymentRefunds"]);
});

test("flag off (or no keys): runRefundReconcile returns skipped and touches neither DB nor Razorpay", async () => {
  const origFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async () => {
    fetched++;
    throw new Error("must not be called");
  }) as typeof fetch;
  try {
    for (const env of [{}, { REFUND_RECONCILE: "0" }, { REFUND_RECONCILE: "true" }, { REFUND_RECONCILE: " 1" }]) {
      assert.deepEqual(await runRefundReconcile({ ...env, RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "s" }), { skipped: true, reason: "REFUND_RECONCILE is off" });
    }
    assert.deepEqual(await runRefundReconcile({ REFUND_RECONCILE: "1" }), { skipped: true, reason: "Razorpay keys are not configured" });
    assert.deepEqual(await runRefundReconcile({ REFUND_RECONCILE: "1", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: " " }), { skipped: true, reason: "Razorpay keys are not configured" });
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});
