/**
 * College money end to end: seat batches, bank, withdrawals, wallet, and the
 * deactivated-college code. The admin and officer are driven through the real
 * routes (one Chromium window per login, so the cookies are the browser's own);
 * the pages are asserted by their text.
 *
 * Re-seeds JKLU first (scripts/seed-colleges.ts), so every run starts from the
 * same demo: cap 300 = the paid batch, 40 used, wallet ₹3,000.
 *
 *   E2E_BASE=http://localhost:3200 E2E_DATABASE_URL=postgresql://... npm run test:e2e:college-money
 *
 * Not covered here: "completing a hire credits once" (a final timesheet has no seed yet); it is unit-tested in money.test.ts / wallet.test.ts.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { seedColleges } from "./lib/env.mjs";

import pg from "pg";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3200";
const DB = process.env.E2E_DATABASE_URL ?? "postgresql://findtern:findtern_dev@localhost:5433/findtern";
const PASSWORD = "Findtern@2026";
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@findtern.dev", password: process.env.E2E_ADMIN_PASSWORD ?? PASSWORD };

let browser, pool, admin, tpo, collegeId, code;
const q = async (sql, params) => (await pool.query(sql, params)).rows;
// Mutations need the double-submit CSRF header, as csrfFetch sends it (src/lib/client-fetch.ts).
const send = async (page, method, path, data) => {
  const csrf = (await page.context().cookies(BASE)).find((c) => c.name === "ft_csrf")?.value;
  const headers = { origin: BASE, ...(csrf && method !== "GET" ? { "x-csrf-token": decodeURIComponent(csrf) } : {}) };
  return page.request.fetch(`${BASE}${path}`, { method, data, headers });
};

async function login(path, creds) {
  const page = await (await browser.newContext()).newPage();
  const res = await page.request.post(`${BASE}${path}`, { data: creds, headers: { origin: BASE } });
  assert.equal(res.status(), 200, `login ${path}`);
  return page;
}

before(async () => {
  seedColleges(DB, BASE);
  pool = new pg.Pool({ connectionString: DB });
  browser = await chromium.launch();
  admin = await login("/api/auth/admin/login", ADMIN);
  tpo = await login("/api/auth/college/login", { email: "tpo@jklu.edu.in", password: PASSWORD });
  [{ id: collegeId }] = await q("SELECT id FROM colleges WHERE slug = 'jklu'");
  [{ code }] = await q("SELECT code FROM promo_codes WHERE college_id = $1", [collegeId]);
});

after(async () => {
  await browser?.close();
  await pool?.end();
});

const cap = async () => (await q("SELECT max_usages FROM promo_codes WHERE college_id = $1", [collegeId]))[0].max_usages;

test("admin: a 100-seat batch marked paid lifts the cap; the officer sees it and its invoice", async () => {
  assert.equal(await cap(), 300, "no free seats: the cap is the paid seats");
  assert.equal((await send(admin, "POST", `/api/admin/colleges/${collegeId}/seat-batches`, { seats: 100 })).status(), 200);
  const [{ id }] = await q("SELECT id FROM college_seat_batches WHERE college_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1", [collegeId]);
  const paid = await send(admin, "PATCH", `/api/admin/colleges/${collegeId}/seat-batches/${id}`, { action: "paid", method: "upi", referenceId: "E2E-UPI-1" });
  assert.equal(paid.status(), 200);
  assert.equal(await cap(), 400);
  const [b] = await q("SELECT invoice_number FROM college_seat_batches WHERE id = $1", [id]);
  assert.ok(b.invoice_number, "paying assigns an invoice number");
  await tpo.goto(`${BASE}/college/seats`);
  const text = await tpo.locator("main").innerText();
  assert.match(text, /E2E-UPI-1|100/);
});

test("officer: saves bank, requests a payout, a second request is 409", async () => {
  const bank = await send(tpo, "PUT", "/api/college/bank", { holder: "JK Lakshmipat University", bankName: "HDFC Bank", accountNumber: "000123456789", confirm: "000123456789", ifsc: "HDFC0000001" });
  assert.equal(bank.status(), 200);
  assert.equal((await send(tpo, "POST", "/api/college/payouts", { amountMinor: 100000 })).status(), 200);
  assert.equal((await send(tpo, "POST", "/api/college/payouts", { amountMinor: 100000 })).status(), 409);
});

test("admin rejects: the money comes back; request again, admin pays: balance falls, one ledger row", async () => {
  const open = async () => (await q("SELECT id FROM college_payouts WHERE college_id = $1 AND status = 'requested'", [collegeId]))[0]?.id;
  const balance = async () => Number((await q("SELECT COALESCE(SUM(amount_minor),0) AS n FROM college_wallet_entries WHERE college_id = $1", [collegeId]))[0].n);
  const before = await balance();
  const first = await open();
  assert.equal((await send(admin, "POST", `/api/admin/colleges/${collegeId}/payouts/${first}`, { action: "reject", reason: "E2E reject" })).status(), 200);
  assert.equal(await balance(), before, "a rejection never touches the ledger");
  assert.equal((await send(tpo, "POST", "/api/college/payouts", { amountMinor: 100000 })).status(), 200);
  const second = await open();
  assert.equal((await send(admin, "POST", `/api/admin/colleges/${collegeId}/payouts/${second}`, { action: "paid", referenceId: "E2E-UTR-1" })).status(), 200);
  assert.equal(await balance(), before - 100000);
  assert.equal((await q("SELECT 1 FROM college_wallet_entries WHERE payout_id = $1 AND kind = 'payout'", [second])).length, 1);
  // Paying twice never debits twice.
  await send(admin, "POST", `/api/admin/colleges/${collegeId}/payouts/${second}`, { action: "paid", referenceId: "E2E-UTR-1" });
  assert.equal(await balance(), before - 100000);
});

test("a deactivated college's code is refused at quote", async () => {
  const [u] = await q("SELECT id, email FROM users WHERE email LIKE '%@jklu.edu.in' ORDER BY email LIMIT 1");
  const stu = await login("/api/auth/login", { email: u.email, password: PASSWORD });
  const quote = () => send(stu, "POST", `/api/intern/${u.id}/payment/validate-promo`, { code });
  assert.equal((await quote()).status(), 200);
  assert.equal((await send(admin, "PATCH", `/api/admin/colleges/${collegeId}`, { isActive: false })).status(), 200);
  try {
    const res = await quote();
    assert.equal(res.status(), 400);
    assert.match((await res.json()).error, /not active/);
  } finally {
    await send(admin, "PATCH", `/api/admin/colleges/${collegeId}`, { isActive: true });
  }
});
