/**
 * Intern payouts and drive orders end to end, against a LOCAL throwaway database (package U, money out).
 * Real routes, real transactions, real audit rows: what the pure tests (src/lib/admin/payout-audit.test.ts,
 * money-payouts.test.ts) cannot show.
 *
 *   E2E_BASE=http://localhost:3219 E2E_DATABASE_URL=postgresql://...127.0.0.1... node --test e2e/payouts-money.e2e.mjs
 *
 * Needs `npm run db:seed` data (admin@findtern.dev, hired proposals with onboarding rows) and the JKLU demo
 * (scripts/seed-colleges.ts). It rewrites four hired placements it picks itself, and creates its own admin roles
 * rows for the permission checks, so a re-run starts from the same state. Refuses a non-loopback database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { chromium } from "playwright";
import { freshIpHeaders, testDatabaseUrl } from "./lib/env.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3219";
const DB = testDatabaseUrl(process.env.E2E_DATABASE_URL);
const PASSWORD = "Findtern@2026";

let browser, pool, admin, sales, emp, anon, hires;
const q = async (sql, params) => (await pool.query(sql, params)).rows;

async function login(path, creds) {
  const page = await (await browser.newContext({ extraHTTPHeaders: freshIpHeaders() })).newPage();
  const res = await page.request.post(`${BASE}${path}`, { data: creds, headers: { origin: BASE } });
  assert.equal(res.status(), 200, `login ${path}`);
  return page;
}
async function send(page, method, path, data, { noCsrf = false, headers = {} } = {}) {
  const csrf = (await page.context().cookies(BASE)).find((c) => c.name === "ft_csrf")?.value;
  const res = await page.request.fetch(`${BASE}${path}`, {
    method,
    data,
    headers: { origin: BASE, ...(csrf && !noCsrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}), ...headers },
  });
  let body;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: res.status(), body };
}

const bank = { accountHolderName: "Test Intern", bankName: "HDFC Bank", accountNumber: "123456789012", ifscCode: "HDFC0001234", upiId: "test@okaxis" };
const offer = (start, stipend) => ({ roleTitle: "Design Intern", mode: "remote", duration: "3m", startDate: start, monthlyHours: 160, hourlyRate: 110, monthlyAmount: 17600, totalPrice: 52800, internStipendMonthly: stipend, perHireCharge: 5000 });

before(async () => {
  pool = new pg.Pool({ connectionString: DB });
  browser = await chromium.launch();
  admin = await login("/api/auth/admin/login", { email: "admin@findtern.dev", password: PASSWORD });
  await q("INSERT INTO admins (email, password, name, role) SELECT 'sales@findtern.dev', password, 'Sales Test', 'exec_sales' FROM admins WHERE email = 'admin@findtern.dev' ON CONFLICT (email) DO NOTHING");
  sales = await login("/api/auth/admin/login", { email: "sales@findtern.dev", password: PASSWORD });
  emp = await login("/api/auth/employer/login", { email: "hiring@northwind.dev", password: PASSWORD });
  anon = await (await browser.newContext()).newPage();

  // Four hired placements: A pays, B has no bank details, C scores 4 (no stipend), D has an old unlinked payout paid at 01:30 IST.
  const rows = await q("SELECT p.id, p.intern_id, p.employer_id FROM proposals p WHERE p.status = 'hired' AND p.intern_id IN (SELECT user_id FROM intern_onboarding) ORDER BY p.id LIMIT 4");
  assert.equal(rows.length, 4, "needs 4 seeded hired proposals");
  const spec = [{ score: 7, bank, stipend: 8000 }, { score: 7, bank: null, stipend: 8000 }, { score: 4, bank, stipend: 0 }, { score: 7, bank, stipend: 8000 }];
  hires = [];
  for (const [i, h] of rows.entries()) {
    const s = spec[i];
    await q("UPDATE proposals SET offer_details = $2, hired_at = '2026-09-18T10:00:00Z', completion_bonus_at = NULL WHERE id = $1", [h.id, JSON.stringify(offer("2026-09-20", s.stipend))]);
    const [ob] = await q("SELECT extra_data FROM intern_onboarding WHERE user_id = $1", [h.intern_id]);
    const extra = ob.extra_data ?? {};
    extra.findternScore = s.score;
    if (s.bank) extra.bankDetails = s.bank; else { delete extra.bankDetails; delete extra.bank; }
    await q("UPDATE intern_onboarding SET extra_data = $2 WHERE user_id = $1", [h.intern_id, JSON.stringify(extra)]);
    await q("DELETE FROM admin_audit_log WHERE meta->>'internId' = $1", [h.intern_id]);
    await q("DELETE FROM intern_payouts WHERE intern_id = $1", [h.intern_id]);
    await q("DELETE FROM employer_payments WHERE (raw->'notes'->'proposalIds') ? $1", [h.id]);
    await q("INSERT INTO employer_payments (employer_id, gateway, order_id, payment_id, amount_minor, currency, status, raw, paid_at) VALUES ($1, 'e2e', $2, $3, 1000000, 'INR', 'paid', $4, '2026-09-18T10:00:00Z')", [h.employer_id, `e2e_${h.id.slice(0, 8)}`, `e2e_p_${h.id.slice(0, 8)}`, JSON.stringify({ notes: { proposalIds: [h.id], paymentMode: "upfront" } })]);
    hires.push({ internId: h.intern_id, proposalId: h.id });
  }
  // D: a legacy payout with no placement link, exactly the share, paid at 01:30 IST on the month date (2026-10-20): 2026-10-19T20:00Z.
  await q("INSERT INTO intern_payouts (intern_id, amount_minor, currency, status, method, reference_id, raw, paid_at, created_at, kind) VALUES ($1, 800000, 'INR', 'paid', 'bank', 'LEGACY-1', '{}', '2026-10-19T20:00:00Z', '2026-10-19T20:00:00Z', 'stipend')", [hires[3].internId]);
});

after(async () => {
  await browser?.close();
  await pool?.end();
});

const create = (h, body = {}) => send(admin, "POST", `/api/admin/interns/${h.internId}/payouts`, { proposalId: h.proposalId, months: 3, method: "bank", amountMinor: 800000, scheduledFor: "2026-10-20", ...body });
const dues = async (h) => (await send(admin, "GET", `/api/admin/interns/${h.internId}/payouts/dues`)).body.dues[0];
const audit = (h, action) => q("SELECT action, meta FROM admin_audit_log WHERE action = $1 AND meta->>'internId' = $2 ORDER BY created_at", [action, h.internId]);

test("gate: no bank details, score below 6, amount over the month, bad amounts are all refused with a reason", async () => {
  const [A, B, C] = hires;
  const noBank = await create(B);
  assert.equal(noBank.status, 409);
  assert.match(noBank.body.error, /no bank details/i);
  assert.equal((await q("SELECT 1 FROM intern_payouts WHERE intern_id = $1", [B.internId])).length, 0, "nothing was created");
  const low = await create(C);
  assert.equal(low.status, 409);
  assert.match(low.body.error, /below 6/);
  assert.equal((await create(A, { amountMinor: 800001 })).status, 409);
  for (const amountMinor of [0, -5, 100.5, "800000"]) assert.equal((await create(A, { amountMinor })).status, 400, `amount ${amountMinor}`);
  assert.equal((await create(A, { currency: "USD" })).status, 400);
  assert.equal((await create(A, { scheduledFor: "20-10-2026" })).status, 400);
});

test("a payout can be created once while one is pending; three parallel mark-paid calls leave exactly one paid, one next month, one audit row", async () => {
  const [A] = hires;
  const first = await create(A);
  assert.equal(first.status, 201);
  assert.equal((await create(A)).status, 409, "second create while pending");
  const id = first.body.payout.id;
  assert.equal((await send(admin, "POST", `/api/admin/interns/${A.internId}/payouts/${id}/mark-paid`, { referenceId: "  " })).status, 400);
  const race = await Promise.all([1, 2, 3].map(() => send(admin, "POST", `/api/admin/interns/${A.internId}/payouts/${id}/mark-paid`, { referenceId: "UTR123" })));
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409, 409]);
  const rows = await q("SELECT status, raw->>'source' AS source, raw->>'scheduledFor' AS sf FROM intern_payouts WHERE intern_id = $1 ORDER BY created_at", [A.internId]);
  assert.equal(rows.filter((r) => r.status === "paid").length, 1);
  assert.equal(rows.filter((r) => r.status === "pending").length, 1, "the next month is queued exactly once");
  assert.equal(rows.find((r) => r.status === "pending").sf, "2026-11-20");
  assert.equal((await audit(A, "payout.mark_paid")).length, 1, "one audit row, written with the payout");
  assert.equal((await send(admin, "POST", `/api/admin/interns/${A.internId}/payouts/${id}/mark-paid`, { referenceId: "UTR999" })).status, 409, "already paid");
  assert.equal((await send(admin, "PATCH", `/api/admin/payouts/${id}`, { status: "pending" })).status, 409, "paid is never reopened");
});

test("every other payout edit leaves an audit row: failed, reopened, a rewritten reference, a note", async () => {
  const [A] = hires;
  const [pending] = await q("SELECT id FROM intern_payouts WHERE intern_id = $1 AND status = 'pending'", [A.internId]);
  const [paid] = await q("SELECT id FROM intern_payouts WHERE intern_id = $1 AND status = 'paid'", [A.internId]);
  const before = (await audit(A, "payout.update")).length;
  assert.equal((await send(admin, "PATCH", `/api/admin/payouts/${pending.id}`, { status: "failed", opsNote: "bank returned: invalid account" })).status, 200);
  assert.equal((await send(admin, "PATCH", `/api/admin/payouts/${pending.id}`, { status: "pending" })).status, 200);
  assert.equal((await send(admin, "PATCH", `/api/admin/payouts/${paid.id}`, { referenceId: "UTR-FIXED" })).status, 200);
  const rows = await audit(A, "payout.update");
  assert.equal(rows.length, before + 3);
  const metas = rows.slice(before).map((r) => r.meta);
  assert.deepEqual(metas.map((m) => [m.statusFrom, m.statusTo]), [["pending", "failed"], ["failed", "pending"], [undefined, undefined]]);
  assert.equal(metas[0].noteChanged, true);
  assert.ok(!JSON.stringify(metas).includes("invalid account"), "note text is not logged");
  assert.deepEqual([metas[2].referenceFrom, metas[2].referenceTo], ["UTR123", "UTR-FIXED"]);
  // A no-op PATCH writes nothing.
  assert.equal((await send(admin, "PATCH", `/api/admin/payouts/${paid.id}`, { referenceId: "UTR-FIXED" })).status, 200);
  assert.equal((await audit(A, "payout.update")).length, before + 3);
});

test("a failed payout is retried as a new payout; reopening the old one while a new one is pending is refused", async () => {
  const [A] = hires;
  const [pending] = await q("SELECT id FROM intern_payouts WHERE intern_id = $1 AND status = 'pending'", [A.internId]);
  assert.equal((await send(admin, "PATCH", `/api/admin/payouts/${pending.id}`, { status: "failed" })).status, 200);
  assert.equal((await send(admin, "PATCH", `/api/admin/payouts/${pending.id}`, { status: "paid", referenceId: "X" })).status, 409, "failed -> paid is refused");
  const retry = await create(A, { scheduledFor: "2026-11-20" });
  assert.equal(retry.status, 201);
  assert.equal((await send(admin, "PATCH", `/api/admin/payouts/${pending.id}`, { status: "pending" })).status, 409);
});

test("a legacy payout paid at 01:30 IST on the month date counts that month (dues show 1 of 3 paid)", async () => {
  const d = await dues(hires[3]);
  assert.equal(d.paidMonths, 1);
  assert.equal(d.remainingMonths, 2);
  assert.equal(d.remainingMinor, 1600000);
});

test("permissions: sales (no transactions:write) 403, employer/anonymous 401, missing CSRF 403", async () => {
  const [A] = hires;
  const [any] = await q("SELECT id FROM intern_payouts WHERE intern_id = $1 LIMIT 1", [A.internId]);
  for (const [name, page, want] of [["sales", sales, 403], ["employer", emp, 401], ["anonymous", anon, 401]]) {
    assert.equal((await send(page, "POST", `/api/admin/interns/${A.internId}/payouts`, { proposalId: A.proposalId, amountMinor: 800000, scheduledFor: "2026-10-20" })).status, want, `${name} create`);
    assert.equal((await send(page, "PATCH", `/api/admin/payouts/${any.id}`, { opsNote: "x" })).status, want, `${name} patch`);
    assert.equal((await send(page, "GET", "/api/admin/payouts/export")).status, want, `${name} export`);
  }
  assert.equal((await send(admin, "POST", `/api/admin/interns/${A.internId}/payouts`, { proposalId: A.proposalId, amountMinor: 800000, scheduledFor: "2026-10-20" }, { noCsrf: true })).status, 403);
});

test("CSV export: rupees with 2 decimals, IST dates, a formula name is neutralised", async () => {
  const [D] = [hires[3]];
  await q("UPDATE users SET first_name = '=HYPERLINK(\"http://evil.test\",\"x\")' WHERE id = $1", [D.internId]);
  const res = await admin.request.get(`${BASE}/api/admin/payouts/export`, { headers: { origin: BASE } });
  assert.equal(res.status(), 200);
  assert.match(res.headers()["content-type"], /text\/csv/);
  const csv = await res.text();
  assert.ok(csv.startsWith("\uFEFFIntern,Email,"), "BOM + header");
  assert.match(csv, /,8000\.00,INR,8000\.00,/);
  assert.ok(!/(^|\r\n)=HYPERLINK/.test(csv) && csv.includes("'=HYPERLINK"), "formula prefixed with a quote");
  assert.match(csv, /LEGACY-1,,2026-10-20,/, "paid at 01:30 IST on the 20th exports as the 20th, not the 19th");
});

test("drive order: slots x fee, credit never above the amount, replay by idempotency key, paid once (one seat batch, one invoice)", async () => {
  const [{ id: collegeId }] = await q("SELECT id FROM colleges WHERE slug = 'jklu'");
  const until = new Date(Date.now() + 90 * 864e5).toISOString();
  const key = `e2e${Date.now()}abcd`;
  const post = (body, k = key) => send(admin, "POST", `/api/admin/colleges/${collegeId}/drive-orders`, body, { headers: { "idempotency-key": k } });
  const a = await post({ slots: 50, feePerStudentMinor: 249900, creditMinor: 1000000, codeValidUntil: until });
  assert.equal(a.status, 201);
  assert.equal(a.body.order.amountMinor, 12495000);
  assert.equal(a.body.order.payableMinor, 11495000);
  const again = await post({ slots: 50, feePerStudentMinor: 249900, creditMinor: 1000000, codeValidUntil: until });
  assert.equal(again.status, 200);
  assert.equal(again.body.order.id, a.body.order.id);
  assert.equal((await post({ slots: 2, feePerStudentMinor: 100, creditMinor: 201, codeValidUntil: until }, `${key}x`)).status, 400, "credit above the amount");
  assert.equal((await post({ slots: 2, feePerStudentMinor: 100.5, codeValidUntil: until }, `${key}y`)).status, 400, "fractional fee");
  const oid = a.body.order.id;
  const pay = (page, body = { method: "bank", reference: "REF1" }) => send(page, "POST", `/api/admin/drive-orders/${oid}/payment`, body);
  assert.equal((await pay(sales)).status, 403, "sales cannot record a payment");
  const race = await Promise.all([pay(admin), pay(admin, { method: "upi", reference: "REF2" })]);
  assert.deepEqual(race.map((r) => r.status), [200, 200]);
  assert.equal((await q("SELECT 1 FROM college_seat_batches WHERE drive_order_id = $1", [oid])).length, 1);
  const [b] = await q("SELECT amount_minor, invoice_number FROM college_seat_batches WHERE drive_order_id = $1", [oid]);
  assert.equal(b.amount_minor, 11495000, "the batch bills amount - credit");
  assert.ok(b.invoice_number);
  const [failed] = await q("INSERT INTO college_drive_orders (college_id, slots, fee_per_student_minor, credit_minor, amount_minor, status, code_valid_until, created_by) VALUES ($1, 2, 100, 0, 200, 'failed', $2, (SELECT id FROM admins LIMIT 1)) RETURNING id", [collegeId, until]);
  const refused = await send(admin, "POST", `/api/admin/drive-orders/${failed.id}/payment`, { method: "bank", reference: "R" });
  assert.equal(refused.status, 409);
});
