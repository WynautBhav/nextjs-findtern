// WP4 $6 + wallet/bank/payout gate: TPO earnings page = admin payouts = DB; races.
//   source ~/.cache/findtern-college-audit/env.sh; use_wp 4; node e2e/college-audit/wp4-wallet.mjs
import fs from "node:fs";
import { BASE, check, loginAs, pool, q, summary } from "./wp4-lib.mjs";

const admin = await loginAs("admin", "admin@findtern.dev");
const tpo = await loginAs("college", "tpo@jklu.edu.in");
const [jklu] = await q("SELECT id FROM colleges WHERE slug = 'jklu'");
const cid = jklu.id;
const inr = (m) => `₹${(m / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const balance = async () => Number((await q("SELECT coalesce(sum(amount_minor),0) s FROM college_wallet_entries WHERE college_id = $1", [cid]))[0].s);
const mailFile = `logs/mail/${new Date().toISOString().slice(0, 10)}.log`;
const mailAll = () => { try { return fs.readFileSync(mailFile, "utf8"); } catch { return ""; } };
const mailStart = mailAll().length;
const mailLog = () => mailAll().slice(mailStart); // only mail written by this run
await q("DELETE FROM college_payouts WHERE college_id = $1 AND status = 'requested'", [cid]);
await q("UPDATE colleges SET bank_account_name=NULL, bank_name=NULL, bank_account_number=NULL, bank_ifsc=NULL WHERE id = $1", [cid]);
const bal0 = await balance();
console.log("start balance", inr(bal0));

// bank gate
let r = await tpo.post("/api/college/payouts", { amountMinor: 100 });
check("$6 payout with no bank -> 400 'Add your bank account'", r.status === 400 && /bank account/i.test(r.json?.error ?? ""), JSON.stringify(r));
check("$6 earnings page says 'Add your bank account'", /Add your bank account/.test(text((await tpo.get("/college/earnings")).text)));
const bank = { holder: "JK Lakshmipat University", bankName: "HDFC Bank", accountNumber: "000123456789", confirm: "000123456789", ifsc: "HDFC0000001" };
check("bank: confirm mismatch -> 400", (await tpo.put("/api/college/bank", { ...bank, confirm: "000123456780" })).status === 400);
check("bank: bad ifsc -> 400", (await tpo.put("/api/college/bank", { ...bank, ifsc: "BAD" })).status === 400);
check("bank: short account number -> 400", (await tpo.put("/api/college/bank", { ...bank, accountNumber: "12", confirm: "12" })).status === 400);
r = await tpo.put("/api/college/bank", bank);
check("bank: saved -> 200, answer holds last4 only", r.status === 200 && r.json?.last4 === "6789" && !JSON.stringify(r.json).includes("000123456789"), JSON.stringify(r));
const earn = (await tpo.get("/college/earnings")).text;
check("bank: earnings page shows only last 4 digits", !earn.includes("000123456789") && /6789/.test(earn));
check("bank: admin tab masks the number", !(await admin.get(`/admin/colleges/${cid}?tab=wallet`)).text.includes("000123456789"));

// bad amounts
for (const bad of [0, -5, 1.5, "100", null, 1e12, bal0 + 1]) {
  const x = await tpo.post("/api/college/payouts", { amountMinor: bad });
  check(`$6 amount ${JSON.stringify(bad)} refused (4xx, no row)`, x.status >= 400 && x.status < 500, `${x.status} ${x.text.slice(0, 120)}`);
}
check("$6 no payout row after bad amounts", (await q("SELECT 1 FROM college_payouts WHERE college_id = $1 AND status = 'requested'", [cid])).length === 0);

// two parallel requests for the whole balance
const [a, b] = await Promise.all([tpo.post("/api/college/payouts", { amountMinor: bal0 }), tpo.post("/api/college/payouts", { amountMinor: bal0 })]);
check("$6 two parallel requests: 200 + 409", [a.status, b.status].sort().join() === "200,409", `${a.status}/${b.status}`);
check("$6 exactly one open request", (await q("SELECT 1 FROM college_payouts WHERE college_id = $1 AND status = 'requested'", [cid])).length === 1);
check("$6 a second request while one is open -> 409", (await tpo.post("/api/college/payouts", { amountMinor: 100 })).status === 409);
check("bank locked while a withdrawal waits -> 409", (await tpo.put("/api/college/bank", bank)).status === 409);
const [open] = await q("SELECT id, amount_minor FROM college_payouts WHERE college_id = $1 AND status = 'requested'", [cid]);

// numbers agree: TPO earnings page, admin college page, DB
{
  const t = text((await tpo.get("/college/earnings")).text);
  const ad = text((await admin.get(`/admin/colleges/${cid}?tab=wallet`)).text);
  check(`numbers: TPO earnings shows balance ${inr(bal0)}`, t.includes(`Balance ${inr(bal0)}`), t.slice(t.indexOf("Earnings"), t.indexOf("Earnings") + 300));
  check("numbers: TPO earnings shows 0 available + all waiting", /₹0 available to withdraw/.test(t) || t.includes("₹0.00 available") || /Nothing available|waiting for Findtern/.test(t));
  check(`numbers: admin wallet panel Balance ${inr(bal0)}, Waiting ${inr(Number(open.amount_minor))}, Available ₹0`, ad.includes(`Balance ${inr(bal0)}`) && ad.includes(`Waiting for payout ${inr(Number(open.amount_minor))}`) && /Available ₹0\b/.test(ad), ad.slice(ad.indexOf("Balance"), ad.indexOf("Balance") + 200));
}

// mail: admin got the request, nobody else
{
  const log = mailLog();
  const requests = log.split("--- ").filter((e) => /Subject: .*(withdraw|payout)/i.test(e));
  check("mail: payout request went to admins only (never the college)", requests.length > 0 && requests.every((e) => !/^To: .*jklu/m.test(e)), requests.map((e) => e.split("\n")[1]).join(" | "));
}

// settle: wrong college id, then parallel paid x2, balance dropped, reject
const other = (await q("SELECT id FROM colleges WHERE slug <> 'jklu' LIMIT 1"))[0];
check("settle with another college's id in the URL -> 404", (await admin.post(`/api/admin/colleges/${other.id}/payouts/${open.id}`, { action: "paid", referenceId: "X" })).status === 404);
check("settle: empty reference -> 400", (await admin.post(`/api/admin/colleges/${cid}/payouts/${open.id}`, { action: "paid", referenceId: " " })).status === 400);
// the wallet drops (adjustment) after the request was made: settle must refuse and keep the request open
await q("INSERT INTO college_wallet_entries (college_id, kind, amount_minor) VALUES ($1,'adjustment',-100)", [cid]);
r = await admin.post(`/api/admin/colleges/${cid}/payouts/${open.id}`, { action: "paid", referenceId: "SHORT-1" });
check("$6 settle after the balance dropped -> 409", r.status === 409, JSON.stringify(r));
check("$6 ...request still open, no debit written", (await q("SELECT status FROM college_payouts WHERE id = $1", [open.id]))[0].status === "requested" && (await q("SELECT 1 FROM college_wallet_entries WHERE payout_id = $1", [open.id])).length === 0);
await q("DELETE FROM college_wallet_entries WHERE college_id = $1 AND kind = 'adjustment' AND amount_minor = -100", [cid]);
const [p1, p2] = await Promise.all([
  admin.post(`/api/admin/colleges/${cid}/payouts/${open.id}`, { action: "paid", referenceId: "UTR-PAR-1" }),
  admin.post(`/api/admin/colleges/${cid}/payouts/${open.id}`, { action: "paid", referenceId: "UTR-PAR-2" }),
]);
check("$6 parallel settle: 200 + 409", [p1.status, p2.status].sort().join() === "200,409", `${p1.status}/${p2.status}`);
check("$6 exactly one debit of the request amount", JSON.stringify((await q("SELECT amount_minor FROM college_wallet_entries WHERE payout_id = $1", [open.id])).map((x) => Number(x.amount_minor))) === JSON.stringify([-Number(open.amount_minor)]));
check("$6 balance is now 0, never negative", (await balance()) === 0, String(await balance()));
check("$6 reject after paid -> 409", (await admin.post(`/api/admin/colleges/${cid}/payouts/${open.id}`, { action: "reject", reason: "late reject" })).status === 409);
{
  const t = text((await tpo.get("/college/earnings")).text);
  const ad = text((await admin.get(`/admin/colleges/${cid}?tab=wallet`)).text);
  check("numbers after pay: TPO balance ₹0 and a 'Withdrawal paid' row of the same amount", t.includes("Balance ₹0") && t.includes("Withdrawal paid") && t.includes(`−${inr(bal0)}`.replace("−", "-")) || t.includes(`-${inr(bal0)}`) || t.includes(`−${inr(bal0)}`), t.slice(t.indexOf("Activity"), t.indexOf("Activity") + 300));
  check("numbers after pay: admin ledger shows the same debit and reference", ad.includes("Withdrawal paid (UTR-PAR-") && ad.includes("Balance ₹0"));
  const log = mailLog();
  const paidMails = log.split("--- ").filter((e) => /Subject: .*payout|Subject: .*withdraw/i.test(e) && /^To: .*jklu/m.test(e));
  check("mail: paid mail went to the college officer once", paidMails.length === 1, String(paidMails.length));
}
// credit arrives, request, reject: no debit, bank unlocks
await q("INSERT INTO college_wallet_entries (college_id, kind, amount_minor) VALUES ($1,'adjustment',50000)", [cid]);
check("request after paid works again", (await tpo.post("/api/college/payouts", { amountMinor: 20000 })).status === 200);
const [open2] = await q("SELECT id FROM college_payouts WHERE college_id = $1 AND status = 'requested'", [cid]);
check("reject with a short reason -> 400", (await admin.post(`/api/admin/colleges/${cid}/payouts/${open2.id}`, { action: "reject", reason: "no" })).status === 400);
check("reject ok", (await admin.post(`/api/admin/colleges/${cid}/payouts/${open2.id}`, { action: "reject", reason: "bank details wrong" })).status === 200);
check("reject: balance unchanged (₹500)", (await balance()) === 50000);
check("bank unlocked after reject", (await tpo.put("/api/college/bank", bank)).status === 200);
check("earnings page lists 'Withdrawal declined'", text((await tpo.get("/college/earnings")).text).includes("Withdrawal declined"));
// restore the seeded wallet so other scripts see the same numbers
await q("DELETE FROM college_wallet_entries WHERE kind IN ('payout','adjustment') AND college_id = $1", [cid]);
await pool.end();
process.exit(summary() ? 1 : 0);
