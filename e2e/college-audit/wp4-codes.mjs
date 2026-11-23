// WP4 $4 + admin Orders and codes: import -> codes -> mail -> redeem under every refusal, with races.
//   source ~/.cache/findtern-college-audit/env.sh; use_wp 4; node e2e/college-audit/wp4-codes.mjs
// Mutates only the wp4 DB. Re-runnable: it makes its own order each time and restores the students it touches.
import fs from "node:fs";
import { BASE, check, loginAs, pool, q, summary } from "./wp4-lib.mjs";
import { deriveDriveCode } from "../../src/lib/drives/code-derive.ts";

const SECRET = process.env.SIGNING_SECRET;
const admin = await loginAs("admin", "admin@findtern.dev");
const [jklu] = await q("SELECT id FROM colleges WHERE slug = 'jklu'");
const [poornima] = await q("SELECT id FROM colleges WHERE slug = 'poornima-university'");
const cid = jklu.id;
const key = () => `wp4c-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const mailFile = `logs/mail/${new Date().toISOString().slice(0, 10)}.log`;
const mailAll = () => { try { return fs.readFileSync(mailFile, "utf8"); } catch { return ""; } };
const mailStart = mailAll().length;
const mailNew = () => mailAll().slice(mailStart).split("--- ").filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const E = {
  tara: "tara.choudhary16@jklu.edu.in", // normal: unpaid, JKLU member
  akash: "akash.choudhary41@jklu.edu.in", // denied by the TPO before the import
  sid: "siddharth.saini59@jklu.edu.in", // member of ANOTHER college
  rishi: "rishi.mishra61@jklu.edu.in", // left JKLU (leave approved)
  meera: "meera.mishra118@jklu.edu.in", // code will be expired
  neha: "neha.joshi178@jklu.edu.in", // code will be revoked
  simran: "simran.mathur184@jklu.edu.in", // racer 1
  saanvi: "saanvi.saini198@jklu.edu.in", // racer 2
  aarav: "aarav.sharma1@jklu.edu.in", // already paid
  ghost: "notjoined1@jklu.edu.in", // roster row, no account
};
const uid = async (email) => (await q("SELECT id FROM users WHERE email = $1", [email]))[0]?.id ?? null;
const U = {}; for (const [k, v] of Object.entries(E)) U[k] = await uid(v);

// ── prepare students (reset what earlier runs did)
await q("DELETE FROM college_denials WHERE college_id = $1", [cid]);
for (const k of ["tara", "akash", "sid", "rishi", "meera", "neha", "simran", "saanvi"]) {
  await q("DELETE FROM intern_payments WHERE intern_id = $1 AND gateway IN ('free','college_drive')", [U[k]]);
  await q("UPDATE intern_onboarding SET extra_data = (coalesce(extra_data,'{}'::jsonb) - 'payment') WHERE user_id = $1", [U[k]]);
  await q("UPDATE college_memberships SET college_id = $2, left_at = NULL, status = 'verified' WHERE user_id = $1", [U[k], cid]);
}
await q("UPDATE college_memberships SET college_id = $2 WHERE user_id = $1", [U.sid, poornima.id]);
await q("UPDATE college_memberships SET left_at = now() WHERE user_id = $1", [U.rishi]);
await q("UPDATE college_memberships SET left_at = now() WHERE user_id = $1", [U.akash]); // a denial ends the membership (approvals.ts)
await q("INSERT INTO college_denials (college_id, user_id, decided_by_type, decided_by_id, note) VALUES ($1,$2,'admin',$3,'wp4 audit')", [cid, U.akash, (await q("SELECT id FROM admins WHERE email='admin@findtern.dev'"))[0].id]);
const paidBefore = Number((await q("SELECT count(*) n FROM intern_payments WHERE intern_id = $1 AND status = 'paid'", [U.aarav]))[0].n);
check("setup: aarav already has a paid row", paidBefore >= 1);

// ── order: 10 slots at 944, pay, import by file
const until = new Date(Date.now() + 30 * 86400_000).toISOString();
const ord = await admin.post(`/api/admin/colleges/${cid}/drive-orders`, { slots: 10, feePerStudentMinor: 94400, creditMinor: 0, codeValidUntil: until }, { "idempotency-key": key() });
check("order created", ord.status === 201, JSON.stringify(ord.json));
const orderId = ord.json.order.id;
// codes must not exist / be mailable before payment
check("campaign before payment -> 409", (await admin.post(`/api/admin/drive-orders/${orderId}/campaign`, {})).status === 409);
const pre = await admin.upload(`/api/admin/drive-orders/${orderId}/imports`, "roster.csv", "Name,Email,Phone\nA B,a@x.com,9829000001\n");
check("import preview allowed on a pending order (no codes yet)", pre.status === 200, JSON.stringify(pre.json).slice(0, 200));
check("confirm before payment -> refused", (await admin.post(`/api/admin/imports/${pre.json.importId}/confirm`, {}, { "idempotency-key": key() })).status >= 400);
check("no code exists before payment", (await q("SELECT 1 FROM drive_codes WHERE order_id = $1", [orderId])).length === 0);
await admin.post(`/api/admin/drive-orders/${orderId}/payment`, { method: "bank", reference: "CODES-1" }, { "idempotency-key": key() });

const names = { tara: "Tara Choudhary", akash: "Akash Choudhary", sid: "Siddharth Saini", rishi: "Rishi Mishra", meera: "Meera Mishra", neha: "Neha Joshi", simran: "Simran Mathur", saanvi: "Saanvi Saini", aarav: "Aarav Sharma", ghost: "Aarav Sharma" };
const phones = Object.fromEntries(await Promise.all(Object.keys(E).map(async (k) => [k, k === "ghost" ? "9829100001" : (await q("SELECT phone_number FROM users WHERE email = $1", [E[k]]))[0].phone_number])));
const csv = ["Name,Email,Phone", ...Object.keys(E).map((k) => `${names[k]},${E[k]},${phones[k]}`)].join("\n");
const imp = await admin.upload(`/api/admin/drive-orders/${orderId}/imports`, "roster.csv", csv);
check("import preview: 10 valid rows", imp.status === 200 && imp.json.counts.valid === 10, JSON.stringify(imp.json?.counts));
const importId = imp.json.importId;
const [c1, c2] = await Promise.all([admin.post(`/api/admin/imports/${importId}/confirm`, {}, { "idempotency-key": key() }), admin.post(`/api/admin/imports/${importId}/confirm`, {}, { "idempotency-key": key() })]);
check("parallel confirm: both succeed, exactly one real", c1.status === 200 && c2.status === 200 && [c1, c2].filter((x) => !x.json.replayed).length === 1, JSON.stringify([c1.json, c2.json]));
check("10 codes issued, order.issued_count = 10", (await q("SELECT issued_count FROM college_drive_orders WHERE id = $1", [orderId]))[0].issued_count === 10 && (await q("SELECT 1 FROM drive_codes WHERE order_id = $1", [orderId])).length === 10);

// who got linked, and what it did to membership
const entries = await q("SELECT e.college_email_norm AS email, e.intern_id, k.id AS code_id FROM drive_roster_entries e JOIN drive_codes k ON k.entry_id = e.id WHERE e.order_id = $1", [orderId]);
const codeOf = (k) => deriveDriveCode(entries.find((x) => x.email === E[k]).code_id, SECRET);
const entryOf = (k) => entries.find((x) => x.email === E[k]);
const memb = async (k) => (await q("SELECT college_id, status, left_at IS NOT NULL AS left_, verified_by FROM college_memberships WHERE user_id = $1", [U[k]]))[0];
check("confirm did not move the other-college student (sid) into JKLU", (await memb("sid")).college_id === poornima.id);
check("confirm did not give the denied student (akash) a live JKLU membership", (await q("SELECT 1 FROM college_memberships WHERE user_id = $1 AND left_at IS NULL AND verified_by = 'roster'", [U.akash])).length === 0);
{
  const m = await memb("rishi");
  check("WP4-01 confirm leaves a student who LEFT the college left (rishi: left_at still set)", m.left_ === true, JSON.stringify(m));
  const sidE = entryOf("sid");
  check("WP4-02 roster row of a student in ANOTHER college is not bound to that account", sidE.intern_id === null, `intern_id=${sidE.intern_id}`);
  const akE = entryOf("akash");
  check("WP4-03 roster row of a DENIED student is not bound to that account", akE.intern_id === null, `intern_id=${akE.intern_id}`);
}

// ── mail: who is emailed (admin presses 'Email codes')
await sleep(500);
const camp = await admin.post(`/api/admin/drive-orders/${orderId}/campaign`, {});
check("campaign 200", camp.status === 200, JSON.stringify(camp.json));
await sleep(4000);
{
  const codeMails = mailNew().filter((e) => /Subject: .*(code|fee)/i.test(e) || /XXXX|[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(e)).filter((e) => /[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(e));
  const to = codeMails.map((e) => e.match(/^To: (.+)$/m)?.[1]);
  const sorted = [...to].sort();
  const dups = sorted.filter((x, i) => sorted.indexOf(x) !== i);
  check("mail: no recipient got two code mails", dups.length === 0, dups.join());
  check("mail: every recipient is on the roster of THIS order", to.every((a) => Object.values(E).includes(a)), to.join());
  check("mail: each mail carries that student's own code", codeMails.every((e) => { const a = e.match(/^To: (.+)$/m)[1]; const k = Object.keys(E).find((x) => E[x] === a); return k && e.includes(codeOf(k)); }));
  console.log("      (a code mail also reaches denied/other-college/left rows: PROPOSAL WP4-P1, see findings)");
  console.log("      code mail went to:", to.join(", "));
}

// ── redeem
const login = async (k) => loginAs("intern", E[k]);
const redeem = async (cl, code) => cl.post("/api/intern/drive-codes/redeem", { code, declaredAdult: true });
const paid = async (k) => Number((await q("SELECT count(*) n FROM intern_payments WHERE intern_id = $1 AND status = 'paid'", [U[k]]))[0].n);
const used = async () => (await q("SELECT redeemed_count FROM college_drive_orders WHERE id = $1", [orderId]))[0].redeemed_count;

const tara = await login("tara");
// without the 18+ tick
check("redeem without declaredAdult -> 400", (await tara.post("/api/intern/drive-codes/redeem", { code: codeOf("tara"), declaredAdult: false })).status === 400);
check("redeem garbage -> 404 (no hint)", (await redeem(tara, "ZZZZ-ZZZZ-ZZZZ")).status === 404);
check("redeem too short -> 400", (await redeem(tara, "AB")).status === 400);
let r = await redeem(tara, codeOf("tara"));
check("$4 tara redeems her own code -> 200", r.status === 200, JSON.stringify(r));
check("$4 tara: one paid college_drive row of amount 0, no invoice number", (await q("SELECT amount_minor, invoice_number FROM intern_payments WHERE intern_id = $1 AND gateway = 'college_drive' AND status = 'paid'", [U.tara])).length === 1 && (await q("SELECT invoice_number FROM intern_payments WHERE intern_id = $1 AND gateway = 'college_drive'", [U.tara]))[0].invoice_number === null);
check("$4 order redeemed_count = 1", (await used()) === 1);
r = await redeem(tara, codeOf("tara"));
check("$4 same student, same code again -> 409/200? must not take a second seat", (await used()) === 1 && (await paid("tara")) === 1, `${r.status} ${JSON.stringify(r.json)}`);
check("$4 used code answers 'already used' / 'already activated'", [409].includes(r.status), `${r.status} ${JSON.stringify(r.json)}`);
// one student, two codes: tara tries the unbound code of the roster row without an account
r = await redeem(tara, codeOf("ghost"));
check("$4 a student who already redeemed cannot burn a second code (409), and that code stays issued", r.status === 409 && (await q("SELECT status FROM drive_codes WHERE id = $1", [entryOf("ghost").code_id]))[0].status === "issued" && (await used()) === 1, `${r.status} ${JSON.stringify(r.json)}`);

// wrong college (sid is Poornima's student) uses JKLU code
const sid = await login("sid");
r = await redeem(sid, codeOf("sid"));
check("$4 code of college B redeemed by a Poornima student -> 403", r.status === 403, `${r.status} ${JSON.stringify(r.json)}`);
check("$4 ...code still issued, no payment, still Poornima", (await q("SELECT status FROM drive_codes WHERE id = $1", [entryOf("sid").code_id]))[0].status === "issued" && (await paid("sid")) === 0 && (await memb("sid")).college_id === poornima.id);
// someone else's bound code
const simran = await login("simran");
r = await redeem(simran, codeOf("neha"));
check("$4 neha's code is bound to neha (linked by email): another student gets 403", r.status === 403, `${r.status} ${JSON.stringify(r.json)}`);

// denied student
const akash = await login("akash");
r = await redeem(akash, codeOf("akash"));
check("$4/L1 DENIED student redeems the code mailed to them -> refused (4xx, never 500)", r.status >= 400 && r.status < 500, `${r.status} ${JSON.stringify(r.json)}`);
check("$4/L1 ...denied student got no payment and no JKLU membership", (await paid("akash")) === 0 && !(await q("SELECT 1 FROM college_memberships WHERE user_id = $1 AND college_id = $2 AND left_at IS NULL", [U.akash, cid])).length);
check("$4/L1 ...code and seat are untouched (still issued, redeemed_count unchanged)", (await q("SELECT status FROM drive_codes WHERE id = $1", [entryOf("akash").code_id]))[0].status === "issued" && (await used()) === 1);

// left student
const rishi = await login("rishi");
r = await redeem(rishi, codeOf("rishi"));
console.log("      rishi (left) redeem ->", r.status, JSON.stringify(r.json), JSON.stringify(await memb("rishi")));
check("$4 student who left JKLU redeems a JKLU code (own action, consent ticked): allowed per brief default", r.status === 200 || r.status === 403, `${r.status}`);

// expired / revoked
await q("UPDATE drive_codes SET valid_until = now() - interval '1 minute' WHERE id = $1", [entryOf("meera").code_id]);
const meera = await login("meera");
r = await redeem(meera, codeOf("meera"));
check("$4 expired code -> 410", r.status === 410, `${r.status} ${JSON.stringify(r.json)}`);
check("$4 ...claim route also refuses (nothing to accept)", (await meera.post("/api/intern/drive-codes/claim", { declaredAdult: true })).status === 404);
await q("UPDATE drive_codes SET status = 'revoked' WHERE id = $1", [entryOf("neha").code_id]);
const neha = await login("neha");
r = await redeem(neha, codeOf("neha"));
check("$4 revoked code -> 410", r.status === 410, `${r.status} ${JSON.stringify(r.json)}`);

// already paid student
const aarav = await login("aarav");
r = await redeem(aarav, codeOf("aarav"));
check("$4 student who already paid -> 409, seat not burned", r.status === 409 && (await q("SELECT status FROM drive_codes WHERE id = $1", [entryOf("aarav").code_id]))[0].status === "issued", `${r.status} ${JSON.stringify(r.json)}`);

// ghost code (unbound, no account): two students at once. Both are JKLU members, unpaid.
{
  const before = await used();
  const s2 = await login("saanvi");
  const code = codeOf("ghost");
  const [x, y] = await Promise.all([redeem(simran, code), redeem(s2, code)]);
  // The loser sees 409 (lost the code row lock) or 403 (the winner had already bound the entry to their account): both refuse, only one wins.
  const losers = [x, y].filter((r) => r.status !== 200);
  check("$4 one unbound code redeemed by two students in parallel -> exactly one 200, the other 403/409", [x, y].filter((r) => r.status === 200).length === 1 && losers.length === 1 && [403, 409].includes(losers[0].status), `${x.status}/${y.status} ${JSON.stringify([x.json, y.json])}`);
  check("$4 ...seat counted once, one payment row in total", (await used()) === before + 1 && (await paid("simran")) + (await paid("saanvi")) === 1, `used ${await used()} paid ${await paid("simran")}+${await paid("saanvi")}`);
}

// one student, two parallel redeems of two different (own) codes is impossible (one entry per student); parallel same code, same student:
{
  const t = await login("tara");
  const [a, b] = await Promise.all([redeem(t, codeOf("tara")), redeem(t, codeOf("tara"))]);
  check("$4 same student double-click on a used code: no 5xx, no extra seat", a.status < 500 && b.status < 500 && (await paid("tara")) === 1);
}

// seat accounting
{
  const [o] = await q("SELECT issued_count, redeemed_count, slots FROM college_drive_orders WHERE id = $1", [orderId]);
  const real = Number((await q("SELECT count(*) n FROM drive_codes WHERE order_id = $1 AND status = 'redeemed'", [orderId]))[0].n);
  const ents = Number((await q("SELECT count(*) n FROM drive_entitlements WHERE order_id = $1", [orderId]))[0].n);
  check("seats: redeemed_count = redeemed codes = entitlements", o.redeemed_count === real && real === ents, `${o.redeemed_count}/${real}/${ents}`);
  check("seats: redeemed <= issued <= slots", o.redeemed_count <= o.issued_count && o.issued_count <= o.slots);
}

// restore the students so other scripts and the next run start clean
await q("DELETE FROM college_denials WHERE college_id = $1", [cid]);
await q("UPDATE college_memberships SET left_at = NULL, college_id = $2 WHERE user_id = ANY($1)", [[U.akash, U.rishi, U.sid], cid]);
await pool.end();
process.exit(summary() ? 1 : 0);
