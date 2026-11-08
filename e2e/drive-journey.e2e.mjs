/**
 * College drive journey end to end: drive order -> payment -> roster import ->
 * identity linking -> codes + email -> redemption -> TPO dashboard -> refunds.
 * Browser (one Chromium context per login) + HTTP (the CSRF header goes through `send`)
 * + direct pg assertions, like college-money.e2e.mjs.
 *
 *   E2E_BASE=http://localhost:3300 DATABASE_URL=postgresql://...localhost.../findtern_e2e npm run test:e2e:drive
 *
 * Needs a server on the SAME local database (see the "Drive journey" section of e2e/README.md).
 * Refuses to run unless the DB host and the server host are loopback. FAKE people only.
 * Not runnable in CI without Postgres + a built server; written to be run by hand.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

import { SEED_PASSWORD, freshIpHeaders } from "./lib/env.mjs";
import { rows, one, closeDb } from "./lib/db.mjs";
import { mailTo, waitForMail } from "./lib/mail.mjs";
import {
  assertLocalOnly, compact, codeForRow, csvMultipart, deriveCode, e164, email, fakePhone, futureIso,
  rosterCsv, seedCollege, seedDrive, seedIntern, spacedPhone, RUN,
} from "./lib/drive.mjs";

const { base: BASE } = assertLocalOnly(); // throws on a non-localhost DB or server
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@findtern.dev", password: process.env.E2E_ADMIN_PASSWORD ?? SEED_PASSWORD };
const FEE = 80_000; // paise, the form default

let browser, admin, tpo, tpoOther, college, other, driveId;
const A = {}; // main order (5 slots) and its import

/** Mutations need the double-submit CSRF header, as csrfFetch sends it (src/lib/client-fetch.ts); always sent, because GET /api/admin/refunds is also behind requireMutation and refuses a request without it. */
async function send(page, method, path, data, extra = {}) {
  const csrf = (await page.context().cookies(BASE)).find((c) => c.name === "ft_csrf")?.value;
  const headers = { origin: BASE, ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}), ...(extra.headers ?? {}) };
  return page.request.fetch(`${BASE}${path}`, { method, headers, ...(extra.multipart ? { multipart: extra.multipart } : data !== undefined ? { data } : {}) });
}
const idem = (k) => ({ headers: { "idempotency-key": `e2e-${RUN}-${k}` } });
const json = async (res) => res.json().catch(() => ({}));

async function login(path, creds, viewport) {
  // Each context signs in from its own private IP (TRUST_PROXY=1 on the e2e server): the redeem route allows 30 tries
  // per address per 15 minutes, never bypassed, and a full run (or a rerun inside the window) used to exhaust it.
  const ctx = await browser.newContext({ ...(viewport ? { viewport } : {}), extraHTTPHeaders: freshIpHeaders() });
  const page = await ctx.newPage();
  const res = await page.request.post(`${BASE}${path}`, { data: creds, headers: { origin: BASE } });
  assert.equal(res.status(), 200, `login ${path} as ${creds.email}: ${await res.text()}`);
  return page;
}
const loginIntern = (u, viewport) => login("/api/auth/login", { email: u.email, password: u.password }, viewport);
const redeem = async (page, code) => {
  const res = await send(page, "POST", "/api/intern/drive-codes/redeem", { code, declaredAdult: true });
  return { status: res.status(), body: await json(res) };
};

/** Raise, pay, upload and confirm an order; returns ids and the derived code per row. */
async function confirmedOrder({ slots, people, label }) {
  const created = await send(admin, "POST", `/api/admin/colleges/${college.id}/drive-orders`, { slots, feePerStudentMinor: FEE, codeValidUntil: futureIso(30) }, idem(`${label}-o`));
  assert.equal(created.status(), 201, await created.text());
  const orderId = (await json(created)).order.id;
  assert.equal((await send(admin, "POST", `/api/admin/drive-orders/${orderId}/payment`, { method: "upi", reference: `E2E-${label}-${RUN}` }, idem(`${label}-p`))).status(), 200);
  const up = await send(admin, "POST", `/api/admin/drive-orders/${orderId}/imports`, undefined, { multipart: csvMultipart(rosterCsv(people.map((p) => ({ name: p.name, email: p.mail, phone: spacedPhone(p.phone) })))) });
  assert.equal(up.status(), 200, await up.text());
  const importId = (await json(up)).importId;
  const conf = await send(admin, "POST", `/api/admin/imports/${importId}/confirm`, undefined, idem(`${label}-c`));
  assert.equal(conf.status(), 200, await conf.text());
  const codes = [];
  for (let i = 1; i <= people.length; i += 1) codes.push(await codeForRow(importId, i));
  return { orderId, importId, codes, result: (await json(conf)).result };
}
const person = (label, first, last) => ({ name: `${first} ${last}`, first, last, mail: email(label), phone: fakePhone() });

before(async () => {
  browser = await chromium.launch();
  admin = await login("/api/auth/admin/login", ADMIN);
  college = await seedCollege("main");
  other = await seedCollege("other");
  const [{ id: adminId }] = await rows("SELECT id FROM admins ORDER BY created_at LIMIT 1");
  driveId = await seedDrive(college.id, adminId);
  tpo = await login("/api/auth/college/login", college.tpo);
  tpoOther = await login("/api/auth/college/login", other.tpo);
});

after(async () => {
  await browser?.close();
  await closeDb();
});

const capRows = async () => JSON.stringify(await rows("SELECT id, max_usages FROM promo_codes WHERE college_id = $1 ORDER BY id", [college.id]));

/* ── 1 ───────────────────────────────────────────────────────────────────── */
test("1 admin creates a pending drive order; the drive is not active before payment", async () => {
  const bad = await send(admin, "POST", `/api/admin/colleges/${college.id}/drive-orders`, { slots: 5, feePerStudentMinor: FEE, codeValidUntil: "2020-01-01T00:00:00Z" }, idem("past"));
  assert.equal(bad.status(), 400, "a past validity date is refused");
  const res = await send(admin, "POST", `/api/admin/colleges/${college.id}/drive-orders`, { slots: 5, feePerStudentMinor: FEE, codeValidUntil: futureIso(30), driveId }, idem("a-create"));
  assert.equal(res.status(), 201, await res.text());
  const { order, replayed } = await json(res);
  assert.equal(replayed, false);
  assert.equal(order.status, "pending");
  assert.equal(order.slots, 5);
  assert.equal(order.feePerStudentMinor, FEE);
  assert.equal(order.amountMinor, 5 * FEE);
  A.orderId = order.id;
  const [d] = await rows("SELECT order_id FROM college_drives WHERE id = $1", [driveId]);
  assert.equal(d.order_id, null, "the drive is not linked (not activated) while the order is pending");
  const [o] = await rows("SELECT status, seat_batch_id FROM college_drive_orders WHERE id = $1", [A.orderId]);
  assert.equal(o.status, "pending");
  assert.equal(o.seat_batch_id, null);
  // Same Idempotency-Key: the same order comes back, nothing new is created.
  const again = await send(admin, "POST", `/api/admin/colleges/${college.id}/drive-orders`, { slots: 5, feePerStudentMinor: FEE, codeValidUntil: futureIso(30), driveId }, idem("a-create"));
  assert.equal((await json(again)).order.id, A.orderId);
  // No codes can be issued yet: confirm needs a paid order (covered with the import in test 3/4).
});

/* ── 2 ───────────────────────────────────────────────────────────────────── */
test("2 mark-paid with a reference is idempotent: one seat batch, college cap unchanged", async () => {
  const capBefore = await capRows();
  const first = await send(admin, "POST", `/api/admin/drive-orders/${A.orderId}/payment`, { method: "bank", reference: `E2E-REF-${RUN}` }, idem("a-pay"));
  assert.equal(first.status(), 200, await first.text());
  const f = await json(first);
  assert.equal(f.order.status, "paid");
  assert.equal(f.replayed, false);
  assert.equal(f.activated, true, "paying links the drive to its order");
  const second = await send(admin, "POST", `/api/admin/drive-orders/${A.orderId}/payment`, { method: "bank", reference: `E2E-REF-${RUN}` }, idem("a-pay-2"));
  assert.equal(second.status(), 200);
  assert.equal((await json(second)).replayed, true);
  assert.equal((await rows("SELECT 1 FROM college_seat_batches WHERE drive_order_id = $1", [A.orderId])).length, 1);
  assert.equal(await capRows(), capBefore, "a drive order never raises the college seat cap");
  const [o] = await rows("SELECT status, seat_batch_id, gateway_ref FROM college_drive_orders WHERE id = $1", [A.orderId]);
  assert.equal(o.status, "paid");
  assert.ok(o.seat_batch_id);
  assert.equal(o.gateway_ref, `E2E-REF-${RUN}`);
  assert.equal((await rows("SELECT order_id FROM college_drives WHERE id = $1", [driveId]))[0].order_id, A.orderId);
});

/* ── 3 ───────────────────────────────────────────────────────────────────── */
// People: 1 verified-email intern, 2 unverified-email intern, 3 phone+name only, 6 phone+name only, 4 bad phone,
// 5 duplicate of 1, 7 plain, 8 and 9 over the 5-slot limit.
const P = {};
test("3 roster preview counts every state with reasons; re-uploading returns the same import", async () => {
  P.verified = await seedIntern({ label: "asha", first: "Asha", last: "Verma" });
  P.unverified = await seedIntern({ label: "bhanu", first: "Bhanu", last: "Rao", verified: false });
  P.phoneOnly = await seedIntern({ label: "chitra-personal", first: "Chitra", last: "Nair" }); // college email differs
  P.phoneOnly2 = await seedIntern({ label: "farhan-personal", first: "Farhan", last: "Khan" });
  const eAsha = P.verified.email, eBhanu = P.unverified.email, eChitra = email("chitra-college"), eFarhan = email("farhan-college");
  const csv = rosterCsv([
    { name: "Asha Verma", email: eAsha, phone: "" },
    { name: "Rao, Bhanu", email: eBhanu, phone: spacedPhone(fakePhone()) }, // quoted comma
    { name: "Chitra Nair", email: eChitra, phone: spacedPhone(P.phoneOnly.phone) },
    { name: "Dev Singh", email: email("dev"), phone: "12345" }, // bad phone
    { name: "Esha Iyer", email: eAsha.toUpperCase(), phone: "" }, // duplicate of row 1 (case-insensitive)
    { name: "Farhan Khan", email: eFarhan, phone: spacedPhone(P.phoneOnly2.phone) },
    { name: "Gita Rao", email: email("gita"), phone: "" },
    { name: "Hari Om", email: email("hari"), phone: "" }, // over the 5-slot limit
    { name: "Indu Pal", email: email("indu"), phone: "" }, // over the 5-slot limit
  ]);
  const up = await send(admin, "POST", `/api/admin/drive-orders/${A.orderId}/imports`, undefined, { multipart: csvMultipart(csv) });
  assert.equal(up.status(), 200, await up.text());
  const body = await json(up);
  assert.equal(body.needsMapping, false);
  assert.equal(body.replayed, false);
  A.importId = body.importId;
  assert.deepEqual(
    { valid: body.counts.valid, invalid: body.counts.invalid, duplicate: body.counts.duplicate, over_allocation: body.counts.over_allocation, total: body.counts.total },
    { valid: 5, invalid: 1, duplicate: 1, over_allocation: 2, total: 9 },
  );
  const row = (n) => body.rows.find((r) => r.rowNo === n);
  assert.equal(row(2).name, "Rao, Bhanu", "a quoted comma stays inside the name");
  assert.equal(row(4).state, "invalid");
  assert.ok(row(4).reasons.includes("phone_invalid"));
  assert.equal(row(5).state, "duplicate");
  assert.ok(row(5).reasons.includes("duplicate_email_in_file"));
  for (const n of [8, 9]) {
    assert.equal(row(n).state, "over_allocation");
    assert.ok(row(n).reasons.includes("over_allocation"));
  }
  assert.equal(row(3).phone, e164(P.phoneOnly.phone), "phones are normalised to E.164");
  // Re-upload of the same bytes: the existing import, no duplicate rows.
  const again = await send(admin, "POST", `/api/admin/drive-orders/${A.orderId}/imports`, undefined, { multipart: csvMultipart(csv, "renamed.csv") });
  const a = await json(again);
  assert.equal(again.status(), 200);
  assert.equal(a.replayed, true);
  assert.equal(a.importId, A.importId);
  assert.equal((await rows("SELECT 1 FROM drive_imports WHERE order_id = $1", [A.orderId])).length, 1);
  assert.equal((await rows("SELECT 1 FROM drive_roster_entries WHERE order_id = $1", [A.orderId])).length, 9);
  assert.equal((await rows("SELECT 1 FROM drive_codes WHERE order_id = $1", [A.orderId])).length, 0, "a preview issues nothing");
  // A non-CSV body is refused (415), not parsed.
  const png = await send(admin, "POST", `/api/admin/drive-orders/${A.orderId}/imports`, undefined, { multipart: { file: { name: "x.csv", mimeType: "text/csv", buffer: Buffer.from([0, 1, 2, 3]) } } });
  assert.equal(png.status(), 415);
});

/* ── 4 ───────────────────────────────────────────────────────────────────── */
test("4 confirm links only a verified-email match; phone+name only queues a review; codes for valid rows only", async () => {
  const usersBefore = (await one("SELECT count(*)::int AS n FROM users"))?.n;
  const emailsBefore = await rows("SELECT id, email FROM users WHERE id = ANY($1::text[]) ORDER BY id", [[P.verified.id, P.unverified.id, P.phoneOnly.id, P.phoneOnly2.id]]);
  const conf = await send(admin, "POST", `/api/admin/imports/${A.importId}/confirm`, undefined, idem("a-confirm"));
  assert.equal(conf.status(), 200, await conf.text());
  const first = await json(conf);
  assert.equal(first.replayed, false);
  assert.deepEqual(first.result, { linked: 1, reviews: 2, codesIssued: 5, skipped: 0 });
  assert.equal((await one("SELECT count(*)::int AS n FROM users"))?.n, usersBefore, "confirming creates no users");
  assert.deepEqual(await rows("SELECT id, email FROM users WHERE id = ANY($1::text[]) ORDER BY id", [[P.verified.id, P.unverified.id, P.phoneOnly.id, P.phoneOnly2.id]]), emailsBefore, "no user's email changes");
  const entry = async (n) => (await rows("SELECT id, intern_id, state FROM drive_roster_entries WHERE import_id = $1 AND row_no = $2", [A.importId, n]))[0];
  assert.equal((await entry(1)).intern_id, P.verified.id, "verified email -> linked");
  assert.equal((await entry(2)).intern_id, null, "an unverified email never links");
  assert.equal((await entry(3)).intern_id, null, "phone+name never links by itself");
  assert.equal((await entry(6)).intern_id, null);
  const mem = await one("SELECT status, verified_by FROM college_memberships WHERE user_id = $1 AND college_id = $2", [P.verified.id, college.id]);
  assert.equal(mem?.status, "verified");
  assert.equal((await rows("SELECT 1 FROM college_memberships WHERE user_id = ANY($1::text[])", [[P.unverified.id, P.phoneOnly.id, P.phoneOnly2.id]])).length, 0);
  const reviews = await rows("SELECT e.row_no, v.candidate_intern_id, v.status FROM identity_reviews v JOIN drive_roster_entries e ON e.id = v.entry_id WHERE v.order_id = $1 ORDER BY e.row_no", [A.orderId]);
  assert.deepEqual(reviews.map((r) => [r.row_no, r.candidate_intern_id, r.status]), [[3, P.phoneOnly.id, "pending"], [6, P.phoneOnly2.id, "pending"]]);
  const codes = await rows("SELECT e.state FROM drive_codes c JOIN drive_roster_entries e ON e.id = c.entry_id WHERE c.order_id = $1", [A.orderId]);
  assert.equal(codes.length, 5);
  assert.ok(codes.every((c) => c.state === "valid"), "no code for an invalid, duplicate or over-limit row");
  assert.equal((await rows("SELECT issued_count FROM college_drive_orders WHERE id = $1", [A.orderId]))[0].issued_count, 5);
  const second = await send(admin, "POST", `/api/admin/imports/${A.importId}/confirm`, undefined, idem("a-confirm-2"));
  const s = await json(second);
  assert.equal(second.status(), 200);
  assert.equal(s.replayed, true);
  assert.deepEqual(s.result, first.result);
  assert.equal((await rows("SELECT 1 FROM drive_codes WHERE order_id = $1", [A.orderId])).length, 5, "a second confirm issues no extra codes");
});

/* ── 5 ───────────────────────────────────────────────────────────────────── */
test("5 identity review: link only a listed candidate; reject leaves the row unlinked", async () => {
  const list = await json(await send(admin, "GET", `/api/admin/identity-reviews?collegeId=${college.id}`));
  assert.equal(list.reviews.length, 2);
  const forChitra = list.reviews.find((r) => r.candidateId === P.phoneOnly.id);
  const forFarhan = list.reviews.find((r) => r.candidateId === P.phoneOnly2.id);
  assert.ok(forChitra && forFarhan);
  // A student who is not in the review is refused, and nothing changes.
  const wrong = await send(admin, "POST", `/api/admin/identity-reviews/${forChitra.id}`, { decision: "link", internId: P.verified.id });
  assert.equal(wrong.status(), 400);
  assert.equal((await rows("SELECT status FROM identity_reviews WHERE id = $1", [forChitra.id]))[0].status, "pending");
  assert.equal((await rows("SELECT intern_id FROM drive_roster_entries WHERE id = (SELECT entry_id FROM identity_reviews WHERE id = $1)", [forChitra.id]))[0].intern_id, null);
  // The listed candidate links.
  const ok = await send(admin, "POST", `/api/admin/identity-reviews/${forChitra.id}`, { decision: "link", internId: P.phoneOnly.id });
  assert.equal(ok.status(), 200, await ok.text());
  assert.equal((await json(ok)).status, "linked");
  assert.equal((await rows("SELECT intern_id FROM drive_roster_entries WHERE id = (SELECT entry_id FROM identity_reviews WHERE id = $1)", [forChitra.id]))[0].intern_id, P.phoneOnly.id);
  assert.equal((await rows("SELECT status FROM college_memberships WHERE user_id = $1", [P.phoneOnly.id]))[0].status, "verified");
  // Reject path.
  const no = await send(admin, "POST", `/api/admin/identity-reviews/${forFarhan.id}`, { decision: "reject" });
  assert.equal(no.status(), 200, await no.text());
  assert.equal((await json(no)).status, "rejected");
  assert.equal((await rows("SELECT status FROM identity_reviews WHERE id = $1", [forFarhan.id]))[0].status, "rejected");
  assert.equal((await rows("SELECT intern_id FROM drive_roster_entries WHERE id = (SELECT entry_id FROM identity_reviews WHERE id = $1)", [forFarhan.id]))[0].intern_id, null);
  assert.equal((await rows("SELECT 1 FROM college_memberships WHERE user_id = $1", [P.phoneOnly2.id])).length, 0);
  // Deciding an already decided review does not flip it.
  assert.equal((await send(admin, "POST", `/api/admin/identity-reviews/${forFarhan.id}`, { decision: "link", internId: P.phoneOnly2.id })).status(), 409);
  assert.equal((await send(admin, "POST", `/api/admin/identity-reviews/${forFarhan.id}`, { decision: "maybe" })).status(), 400);
});

/* ── 6 ───────────────────────────────────────────────────────────────────── */
test("6 campaign: one email per code, no plain code in the DB, resend adds an outbox row", async (t) => {
  const since = Date.now() - 1000;
  const camp = await send(admin, "POST", `/api/admin/drive-orders/${A.orderId}/campaign`);
  assert.equal(camp.status(), 200, await camp.text());
  const c = await json(camp);
  assert.equal(c.queued, 5);
  const outbox = () => rows("SELECT ob.id, ob.to_email, ob.status FROM email_outbox ob JOIN email_campaigns ca ON ca.id::text = ob.campaign_id WHERE ca.order_id = $1 ORDER BY ob.created_at, ob.id", [A.orderId]);
  assert.equal((await outbox()).length, 5, "one outbox row per code");
  // Repeating the campaign queues nothing more.
  assert.equal((await json(await send(admin, "POST", `/api/admin/drive-orders/${A.orderId}/campaign`))).queued, 0);

  // The DB never holds a plain code: only code_hash / code_last4, and no value of any row contains one.
  const cols = (await rows("SELECT column_name FROM information_schema.columns WHERE table_name = 'drive_codes'")).map((r) => r.column_name);
  assert.ok(cols.includes("code_hash") && cols.includes("code_last4"));
  assert.ok(!cols.includes("code") && !cols.includes("plain_code"), `unexpected plain-code column in ${cols}`);
  const plain = [];
  for (let n = 1; n <= 9; n += 1) {
    try { plain.push(await codeForRow(A.importId, n)); } catch { /* rows without a code */ }
  }
  assert.equal(plain.length, 5);
  const dump = (await rows("SELECT to_jsonb(d)::text AS t FROM drive_codes d WHERE order_id = $1", [A.orderId])).map((r) => r.t).join("\n")
    + (await rows("SELECT to_jsonb(ob)::text AS t FROM email_outbox ob JOIN email_campaigns ca ON ca.id::text = ob.campaign_id WHERE ca.order_id = $1", [A.orderId])).map((r) => r.t).join("\n");
  for (const code of plain) {
    assert.ok(!dump.toUpperCase().includes(compact(code)) && !dump.toUpperCase().includes(code), "plain code found in the database");
  }
  const lasts = (await rows("SELECT code_last4 FROM drive_codes WHERE order_id = $1", [A.orderId])).map((r) => r.code_last4);
  assert.ok(plain.every((p) => lasts.includes(compact(p).slice(-4))), "last4 matches the derived code");

  // Sending needs the outbox tick: GET /api/cron/email-outbox with CRON_SECRET, on a server with SCHEDULERS != off.
  const secret = process.env.CRON_SECRET;
  const tick = secret ? await fetch(`${BASE}/api/cron/email-outbox`, { headers: { authorization: `Bearer ${secret}` } }) : null;
  const tickBody = tick ? await tick.json().catch(() => ({})) : {};
  if (!tick || tick.status !== 200 || tickBody.skipped) {
    t.skip(`outbox not driven (needs CRON_SECRET in this process and the server, and SCHEDULERS not "off"; got ${tick ? `${tick.status} ${JSON.stringify(tickBody)}` : "no CRON_SECRET"}). Mail assertions skipped; DB assertions above passed.`);
    return;
  }
  const people = await rows("SELECT e.college_email_norm AS mail, c.id AS code_id FROM drive_roster_entries e JOIN drive_codes c ON c.entry_id = e.id WHERE e.order_id = $1", [A.orderId]);
  for (const p of people) {
    const mine = deriveCode(p.code_id);
    const [m] = await waitForMail(p.mail, { since });
    const all = await mailTo(p.mail, { since });
    assert.equal(all.length, 1, `exactly one email to ${p.mail}`);
    assert.ok(m.text.includes(mine) || m.text.includes(compact(mine)), "the email carries the student's code");
    for (const other of plain.filter((x) => x !== mine)) assert.ok(!m.text.includes(other) && !m.text.includes(compact(other)), "no other student's code");
  }
  const before = (await outbox()).length;
  const sent = (await outbox()).find((r) => r.status === "sent");
  assert.ok(sent, "an email was marked sent");
  const rs = await send(admin, "POST", `/api/admin/drive-orders/${A.orderId}/outbox/${sent.id}/resend`);
  assert.equal(rs.status(), 200, await rs.text());
  assert.equal((await outbox()).length, before + 1, "resend creates a new outbox row");
});

/* ── 7 ───────────────────────────────────────────────────────────────────── */
test("7 redemption: waiver payment, entitlement, verified membership; every refusal has its status", async () => {
  P.r1 = await seedIntern({ label: "redeemer1", first: "Ravi", last: "Kumar" }); // email differs from the roster email
  P.r2 = await seedIntern({ label: "redeemer2", first: "Rita", last: "Sen" });
  const code6 = await codeForRow(A.importId, 6); // Farhan: review rejected, so unlinked
  const r1 = await loginIntern(P.r1);
  const r2 = await loginIntern(P.r2);
  const ok = await redeem(r1, code6);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.collegeName);
  const pay = await one("SELECT gateway, amount_minor, status, invoice_number, order_id FROM intern_payments WHERE intern_id = $1", [P.r1.id]);
  assert.equal(pay.gateway, "college_drive");
  assert.equal(pay.amount_minor, 0);
  assert.equal(pay.status, "paid");
  assert.equal(pay.invoice_number ?? null, null, "a waiver has no invoice number");
  const ent = await one("SELECT order_id, college_id, payment_id FROM drive_entitlements WHERE intern_id = $1", [P.r1.id]);
  assert.equal(ent.order_id, A.orderId);
  assert.equal(ent.college_id, college.id);
  assert.ok(ent.payment_id);
  const mem = await one("SELECT status, verified_by FROM college_memberships WHERE user_id = $1 AND college_id = $2", [P.r1.id, college.id]);
  assert.deepEqual([mem.status, mem.verified_by], ["verified", "drive_code"]);
  assert.equal((await one("SELECT redeemed_count FROM college_drive_orders WHERE id = $1", [A.orderId])).redeemed_count, 1);
  assert.equal((await one("SELECT status FROM drive_codes WHERE entry_id = (SELECT id FROM drive_roster_entries WHERE import_id = $1 AND row_no = 6)", [A.importId])).status, "redeemed");

  // Same code again by the same student: used.
  assert.equal((await redeem(r1, code6)).status, 409);
  // A second student with the used code: refused (403 once the row is bound to the first student, 409 if the code is simply used).
  const second = await redeem(r2, code6);
  assert.ok([403, 409].includes(second.status), `second intern got ${second.status}`);
  // Wrong code and unknown code give the same 404 body.
  const wrong = await redeem(r2, `${code6.slice(0, -1)}${code6.endsWith("2") ? "3" : "2"}`);
  const unknown = await redeem(r2, "ZZZZ-ZZZZ-ZZZZ");
  assert.equal(wrong.status, 404);
  assert.equal(unknown.status, 404);
  assert.deepEqual(wrong.body, unknown.body);
  // Another student's linked entry (row 1 belongs to the verified-email intern): refused.
  const bound = await redeem(r2, await codeForRow(A.importId, 1));
  assert.equal(bound.status, 403);
  assert.equal((await rows("SELECT 1 FROM drive_entitlements WHERE intern_id = $1", [P.r2.id])).length, 0);
  // Expired code (row 7).
  await rows("UPDATE drive_codes SET valid_until = now() - interval '1 day' WHERE entry_id = (SELECT id FROM drive_roster_entries WHERE import_id = $1 AND row_no = 7)", [A.importId]);
  assert.equal((await redeem(r2, await codeForRow(A.importId, 7))).status, 410);
  // Unpaid order (row 3 belongs to the linked phone+name intern, who redeems their own code).
  await rows("UPDATE college_drive_orders SET status = 'pending' WHERE id = $1", [A.orderId]);
  try {
    const chitra = await loginIntern(P.phoneOnly);
    assert.equal((await redeem(chitra, await codeForRow(A.importId, 3))).status, 402);
  } finally {
    await rows("UPDATE college_drive_orders SET status = 'paid' WHERE id = $1", [A.orderId]);
  }
  assert.equal((await one("SELECT redeemed_count FROM college_drive_orders WHERE id = $1", [A.orderId])).redeemed_count, 1, "refusals redeem nothing");
});

/* ── 8 ───────────────────────────────────────────────────────────────────── */
test("8 eight parallel redemptions of one code: exactly one 200", async () => {
  const people = [person("c1", "Kiran", "Das"), person("c2", "Lata", "Roy"), person("c3", "Mohan", "Lal")];
  const o = await confirmedOrder({ slots: 3, people, label: "race" });
  assert.equal(o.result.codesIssued, 3);
  const racers = [];
  for (let i = 0; i < 8; i += 1) racers.push(await loginIntern(await seedIntern({ label: `racer${i}`, first: `Racer${i}`, last: "Test" })));
  const results = await Promise.all(racers.map((p) => redeem(p, o.codes[0])));
  const statuses = results.map((r) => r.status).sort();
  assert.equal(statuses.filter((s) => s === 200).length, 1, `statuses: ${statuses}`);
  assert.ok(statuses.every((s) => [200, 403, 409].includes(s)), `no 5xx or 429 expected, got ${statuses}`);
  const [ord] = await rows("SELECT issued_count, redeemed_count FROM college_drive_orders WHERE id = $1", [o.orderId]);
  assert.equal(ord.redeemed_count, 1);
  assert.equal((await rows("SELECT 1 FROM drive_entitlements WHERE order_id = $1", [o.orderId])).length, 1);
});

/* ── 9 ───────────────────────────────────────────────────────────────────── */
test("9 slots: issued <= slots and redeemed <= issued, enforced by the database too", async () => {
  const people = [person("s1", "Neha", "Jain"), person("s2", "Om", "Puri"), person("s3", "Pia", "Dutt")];
  const o = await confirmedOrder({ slots: 2, people: people.slice(0, 2), label: "slots" });
  assert.equal(o.result.codesIssued, 2);
  // A third row cannot get a code: the preview marks it over the limit, confirm refuses.
  const up = await send(admin, "POST", `/api/admin/drive-orders/${o.orderId}/imports`, undefined, { multipart: csvMultipart(rosterCsv([{ name: people[2].name, email: people[2].mail, phone: "" }]), "extra.csv") });
  assert.equal(up.status(), 200, await up.text());
  const extra = await json(up);
  assert.equal(extra.counts.over_allocation, 1);
  const conf = await send(admin, "POST", `/api/admin/imports/${extra.importId}/confirm`, undefined, idem("slots-extra"));
  assert.ok([400, 409].includes(conf.status()), `confirm over the limit -> ${conf.status()}`);
  for (const [i, code] of o.codes.entries()) {
    const intern = await seedIntern({ label: `slot-intern${i}`, first: `Slot${i}`, last: "Test" });
    assert.equal((await redeem(await loginIntern(intern), code)).status, 200);
  }
  const [ord] = await rows("SELECT slots, issued_count, redeemed_count FROM college_drive_orders WHERE id = $1", [o.orderId]);
  assert.deepEqual([ord.slots, ord.issued_count, ord.redeemed_count], [2, 2, 2]);
  assert.ok(ord.issued_count <= ord.slots && ord.redeemed_count <= ord.issued_count);
  const refused = async (sql) => {
    await assert.rejects(rows(sql, [o.orderId]), (e) => e.code === "23514", `expected a CHECK violation (23514) from: ${sql}`);
  };
  await refused("UPDATE college_drive_orders SET issued_count = slots + 1 WHERE id = $1");
  await refused("UPDATE college_drive_orders SET redeemed_count = issued_count + 1 WHERE id = $1");
  await refused("UPDATE college_drive_orders SET amount_minor = amount_minor + 1 WHERE id = $1");
  const [after] = await rows("SELECT issued_count, redeemed_count FROM college_drive_orders WHERE id = $1", [o.orderId]);
  assert.deepEqual([after.issued_count, after.redeemed_count], [2, 2]);
});

/* ── 10 ──────────────────────────────────────────────────────────────────── */
test("10 TPO dashboard: counts match, no plain code or full phone, another college sees nothing", async () => {
  const res = await tpo.request.get(`${BASE}/api/college/drive-dashboard?pageSize=100`);
  assert.equal(res.status(), 200);
  const text = await res.text();
  const body = JSON.parse(text);
  const [sums] = await rows("SELECT coalesce(sum(slots),0)::int AS slots, coalesce(sum(issued_count),0)::int AS issued, coalesce(sum(redeemed_count),0)::int AS redeemed FROM college_drive_orders WHERE college_id = $1 AND status IN ('paid','partially_refunded')", [college.id]);
  assert.deepEqual([body.metrics.totals.slots, body.metrics.totals.issued, body.metrics.totals.redeemed], [sums.slots, sums.issued, sums.redeemed]);
  const [{ n: entries }] = await rows("SELECT count(*)::int AS n FROM drive_roster_entries e JOIN college_drive_orders o ON o.id = e.order_id WHERE o.college_id = $1", [college.id]);
  assert.equal(body.students.total, entries);
  assert.ok(body.students.rows.length > 0);
  // No plain code (derived or compact), no 10-digit phone, no +91 number anywhere in the JSON.
  const codes = await rows("SELECT c.id FROM drive_codes c JOIN college_drive_orders o ON o.id = c.order_id WHERE o.college_id = $1", [college.id]);
  for (const c of codes) {
    const code = deriveCode(c.id);
    assert.ok(!text.toUpperCase().includes(code) && !text.toUpperCase().includes(compact(code)));
  }
  assert.ok(!/\+91|\b\d{10}\b|\b[6-9]\d{4}[ -]?\d{5}\b/.test(text), "no phone number in the dashboard JSON");
  assert.ok(body.students.rows.every((r) => r.email.includes("•••@")), "emails are masked");
  const mine = await json(await tpoOther.request.get(`${BASE}/api/college/drive-dashboard?pageSize=100`));
  assert.equal(mine.students.total, 0);
  assert.deepEqual(mine.students.rows, []);
  assert.deepEqual(mine.metrics.orders, []);
  const names = new Set(body.students.rows.map((r) => r.name));
  assert.ok(![...names].some((n) => JSON.stringify(mine).includes(n)), "the other college sees none of these students");
  // Anonymous callers get nothing.
  assert.equal((await (await browser.newContext()).request.get(`${BASE}/api/college/drive-dashboard`)).status(), 401);
});

/* ── 11 ──────────────────────────────────────────────────────────────────── */
const R = {};
test("11a refunds: scan copies the paid amount once; a consumed interview goes to review", async () => {
  const people = [person("f1", "Qadir", "Ali"), person("f2", "Rhea", "Sood")];
  const o = await confirmedOrder({ slots: 2, people, label: "refund" });
  R.interns = [];
  for (const [i, code] of o.codes.entries()) {
    const intern = await seedIntern({ label: `refund-intern${i}`, first: `Refund${i}`, last: "Test" });
    R.interns.push(intern);
    assert.equal((await redeem(await loginIntern(intern), code)).status, 200);
    // The redeem route refuses a student whose fee is already paid, so the Rs 2,500 razorpay payment is placed
    // as if it settled just before the redemption (e.g. a late webhook): paid_at one hour before redeemed_at.
    await rows(
      `INSERT INTO intern_payments (intern_id, gateway, order_id, payment_id, amount_minor, currency, status, paid_at)
       SELECT $1::varchar, 'razorpay', $2, $3, 250000, 'INR', 'paid', e.redeemed_at - interval '1 hour' FROM drive_entitlements e WHERE e.intern_id = $1`,
      [intern.id, `order_e2e_${RUN}_${i}`, `pay_e2e_${RUN}_${i}`],
    );
  }
  await rows("UPDATE drive_entitlements SET interview_status = 'completed' WHERE intern_id = $1", [R.interns[1].id]);
  const ids = R.interns.map((i) => i.id);
  const scan = await send(admin, "POST", "/api/admin/refunds");
  assert.equal(scan.status(), 200, await scan.text());
  const refundsFor = () => rows("SELECT r.id, r.amount_minor, r.status, r.reason, p.intern_id FROM payment_refunds r JOIN intern_payments p ON p.id = r.intern_payment_id WHERE p.intern_id = ANY($1::text[]) ORDER BY p.intern_id", [ids]);
  const made = await refundsFor();
  assert.equal(made.length, 2, "exactly one refund row per payment");
  for (const r of made) assert.equal(r.amount_minor, 250000, "amount copied from the payment");
  const byIntern = Object.fromEntries(made.map((r) => [r.intern_id, r]));
  assert.equal(byIntern[R.interns[0].id].status, "eligible");
  assert.equal(byIntern[R.interns[1].id].status, "review", "a consumed interview needs a person to decide");
  assert.equal(byIntern[R.interns[1].id].reason, "interview_consumed");
  R.first = byIntern[R.interns[0].id];
  R.second = byIntern[R.interns[1].id];
  // A second scan creates nothing for these payments.
  await send(admin, "POST", "/api/admin/refunds");
  assert.equal((await refundsFor()).length, 2);
  // The listing shows it.
  const listRes = await send(admin, "GET", "/api/admin/refunds?status=review&per=100");
  assert.equal(listRes.status(), 200, await listRes.text());
  const list = await json(listRes);
  assert.ok(list.rows.some((r) => r.id === R.second.id));
});

test("11b refunds: initiate needs confirm and the equal amount; with no Razorpay keys it fails safely", async () => {
  const url = `/api/admin/refunds/${R.first.id}/initiate`;
  const status = async () => (await one("SELECT status, gateway_refund_id FROM payment_refunds WHERE id = $1", [R.first.id]));
  const noConfirm = await send(admin, "POST", url, { amountMinor: 250000 });
  assert.ok(noConfirm.status() >= 400 && noConfirm.status() < 500);
  assert.equal((await json(noConfirm)).reason, "confirm_required");
  const wrong = await send(admin, "POST", url, { confirm: true, amountMinor: 100 });
  assert.ok(wrong.status() >= 400 && wrong.status() < 500);
  assert.equal((await json(wrong)).reason, "amount_mismatch");
  assert.equal((await status()).status, "eligible", "a refused initiate changes nothing");
  // Server env has RAZORPAY_KEY_ID/SECRET blank (e2e/run.mjs): the gateway call cannot succeed.
  const go = await send(admin, "POST", url, { confirm: true, amountMinor: 250000 });
  assert.equal(go.ok(), false, "must not report success without a gateway");
  const after = await status();
  assert.notEqual(after.status, "refunded");
  assert.ok(["failed", "initiated"].includes(after.status), `status ${after.status}`);
  assert.equal(after.gateway_refund_id, null);
  // No second attempt on the same row.
  const again = await send(admin, "POST", url, { confirm: true, amountMinor: 250000 });
  assert.equal(again.ok(), false);
});

const webhookBody = (refundId) => JSON.stringify({ event: "refund.processed", payload: { refund: { entity: { id: refundId, status: "processed" } } } });
const postWebhook = (body, sig) => fetch(`${BASE}/api/webhooks/razorpay`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, ...(sig ? { "x-razorpay-signature": sig } : {}) }, body });

test("11c refunds: a refund.processed webhook with a bad or missing signature is rejected", async () => {
  const gid = `rfnd_e2e_bad_${RUN}`;
  await rows("UPDATE payment_refunds SET status = 'initiated', gateway_refund_id = $2 WHERE id = $1", [R.second.id, gid]);
  const body = webhookBody(gid);
  assert.equal((await postWebhook(body, "00".repeat(32))).status, 400);
  assert.equal((await postWebhook(body)).status, 400);
  assert.equal((await one("SELECT status FROM payment_refunds WHERE id = $1", [R.second.id])).status, "initiated", "nothing settled");
});

test("11d refunds: a validly signed refund.processed webhook settles once", { skip: process.env.E2E_WEBHOOK_SECRET ? false : "needs E2E_WEBHOOK_SECRET set here AND the server started with RAZORPAY_WEBHOOK_SECRET to the same value; e2e/run.mjs blanks it" }, async () => {
  const gid = `rfnd_e2e_ok_${RUN}`;
  await rows("UPDATE payment_refunds SET status = 'initiated', gateway_refund_id = $2 WHERE id = $1", [R.second.id, gid]);
  const body = webhookBody(gid);
  const sig = createHmac("sha256", process.env.E2E_WEBHOOK_SECRET).update(body).digest("hex");
  assert.equal((await postWebhook(body, sig)).status, 200);
  assert.equal((await one("SELECT status FROM payment_refunds WHERE id = $1", [R.second.id])).status, "refunded");
  assert.equal((await postWebhook(body, sig)).status, 200, "a replay is a no-op");
  assert.equal((await one("SELECT status FROM payment_refunds WHERE id = $1", [R.second.id])).status, "refunded");
});

/* ── mobile smoke + accessibility ────────────────────────────────────────── */
const MOBILE = { width: 390, height: 844 };
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("12 mobile 390x844: admin drive panel has no horizontal scroll and its headings", async () => {
  const page = await login("/api/auth/admin/login", ADMIN, MOBILE);
  await page.goto(`${BASE}/admin/colleges/${college.id}?tab=drives`, { waitUntil: "domcontentloaded" });
  await page.getByText("Drive orders", { exact: true }).first().waitFor({ timeout: 20_000 });
  await page.getByText("Identity review", { exact: true }).first().waitFor();
  assert.ok(await noHorizontalScroll(page), "page scrolls sideways at 390px");
  await page.context().close();
});

test("13 mobile 390x844: TPO dashboard has no horizontal scroll and its headings", async () => {
  const page = await login("/api/auth/college/login", college.tpo, MOBILE);
  await page.goto(`${BASE}/college`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: college.name }).first().waitFor({ timeout: 20_000 });
  await page.getByRole("region", { name: "Drive dashboard" }).waitFor();
  await page.waitForLoadState("networkidle").catch(() => {});
  assert.ok(await noHorizontalScroll(page), "page scrolls sideways at 390px");
  await page.context().close();
});

test("14 axe: the TPO dashboard has no serious or critical violations", async () => {
  const page = await login("/api/auth/college/login", college.tpo);
  await page.goto(`${BASE}/college`, { waitUntil: "domcontentloaded" });
  await page.getByRole("region", { name: "Drive dashboard" }).waitFor({ timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  assert.deepEqual(bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`), []);
  await page.context().close();
});
