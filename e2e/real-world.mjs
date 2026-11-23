// Real-world scenarios through the app's own routes, then what each role sees for that exact record.
// Each scenario uses a fresh student, acts as the employer / student / college through the API (same calls the buttons
// make), moves only TIME where the real world would wait (a start date or a slot passes), optionally runs the real
// expiry sweep, then reads the student's, the employer's, the admin's and the college's screens for that record and
// the college master data row. Asserts every role tells the same story.
//
//   DATABASE_URL=postgresql://findtern:findtern_dev@127.0.0.1:5435/findtern_otw271 BASE=http://localhost:3528 \
//     node e2e/real-world.mjs
//
// LOCAL ONLY. It writes to the local test DB (new offers, meetings, payments in PAYMENTS_MODE=free; mail is logged).
import { execFileSync } from "node:child_process";
import pg from "pg";
import { chromium } from "playwright";

const DB = process.env.DATABASE_URL;
const BASE = process.env.BASE ?? "http://localhost:3528";
const PASSWORD = "Findtern@2026";
if (!DB || !/@(127\.0\.0\.1|localhost)[:/]/.test(DB)) throw new Error("DATABASE_URL must be a loopback test DB");
// Every run starts from the same seeded world (e2e/seed-local-college.mjs), so earlier runs never leak in.
if (process.env.RESEED !== "0") execFileSync("node", ["e2e/seed-local-college.mjs", "--yes"], { env: process.env, stdio: "ignore" });
pg.types.setTypeParser(1114, (v) => new Date(`${v.replace(" ", "T")}Z`));
const db = new pg.Client({ connectionString: DB, options: "-c TimeZone=UTC" });
await db.connect();
const q = async (s, p = []) => (await db.query(s, p)).rows;

const browser = await chromium.launch();
const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;
async function signIn(path, email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": ip() } });
  const res = await ctx.request.post(`${BASE}${path}`, { data: { email, password: PASSWORD }, headers: { origin: BASE } });
  if (!res.ok()) throw new Error(`${email} sign-in ${res.status()} ${await res.text()}`);
  const page = await ctx.newPage();
  const call = async (method, url, data) => {
    const csrf = decodeURIComponent((await ctx.cookies(BASE)).find((c) => c.name === "ft_csrf")?.value ?? "");
    const r = await ctx.request.fetch(`${BASE}${url}`, { method, data, headers: { origin: BASE, "x-csrf-token": csrf } });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok(), status: r.status(), body };
  };
  // The page's main content as text (menus left out), after it settles.
  const read = async (url) => {
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.locator("main").first().waitFor({ timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(700);
    return (await page.locator("main").first().innerText().catch(() => "")) || (await page.locator("body").innerText());
  };
  return { ctx, page, call, read };
}

// Actors.
const college = (await q(`SELECT college_id AS id FROM college_admins WHERE email = 'tpo@jklu.edu.in'`))[0];
const summer = (await q(`SELECT * FROM college_drives WHERE college_id = $1 AND title LIKE 'Summer%'`, [college.id]))[0];
const finalYear = (await q(`SELECT * FROM college_drives WHERE college_id = $1 AND title LIKE 'Final year%'`, [college.id]))[0];
const empRow = async (email) => (await q(`SELECT e.id, e.company_name, (SELECT p.id FROM projects p WHERE p.employer_id = e.id ORDER BY p.created_at LIMIT 1) AS project FROM employers e WHERE e.company_email = $1`, [email]))[0];
const EMP = { a: await empRow("hiring@northwind.dev"), b: await empRow("talent@meridian.dev") };
// Fresh students: in the pool (approved, open to work), years 2-3 (in the summer drive), with nothing yet.
const fresh = await q(
  `SELECT u.id, u.email FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.status = 'verified'
     JOIN intern_onboarding o ON o.user_id = u.id
    WHERE o.extra_data->>'approvalStatus' = 'Approved' AND o.location_types ? 'remote' AND coalesce((o.extra_data->>'openToWork')::boolean, true)
      AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.intern_id = u.id) AND NOT EXISTS (SELECT 1 FROM interviews i WHERE i.intern_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM college_drive_meetings d WHERE d.user_id = u.id)
    ORDER BY u.email`,
);
let nextStudent = 0;
// Only students an employer can actually find (in the pool: open to work, not paused): the app's own rule decides.
const visible = async (sid) => (await q(`SELECT 1 FROM users u JOIN intern_onboarding o ON o.user_id = u.id
  WHERE u.id = $1 AND u.is_active AND coalesce((o.extra_data->>'openToWork')::boolean, true) AND coalesce(u.profile_visibility, 'live') = 'live'
    AND coalesce((o.extra_data->>'findternScore')::float, 0) > 0`, [sid])).length > 0;
// The next fresh student an employer could find; ones outside the pool are passed over, as an employer would never see them.
const takeStudent = async () => { for (;;) { const s = fresh[nextStudent++]; if (!s) throw new Error("ran out of fresh students"); if (await visible(s.id)) return s; } };

const tpo = await signIn("/api/auth/college/login", "tpo@jklu.edu.in");
const admin = await signIn("/api/auth/admin/login", "admin@findtern.dev");
const emp = { a: await signIn("/api/auth/employer/login", "hiring@northwind.dev"), b: await signIn("/api/auth/employer/login", "talent@meridian.dev") };

const day = (offset) => new Date(Date.now() + 5.5 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const weekdayAhead = (n) => { for (let i = n; ; i++) { const d = new Date(`${day(i)}T00:00:00Z`).getUTCDay(); if (d !== 0 && d !== 6) return day(i); } };
const sweep = () => execFileSync("npx", ["tsx", "e2e/run-sweeps.mts"], { env: process.env, stdio: "pipe" });

async function sendOffer(e, student) {
  if (!(await visible(student.id))) throw Object.assign(new Error("not in the pool"), { skip: true });
  const r = await emp[e].call("POST", `/api/employer/${EMP[e].id}/proposals`, {
    internId: student.id, projectId: EMP[e].project, flowType: "direct", agreedToPolicy: true, roleTitle: "Scenario Intern",
    jd: "Real-world scenario.", additionalInfo: "How a real product team ships: code review, testing and weekly demos.", mode: "remote", startDate: weekdayAhead(7), duration: "2m", shiftFrom: "09:00", shiftTo: "17:00",
    timezone: "Asia/Kolkata", laptop: "candidate", monthlyAmount: 20000, currency: "INR",
  });
  if (r.status === 404 && /Unknown candidate/.test(JSON.stringify(r.body))) throw Object.assign(new Error("not visible"), { skip: true });
  if (!r.ok) throw new Error(`send offer ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.proposal?.id ?? r.body.id ?? (await q(`SELECT id FROM proposals WHERE intern_id = $1 AND employer_id = $2 ORDER BY created_at DESC LIMIT 1`, [student.id, EMP[e].id]))[0].id;
}
const startPassed = (id) => q(`UPDATE proposals SET offer_details = jsonb_set(offer_details, '{startDate}', to_jsonb($2::text)) WHERE id = $1`, [id, day(-1)]);

// What a screen says, from a fixed list of each role's labels (longest first, so "Rejected · no response" is not "Rejected").
const VOCAB = {
  intern: ["Closed · you took another offer", "Waiting on you", "Interview booked", "Accepted · awaiting payment", "Rejected · no response", "Rejected", "Withdrawn", "Expired", "Closed by Findtern", "Hired · full-time", "Hired"],
  employer: ["Waiting on candidate", "Accepted · payment due", "Accepted · not payable yet", "Declined", "Expired · no reply before start", "Expired · not paid before start", "Withdrawn", "Closed · candidate accepted another offer", "Closed · accepted elsewhere", "Payment in progress", "Hired"],
  admin: ["Sent", "Accepted", "Rejected", "Expired", "Withdrawn", "Hired", "Processing"],
  college: ["Waiting for the student's reply", "Rejected · no response", "Rejected", "Accepted", "Withdrawn", "Expired", "Hired", "Processing"],
};
const labelsIn = (text, words) => {
  const found = [];
  let t = ` ${text} `;
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[^A-Za-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`);
    if (re.test(t)) { found.push(w); t = t.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), " "); }
  }
  return found;
};
async function masterRow(student, cols) {
  const r = await tpo.call("POST", "/api/college/students/export", { columns: ["email", ...cols], userIds: [student.id] });
  const csv = await (await tpo.ctx.request.post(`${BASE}/api/college/students/export`, { data: { columns: ["email", ...cols], userIds: [student.id] }, headers: { origin: BASE, "x-csrf-token": decodeURIComponent((await tpo.ctx.cookies(BASE)).find((c) => c.name === "ft_csrf")?.value ?? "") } })).text();
  void r;
  const line = csv.replace(/^﻿/, "").trim().split("\n")[1] ?? "";
  return Object.fromEntries(cols.map((c, i) => [c, (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [])[i + 1]?.replace(/,$/, "").replace(/^"|"$/g, "") ?? ""]));
}

async function viewsOfOffer(e, student, id, intern) {
  return {
    intern: labelsIn(await intern.read(`/intern/proposals/${id}`), VOCAB.intern),
    employer: labelsIn(await emp[e].read(`/employer/proposal/${id}`), VOCAB.employer),
    admin: labelsIn(await admin.read(`/admin/proposal-tracker/${id}`), VOCAB.admin),
    college: labelsIn(await tpo.read(`/college/students/${student.id}`), VOCAB.college),
    master: (await masterRow(student, ["offerReplies", "hired"])),
  };
}

const results = [];
const failures = [];
function expect(name, views, want) {
  results.push({ name, ...Object.fromEntries(Object.entries(views).map(([k, v]) => [k, Array.isArray(v) ? v.join(" / ") : JSON.stringify(v)])) });
  for (const [role, label] of Object.entries(want)) {
    const got = views[role];
    const ok = role === "master" ? Object.entries(label).every(([k, v]) => got[k] === v) : got.includes(label);
    if (!ok) failures.push(`${name}: ${role} should show "${typeof label === "string" ? label : JSON.stringify(label)}", shows ${JSON.stringify(got)}`);
  }
  // A role showing two different outcomes for one record is itself a contradiction.
  for (const role of ["intern", "employer", "admin"]) if (views[role]?.length > 1) failures.push(`${name}: ${role} shows more than one status: ${views[role].join(" / ")}`);
}

/* ── Offers ── */
async function offerScenario(name, steps, want) {
  let s, id;
  for (;;) {
    s = await takeStudent();
    try { id = await sendOffer("a", s); break; } catch (err) { if (!err.skip) throw err; }
  }
  const intern = await signIn("/api/auth/login", s.email);
  for (const step of steps) await step({ s, id, intern });
  expect(name, await viewsOfOffer("a", s, id, intern), want);
  await intern.ctx.close();
}
const accept = async ({ id, intern }) => { const r = await intern.call("PATCH", `/api/proposals/${id}/status`, { status: "accepted", agreedToTerms: true }); if (!r.ok) throw new Error(`accept ${r.status} ${JSON.stringify(r.body)}`); };
const reject = async ({ id, intern }) => { const r = await intern.call("PATCH", `/api/proposals/${id}/status`, { status: "rejected", acknowledgeGuaranteeEnd: true }); if (!r.ok) throw new Error(`reject ${r.status} ${JSON.stringify(r.body)}`); };
const withdraw = async ({ id }) => { const r = await emp.a.call("PATCH", `/api/proposals/${id}/status`, { status: "withdrawn" }); if (!r.ok) throw new Error(`withdraw ${r.status} ${JSON.stringify(r.body)}`); };
const pay = (e) => async ({ id }) => { const r = await emp[e].call("POST", `/api/employer/${EMP[e].id}/payment/razorpay/order`, { currency: "INR", proposalIds: [id], mode: "upfront", paymentIndex: 0 }); if (!r.ok) throw new Error(`pay ${r.status} ${JSON.stringify(r.body)}`); };
const timePasses = async ({ id }) => startPassed(id);
const runSweep = async () => sweep();

await offerScenario("Offer sent, waiting", [], { intern: "Waiting on you", employer: "Waiting on candidate", admin: "Sent", college: "Waiting for the student's reply", master: { offerReplies: "1 waiting" } });
await offerScenario("Student rejects", [reject], { intern: "Rejected", employer: "Declined", admin: "Rejected", college: "Rejected", master: { offerReplies: "1 rejected" } });
await offerScenario("Student accepts, not paid yet", [accept], { intern: "Accepted · awaiting payment", employer: "Accepted · payment due", admin: "Accepted", college: "Accepted", master: { offerReplies: "1 accepted", hired: "No" } });
await offerScenario("Employer withdraws", [withdraw], { intern: "Withdrawn", employer: "Withdrawn", admin: "Withdrawn", college: "Withdrawn", master: { offerReplies: "" } });
await offerScenario("No reply, start date passes", [timePasses], { intern: "Rejected · no response", employer: "Expired · no reply before start", admin: "Expired", college: "Rejected · no response", master: { offerReplies: "1 deadline missed" } });
await offerScenario("No reply, start passes, then the nightly sweep", [timePasses, runSweep], { intern: "Rejected · no response", employer: "Expired · no reply before start", admin: "Expired", college: "Rejected · no response", master: { offerReplies: "1 deadline missed" } });
await offerScenario("Accepted, employer never pays, start passes", [accept, timePasses], { intern: "Expired", employer: "Expired · not paid before start", admin: "Expired", college: "Expired", master: { hired: "No" } });
await offerScenario("Accepted, never paid, start passes, then the sweep", [accept, timePasses, runSweep], { intern: "Expired", employer: "Expired · not paid before start", admin: "Expired", college: "Expired", master: { hired: "No" } });
await offerScenario("Accepted and paid: hired", [accept, pay("a")], { intern: "Hired", employer: "Hired", admin: "Hired", college: "Hired", master: { offerReplies: "1 accepted", hired: "Yes" } });

// Two companies offer one student; the student accepts the first, it is paid; the second offer closes.
{
  const s = await takeStudent();
  const intern = await signIn("/api/auth/login", s.email);
  const first = await sendOffer("a", s);
  const second = await sendOffer("b", s);
  await accept({ id: first, intern });
  await pay("a")({ id: first });
  const v = {
    intern: labelsIn(await intern.read(`/intern/proposals/${second}`), VOCAB.intern),
    employer: labelsIn(await emp.b.read(`/employer/proposal/${second}`), VOCAB.employer),
    admin: labelsIn(await admin.read(`/admin/proposal-tracker/${second}`), VOCAB.admin),
    college: [],
    master: await masterRow(s, ["offerReplies", "hired"]),
  };
  expect("Hired elsewhere: the other company's open offer", v, { master: { hired: "Yes" } });
  // Accepting the second offer now must be refused (already hired).
  const late = await intern.call("PATCH", `/api/proposals/${second}/status`, { status: "accepted", agreedToTerms: true });
  if (late.ok) failures.push("Hired elsewhere: the student could still accept a second company's offer after being hired");
  await intern.ctx.close();
}

/* ── Employer meetings ── */
// Each run books on its own days (30-300 days ahead), so its meetings never clash with an earlier run's.
let meetingNo = 0;
const RUN_DAY = 30 + Math.floor(Math.random() * 270);
async function interviewScenario(name, steps, want) {
  const k = meetingNo++; // each meeting on its own days: an employer can't hold two at once
  const s = await takeStudent();
  const intern = await signIn("/api/auth/login", s.email);
  const wall = (d, h) => `${day(d)}T${String(h).padStart(2, "0")}:00`;
  const r = await emp.a.call("POST", `/api/employer/${EMP.a.id}/interviews`, { internId: s.id, projectId: EMP.a.project, slot1: wall(RUN_DAY + 2 * k, 11), slot2: wall(RUN_DAY + 2 * k, 12), slot3: wall(RUN_DAY + 1 + 2 * k, 11), timezone: "Asia/Kolkata" });
  if (!r.ok) throw new Error(`schedule ${r.status} ${JSON.stringify(r.body)}`);
  const id = (await q(`SELECT id FROM interviews WHERE intern_id = $1 ORDER BY created_at DESC LIMIT 1`, [s.id]))[0].id;
  for (const step of steps) await step({ s, id, intern });
  const V = {
    intern: ["Booked", "Choose a time", "Interview done", "Employer didn't join", "Expired", "Missed", "Cancelled", "Closed"],
    employer: ["Waiting on candidate", "Expired: employer didn't join", "Expired", "Scheduled", "Happening now", "Completed", "Missed", "Closed", "Cancelled"],
    admin: ["Pending", "Scheduled", "Expired", "Missed", "Completed", "Cancelled"],
    college: ["Pending", "Scheduled", "Expired", "Missed", "Completed", "Cancelled"],
  };
  // Only this meeting's row on each screen (the pages also carry filter tabs with the same words).
  await emp.a.read(`/employer/schedule`);
  const empRow = await emp.a.page.locator(`a[href="/employer/intern/${s.id}"]`).first().locator("xpath=ancestor::*[self::li or self::tr or self::article][1]").innerText().catch(() => "");
  await admin.read(`/admin/interns/${s.id}`);
  await admin.page.getByRole("tab", { name: /Interviews/ }).or(admin.page.getByRole("button", { name: /^Interviews/ })).first().click().catch(() => {});
  await admin.page.waitForTimeout(500);
  const adminRows = await admin.page.locator("table tbody").last().innerText().catch(() => "");
  expect(name, {
    intern: labelsIn(await intern.read(`/intern/interviews`), V.intern),
    employer: labelsIn(empRow, V.employer),
    admin: labelsIn(adminRows, V.admin),
    college: labelsIn(await tpo.read(`/college/students/${s.id}`), V.college),
    master: await masterRow(s, ["meetingsDone", "meetingsNotAccepted", "meetingsMissed"]),
  }, want);
  await intern.ctx.close();
}
const pickSlot = async ({ id, intern }) => { const r = await intern.call("POST", `/api/interviews/${id}/select-slot`, { slot: 1 }); if (!r.ok) throw new Error(`pick ${r.status} ${JSON.stringify(r.body)}`); };
const slotPassed = async ({ id }) => q(`UPDATE interviews SET slot1 = (now() AT TIME ZONE 'UTC') - interval '3 hours', slot2 = (now() AT TIME ZONE 'UTC') - interval '150 minutes', slot3 = (now() AT TIME ZONE 'UTC') - interval '2 hours' WHERE id = $1`, [id]);
// The meeting starts (picked slot began 5 minutes ago) and the employer presses Join, as at the real time.
const meetingStarts = async ({ id }) => q(`UPDATE interviews SET meeting_link = coalesce(meeting_link, 'https://meet.google.com/scn-test-run'), slot1 = (now() AT TIME ZONE 'UTC') - interval '5 minutes', slot2 = (now() AT TIME ZONE 'UTC') + interval '1 day', slot3 = (now() AT TIME ZONE 'UTC') + interval '2 days' WHERE id = $1`, [id]);
// The employer presses Join: the recorded gate (/meet/<token>), 10 s of rules, "I understand and agree", then the redirect
// to Meet that stamps employer_joined_at. The hop to Google is blocked: nothing leaves this machine.
const employerJoins = async ({ id }) => {
  const r = await emp.a.call("POST", `/api/interviews/${id}/join`, {});
  if (!r.ok) throw new Error(`join ${r.status} ${JSON.stringify(r.body)}`);
  const page = emp.a.page;
  await page.route("**/*", (route) => (route.request().url().startsWith(BASE) ? route.continue() : route.abort()));
  await page.goto(`${BASE}${r.body.gate}`, { waitUntil: "domcontentloaded" });
  const agree = page.getByRole("button", { name: /I understand and agree/ });
  await agree.waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /I understand and agree/.test(b.textContent ?? "") && !b.disabled), null, { timeout: 30_000 });
  await agree.click();
  await page.waitForTimeout(3000);
  await page.unroute("**/*");
  const [row] = await q(`SELECT employer_joined_at FROM interviews WHERE id = $1`, [id]);
  if (!row.employer_joined_at) throw new Error("employer joined through the gate but no join was recorded");
};
const markMissed = async ({ id }) => { const r = await emp.a.call("POST", `/api/interviews/${id}/mark-missed`, {}); if (!r.ok) throw new Error(`mark missed ${r.status} ${JSON.stringify(r.body)}`); };
const markDone = async ({ id }) => { const r = await emp.a.call("POST", `/api/interviews/${id}/mark-completed`, {}); if (!r.ok) throw new Error(`mark done ${r.status} ${JSON.stringify(r.body)}`); };
const cancelByEmployer = async ({ id }) => { const r = await emp.a.call("POST", `/api/interviews/${id}/cancel`, { reason: "Role filled" }); if (!r.ok) throw new Error(`cancel ${r.status} ${JSON.stringify(r.body)}`); };

await interviewScenario("Meeting booked by the student", [pickSlot], { intern: "Booked", employer: "Scheduled", admin: "Scheduled", college: "Scheduled", master: { meetingsDone: "0", meetingsNotAccepted: "0", meetingsMissed: "0" } });
await interviewScenario("Booked, time passes, employer never joins", [pickSlot, slotPassed], { intern: "Employer didn't join", employer: "Expired: employer didn't join", admin: "Expired", college: "Expired", master: { meetingsNotAccepted: "0", meetingsMissed: "0" } });
await interviewScenario("Booked, time passes, employer marks student missed", [pickSlot, meetingStarts, employerJoins, slotPassed, markMissed], { intern: "Missed", employer: "Missed", admin: "Missed", college: "Missed", master: { meetingsMissed: "1", meetingsNotAccepted: "0" } });
await interviewScenario("Booked, held, employer marks it done", [pickSlot, meetingStarts, employerJoins, slotPassed, markDone], { intern: "Interview done", employer: "Completed", admin: "Completed", college: "Completed", master: { meetingsDone: "1" } });
await interviewScenario("Invite never answered, every slot passes", [slotPassed], { intern: "Expired", employer: "Expired", admin: "Expired", college: "Expired", master: { meetingsNotAccepted: "1" } });
await interviewScenario("Employer cancels a booked meeting", [pickSlot, cancelByEmployer], { intern: "Cancelled", employer: "Cancelled", admin: "Cancelled", college: "Cancelled", master: { meetingsNotAccepted: "0" } });

/* ── Drive meets (summer drive; the employer must have come into it) ── */
const came = new Set((await q(`SELECT employer_id FROM college_drive_employers WHERE drive_id = $1`, [summer.id])).map((r) => r.employer_id));
if (!came.has(EMP.a.id)) failures.push("Northwind has not joined the summer drive; drive meet scenarios skipped");
else {
  async function meetScenario(name, steps, wantEmployer, wantMaster) {
    let s = await takeStudent();
    let r = await emp.a.call("POST", `/api/employer/drives/${summer.id}/meetings`, { userId: s.id, inMinutes: 0, manualLink: "https://meet.example.com/scenario" });
    // A student outside the drive (wrong year, below its cutoffs) cannot be called; an employer would not see them there.
    while (r.status === 404 && /not in this drive/.test(JSON.stringify(r.body))) {
      s = await takeStudent();
      r = await emp.a.call("POST", `/api/employer/drives/${summer.id}/meetings`, { userId: s.id, inMinutes: 0, manualLink: "https://meet.example.com/scenario" });
    }
    if (!r.ok) { failures.push(`${name}: request ${r.status} ${JSON.stringify(r.body)}`); return; }
    const intern = await signIn("/api/auth/login", s.email);
    const id = (await q(`SELECT id FROM college_drive_meetings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [s.id]))[0].id;
    for (const step of steps) await step({ s, id, intern });
    const list = await emp.a.call("GET", `/api/employer/drives/${summer.id}/meetings`);
    const mine = (list.body.meetings ?? []).find((m) => m.id === id);
    const views = { employer: [mine?.status ?? "missing"], master: await masterRow(s, ["driveCalls"]), college: labelsIn(await tpo.read(`/college/students/${s.id}`), ["Requested", "Accepted", "Declined", "Expired", "Cancelled"]) };
    expect(name, views, { employer: wantEmployer, master: { driveCalls: wantMaster } });
    await intern.ctx.close();
  }
  const answer = (action) => async ({ id, intern }) => { const r = await intern.call("POST", `/api/intern/college/meetings/${id}`, { action }); if (!r.ok) throw new Error(`${action} ${r.status} ${JSON.stringify(r.body)}`); };
  const lapse = async ({ id }) => q(`UPDATE college_drive_meetings SET starts_at = (now() AT TIME ZONE 'UTC') - interval '30 minutes', created_at = (now() AT TIME ZONE 'UTC') - interval '35 minutes' WHERE id = $1`, [id]);
  const cancelMeet = async ({ id }) => { const r = await emp.a.call("DELETE", `/api/employer/drives/${summer.id}/meetings?meeting=${id}`); if (!r.ok) throw new Error(`cancel meet ${r.status} ${JSON.stringify(r.body)}`); };
  await meetScenario("Drive meet asked, not answered yet", [], "requested", "1 waiting");
  await meetScenario("Drive meet accepted", [answer("accept")], "accepted", "1 accepted");
  await meetScenario("Drive meet declined", [answer("decline")], "declined", "1 declined or lapsed");
  await meetScenario("Drive meet lapses unanswered", [lapse], "expired", "1 declined or lapsed");
  await meetScenario("Employer cancels the drive meet", [cancelMeet], "cancelled", "");
  // A lapsed request can no longer be accepted.
  {
    const s = await takeStudent();
    const intern = await signIn("/api/auth/login", s.email);
    await emp.a.call("POST", `/api/employer/drives/${summer.id}/meetings`, { userId: s.id, inMinutes: 0, manualLink: "https://meet.example.com/scenario" });
    const id = (await q(`SELECT id FROM college_drive_meetings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [s.id]))[0].id;
    await lapse({ id });
    const late = await intern.call("POST", `/api/intern/college/meetings/${id}`, { action: "accept" });
    if (late.ok) failures.push("A lapsed drive meet could still be accepted");
    await intern.ctx.close();
  }
}

await browser.close();
await db.end();
for (const r of results) console.log(`[real-world] ${r.name}\n    student: ${r.intern ?? "-"} | employer: ${r.employer ?? "-"} | admin: ${r.admin ?? "-"} | college: ${r.college ?? "-"} | master: ${r.master}`);
if (failures.length) {
  console.log(`[real-world] FAIL ${failures.length}\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("[real-world] PASS: every role tells the same story in every scenario");
