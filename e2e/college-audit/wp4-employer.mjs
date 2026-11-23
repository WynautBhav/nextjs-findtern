// WP4: employer order for a college-drive full-time hire (1% fee) vs a standard one (8.33%), at the real amount (testPay) and in free mode.
//   source ~/.cache/findtern-college-audit/env.sh; use_wp 4; node e2e/college-audit/wp4-employer.mjs
import { check, loginAs, pool, q, summary } from "./wp4-lib.mjs";
import { randomUUID } from "node:crypto";

const emp = await loginAs("employer", "hiring@northwind.dev");
const [e] = await q("SELECT id FROM employers WHERE company_email = 'hiring@northwind.dev'");
const [project] = await q("SELECT id FROM projects WHERE employer_id = $1 AND status = 'active' LIMIT 1", [e.id]);
const [drive] = await q("SELECT id FROM college_drives WHERE kind = 'full_time' LIMIT 1");
const students = await q(`SELECT u.id FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.left_at IS NULL JOIN intern_onboarding o ON o.user_id = u.id AND coalesce(o.extra_data->'cgpaVerification'->>'status', 'none') <> 'pending'
   WHERE u.role = 'intern' AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.intern_id = u.id) AND EXISTS (SELECT 1 FROM intern_payments ip WHERE ip.intern_id = u.id AND ip.status = 'paid') ORDER BY u.email LIMIT 4`);
check("setup: employer, open project, full-time drive, 4 free students", Boolean(e && project && drive && students.length === 4), JSON.stringify({ e: !!e, project: !!project, drive: !!drive, n: students.length }));
const counter = async () => Number((await q("SELECT last FROM invoice_counters WHERE fy = '2026-27'"))[0]?.last ?? 0);
const inr = (minor) => `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const start = new Date(Date.now() + 20 * 86400_000).toISOString().slice(0, 10);

async function accepted(internId, ctcRupees, feeRate) {
  const id = randomUUID();
  const ft = { jobTitle: "Associate Engineer", jobMode: "remote", timezone: "Asia/Kolkata", shiftFrom: "09:00", shiftTo: "17:00", ctcCurrency: "INR", annualCtc: ctcRupees, annualCtcMinor: ctcRupees * 100, offerLetterKey: "x", startDate: start, createdAt: new Date().toISOString(), ...(feeRate ? { driveId: drive.id, feeRate } : {}) };
  await q("INSERT INTO proposals (id, employer_id, intern_id, project_id, flow_type, status, currency, offer_details) VALUES ($1,$2,$3,$4,'direct','accepted','INR',$5::jsonb)", [id, e.id, internId, project.id, JSON.stringify({ fullTimeOffer: ft, currency: "INR" })]);
  return id;
}
const pay = (proposalId, body = {}) => emp.post(`/api/employer/${e.id}/payment/razorpay/order`, { currency: "INR", proposalIds: [proposalId], mode: "upfront", paymentIndex: 0, ...body });

// The hire gate: a student whose CGPA check is still pending cannot be paid for (409), at any price
const gatedStudent = (await q("SELECT o.user_id id FROM intern_onboarding o JOIN college_memberships m ON m.user_id = o.user_id WHERE o.extra_data->'cgpaVerification'->>'status' = 'pending' AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.intern_id = o.user_id) LIMIT 1"))[0];
if (gatedStudent) {
  const gp = await accepted(gatedStudent.id, 800000, 0.01);
  const g = await pay(gp, { testPay: true });
  check("hire gate: pending CGPA check -> 409 cgpa_verification_pending, no order row", g.status === 409 && g.json?.code === "cgpa_verification_pending" && (await q("SELECT 1 FROM employer_payments WHERE raw::text LIKE $1", [`%${gp}%`])).length === 0, `${g.status} ${JSON.stringify(g.json)}`);
  await q("DELETE FROM proposals WHERE id = $1", [gp]);
} else console.log("      (no student with a pending CGPA check to exercise the gate)");

// 8,00,000 CTC: drive 1% = 8,000; standard 8.33% = 66,640
const drivePid = await accepted(students[0].id, 800000, 0.01);
const stdPid = await accepted(students[1].id, 800000, null);
const forgedPid = await accepted(students[2].id, 800000, 0.0833); // a stamped rate that is not lower than standard reads as standard
const freePid = await accepted(students[3].id, 800000, 0.01);

let before = await counter();
let r = await pay(drivePid, { testPay: true });
console.log("      drive order ->", r.status, JSON.stringify(r.json).slice(0, 300));
check("drive 1%: order accepted", r.status === 200, JSON.stringify(r.json));
const byProposal = (pid) => q("SELECT id, amount_minor, invoice_number, status, gateway FROM employer_payments WHERE raw::text LIKE $1 ORDER BY created_at DESC LIMIT 1", [`%${pid}%`]);
let [row] = await byProposal(drivePid);
console.log("      row:", row && { amount: row.amount_minor, status: row.status, inv: row.invoice_number, gw: row.gateway });
const driveFee = 800000 * 100 * 0.01; // 8,00,000 CTC x 1% in paise
check(`drive 1%: charged ${inr(driveFee)} (1% of CTC)`, row && Number(row.amount_minor) === driveFee, `${row?.amount_minor} vs ${driveFee}`);
check("drive 1%: settled paid with an invoice serial (amount > 0)", row && row.status === "paid" && !!row.invoice_number && (await counter()) === before + 1, JSON.stringify(row));

r = await pay(stdPid, { testPay: true });
const [rowStd] = await byProposal(stdPid);
console.log("      standard charge:", rowStd && Number(rowStd.amount_minor));
check("standard 8.33%: charged 8.33% of CTC (66,640.00)", r.status === 200 && rowStd && Number(rowStd.amount_minor) === 6664000, JSON.stringify({ r: r.status, std: rowStd?.amount_minor }));

r = await pay(forgedPid, { testPay: true });
const [rowForged] = await byProposal(forgedPid);
check("a stamped rate that is not below standard is charged as standard", rowForged && Number(rowForged.amount_minor) === 6664000, JSON.stringify({ forged: rowForged?.amount_minor }));

r = await pay(drivePid, { testPay: true });
check("paying the same hire again is refused (already paid), no second row", r.status >= 400 && r.status < 500 && (await q("SELECT 1 FROM employer_payments WHERE raw::text LIKE $1", [`%${drivePid}%`])).length === 1, `${r.status} ${JSON.stringify(r.json)}`);

// free mode: no testPay -> amount 0, no serial
before = await counter();
r = await pay(freePid);
const [rowFree] = await byProposal(freePid);
check("free mode: order settles at 0 (gateway free) with no invoice serial", r.status === 200 && rowFree && Number(rowFree.amount_minor) === 0 && rowFree.status === "paid" && rowFree.invoice_number === null && (await counter()) === before, JSON.stringify({ r: r.status, rowFree, c: await counter(), before }));
const [hired] = await q("SELECT status FROM proposals WHERE id = $1", [freePid]);
check("free mode: the hire is made (proposal hired)", hired.status === "hired", hired.status);

// leave the DB as found for the other scripts
await q("DELETE FROM employer_payments WHERE id = ANY($1)", [[row?.id, rowStd?.id, rowForged?.id, rowFree?.id].filter(Boolean)]);
await q("DELETE FROM proposals WHERE id = ANY($1)", [[drivePid, stdPid, forgedPid, freePid]]);
await pool.end();
process.exit(summary() ? 1 : 0);
