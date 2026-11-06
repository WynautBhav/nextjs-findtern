/**
 * College activation refunds (PLAN §2.3 "Refunds", WP-R) against the local
 * Razorpay stub (e2e/lib/razorpay-stub.mjs; the server's RAZORPAY_API_BASE
 * points at it, nothing reaches Razorpay).
 *
 *   a paid intern who is on a college roster → eligible · interview taken →
 *   requires_review · college-code activation → refused · confirm amount must
 *   match · initiate claims one college seat and makes ONE gateway call
 *   (double / concurrent initiate → still one) → webhook refund.processed →
 *   refunded (replay is a no-op, bad signature 400) · gateway refusal → 502,
 *   row stays pending with the error, retry after a refresh reuses the seat ·
 *   refund.failed → failed → retry → one new gateway call · no seats left → 409.
 *
 * Specs for contracts that are not merged yet fail here until they are (the
 * report names which); assertions are not weakened to pass.
 *
 * Run through e2e/run.mjs (`npm run e2e`, E2E_SPECS=refunds).
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { chromium } from "playwright";

import { baseUrl, ROOT, testDatabaseUrl } from "./lib/env.mjs";
import { visit } from "./lib/browser.mjs";
import { stubControl } from "./lib/razorpay-stub.mjs";
import {
  closeDb, db, eventually, expectText, one, rows, seedAdmin, seedAiInterview, seedCollege, seedEmployer, seedIntern, seedInternPayment, send,
  signedInContext, uniq,
} from "./lib/fixtures.mjs";

testDatabaseUrl();

const STUB_URL = process.env.E2E_STUB_URL;
const WEBHOOK_SECRET = process.env.E2E_STUB_WEBHOOK_SECRET;
if (!STUB_URL || !WEBHOOK_SECRET) throw new Error("run through e2e/run.mjs: E2E_STUB_URL / E2E_STUB_WEBHOOK_SECRET are not set");

const stub = stubControl(STUB_URL);
const state = {};
let browser;

const shot = async (page, name) => page.screenshot({ path: join(ROOT, "e2e", ".artifacts", `fail-refunds-${name}.png`), fullPage: true }).catch(() => {});
const FEE = 249_900;

const create = (internPaymentId, ctx = state.adminCtx) => send(ctx, "POST", "/api/admin/refunds", { internPaymentId });
const act = (id, body, ctx = state.adminCtx) => send(ctx, "PATCH", `/api/admin/refunds/${id}`, body);
const refundRow = (id) => one(`SELECT * FROM payment_refunds WHERE id = $1`, [id]);
const used = async (collegeId = state.collegeId) => (await one(`SELECT used_count FROM promo_codes WHERE college_id = $1`, [collegeId])).used_count;

/** A paid, unscored intern whose email is on the college's roster. */
async function paidStudent(collegeId, label, { gateway = "razorpay", amountMinor = FEE } = {}) {
  const intern = await seedIntern({ label });
  const pay = await seedInternPayment(intern.id, { gateway, amountMinor });
  await db().query(
    `UPDATE intern_onboarding SET extra_data = jsonb_set(extra_data, '{payment}', $2::jsonb) WHERE user_id = $1`,
    [intern.id, JSON.stringify({ isPaid: true, paidAt: new Date().toISOString(), gateway, orderId: "order_e2e", paymentId: pay.paymentId, finalAmountMinor: amountMinor })],
  );
  await db().query(
    `INSERT INTO college_roster (college_id, email, name, match_status, matched_user_id) VALUES ($1, $2, $3, 'email', $4)`,
    [collegeId, intern.email, `${intern.firstName} ${intern.lastName}`, intern.id],
  );
  return { intern, pay };
}

/** A signed Razorpay webhook for a refund event. */
function webhook(event, { refundId, paymentId, amount = FEE, gatewayRefundId }) {
  const body = JSON.stringify({
    event,
    payload: { refund: { entity: { id: gatewayRefundId, entity: "refund", payment_id: paymentId, amount, status: event === "refund.failed" ? "failed" : "processed", notes: { refund_id: refundId } } } },
  });
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  return { body, signature };
}
const deliver = async (event, args, signature) => {
  const w = webhook(event, args);
  const res = await fetch(new URL("/api/webhooks/razorpay", baseUrl()), {
    method: "POST",
    headers: { "content-type": "application/json", "x-razorpay-signature": signature ?? w.signature },
    body: w.body,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  await stub.reset();
  state.admin = await seedAdmin();
  state.adminCtx = await signedInContext(browser, state.admin);
  const tag = uniq("rf");
  state.college = await seedCollege(state.adminCtx, { name: `Refund Institute ${tag}`, seats: 300, withTpo: false });
  state.collegeId = state.college.collegeId;
  state.tinyCollege = await seedCollege(state.adminCtx, { name: `Refund Annex ${tag}`, seats: 1, withTpo: false });

  state.a = await paidStudent(state.collegeId, "rf-a"); // the happy path
  state.b = await paidStudent(state.collegeId, "rf-b"); // took the interview
  await seedAiInterview(state.b.intern.id, "completed");
  state.c = await paidStudent(state.collegeId, "rf-c", { gateway: "free", amountMinor: 0 }); // used the college code
  state.d = await paidStudent(state.collegeId, "rf-d"); // gateway refuses once
  state.e = await paidStudent(state.collegeId, "rf-e"); // refund.failed then retry
  state.f = await paidStudent(state.collegeId, "rf-f"); // concurrent double click
  state.g = await paidStudent(state.tinyCollege.collegeId, "rf-g"); // the only seat of the annex
  state.h = await paidStudent(state.tinyCollege.collegeId, "rf-h"); // no seat left
  state.usedAtStart = await used();
});

after(async () => {
  await browser?.close();
  await closeDb();
});

/* ── Eligibility ────────────────────────────────────────────────────────── */

test("a paid student on the roster is eligible for the full fee; creating twice returns the same row", async () => {
  const r = await create(state.a.pay.id);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, "eligible");
  assert.equal(r.body.amountMinor, FEE);
  state.a.refundId = r.body.refundId;
  const again = await create(state.a.pay.id);
  assert.equal(again.body.refundId, state.a.refundId, "idempotent: the live row is returned");
  const n = await one(`SELECT count(*)::int AS n FROM payment_refunds WHERE intern_payment_id = $1`, [state.a.pay.id]);
  assert.equal(n.n, 1);
  assert.equal((await refundRow(state.a.refundId)).gateway, "razorpay");
  assert.equal(await used(), state.usedAtStart, "creating a refund claims no seat yet");
});

test("a student who took the AI interview needs a human decision and cannot be initiated", async () => {
  const r = await create(state.b.pay.id);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, "requires_review");
  assert.equal(r.body.reviewReason, "interview_taken");
  const go = await act(r.body.refundId, { action: "initiate", confirmAmountMinor: FEE });
  assert.equal(go.status, 409, JSON.stringify(go.body));
  assert.equal((await stub.refundCalls()).length, 0, "no gateway call for a row that needs review");
});

test("a college-code activation is not refundable; neither is a payment that does not exist", async () => {
  const r = await create(state.c.pay.id);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.match(String(r.body.error), /college code|not a paid activation/i);
  const missing = await create("00000000-0000-0000-0000-000000000000");
  assert.equal(missing.status, 404);
  const rowsFor = await rows(`SELECT id FROM payment_refunds WHERE intern_payment_id = $1`, [state.c.pay.id]);
  assert.equal(rowsFor.length, 0);
});

test("only an admin with money access can create or initiate a refund", async () => {
  const employer = await seedEmployer({ label: "rf-emp" });
  const employerCtx = await signedInContext(browser, employer);
  const intern = await signedInContext(browser, state.a.intern);
  try {
    // Not an admin session at all: 401 (no admin identity) or 403 (wrong role) both refuse.
    const refused = (res) => [401, 403].includes(res.status);
    assert.ok(refused(await create(state.a.pay.id, employerCtx)), "an employer");
    assert.ok(refused(await create(state.a.pay.id, intern)), "an intern");
    assert.ok(refused(await act(state.a.refundId, { action: "initiate", confirmAmountMinor: FEE }, intern)), "an intern initiating");
    const noCsrf = await state.adminCtx.request.post(new URL("/api/admin/refunds", baseUrl()).toString(), {
      data: { internPaymentId: state.a.pay.id }, headers: { origin: baseUrl() }, failOnStatusCode: false,
    });
    assert.equal(noCsrf.status(), 403, "a write without the CSRF header is refused");
  } finally {
    await employerCtx.close();
    await intern.close();
  }
  assert.equal((await stub.refundCalls()).length, 0);
});

/* ── Initiate: one seat, one gateway call ───────────────────────────────── */

test("a wrong confirmed amount is refused and nothing moves", async () => {
  const r = await act(state.a.refundId, { action: "initiate", confirmAmountMinor: FEE - 100 });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal((await refundRow(state.a.refundId)).status, "eligible");
  assert.equal((await stub.refundCalls()).length, 0);
  assert.equal(await used(), state.usedAtStart);
});

test("initiate: claims one seat, makes one gateway call with the right amount and receipt, row is initiated", async () => {
  await stub.mode("pending");
  const r = await act(state.a.refundId, { action: "initiate", confirmAmountMinor: FEE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "initiated");
  assert.match(String(r.body.gatewayRefundId), /^rfnd_e2e_/);
  state.a.gatewayRefundId = r.body.gatewayRefundId;

  const calls = await stub.refundCalls();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].authorised, true, "the server used its configured key");
  assert.ok(calls[0].path.endsWith(`/payments/${state.a.pay.paymentId}/refund`), calls[0].path);
  assert.equal(calls[0].body.amount, FEE);
  assert.equal(calls[0].body.receipt, state.a.refundId);
  assert.equal(calls[0].body.notes?.refund_id, state.a.refundId);

  const row = await refundRow(state.a.refundId);
  assert.equal(row.status, "initiated");
  assert.equal(row.gateway_refund_id, state.a.gatewayRefundId);
  assert.ok(row.seat_usage_id, "the seat claimed for this refund is recorded");
  assert.equal(await used(), state.usedAtStart + 1, "seat count +1");
  const m = await one(`SELECT college_id, status FROM college_memberships WHERE user_id = $1 AND left_at IS NULL`, [state.a.intern.id]);
  assert.equal(m.college_id, state.collegeId);
  assert.equal(m.status, "verified");
});

test("initiating again does nothing: 409, still one gateway call, still one seat", async () => {
  const r = await act(state.a.refundId, { action: "initiate", confirmAmountMinor: FEE });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal((await stub.refundCalls()).length, 1);
  assert.equal(await used(), state.usedAtStart + 1);
});

test("two initiates at the same instant make exactly one gateway call and claim one seat", async () => {
  await stub.mode("pending");
  const made = await create(state.f.pay.id);
  assert.equal(made.body.status, "eligible", JSON.stringify(made.body));
  state.f.refundId = made.body.refundId;
  const callsBefore = (await stub.refundCalls()).length;
  const usedBefore = await used();
  const [x, y] = await Promise.all([
    act(state.f.refundId, { action: "initiate", confirmAmountMinor: FEE }),
    act(state.f.refundId, { action: "initiate", confirmAmountMinor: FEE }),
  ]);
  const statuses = [x.status, y.status].sort();
  assert.deepEqual(statuses, [200, 409], `one wins, one is refused: ${JSON.stringify([x.body, y.body])}`);
  assert.equal((await stub.refundCalls()).length, callsBefore + 1, "one gateway call");
  assert.equal(await used(), usedBefore + 1, "one seat");
  const live = await one(`SELECT count(*)::int AS n FROM payment_refunds WHERE intern_payment_id = $1 AND status NOT IN ('failed','rejected')`, [state.f.pay.id]);
  assert.equal(live.n, 1);
});

/* ── Settlement through the webhook ─────────────────────────────────────── */

test("webhook: a bad signature is refused; refund.processed settles the row; a replay changes nothing", async () => {
  const args = { refundId: state.a.refundId, paymentId: state.a.pay.paymentId, gatewayRefundId: state.a.gatewayRefundId };
  const bad = await deliver("refund.processed", args, "0".repeat(64));
  assert.equal(bad.status, 400);
  assert.equal((await refundRow(state.a.refundId)).status, "initiated", "an unsigned event settles nothing");

  const ok = await deliver("refund.processed", args);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const row = await refundRow(state.a.refundId);
  assert.equal(row.status, "refunded");
  assert.ok(row.settled_at, "settled_at is stamped");

  const replay = await deliver("refund.processed", args);
  assert.equal(replay.status, 200);
  const after = await refundRow(state.a.refundId);
  assert.equal(after.status, "refunded");
  assert.equal(String(after.settled_at), String(row.settled_at), "a replay does not re-settle");
  assert.equal(await used(), state.usedAtStart + 2, "settling claims no extra seat (A and F hold one each)");
  const audit = await rows(`SELECT action FROM admin_audit_log WHERE action = 'refund.settle' AND target_id = $1`, [state.a.refundId]).catch(() => []);
  if (audit.length) assert.equal(audit.length, 1, "one settle audit row, not two");
});

test("a refund the gateway reports as processed on the spot is refunded straight away", async () => {
  await stub.mode("processed");
  const made = await create(state.g.pay.id);
  assert.equal(made.body.status, "eligible", JSON.stringify(made.body));
  const r = await act(made.body.refundId, { action: "initiate", confirmAmountMinor: FEE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "refunded");
  state.g.refundId = made.body.refundId;
});

test("no seats left: the annex's only seat is gone, so the next initiate is refused (409) and no call is made", async () => {
  const made = await create(state.h.pay.id);
  assert.equal(made.body.status, "eligible", JSON.stringify(made.body));
  const callsBefore = (await stub.refundCalls()).length;
  const r = await act(made.body.refundId, { action: "initiate", confirmAmountMinor: FEE });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.match(String(r.body.error), /no seats left/i);
  assert.equal((await stub.refundCalls()).length, callsBefore);
  assert.equal((await refundRow(made.body.refundId)).status, "eligible", "the row is untouched");
  assert.equal(await used(state.tinyCollege.collegeId), 1, "the cap holds");
});

/* ── Failure and retry ──────────────────────────────────────────────────── */

test("gateway refusal: 502, the row stays pending with the error; after a refresh finds nothing, a retry reuses the seat", async () => {
  const made = await create(state.d.pay.id);
  state.d.refundId = made.body.refundId;
  await stub.mode("fail");
  const callsBefore = (await stub.refundCalls()).length;
  const usedBefore = await used();
  const r = await act(state.d.refundId, { action: "initiate", confirmAmountMinor: FEE });
  assert.equal(r.status, 502, JSON.stringify(r.body));
  const row = await refundRow(state.d.refundId);
  assert.equal(row.status, "pending");
  assert.match(String(row.last_error), /refused|refund/i, "the gateway's reason is kept");
  assert.equal(row.gateway_refund_id, null);
  assert.equal(await used(), usedBefore + 1, "the seat is held while the refund is pending");
  assert.equal((await stub.refundCalls()).length, callsBefore + 1);

  await stub.mode("processed");
  const refresh = await act(state.d.refundId, { action: "refresh" });
  assert.equal(refresh.status, 200, JSON.stringify(refresh.body));
  assert.equal((await refundRow(state.d.refundId)).status, "pending", "the gateway has no refund for this payment, so nothing is settled");
  const retry = await act(state.d.refundId, { action: "initiate", confirmAmountMinor: FEE });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.ok(["initiated", "refunded"].includes(retry.body.status), retry.body.status);
  assert.equal(await used(), usedBefore + 1, "the retry reused the seat, no second one");
  const refunds = (await stub.refundCalls()).filter((c) => c.path.includes(state.d.pay.paymentId));
  assert.equal(refunds.length, 2, "one refused call, one that went through");
});

test("refund.failed marks the row failed; initiating again makes one new gateway call on the same seat; failed rows can be re-created", async () => {
  await stub.mode("pending");
  const made = await create(state.e.pay.id);
  state.e.refundId = made.body.refundId;
  const first = await act(state.e.refundId, { action: "initiate", confirmAmountMinor: FEE });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.status, "initiated");
  const usedAfterFirst = await used();

  const failed = await deliver("refund.failed", { refundId: state.e.refundId, paymentId: state.e.pay.paymentId, gatewayRefundId: first.body.gatewayRefundId });
  assert.equal(failed.status, 200, JSON.stringify(failed.body));
  assert.equal((await refundRow(state.e.refundId)).status, "failed");

  const callsBefore = (await stub.refundCalls()).length;
  await stub.mode("processed");
  const retry = await act(state.e.refundId, { action: "initiate", confirmAmountMinor: FEE });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.status, "refunded");
  assert.notEqual(retry.body.gatewayRefundId, first.body.gatewayRefundId, "a new gateway refund");
  assert.equal((await stub.refundCalls()).length, callsBefore + 1, "exactly one new call");
  assert.equal(await used(), usedAfterFirst, "the retry reused the seat");
  const live = await one(`SELECT count(*)::int AS n FROM payment_refunds WHERE intern_payment_id = $1 AND status NOT IN ('failed','rejected')`, [state.e.pay.id]);
  assert.equal(live.n, 1);
});

/* ── The admin page ─────────────────────────────────────────────────────── */

test("the admin refunds page lists the rows with their statuses; no sideways scroll at 390 [UI]", async () => {
  const page = await state.adminCtx.newPage();
  try {
    await visit(page, "/admin/colleges/refunds");
    const text = await page.locator("main").innerText();
    expectText(text, /refunded/i, "a refunded row");
    expectText(text, /requires review|review/i, "the interview-taken row");
    expectText(text, new RegExp(state.a.intern.lastName), "the student's name");
    await page.setViewportSize({ width: 390, height: 800 });
    await page.reload();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, "no horizontal scroll at 390 px");
  } catch (err) {
    await shot(page, "page");
    throw err;
  } finally {
    await page.close();
  }
});

test("reject and cancel are not on the happy path: a requires_review row can be rejected with a reason and then never initiated", async () => {
  const row = await one(`SELECT id FROM payment_refunds WHERE intern_payment_id = $1`, [state.b.pay.id]);
  const noReason = await act(row.id, { action: "reject" });
  assert.equal(noReason.status, 400, "a reason is required");
  const ok = await act(row.id, { action: "reject", reason: "Took the AI interview and used the report" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await refundRow(row.id)).status, "rejected");
  const go = await act(row.id, { action: "initiate", confirmAmountMinor: FEE });
  assert.equal(go.status, 409);
  await eventually("no extra gateway calls for the rejected row", async () => (await stub.refundCalls()).every((c) => !c.path.includes(state.b.pay.paymentId)));
});
