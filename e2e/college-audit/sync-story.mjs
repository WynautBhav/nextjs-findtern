// Round-2 story driver: employer signup -> project -> TPO decisions -> drives + meets -> offers (accept/auto-close/decline/withdraw/lapse/admin-close) -> free-mode hire ->
// full-time 1% drive offer -> leave -> admin freeze. Real HTTP APIs with real session cookies (the same calls the forms make). SQL writes ONLY shift timestamps.
// After every step: checkpoint() (SQL invariants + role oracles) and the college oracle of the new college.
//   BASE=http://localhost:3337 DATABASE_URL=postgresql://findtern@127.0.0.1:55490/findtern_ca_entry LEDGER=ledger.json STORY=story-ledger.json node --experimental-strip-types e2e/college-audit/sync-story.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { q, one, BASE, sessionAny, saveSecret, secrets, rec, png } from "./sync-lib.mjs";
import { Client } from "./wp4-lib.mjs";
import { checkpoint } from "./sync-checkpoint.mjs";
import { collegeOracle } from "./sync-college.mjs";
import { businessStartDate } from "../lib/start-date.mjs";

const led = JSON.parse(readFileSync(process.env.LEDGER, "utf8"));
const OUT = process.env.STORY ?? "story-ledger.json";
const story = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { steps: [], scenarios: {}, ids: {} };
const TAG = story.tag ?? (story.tag = Math.random().toString(36).slice(2, 6));
const save = () => writeFileSync(OUT, JSON.stringify(story, null, 1));
let seq = story.steps.length;
const act = (step, actor, api, r, expected, extra = {}) => { const a = { seq: ++seq, step, actor, api, http: r?.status ?? null, expected, ok: !!r && r.status >= 200 && r.status < 300, ...extra }; if (r && !a.ok) a.body = (r.text ?? "").slice(0, 240); story.steps.push(a); save(); console.log(`${a.ok ? "ok     " : "REFUSED"} #${a.seq} [${step}] ${actor} ${api} -> ${a.http} ${a.ok ? "" : a.body}`); return r; };
const pw = process.env.SYNC_ENTRY_PW ?? "Sync@2026x";
const mailFile = () => `${process.cwd()}/logs/mail/${new Date().toISOString().slice(0, 10)}.log`;
const otpFor = (email) => { const t = existsSync(mailFile()) ? readFileSync(mailFile(), "utf8") : ""; const b = t.split(/\n--- /).filter((x) => x.includes(`To: ${email}`)).at(-1) ?? ""; const m = b.match(/\b(\d{6})\b/); if (!m) throw new Error("no otp " + email); return m[1]; };
const byEmail = Object.fromEntries(led.interns.map((i) => [i.email.split(".")[0], i]));
const I = (k) => byEmail[k]; const uid = (k) => I(k).id;
const NEWC = led.colleges[0];
const admin = await sessionAny("admin", "admin@findtern.dev");
const tpo = await sessionAny("college", NEWC.tpoEmail);
const tpoJ = await sessionAny("college", "tpo@jklu.edu.in");
act("tpo.terms", "tpo", "POST /api/terms/accept", await tpo.post("/api/terms/accept"), "200");
let adminSessForOracle = admin;

async function step(label, scope, fn) {
  console.log(`\n=== STEP ${label}`);
  try { await fn(); } catch (e) { console.log("STEP ERROR", e.stack?.split("\n").slice(0, 3).join(" | ")); story.steps.push({ seq: ++seq, step: label, error: e.message }); save(); rec("story", label, `step ${label} completed without crashing`, false, e.message); }
  await checkpoint(label, { collegeId: NEWC.id, internIds: [], employerIds: [], proposalIds: [], ...scope });
  try { await collegeOracle(`story:${label}`, { collegeId: NEWC.id, tpoEmail: NEWC.tpoEmail, admin: adminSessForOracle, sampleCap: 12 }); } catch (e) { rec("story", `${label}:college oracle`, "college oracle ran", false, e.message); }
  save();
}

async function employerSignup(n, company) {
  const email = `hr${n}.${TAG}@syncorp-${TAG}${n}.in`; const phone = `97${TAG.replace(/\D/g, "").padEnd(2, "3").slice(0, 2)}${String(7000 + n).padStart(6, "0")}`.slice(0, 10);
  const c = new Client();
  act("employer.signup", `employer${n}`, "POST /api/auth/signup/send-otp", await c.post("/api/auth/signup/send-otp", { email, subjectType: "employer", countryCode: "+91", phoneNumber: phone }), "200");
  await new Promise((r) => setTimeout(r, 500));
  act("employer.signup", `employer${n}`, "POST /api/auth/signup/verify-otp", await c.post("/api/auth/signup/verify-otp", { email, otp: otpFor(email), subjectType: "employer" }), "200");
  const r = act("employer.signup", `employer${n}`, "POST /api/auth/employer/signup", await c.post("/api/auth/employer/signup", { name: `Hiring Manager ${n}`, companyName: company, companyEmail: email, countryCode: "+91", phoneNumber: phone, password: pw, agreedToTerms: true }), "200");
  const id = r.json?.employer?.id;
  const domain = email.split("@")[1];
  act("employer.onboard", `employer${n}`, "PATCH /api/employer/[id]", await c.patch(`/api/employer/${id}`, { companyName: company, websiteUrl: `https://${domain}`, logoUrl: null, companySize: "11-50", country: "India", state: "Karnataka", city: "Bengaluru", primaryContactName: `Hiring Manager ${n}`, primaryContactRole: "Founder", countryCode: "+91", phoneNumber: phone, escalationContactName: "Ravi Ops", escalationContactRole: "Operations lead", escalationContactEmail: `ops@${domain}`, escalationContactCountryCode: "+91", escalationContactPhone: `96${phone.slice(2)}`, gstNumber: null, billingPincode: "560001" }), "200");
  const pr = act("employer.project", `employer${n}`, "POST /api/employer/[id]/projects", await c.post(`/api/employer/${id}/projects`, { projectName: `Syncorp dashboards ${n} ${TAG}`, skills: ["Python", "SQL", "React", "Data Analysis"], scopeOfWork: "upto-60", fullTimeOffer: false, locationType: "remote", preferredLocations: [], pincode: "", city: "", state: "", timezone: "Asia/Kolkata" }), "201");
  const pid = pr.json?.project?.id;
  act("employer.project", `employer${n}`, "POST /api/employer/projects/[id]/transition", await c.post(`/api/employer/projects/${pid}/transition`, { to: "published" }), "200");
  const s = await sessionAny("employer", email).catch(() => null);
  return { n, email, id, pid, c, phone, company };
}
const offerBody = (internId, projectId, role, over = {}) => ({ internId, projectId, flowType: "direct", agreedToPolicy: true, roleTitle: role, jd: `Build and maintain ${role} work for the team.`, additionalInfo: "Real work with code review and mentoring.", mode: "remote", startDate: businessStartDate(7), duration: "2m", weeklySchedule: "mon_fri", shiftFrom: "10:00", shiftTo: "18:00", timezone: "Asia/Kolkata", laptop: "company", paidLeavesPerMonth: 0, skills: ["Python", "SQL"], ...over });
const accept = (stu, pid) => stu.patch(`/api/proposals/${pid}/status`, { status: "accepted", agreedToTerms: true });

let E1, E2; const sc = story.scenarios; const ids = story.ids;
const stu = {}; for (const k of Object.keys(byEmail)) stu[k] = await sessionAny("intern", I(k).email);

// ---------------------------------------------------------------- 1 employers
if (!ids.employers) await step("1-employers", {}, async () => {
  E1 = await employerSignup(1, `Syncorp ${TAG} Pvt Ltd`); E2 = await employerSignup(2, `Beta Works ${TAG} LLP`);
  ids.employers = [{ id: E1.id, email: E1.email, project: E1.pid, company: E1.company }, { id: E2.id, email: E2.email, project: E2.pid, company: E2.company }];
});
const emp1 = await sessionAny("employer", ids.employers[0].email), emp2 = await sessionAny("employer", ids.employers[1].email);
E1 = { ...ids.employers[0], c: emp1 }; E2 = { ...ids.employers[1], c: emp2 };
const EIDS = [E1.id, E2.id];

// ---------------------------------------------------------------- 2 TPO decisions
await step("2-tpo-decisions", { internIds: led.interns.map((i) => i.id) }, async () => {
  const mine = ["ananya", "zoe", "priya", "rohan", "ishaan", "meera", "aditya"].map(uid);
  act("tpo.decide", "tpo", "POST /api/college/students/decide accept x7 (already verified: expect idempotent)", await tpo.post("/api/college/students/decide", { userIds: mine, action: "accept" }), "200/idempotent");
  act("tpo.decide", "tpo", "POST decide deny aditya", await tpo.post("/api/college/students/decide", { userIds: [uid("aditya")], action: "deny", note: "Not on our placement list" }), "200 denied");
  ids.deniedState = await one("SELECT status FROM college_memberships WHERE user_id=$1", [uid("aditya")]);
  act("tpo.decide", "tpo", "POST decide restore aditya (add back)", await tpo.post("/api/college/students/decide", { userIds: [uid("aditya")], action: "restore" }), "200 verified");
  act("tpo.decide", "tpoJKLU", "POST decide accept sana,lakshmi", await tpoJ.post("/api/college/students/decide", { userIds: [uid("sana"), uid("lakshmi")], action: "accept" }), "200");
  act("tpo.decide", "tpoJKLU", "POST decide deny tarun", await tpoJ.post("/api/college/students/decide", { userIds: [uid("tarun")], action: "deny", note: "Left the program" }), "200 denied");
  sc.tpoDenied = { internEmail: I("tarun").email, college: "JKLU" }; sc.tpoDeniedRestored = { internEmail: I("aditya").email, college: NEWC.name };
});

// ---------------------------------------------------------------- 3 drives + meets
let drive, ftDrive;
await step("3-drives-meets", { internIds: ["ananya", "zoe", "priya", "rohan"].map(uid), employerIds: EIDS }, async () => {
  const iso = (ms) => new Date(Date.now() + ms).toISOString(); const H = 3600e3;
  const tok = (u) => u.split("/drive/")[1];
  let r = act("drive.create", "tpo", "POST /api/college/drives internship", await tpo.post("/api/college/drives", { title: `Sync campus drive ${TAG}`, kind: "internship", startsAt: iso(-H), endsAt: iso(48 * H), eligibility: { years: [1, 2, 3, 4, 5] } }), "201");
  drive = { id: r.json?.id, token: tok(r.json?.url ?? "/drive/") };
  r = act("drive.create", "tpo", "POST /api/college/drives full_time", await tpo.post("/api/college/drives", { title: `Sync full-time drive ${TAG}`, kind: "full_time", startsAt: iso(-H), endsAt: iso(48 * H), eligibility: { years: [3, 4, 5] } }), "201");
  ftDrive = { id: r.json?.id, token: tok(r.json?.url ?? "/drive/") };
  ids.drive = drive; ids.ftDrive = ftDrive;
  act("drive.join", "employer1", "POST /api/drives/join", await emp1.post("/api/drives/join", { token: drive.token }), "200");
  act("drive.join", "employer1", "POST /api/drives/join (full-time)", await emp1.post("/api/drives/join", { token: ftDrive.token }), "200");
  act("drive.join", "employer2", "POST /api/drives/join", await emp2.post("/api/drives/join", { token: drive.token }), "200");
  const ask = (e, k, m) => e.post(`/api/employer/drives/${drive.id}/meetings`, { userId: uid(k), inMinutes: m, manualLink: "https://meet.example.com/sync" });
  const mA = act("meet.request", "employer1", "POST meetings ananya", await ask(emp1, "ananya", 10), "201"), mB = act("meet.request", "employer1", "POST meetings zoe", await ask(emp1, "zoe", 10), "201");
  const mC = act("meet.request", "employer1", "POST meetings priya", await ask(emp1, "priya", 10), "201"), mD = act("meet.request", "employer2", "POST meetings rohan", await ask(emp2, "rohan", 10), "201");
  act("meet.request", "employer1", "POST meetings ananya again (expect 409 while open)", await ask(emp1, "ananya", 5), "409");
  act("meet.accept", "intern ananya", "POST /api/intern/college/meetings/[id] accept", await stu.ananya.post(`/api/intern/college/meetings/${mA.json?.meeting?.id}`, { action: "accept" }), "200 accepted");
  act("meet.decline", "intern zoe", "decline", await stu.zoe.post(`/api/intern/college/meetings/${mB.json?.meeting?.id}`, { action: "decline" }), "200 declined");
  if (mC.json?.meeting?.id) await q("UPDATE college_drive_meetings SET starts_at = (now() AT TIME ZONE 'UTC') - interval '11 minutes' WHERE id=$1", [mC.json.meeting.id]); // time passing
  act("meet.lapsed", "intern priya", "accept after lapse (expect 409)", await stu.priya.post(`/api/intern/college/meetings/${mC.json?.meeting?.id}`, { action: "accept" }), "409");
  act("meet.reask", "employer1", "POST meetings zoe again after decline", await ask(emp1, "zoe", 10), "201");
  sc.meetings = { accepted: mA.json?.meeting?.id, declined: mB.json?.meeting?.id, lapsed: mC.json?.meeting?.id, other: mD.json?.meeting?.id };
  const slots = await q("SELECT count(*)::int n FROM college_drive_meetings WHERE drive_id=$1", [drive.id]); ids.meetCount = slots[0].n;
});

// ---------------------------------------------------------------- 4 offers
const P = {};
await step("4-offers", { internIds: ["ananya", "zoe", "priya", "rohan", "ishaan", "meera"].map(uid), employerIds: EIDS }, async () => {
  const send = async (label, e, k, role, over) => { const r = act("offer.send", e === emp1 ? "employer1" : "employer2", `POST proposals ${label} -> ${k}`, await e.post(`/api/employer/${e === emp1 ? E1.id : E2.id}/proposals`, offerBody(uid(k), e === emp1 ? E1.project : E2.project, role, over)), "201"); P[label] = r.json?.proposal?.id; return r; };
  Object.assign(P, story.ids.proposals ?? {});
  const hy = (city, state) => ({ mode: "hybrid", city, state, officeDays: 2, homeDays: 3 });
  if (!P.A1) await send("A1", emp1, "ananya", "Data Analyst Intern");
  if (!P.A2) await send("A2", emp2, "ananya", "Backend Intern");          // second offer to the SAME intern from another employer
  if (!P.Z1) await send("Z1", emp1, "zoe", "Data Intern", hy("Pune", "Maharashtra"));
  if (!P.PR1) await send("PR1", emp1, "priya", "Web Intern", { mode: "onsite", city: "Chennai", state: "Tamil Nadu" });
  if (!P.R1) await send("R1", emp1, "rohan", "Ops Intern");
  if (!P.I1) await send("I1", emp1, "ishaan", "Analytics Intern");
  if (!P.M1) await send("M1", emp1, "meera", "Research Intern", hy("Kochi", "Kerala"));
  if (!story.ids.proposals) await send("A1b", emp1, "ananya", "Duplicate (expect refusal: live offer with this candidate)");
  ids.proposals = P; sc.offers = P;
});
await step("4b-responses", { internIds: ["ananya", "zoe", "priya", "rohan", "ishaan", "meera"].map(uid), employerIds: EIDS, proposalIds: Object.values(P) }, async () => {
  if ((await one("select status from proposals where id=$1", [P.A1]))?.status === "sent") act("offer.accept", "intern ananya", "PATCH status accepted (A1)", await accept(stu.ananya, P.A1), "200");
  const a2 = await one("SELECT status, offer_details->>'expiryReason' r, offer_details FROM proposals WHERE id=$1", [P.A2]);
  console.log("A2 after A1 accepted:", a2?.status, a2?.r); sc.autoClosed = [{ proposalId: P.A2, internEmail: I("ananya").email, employerId: E2.id, status: a2?.status }];
  if ((await one("select status from proposals where id=$1", [P.Z1]))?.status === "sent") act("offer.decline", "intern zoe", "PATCH status rejected (Z1)", await stu.zoe.patch(`/api/proposals/${P.Z1}/status`, { status: "rejected" }), "200");
  if ((await one("select status from proposals where id=$1", [P.PR1]))?.status === "sent") act("offer.withdraw", "employer1", "PATCH status withdrawn (PR1)", await emp1.patch(`/api/proposals/${P.PR1}/status`, { status: "withdrawn" }), "200");
  // lapse: the start date passes unanswered (time shift only)
  await q(`UPDATE proposals SET offer_details = jsonb_set(offer_details, '{startDate}', to_jsonb(to_char(now() AT TIME ZONE 'Asia/Kolkata' - interval '3 days','YYYY-MM-DD'))), created_at = created_at - interval '10 days' WHERE id=$1`, [P.R1]);
  await emp1.get("/employer/proposals"); await stu.rohan.get("/intern/proposals");
  const cron = await fetch(BASE + "/api/cron/proposal-expiry", { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? "cron"}` } }).catch(() => null);
  console.log("cron expiry:", cron?.status);
  const r1 = await one("SELECT status FROM proposals WHERE id=$1", [P.R1]); console.log("R1 status after lapse trigger:", r1?.status);
  sc.acceptedOffer = { proposalId: P.A1, internEmail: I("ananya").email, employerId: E1.id }; sc.declined = { proposalId: P.Z1, internEmail: I("zoe").email, employerId: E1.id };
  sc.withdrawn = { proposalId: P.PR1, internEmail: I("priya").email, employerId: E1.id }; sc.lapsed = { proposalId: P.R1, internEmail: I("rohan").email, employerId: E1.id, statusAfter: r1?.status };
  // after acceptance the intern must be hidden from the other employer's candidate list
  const lst = await emp2.get(`/api/employer/candidates/results`); const hidden = lst.status === 200 ? !lst.text.includes(uid("ananya")) : null;
  const pg = await emp2.get(`/employer/intern/${uid("ananya")}`);
  sc.hiddenFromOther = { candidatesApi: lst.status, ananyaAbsentFromApi: hidden, profilePageStatus: pg.status };
  rec("story", "intern hidden from other employers after accepting", hidden !== false, "ananya still in employer2 candidates/results");
});

// ---------------------------------------------------------------- 5 hire (free) + full-time 1%
await step("5-hire", { internIds: ["ishaan", "aditya"].map(uid), employerIds: [E1.id], proposalIds: [P.I1] }, async () => {
  const hired0 = (await one("select status from proposals where id=$1", [P.I1]))?.status === "hired";
  if (!hired0) act("offer.accept", "intern ishaan", "PATCH accepted (I1)", await accept(stu.ishaan, P.I1), "200");
  // the hire gate: the intern's CGPA check is pending -> payment 409 until Findtern verifies it (the app's own admin decision route)
  let r = hired0 ? null : act("pay.gate", "employer1", "POST payment/razorpay/order (CGPA pending: expect 409 gate)", await emp1.post(`/api/employer/${E1.id}/payment/razorpay/order`, { currency: "INR", proposalIds: [P.I1], mode: "postpaid", paymentIndex: 0 }), "409 cgpa_verification_pending");
  for (const k of ["ishaan", "aditya", "ananya"]) act("admin.cgpa", "admin", `POST cgpa-verifications/${k}/decision verified`, await admin.post(`/api/admin/cgpa-verifications/${uid(k)}/decision`, { decision: "verified" }), "200");
  if (!hired0) r = act("pay.free", "employer1", "POST payment/razorpay/order (free mode)", await emp1.post(`/api/employer/${E1.id}/payment/razorpay/order`, { currency: "INR", proposalIds: [P.I1], mode: "postpaid", paymentIndex: 0 }), "200 free:true");
  sc.hire = { proposalId: P.I1, internEmail: I("ishaan").email, employerId: E1.id, mode: "free", resp: r?.json ?? "paid in the first run (free mode, HTTP 200)" };
  // full-time offer from the drive at 1%
  const up = await fetch(BASE + "/api/uploads", { method: "POST", headers: { origin: BASE, cookie: emp1.cookie(), "x-csrf-token": decodeURIComponent((emp1.cookie().match(/ft_csrf=([^;]+)/) ?? [])[1] ?? ""), "content-type": "image/png", "x-document-kind": "offer_letter", "x-file-name": "offer.png", "x-forwarded-for": "10.9.9.9" }, body: png(48, [30, 120, 90]) });
  const uj = await up.json().catch(() => ({})); act("upload", "employer1", "POST /api/uploads offer_letter", { status: up.status, text: JSON.stringify(uj) }, "200");
  const ft = act("ft.offer", "employer1", "POST full-time-offer (drive, 1%)", await emp1.post(`/api/employer/${E1.id}/full-time-offer`, { driveId: ftDrive.id, internId: uid("aditya"), projectId: E1.project, jobTitle: "Associate Engineer", jobMode: "remote", timezone: "Asia/Kolkata", shiftFrom: "09:00", shiftTo: "17:00", ctcCurrency: "INR", annualCtc: 800000, offerLetterKey: uj.key ?? uj.name ?? "x".repeat(12), startDate: businessStartDate(20) }), "200/201");
  const ftId = ft.json?.proposal?.id ?? ft.json?.id; P.FT = ftId; sc.fullTime = { proposalId: ftId, internEmail: I("aditya").email, employerId: E1.id, annualCtc: 800000, expectedFeeRupees: 8000 };
  if (ftId) {
    act("offer.accept", "intern aditya", "PATCH accepted full-time", await stu.aditya.patch(`/api/proposals/${ftId}/status`, { status: "accepted", agreedToTerms: true, agreedToFullTimeTerms: true }), "200");
    const pay = act("pay.fulltime", "employer1", "POST order (1% fee, testPay=real amount + invoice)", await emp1.post(`/api/employer/${E1.id}/payment/razorpay/order`, { currency: "INR", proposalIds: [ftId], mode: "upfront", paymentIndex: 0, testPay: true }), "200");
    sc.fullTime.payment = await one("SELECT id, amount_minor, status, gateway, invoice_number FROM employer_payments WHERE raw::text LIKE $1 ORDER BY created_at DESC LIMIT 1", [`%${ftId}%`]);
  }
  ids.proposals = P;
});

// ---------------------------------------------------------------- 6 leave
await step("6-leave", { internIds: [uid("zoe")] }, async () => {
  let lr = await one("SELECT id, status FROM college_leave_requests WHERE user_id=$1 ORDER BY ctid DESC LIMIT 1", [uid("zoe")]);
  if (!lr) { act("leave.request", "intern zoe", "POST /api/intern/college/leave-request", await stu.zoe.post("/api/intern/college/leave-request", { reason: "Transferring to another campus" }), "200/201"); lr = await one("SELECT id, status FROM college_leave_requests WHERE user_id=$1 ORDER BY ctid DESC LIMIT 1", [uid("zoe")]); }
  act("leave.decide", "tpo", "POST /api/college/leave-requests/decide approve", await tpo.post("/api/college/leave-requests/decide", { ids: [lr?.id], action: "approve", note: "Approved" }), "200");
  sc.leave = { requestId: lr?.id, internEmail: I("zoe").email };
});

// ---------------------------------------------------------------- 7 admin close + freeze
await step("7-admin", { internIds: [uid("meera"), uid("rohan"), uid("ishaan")], employerIds: [E1.id], proposalIds: [P.M1] }, async () => {
  act("admin.close", "admin", "PATCH /api/proposals/[id]/status expired (M1)", await admin.patch(`/api/proposals/${P.M1}/status`, { status: "expired" }), "200");
  sc.adminClosed = { proposalId: P.M1, internEmail: I("meera").email, employerId: E1.id };
  const fz = (k) => admin.post(`/api/admin/interns/${uid(k)}/standing`, { action: "freeze", reason: "other", evidenceNote: "Data-sync verification freeze", expectedViolations: 0 });
  act("admin.freeze", "admin", "POST standing freeze (with hire: ishaan)", await fz("ishaan"), "200");
  act("admin.freeze", "admin", "POST standing freeze (no hire: meera)", await fz("meera"), "200");
  sc.frozenWithHire = { internEmail: I("ishaan").email, proposalId: P.I1 }; sc.frozenNoHire = { internEmail: I("meera").email };
});
console.log("\nSTORY DONE; refused steps:", story.steps.filter((s) => s.ok === false).map((s) => `#${s.seq} ${s.step} ${s.http}`).join("; ") || "none");
const { summary, closeDb } = await import("./sync-lib.mjs");
const out = summary({ tag: "story" }); await closeDb(); process.exit(out.fail ? 1 : 0);
