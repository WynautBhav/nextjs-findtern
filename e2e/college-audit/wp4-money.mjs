// WP4 $1-$3, $5: seat batches and drive orders at 800 + 18% GST, invoices, serials, races.
//   source ~/.cache/findtern-college-audit/env.sh; use_wp 4; node e2e/college-audit/wp4-money.mjs
import fs from "node:fs";
import { BASE, Client, check, invoiceHtmls, invoiceText, loginAs, pool, q, summary } from "./wp4-lib.mjs";

const mailFile = `logs/mail/${new Date().toISOString().slice(0, 10)}.log`;
const mailAll = () => { try { return fs.readFileSync(mailFile, "utf8"); } catch { return ""; } };
const mailStart = mailAll().length;
const admin = await loginAs("admin", "admin@findtern.dev");
const tpo = await loginAs("college", "tpo@jklu.edu.in");
const [jklu] = await q("SELECT id FROM colleges WHERE slug = 'jklu'");
const cid = jklu.id;
const counter = async () => Number((await q("SELECT last FROM invoice_counters WHERE fy = '2026-27'"))[0]?.last ?? 0);
const cap = async () => (await q("SELECT max_usages FROM promo_codes WHERE college_id = $1", [cid]))[0].max_usages;
const counterAtStart = await counter();
const key = () => `wp4-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const inr = (minor) => `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function newBatch(seats) {
  const r = await admin.post(`/api/admin/colleges/${cid}/seat-batches`, { seats });
  return r;
}
async function pay(id, ref = "WP4-REF") {
  return admin.patch(`/api/admin/colleges/${cid}/seat-batches/${id}`, { action: "paid", method: "bank", referenceId: ref });
}
async function invoiceFor(batchId) {
  const page = await tpo.get("/college/seats");
  const [b] = await q("SELECT invoice_number FROM college_seat_batches WHERE id = $1", [batchId]);
  return invoiceHtmls(page.text).map(invoiceText).find((t) => t.includes(`Invoice Number : ${b.invoice_number}`));
}

// ── $1 amounts: 1, 7, 5000 seats; bad inputs
for (const [seats, total] of [[1, 94400], [7, 660800], [5000, 472000000]]) {
  const r = await newBatch(seats);
  check(`$1 create ${seats} seats -> 200`, r.status === 200, JSON.stringify(r.json));
  const [b] = await q("SELECT * FROM college_seat_batches WHERE id = $1", [r.json.id]);
  check(`$1 ${seats} seats stores ${inr(total)} (944 x n)`, Number(b.amount_minor) === total, String(b.amount_minor));
}
for (const bad of [0, -1, 1.5, 5001, "7", null, NaN]) {
  const r = await newBatch(bad);
  check(`$1 seats=${JSON.stringify(bad)} refused`, r.status === 400, `${r.status}`);
}
const nonPartner = (await q("SELECT id FROM colleges WHERE NOT is_partner LIMIT 1"))[0];
check("$1 non-partner college cannot buy seats", (await admin.post(`/api/admin/colleges/${nonPartner.id}/seat-batches`, { seats: 1 })).status === 400);
check("$1 unknown college -> 404", (await admin.post(`/api/admin/colleges/00000000-0000-0000-0000-000000000000/seat-batches`, { seats: 1 })).status === 404);

// ── $1 invoice: Rajasthan GSTIN (CGST+SGST) and a non-Rajasthan GSTIN (IGST)
for (const [gstin, state, mode] of [["08AAACJ1234K1Z5", "Rajasthan", "intra"], ["24AAACJ1234K1Z5", "Gujarat", "inter"]]) {
  await q("UPDATE colleges SET gstin = $2, state = $3 WHERE id = $1", [cid, gstin, state]);
  for (const seats of [1, 7, 5000]) {
    const [b] = await q("SELECT id FROM college_seat_batches WHERE college_id = $1 AND seats = $2 AND status = 'pending' AND drive_order_id IS NULL ORDER BY created_at DESC LIMIT 1", [cid, seats]);
    const before = await counter();
    const r = await pay(b.id);
    check(`$1 ${state} pay ${seats}-seat batch`, r.status === 200, JSON.stringify(r.json));
    check(`$1 serial moved by exactly 1`, (await counter()) === before + 1);
    const t = await invoiceFor(b.id);
    const base = seats * 80000, gst = seats * 14400;
    check(`$1 invoice ${seats} seats base ${inr(base)} total ${inr(base + gst)}`, !!t && t.includes(`Taxable value ${inr(base)}`) && t.includes(`Total ${inr(base + gst)}`), t?.slice(0, 600));
    if (mode === "intra") check(`$1 ${state} ${seats}: CGST ${inr(gst / 2)} + SGST ${inr(gst / 2)}`, !!t && t.includes(`CGST 9% ${inr(gst / 2)}`) && t.includes(`SGST 9% ${inr(gst / 2)}`) && !t.includes("IGST"));
    else check(`$1 ${state} ${seats}: IGST ${inr(gst)}`, !!t && t.includes(`IGST 18% ${inr(gst)}`) && !t.includes("CGST"), t?.slice(0, 700));
    // top up pending set for the second GSTIN pass
    if (mode === "intra") await newBatch(seats);
  }
}
await q("UPDATE colleges SET gstin = NULL, state = 'Rajasthan' WHERE id = $1", [cid]);

// ── $3 double mark-paid and two parallel mark-paid on a seat batch: one serial, cap raised once
{
  const { json } = await newBatch(3);
  const capBefore = await cap(); const serBefore = await counter();
  const [a, b] = await Promise.all([pay(json.id, "RACE-A"), pay(json.id, "RACE-B")]);
  const codes = [a.status, b.status].sort();
  check("$3 two parallel mark-paid: one 200 and one 409", codes[0] === 200 && codes[1] === 409, JSON.stringify(codes));
  check("$3 serial moved once", (await counter()) === serBefore + 1);
  const paidSeats = Number((await q("SELECT coalesce(sum(seats),0) s FROM college_seat_batches WHERE college_id = $1 AND status = 'paid' AND drive_order_id IS NULL", [cid]))[0].s);
  check("$3 cap raised once (cap = paid seats)", (await cap()) >= capBefore + 3 - 0 && (await cap()) === Math.max(capBefore, paidSeats), `${capBefore} -> ${await cap()} paid ${paidSeats}`);
  check("$3 third mark-paid -> 409 and no new serial", (await pay(json.id, "RACE-C")).status === 409 && (await counter()) === serBefore + 1);
  const v = await newBatch(2);
  check("$3 void a pending batch", (await admin.patch(`/api/admin/colleges/${cid}/seat-batches/${v.json.id}`, { action: "void" })).status === 200);
  check("$3 paying a void batch -> 409, no serial", (await pay(v.json.id)).status === 409 && (await counter()) === serBefore + 1);
}

// ── $2 / $3 drive orders: credit rounding, 100% credit, replay, parallel
const until = new Date(Date.now() + 40 * 86400_000).toISOString();
async function newOrder(slots, fee, credit) {
  return admin.post(`/api/admin/colleges/${cid}/drive-orders`, { slots, feePerStudentMinor: fee, creditMinor: credit, codeValidUntil: until }, { "idempotency-key": key() });
}
async function payOrder(id, ref = "ORD-REF", k = key()) {
  return admin.post(`/api/admin/drive-orders/${id}/payment`, { method: "bank", reference: ref }, { "idempotency-key": k });
}
{
  // $2: 3 students at 944 with a Rs 1 credit
  const o = await newOrder(3, 94400, 100);
  check("$2 create order 3 x 944 with Rs 1 credit", o.status === 201, JSON.stringify(o.json));
  check("$2 payable = 3x944 - 1 = 2831.00", o.json?.order?.payableMinor === 283100, JSON.stringify(o.json?.order));
  const before = await counter();
  const capBeforeOrder = await cap();
  const p = await payOrder(o.json.order.id);
  check("$2 mark paid", p.status === 200 && p.json.order.status === "paid", JSON.stringify(p.json));
  const [batch] = await q("SELECT * FROM college_seat_batches WHERE drive_order_id = $1", [o.json.order.id]);
  check("$2 batch amount = payable", Number(batch.amount_minor) === 283100, String(batch.amount_minor));
  check("$2 one serial taken", (await counter()) === before + 1 && !!batch.invoice_number);
  const t = await invoiceFor(batch.id);
  check("$2 invoice base + CGST + SGST = payable (2,831.00)", !!t && t.includes("Total ₹2,831.00") && t.includes("Taxable value ₹2,399.15") && t.includes("CGST 9% ₹215.93") && t.includes("SGST 9% ₹215.92"), t?.slice(0, 700));
  const p2 = await payOrder(o.json.order.id, "ORD-REF-2");
  check("$3 second record-payment is a replay (200 replayed)", p2.status === 200 && p2.json.replayed === true && p2.json.order.gatewayRef === "ORD-REF", JSON.stringify(p2.json));
  check("$3 replay took no serial and made no 2nd batch", (await counter()) === before + 1 && (await q("SELECT 1 FROM college_seat_batches WHERE drive_order_id = $1", [o.json.order.id])).length === 1);
  check("$2 drive-order batch did not raise the TPO code's seat cap", (await cap()) === capBeforeOrder, `${capBeforeOrder} -> ${await cap()}`);
}
{
  // $3 two parallel record-payment calls
  const o = await newOrder(2, 94400, 0);
  const before = await counter();
  const [a, b] = await Promise.all([payOrder(o.json.order.id, "PAR-A"), payOrder(o.json.order.id, "PAR-B")]);
  check("$3 parallel record-payment: no 5xx", a.status < 500 && b.status < 500, `${a.status}/${b.status}`);
  check("$3 parallel: exactly one is not a replay", [a, b].filter((r) => r.status === 200 && r.json.replayed === false).length === 1, JSON.stringify([a.json, b.json]));
  check("$3 parallel: one batch, one serial", (await counter()) === before + 1 && (await q("SELECT 1 FROM college_seat_batches WHERE drive_order_id = $1", [o.json.order.id])).length === 1);
}
{
  // $3 100% credit: payable 0 must not consume a GST serial
  const o = await newOrder(2, 94400, 188800);
  check("$3 100% credit order is accepted", o.status === 201 && o.json.order.payableMinor === 0, JSON.stringify(o.json));
  const before = await counter();
  const p = await payOrder(o.json.order.id, "ZERO-REF");
  check("$3 100% credit marks paid", p.status === 200, JSON.stringify(p.json));
  const [batch] = await q("SELECT * FROM college_seat_batches WHERE drive_order_id = $1", [o.json.order.id]);
  check("$3 100% credit: counter did not move", (await counter()) === before, `${before} -> ${await counter()}`);
  check("$3 100% credit: batch has no invoice number", batch && batch.invoice_number === null, String(batch?.invoice_number));
  const page = await tpo.get("/college/seats");
  check("$3 seats page shows no 'Invoice null' for the free batch", !/Invoice\s*(<!--.*?-->)?\s*null/.test(page.text) && !invoiceHtmls(page.text).map(invoiceText).some((t) => /Invoice Number : (null|)\s/.test(t)));
}

// serials are gapless and unique across every paid row
{
  const rows = await q(`SELECT invoice_number FROM (
      SELECT invoice_number FROM college_seat_batches WHERE invoice_number IS NOT NULL
      UNION ALL SELECT invoice_number FROM employer_payments WHERE invoice_number IS NOT NULL
      UNION ALL SELECT invoice_number FROM intern_payments WHERE invoice_number IS NOT NULL) x`);
  const nums = rows.map((r) => r.invoice_number).filter((n) => /^\d{6}-\d+$/.test(n));
  check("serials: no duplicate invoice numbers", new Set(nums).size === nums.length);
  // Rows deleted by other audit scripts (wp4-employer cleans up after itself) leave old gaps; judge only what THIS run issued.
  const mine = nums.map((n) => Number(n.split("-")[1])).filter((n) => n > counterAtStart).sort((a, b) => a - b);
  const nowCounter = await counter();
  check(`serials issued by this run are gapless (${counterAtStart + 1}..${nowCounter})`, mine.length === nowCounter - counterAtStart && mine.every((x, i) => x === counterAtStart + 1 + i), `mine=${mine.join(",")}`);
}

{
  const seatMails = mailAll().slice(mailStart).split("--- ").filter((e) => /Subject: Seat payment received/.test(e));
  const to = seatMails.map((e) => e.match(/^To: (.+)$/m)?.[1]);
  check("mail: seat/order payment mails went to the college officer only (never students, never another college)", seatMails.length > 0 && to.every((a) => a === "tpo@jklu.edu.in"), to.join());
  check("mail: every seat mail names JKLU and no other college", seatMails.every((e) => !/Poornima|JECRC|Manipal|LNMIIT|MNIT/.test(e)));
}
await pool.end();
process.exit(summary() ? 1 : 0);
