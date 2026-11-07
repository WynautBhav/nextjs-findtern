import assert from "node:assert/strict";
import test from "node:test";

import { deriveDriveCode, hashDriveCode } from "./code-derive.ts";
import { redeemDecision, redeemInTransaction, type RedeemTx } from "./redeem.ts";

const now = new Date("2026-11-07T00:00:00Z");
const future = new Date("2027-01-01T00:00:00Z");
const adult = { dateOfBirth: new Date("2000-01-01") };
const order = { id: "o1", collegeId: "c1", status: "paid" };
const code = { id: "k1", orderId: "o1", status: "issued", validUntil: future };
const base: Parameters<typeof redeemDecision>[0] = { code, order, intern: adult as { dateOfBirth: Date | null }, membership: null, now };
const reason = (x: Partial<Parameters<typeof redeemDecision>[0]>) => {
  const d = redeemDecision({ ...base, ...x });
  return d.ok ? "ok" : `${d.reason}:${d.status}`;
};

test("decision outcomes and statuses", () => {
  assert.equal(reason({}), "ok");
  assert.equal(reason({ code: null as never }), "not_found:404");
  assert.equal(reason({ code: { ...code, status: "redeemed" } }), "already_redeemed:409");
  assert.equal(reason({ code: { ...code, status: "revoked" } }), "expired_or_revoked:410");
  assert.equal(reason({ code: { ...code, status: "expired" } }), "expired_or_revoked:410");
  assert.equal(reason({ code: { ...code, validUntil: now } }), "expired_or_revoked:410");
  assert.equal(reason({ order: { ...order, status: "pending" } }), "order_unpaid:402");
  assert.equal(reason({ membership: { collegeId: "c2", status: "verified" } }), "wrong_college:403");
  assert.equal(reason({ membership: { collegeId: "c1", status: "claimed" } }), "ok");
  assert.equal(reason({ intern: { dateOfBirth: new Date("2010-01-01") } }), "under_18:403");
  assert.equal(reason({ intern: { dateOfBirth: null } }), "under_18:403");
});

const SECRET = "s".repeat(40);
const plain = deriveDriveCode("k1", SECRET);

function fake(opts: { issued?: number; status?: string; validUntil?: Date; orderStatus?: string } = {}) {
  const st = {
    codeStatus: opts.status ?? "issued",
    redeemed: 0,
    issued: opts.issued ?? 1,
    ents: [] as unknown[],
  };
  let chain: Promise<unknown> = Promise.resolve();
  // serialises like a row lock: one transaction at a time
  const run = <T>(fn: (tx: RedeemTx) => Promise<T>): Promise<T> => {
    const p = chain.then(() => fn(tx));
    chain = p.catch(() => undefined);
    return p;
  };
  const tx: RedeemTx = {
    async execute(q, p) {
      if (q.includes("FROM drive_codes")) {
        return p[0] === hashDriveCode(plain, SECRET)
          ? { rows: [{ id: "k1", order_id: "o1", status: st.codeStatus, valid_until: opts.validUntil ?? future }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (q.includes("FROM college_drive_orders")) {
        return { rows: [{ id: "o1", college_id: "c1", status: opts.orderStatus ?? "paid" }], rowCount: 1 };
      }
      if (q.startsWith("UPDATE drive_codes")) {
        if (st.codeStatus !== "issued") return { rows: [], rowCount: 0 };
        st.codeStatus = "redeemed";
        return { rows: [], rowCount: 1 };
      }
      if (st.redeemed >= st.issued) return { rows: [], rowCount: 0 };
      st.redeemed += 1;
      return { rows: [], rowCount: 1 };
    },
    async insertEntitlement(r) {
      if (st.ents.some((e) => (e as { internId: string }).internId === r.internId)) throw Object.assign(new Error("duplicate"), { code: "23505" });
      st.ents.push(r);
    },
  };
  return { st, run };
}
const inp = (internId: string, extra = {}) => ({
  code: plain.toLowerCase().replace(/-/g, " "),
  internId,
  dateOfBirth: adult.dateOfBirth,
  membership: null,
  now,
  secret: SECRET,
  ...extra,
});

test("different-email student succeeds and gets waiver descriptor", async () => {
  const f = fake();
  const r = await f.run((tx) => redeemInTransaction(tx, inp("u1")));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.waiverPayment.gateway, "college_drive");
    assert.equal(r.waiverPayment.amountMinor, 0);
    assert.equal(r.membership.verifiedBy, "drive_code");
    assert.ok(!JSON.stringify(r).includes(plain));
  }
});

test("two simultaneous redemptions: exactly one wins", async () => {
  const f = fake({ issued: 2 });
  const rs = await Promise.all([
    f.run((tx) => redeemInTransaction(tx, inp("u1"))),
    f.run((tx) => redeemInTransaction(tx, inp("u2"))),
  ]);
  assert.equal(rs.filter((r) => r.ok).length, 1);
  const lost = rs.find((r) => !r.ok);
  assert.equal(lost && !lost.ok && lost.status, 409);
  assert.equal(f.st.ents.length, 1);
});

test("slot cap, wrong college, expired, revoked, unknown", async () => {
  const capped = fake({ issued: 0 });
  const c = await capped.run((tx) => redeemInTransaction(tx, inp("u1")));
  assert.equal(!c.ok && c.status, 409);
  const w = await fake().run((tx) => redeemInTransaction(tx, inp("u1", { membership: { collegeId: "c9", status: "verified" } })));
  assert.equal(!w.ok && w.status, 403);
  const e = await fake({ validUntil: new Date("2026-01-01") }).run((tx) => redeemInTransaction(tx, inp("u1")));
  assert.equal(!e.ok && e.status, 410);
  const v = await fake({ status: "revoked" }).run((tx) => redeemInTransaction(tx, inp("u1")));
  assert.equal(!v.ok && v.status, 410);
  const u = await fake().run((tx) => redeemInTransaction(tx, inp("u1", { code: "AAAA-BBBB-CCCC" })));
  assert.equal(!u.ok && u.status, 404);
});

test("a student who already holds a seat on the order gets 409, not a server error", async () => {
  const f = fake({ issued: 2 });
  f.st.ents.push({ internId: "u1" });
  const r = await f.run((tx) => redeemInTransaction(tx, inp("u1")));
  assert.equal(!r.ok && r.status, 409);
});
