import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Structure of the pay gate in the routes (the behaviour is proved against a real database by e2e/sem-expiry.e2e.mjs):
 * what must come before what, so a refactor cannot quietly move the check behind a write or a code redemption.
 */

const API = join(import.meta.dirname, "../../app/api");
const LIB = join(import.meta.dirname, "..");
const read = (...p: string[]) => readFileSync(join(...p), "utf8");
const order = read(API, "employer/[id]/payment/razorpay/order/route.ts");
const promo = read(API, "employer/[id]/payment/validate-promo/route.ts");
const ack = read(API, "proposals/[id]/cgpa-ack/route.ts");
const cron = read(API, "cron/proposal-expiry/route.ts");
const sweeperFull = read(LIB, "proposal-expiry-db.ts");
/** Code only: the header comment is allowed to say what the sweeper never does. */
const sweeper = sweeperFull.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sched = read(LIB, "schedulers.ts");

test("order route: expired/CGPA offers are refused before any promo is quoted and again inside the order transaction", () => {
  const early = order.indexOf("payRequestRefusal(");
  assert.ok(early > 0);
  assert.ok(early < order.indexOf("quotePromoGuarded("), "refused before a code is looked at");
  assert.ok(early < order.indexOf("openOrder(id,"), "refused before an order is opened");
  const lockAt = order.indexOf("withLock(`employer-pay:");
  const gateAt = order.indexOf("payGateRefusalFor(tx,");
  const insertAt = order.indexOf("tx.insert(schema.employerPayments)");
  assert.ok(lockAt > 0 && gateAt > lockAt && insertAt > gateAt, "re-checked on tx, under the lock, before the order row goes in");
  assert.match(order, /NextResponse\.json\(held, \{ status: 409 \}\)/);
  assert.match(order, /NextResponse\.json\(refused, \{ status: 409 \}\)/);
});

test("validate-promo: refused before the code is quoted", () => {
  assert.ok(promo.indexOf("payRequestRefusal(") > 0);
  assert.ok(promo.indexOf("payRequestRefusal(") < promo.indexOf("quotePromoGuarded("));
});

test("settlement is not changed by this feature: payments.ts knows nothing of expiry", () => {
  const pay = read(LIB, "payments.ts");
  assert.doesNotMatch(pay, /pay-gate|proposal-expiry|expiryOf|acceptedUnpaidExpired/);
});

test("cgpa-ack: CSRF/role guard, ownership, takedown guard, then a row-locked write and a strict audit row in the same transaction", () => {
  const at = (s: string) => ack.indexOf(s);
  assert.ok(at("requireMutation({ req, roles: [\"employer\"] })") > 0);
  assert.ok(at("requireMutation(") < at("req.json") || !ack.includes("req.json"), "no body is read before the guard");
  assert.ok(at("eq(schema.proposals.employerId, session.uid)") > at("requireMutation("));
  assert.ok(at("assertProposalActionable(id, session.uid)") > at("eq(schema.proposals.employerId, session.uid)"));
  assert.ok(at(".for(\"update\")") > at("assertProposalActionable("));
  assert.ok(at(".update(schema.proposals)") > at(".for(\"update\")"));
  assert.match(ack, /cgpaAckAt/);
  // B-48: the employer's confirmation is audited, written with the stamp in one transaction (strict: a failed audit rolls the stamp back).
  assert.match(ack, /recordAdminAudit\(tx, /);
  assert.match(ack, /\{ strict: true \}/);
  assert.ok(at("recordAdminAudit(tx") > at(".update(schema.proposals)"));
});

test("sweeper: per-employer lock shared with the order route, bounded, never lapsedAt, strict audit in the same transaction", () => {
  assert.match(sweeper, /withLock\(`employer-pay:\$\{employerId\}`/);
  assert.ok(sweeper.indexOf("openOrderProposalIds(tx,") > sweeper.indexOf("withLock("), "open orders read inside the lock");
  assert.match(sweeper, /\.limit\(MAX_ROWS_PER_EMPLOYER\)/);
  assert.match(sweeper, /\.for\("update"\)/);
  assert.match(sweeper, /eq\(schema\.proposals\.status, "accepted"\)[\s\S]*isNull\(schema\.proposals\.hiredAt\)/);
  assert.match(sweeper, /expiredStamp\("unpaid_past_start"/);
  assert.doesNotMatch(sweeper, /lapsedAt/);
  assert.match(sweeper, /action: "proposal\.expired_unpaid"/);
  assert.match(sweeper, /adminId: SYSTEM_ACTOR/);
  assert.match(sweeper, /\{ strict: true \}/);
  assert.ok(sweeper.indexOf("notifyExpired(all)") > sweeper.indexOf("expireForEmployer(e.id"), "notifications after the commits");
});

test("sweeper SQL: the start-date test uses [0-9], not \\d (a bare \\d in a template literal is the letter d and matches nothing)", () => {
  const sql = sweeper.slice(sweeper.indexOf("const startBegun"), sweeper.indexOf("async function expireForEmployer"));
  assert.match(sql, /\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}/);
  assert.doesNotMatch(sql, /\\d/);
});

test("cron route: bearer-only, closed without a secret, honours SCHEDULERS=off; scheduler runs the sweep hourly", () => {
  const handler = read(LIB, "proposal-expiry-cron.ts"); // behaviour is unit tested in proposal-expiry-no-reply.test.ts
  assert.match(cron, /runExpiryCron\(req/);
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(handler, /cronAuthorized\(req, deps\.secret\)/);
  assert.ok(handler.indexOf("cronAuthorized(") < handler.indexOf("deps.sweep()"));
  assert.match(handler, /schedulers === "off"/);
  assert.match(cron, /sweepProposalExpiry/);
  assert.match(sched, /sweepProposalExpiry/);
  assert.match(sched, /setInterval\(expiry, 60 \* 60 \* 1000\)/);
  assert.match(read(join(import.meta.dirname, "../../.."), "vercel.json"), /\/api\/cron\/proposal-expiry/);
});
