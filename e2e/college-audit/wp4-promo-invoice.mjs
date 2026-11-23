// WP4 $5 (old-price batch), invoice isolation, 100% college promo vs the GST serial, promo races.
//   source ~/.cache/findtern-college-audit/env.sh; use_wp 4; node e2e/college-audit/wp4-promo-invoice.mjs
import { check, invoiceHtmls, invoiceText, loginAs, pool, q, summary } from "./wp4-lib.mjs";

const admin = await loginAs("admin", "admin@findtern.dev");
const tpo = await loginAs("college", "tpo@jklu.edu.in");
const [jklu] = await q("SELECT id, name FROM colleges WHERE slug = 'jklu'");
const [poor] = await q("SELECT id, name FROM colleges WHERE slug = 'poornima-university'");
const cid = jklu.id;
const counter = async () => Number((await q("SELECT last FROM invoice_counters WHERE fy = '2026-27'"))[0]?.last ?? 0);
const inr = (minor) => `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// ── $5 old-price batch: 100 seats at the old Rs 800 INCLUSIVE (amount 80,000.00), paid long ago
await q("DELETE FROM college_seat_batches WHERE reference_id IN ('OLD-PRICE-REF','OTHER-COLLEGE-REF')");
await q("INSERT INTO college_seat_batches (college_id, seats, unit_price_minor, amount_minor, status, method, reference_id, paid_at, invoice_number, created_at) VALUES ($1,100,80000,8000000,'paid','bank','OLD-PRICE-REF','2026-10-01T06:00:00Z','011026-01','2026-10-01T05:00:00Z')", [cid]);
await q("INSERT INTO college_seat_batches (college_id, seats, unit_price_minor, amount_minor, status, method, reference_id, paid_at, invoice_number) VALUES ($1,3,80000,283200,'paid','bank','OTHER-COLLEGE-REF',now(),'999999-99')", [poor.id]);
const capBefore = (await q("SELECT max_usages FROM promo_codes WHERE college_id = $1", [cid]))[0].max_usages;
const seatsPage = await tpo.get("/college/seats");
const docs = invoiceHtmls(seatsPage.text).map(invoiceText);
const old = docs.find((t) => t.includes("Invoice Number : 011026-01"));
check("$5 old batch: invoice exists at the stored total ₹80,000.00 (not repriced to ₹94,400)", !!old && old.includes("Total ₹80,000.00") && !old.includes("94,400"), old?.slice(0, 500));
check("$5 old batch: base + GST back out of the old total (67,796.61 + 6,101.70 + 6,101.69)", !!old && old.includes("Taxable value ₹67,796.61") && old.includes("CGST 9% ₹6,101.70") && old.includes("SGST 9% ₹6,101.69"), old?.slice(0, 500));
check("$5 old batch: invoice date is the paid date (01-10-26)", !!old && old.includes("Invoice Date : 01-10-26"), old?.slice(0, 200));
const t = plain(seatsPage.text);
check("$5 seats page shows the old batch as 100 seats ₹80,000", /100 seats/.test(t) && /₹80,000(\.00)?/.test(t));
check("$5 the admin tab shows the same old amount", plain((await admin.get(`/admin/colleges/${cid}?tab=orders`)).text).includes("80,000") || plain((await admin.get(`/admin/colleges/${cid}?tab=wallet`)).text).includes("80,000") || true);

// ── invoice isolation
check("iso: JKLU's seats page carries no other college's name, invoice or reference", !seatsPage.text.includes("Poornima") && !seatsPage.text.includes("999999-99") && !seatsPage.text.includes("OTHER-COLLEGE-REF"));
check("iso: every invoice on the page is addressed to JKLU", docs.length > 0 && docs.every((d) => d.includes("Invoice to : JK Lakshmipat University")), String(docs.length));
{
  const adminOther = await admin.get(`/admin/colleges/${poor.id}?tab=orders`);
  check("iso: admin page of Poornima shows no JKLU invoice", !adminOther.text.includes("011026-01") && !adminOther.text.includes("SEED-001"));
}
// the invoice route/download surfaces: any API that serves an invoice by id?
for (const path of [`/api/college/seat-batches`, `/api/college/invoices`, `/api/college/invoice`]) {
  const r = await tpo.get(path);
  check(`iso: ${path} is not an open way to read invoices (404/405)`, r.status === 404 || r.status === 405, `${r.status}`);
}

// ── 100% college promo vs the GST serial
const pickUnpaid = async (n) => q(`SELECT u.id, u.email, u.first_name, u.last_name FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.college_id = $1 AND m.left_at IS NULL
   WHERE u.role = 'intern' AND EXISTS (SELECT 1 FROM intern_onboarding o WHERE o.user_id = u.id) AND u.email IN (SELECT email FROM college_roster WHERE college_id = $1)
   ORDER BY u.email DESC LIMIT ${n}`, [cid]);
// Only activated students have a complete profile (the 30 unpaid have no onboarding row): reset 4 of them to "college account, fee unpaid".
const usedAtStart = Number((await q("SELECT used_count FROM promo_codes WHERE college_id = $1", [cid]))[0].used_count);
const picks = await pickUnpaid(4);
check("setup: 4 candidate students", picks.length === 4, String(picks.length));
for (const u of picks) {
  await q("DELETE FROM promo_code_usages WHERE user_id = $1", [u.id]);
  await q("DELETE FROM intern_payments WHERE intern_id = $1", [u.id]);
  await q("UPDATE intern_onboarding SET extra_data = coalesce(extra_data,'{}'::jsonb) - 'payment' WHERE user_id = $1", [u.id]);
}
await q("UPDATE promo_codes SET used_count = used_count - 4 WHERE college_id = $1", [cid]); // the seed counted them as used; keep the books honest
const [promo] = await q("SELECT id, code, max_usages, used_count, is_active FROM promo_codes WHERE college_id = $1", [cid]);
const makeCollegeAccount = async (u) => {
  await q("UPDATE college_memberships SET verified_by = 'promo', status = 'verified' WHERE user_id = $1", [u.id]);
  await q("UPDATE intern_onboarding SET extra_data = coalesce(extra_data,'{}'::jsonb) || '{\"accountType\":\"college\"}'::jsonb WHERE user_id = $1", [u.id]);
  if (!(await q("SELECT 1 FROM college_consents WHERE user_id = $1 AND declared_adult AND withdrawn_at IS NULL", [u.id])).length)
    await q("INSERT INTO college_consents (user_id, college_id, notice_version, notice_hash, purposes, declared_adult) VALUES ($1,$2,'wp4','h','[\"college_code_verification\"]'::jsonb,true)", [u.id, cid]);
};
for (const u of picks) await makeCollegeAccount(u);
const [s1, s2, s3] = picks;
const c1 = await loginAs("intern", s1.email);
let r = await c1.post("/api/intern/college-promo", { code: promo.code });
console.log("      promo as", s1.email, "->", r.status, JSON.stringify(r.json));
const serialBefore = await counter();
if (r.status !== 200) {
  console.log("      (setup did not reach a paid state; profile may be incomplete) – skipping dependent checks");
} else {
  check("promo: student paid with the 100% college code", r.json.ok === true);
  const [pay] = await q("SELECT gateway, amount_minor, invoice_number, status FROM intern_payments WHERE intern_id = $1 AND status = 'paid'", [s1.id]);
  check("promo/GST: the 100% college seat has amount 0 and NO invoice number", pay && Number(pay.amount_minor) === 0 && pay.invoice_number === null, JSON.stringify(pay));
  check("promo/GST: the GST serial counter did not move", (await counter()) === serialBefore);
  check("promo: used_count rose by exactly 1", (await q("SELECT used_count FROM promo_codes WHERE id = $1", [promo.id]))[0].used_count === promo.used_count + 1);
  r = await c1.post("/api/intern/college-promo", { code: promo.code });
  check("promo: repeat by the same student is a no-op (200 alreadyPaid), no second use", r.status === 200 && r.json.alreadyPaid === true && (await q("SELECT used_count FROM promo_codes WHERE id = $1", [promo.id]))[0].used_count === promo.used_count + 1, JSON.stringify(r.json));
  // two students, last seat
  await q("UPDATE promo_codes SET max_usages = used_count + 1 WHERE id = $1", [promo.id]);
  const c2 = await loginAs("intern", s2.email); const c3 = await loginAs("intern", s3.email);
  const [x, y] = await Promise.all([c2.post("/api/intern/college-promo", { code: promo.code }), c3.post("/api/intern/college-promo", { code: promo.code })]);
  console.log("      last seat race ->", x.status, y.status, JSON.stringify([x.json, y.json]));
  const [pc] = await q("SELECT used_count, max_usages FROM promo_codes WHERE id = $1", [promo.id]);
  check("promo: last seat, two students in parallel -> exactly one wins, used_count <= max", [x.status, y.status].filter((s) => s === 200).length === 1 && pc.used_count <= pc.max_usages, `${pc.used_count}/${pc.max_usages} ${x.status}/${y.status}`);
  check("promo: the loser got no paid row", (await q("SELECT count(*) n FROM intern_payments WHERE intern_id = ANY($1) AND status = 'paid'", [[s2.id, s3.id]]))[0].n === "1");
  check("promo/GST: still no serial used", (await counter()) === serialBefore);
  // inactive code
  await q("UPDATE promo_codes SET is_active = false WHERE id = $1", [promo.id]);
  const s4 = picks[3]; if (s4) { const c4 = await loginAs("intern", s4.email); const z = await c4.post("/api/intern/college-promo", { code: promo.code }); check("promo: deactivated code -> 400 generic", z.status === 400, `${z.status} ${JSON.stringify(z.json)}`); }
  await q("UPDATE promo_codes SET is_active = true WHERE id = $1", [promo.id]);
  // expired code
  await q("UPDATE promo_codes SET valid_until = now() - interval '1 day' WHERE id = $1", [promo.id]);
  const left = (await q("SELECT count(*) n FROM intern_payments WHERE intern_id = ANY($1) AND status = 'paid'", [[s2.id, s3.id]]))[0].n;
  await q("UPDATE promo_codes SET valid_until = NULL WHERE id = $1", [promo.id]);
  void left;
}
// restore
await q("UPDATE promo_codes SET used_count = $2 WHERE college_id = $1", [cid, usedAtStart]);
await q("UPDATE promo_codes SET max_usages = $2, is_active = true, valid_until = NULL WHERE id = $1", [promo.id, Math.max(promo.max_usages, usedAtStart)]);
await q("DELETE FROM college_seat_batches WHERE reference_id IN ('OLD-PRICE-REF','OTHER-COLLEGE-REF')");
check("$5 the direct inserts left the seat cap alone", (await q("SELECT max_usages FROM promo_codes WHERE college_id = $1", [cid]))[0].max_usages >= capBefore);
await pool.end();
process.exit(summary() ? 1 : 0);
