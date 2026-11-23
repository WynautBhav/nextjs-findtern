// WP3 X4 (full-time drive offer at the 1% fee, through checkout), X2 (student leaves with open drive things),
// and employer-sees-no-names. Real HTTP against a running production build on a findtern_ca_* DB.
//   . ~/.cache/findtern-college-audit/env.sh; use_wp 3; node e2e/college-audit/wp3-x2-x4.mjs [x2|x4]
import { q, one, session, check, finish, flight } from "./wp3-lib.mjs";
import { DRIVE_FULL_TIME_FEE, fullTimeFeeMinor } from "../../src/lib/checkout.ts";

const only = process.argv[2];
const want = (k) => !only || only === k;
const ftDrive = await one(`SELECT * FROM college_drives WHERE title = 'Final year placements 2027'`);
const nw = await one(`SELECT id FROM employers WHERE company_email = 'hiring@northwind.dev'`);
const college = await one(`SELECT college_id AS id FROM college_admins WHERE email = 'tpo@jklu.edu.in'`);
const tpo = await session("college", "tpo@jklu.edu.in");
const admin = await session("admin", "admin@findtern.dev");
const emp = await session("employer", "hiring@northwind.dev");

function listIn(html, key) {
  const f = flight(html);
  const i = f.indexOf(`"${key}":[`);
  if (i < 0) return null;
  let depth = 0, j = f.indexOf("[", i);
  const start = j;
  for (; j < f.length; j++) { if (f[j] === "[") depth++; else if (f[j] === "]" && --depth === 0) break; }
  try { return JSON.parse(f.slice(start, j + 1)); } catch { return null; }
}
const board = async (key) => listIn((await tpo.get(`/college/drives/${ftDrive.id}`)).text, key);

/* ───────── X4: 1% fee ───────── */
if (want("x4")) {
  const waiting = ((await board("offersWaiting")) ?? []).map((x) => x.userId);
  const o = await one(
    `SELECT p.id, p.intern_id, u.email, p.offer_details->'fullTimeOffer'->>'feeRate' fee, p.offer_details->'fullTimeOffer'->>'annualCtc' ctc, p.offer_details->'fullTimeOffer'->>'ctcCurrency' cur
     FROM proposals p JOIN users u ON u.id = p.intern_id WHERE p.employer_id = $1 AND p.status = 'sent' AND p.offer_details->'fullTimeOffer'->>'driveId' = $2 AND p.intern_id = ANY($3) ORDER BY p.created_at LIMIT 1`, [nw.id, ftDrive.id, waiting]);
  check("X4.0", "setup: a sent drive full-time offer carrying driveId and feeRate", Boolean(o) && Number(o.fee) === DRIVE_FULL_TIME_FEE, JSON.stringify(o));
  console.log(`        offer ${o?.id} CTC ${o?.cur} ${o?.ctc} feeRate ${o?.fee}`);
  const stu = await session("intern", o.email);
  const hiredBefore = (await board("hired")) ?? [];
  check("X4.1", "intern's offers page shows the offer", (await stu.get(`/intern/proposals`)).status === 200);
  const acc = await stu.patch(`/api/proposals/${o.id}/status`, { status: "accepted", agreedToTerms: true, agreedToFullTimeTerms: true });
  check("X4.2", "intern accepts the full-time offer (200)", acc.status === 200, `${acc.status} ${acc.text.slice(0, 200)}`);
  console.log(`        status after accept: ${(await one(`SELECT status FROM proposals WHERE id = $1`, [o.id])).status}`);
  const hiredMid = (await board("hired")) ?? [];
  check("X4.3", "college 'Hired' does NOT count it before it is paid", hiredMid.length === hiredBefore.length && !hiredMid.some((s) => s.userId === o.intern_id), `${hiredBefore.length} -> ${hiredMid.length}`);
  const view = await emp.get(`/employer/proposal/${o.id}`);
  const has1 = /\b1%/.test(view.text), has833 = /8\.33%/.test(view.text);
  check("X4.4", "employer proposal page shows 1% and not 8.33%", has1 && !has833, `status ${view.status}; 1% ${has1}, 8.33% ${has833}`);
  const ord = await emp.post(`/api/employer/${nw.id}/payment/razorpay/order`, { currency: o.cur === "USD" ? "USD" : "INR", proposalIds: [o.id], mode: "upfront", paymentIndex: 0, testPay: true });
  console.log(`        order: ${ord.status} ${ord.text.slice(0, 300)}`);
  check("X4.5", "employer order settles through the real settlement path (200)", ord.status === 200, `${ord.status} ${ord.text.slice(0, 300)}`);
  const pay = await one(`SELECT amount_minor, status, gateway, invoice_number FROM employer_payments WHERE employer_id = $1 ORDER BY created_at DESC LIMIT 1`, [nw.id]);
  const feeMinor = fullTimeFeeMinor(Number(o.ctc) * 100, DRIVE_FULL_TIME_FEE);
  console.log(`        payment row ${JSON.stringify(pay)}; 1% of CTC = ${feeMinor / 100}, 8.33% would be ${fullTimeFeeMinor(Number(o.ctc) * 100) / 100}`);
  check("X4.6", "charged amount is 1% (plus GST at most), nowhere near 8.33%", Boolean(pay) && Number(pay.amount_minor) >= feeMinor && Number(pay.amount_minor) <= Math.round(feeMinor * 1.18) + 100, JSON.stringify(pay));
  const st = await one(`SELECT status FROM proposals WHERE id = $1`, [o.id]);
  console.log(`        status after payment: ${st.status}`);
  const hiredAfter = (await board("hired")) ?? [];
  check("X4.7", "after payment: college 'Hired' counts it exactly once", hiredAfter.filter((s) => s.userId === o.intern_id).length === 1 && hiredAfter.length === hiredBefore.length + 1, `${hiredBefore.length} -> ${hiredAfter.length} status ${st.status}`);
  check("X4.8", "admin proposal tracker loads", (await admin.get(`/admin/proposal-tracker`)).status === 200);
  check("X4.9", "TPO drive 'Full-time' list has the same student", ((await board("fullTime")) ?? []).some((s) => s.userId === o.intern_id));
}

/* ───────── X2: student leaves the college with open drive things ───────── */
if (want("x2")) {
  const s = await one(
    `SELECT u.id, u.email, u.first_name, u.last_name FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.college_id = $1 AND m.status = 'verified' AND m.left_at IS NULL
     JOIN intern_onboarding o ON o.user_id = u.id AND o.extra_data->>'approvalStatus' = 'Approved'
     WHERE m.year = 4 AND u.frozen_at IS NULL AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.intern_id = u.id) ORDER BY u.email LIMIT 1`, [college.id]);
  const stu = await session("intern", s.email);
  const meet = (await emp.post(`/api/employer/drives/${ftDrive.id}/meetings`, { userId: s.id, inMinutes: 10, manualLink: "https://meet.example.com/wp3-x2" })).json?.meeting;
  const sl = await emp.post(`/api/employer/drives/${ftDrive.id}/shortlist`, { userId: s.id, on: true });
  const before = await one(`SELECT (SELECT count(*)::int FROM college_memberships WHERE college_id = $1 AND left_at IS NULL) members, (SELECT coalesce(sum(seats),0)::int FROM college_seat_batches WHERE college_id = $1 AND status = 'paid') seats`, [college.id]);
  check("X2.0", "setup: open meet and shortlist exist", Boolean(meet) && sl.status === 200, `${sl.status} ${sl.text.slice(0, 100)}`);
  const ep0 = await emp.get(`/employer/drives/${ftDrive.id}`);
  check("X2.0b", "employer drive page shows the student, and never their name before hire", flight(ep0.text).includes(s.id) && !ep0.text.includes(`${s.first_name} ${s.last_name}`), `full name in page ${ep0.text.includes(`${s.first_name} ${s.last_name}`)}`);
  check("X2.1", "before: student is in the drive (board 'meetingsWaiting')", ((listIn((await tpo.get(`/college/drives/${ftDrive.id}`)).text, "meetingsWaiting")) ?? []).some((x) => x.userId === s.id));
  const lr = await stu.post(`/api/intern/college/leave-request`, { reason: "audit" });
  check("X2.2", "student files the leave request", [200, 201].includes(lr.status), `${lr.status} ${lr.text.slice(0, 120)}`);
  const reqRow = await one(`SELECT id FROM college_leave_requests WHERE user_id = $1 AND status = 'requested'`, [s.id]);
  const dec = await tpo.post(`/api/college/leave-requests/decide`, { ids: [reqRow.id], action: "approve" });
  check("X2.3", "TPO approves (200)", dec.status === 200, `${dec.status} ${dec.text.slice(0, 160)}`);
  check("X2.4", "membership ended (left_at set)", Boolean((await one(`SELECT left_at FROM college_memberships WHERE user_id = $1`, [s.id]))?.left_at));
  const after = (await tpo.get(`/college/drives/${ftDrive.id}`)).text;
  check("X2.5", "student is gone from every list on the TPO drive page", !flight(after).includes(`"userId":"${s.id}"`));
  const mrow = await one(`SELECT status FROM college_drive_meetings WHERE id = $1`, [meet.id]);
  console.log(`        open meet status after leave: ${mrow.status}`);
  const em = await emp.get(`/api/employer/drives/${ftDrive.id}/meetings`);
  const seen = em.json?.meetings?.find((x) => x.id === meet.id);
  check("X2.6", "employer's view of the open meet reads cancelled once the student has left (API)", seen?.status === "cancelled", JSON.stringify(seen));
  console.log(`        (stored row status: ${mrow.status} -- REQUEST to close it when the membership ends, leave-request-db.ts endMembership)`);
  const acc = await stu.post(`/api/intern/college/meetings/${meet.id}`, { action: "accept" });
  check("X2.7", "student cannot accept the drive meet after leaving", acc.status !== 200, `${acc.status} ${acc.text.slice(0, 120)}`);
  const again = await emp.post(`/api/employer/drives/${ftDrive.id}/meetings`, { userId: s.id, inMinutes: 10, manualLink: "https://meet.example.com/wp3-x2b" });
  check("X2.8", "employer cannot make a new meet request (404)", again.status === 404, `${again.status} ${again.text.slice(0, 120)}`);
  const ep = await emp.get(`/employer/drives/${ftDrive.id}`);
  check("X2.9", "employer drive page no longer lists the student as a candidate", !flight(ep.text).includes(`"id":"${s.id}","name"`), "candidate card still in payload");
  check("X2.9b", "employer drive page: the open meet is shown cancelled, not requested", !new RegExp(`"userId":"${s.id}"[^}]*"status":"(requested|accepted)"`).test(flight(ep.text)), "meeting still open in the page payload");
  const proj = await one(`SELECT id FROM projects WHERE employer_id = $1 AND status = 'open' LIMIT 1`, [nw.id]);
  const ftOffer = await emp.post(`/api/employer/${nw.id}/full-time-offer`, { driveId: ftDrive.id, internId: s.id, projectId: proj?.id ?? "x", roleTitle: "Engineer", jd: "x", jobMode: "remote", timezone: "Asia/Kolkata", shiftFrom: "09:00", shiftTo: "18:00", ctcCurrency: "INR", annualCtc: 600000, offerLetterKey: `${nw.id}-x` });
  check("X2.10", "employer cannot send a drive full-time offer (404 student not in drive; or 400 body)", ![200, 201].includes(ftOffer.status), `${ftOffer.status} ${ftOffer.text.slice(0, 120)}`);
  const exp = await tpo.post(`/api/college/students/export`, { columns: ["email", "driveCalls"], userIds: [s.id] });
  console.log(`        master data export for the student after leave: ${exp.status} ${JSON.stringify(exp.text.slice(0, 160))}`);
  check("X2.11", "master data does not export a student who left", !exp.text.includes(s.email), exp.text.slice(0, 160));
  const afterM = await one(`SELECT (SELECT count(*)::int FROM college_memberships WHERE college_id = $1 AND left_at IS NULL) members, (SELECT coalesce(sum(seats),0)::int FROM college_seat_batches WHERE college_id = $1 AND status = 'paid') seats`, [college.id]);
  check("X2.12", "no seat comes back: paid seats unchanged, members down by exactly 1 (D2)", afterM.seats === before.seats && afterM.members === before.members - 1, JSON.stringify({ before, afterM }));
  const sp = await tpo.get(`/college/students/${s.id}`);
  console.log(`        TPO student page after leave: ${sp.status}`);
  check("X2.13", "TPO student page for the student who left shows the not-found screen and none of their data (Next streams it with 200)", /could.?n.t find|not found|404/i.test(sp.text) && !sp.text.includes(s.email) && !sp.text.includes(s.first_name), `${sp.status}`);
}

await finish();
