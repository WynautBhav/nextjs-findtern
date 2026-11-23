/**
 * College Virtual Drives (campus-locked employers), TC-A1 … TC-D4, against a running server and its LOCAL database:
 * real HTTP through the app's routes (sign-in, CSRF, guards), direct pg reads for the assertions, rows cleaned up after.
 *
 *   E2E_BASE=http://localhost:3570 DATABASE_URL=postgresql://findtern:findtern_dev@127.0.0.1:5435/findtern_sweep \
 *     node --test --test-concurrency=1 e2e/virtual-drive.e2e.mjs
 *
 * The server must run on the same database with MAIL_MODE=log (mails land in logs/mail, read back here) and trust
 * X-Forwarded-For from loopback (each sign-in comes from its own address, so the login limiter never trips).
 * Refuses a non-loopback database or server. The pure pricing / final-year / countdown rules are also unit-tested in
 * src/lib/college/virtual-drive.test.ts.
 *
 * Setup that is not the feature under test is written straight to the database and says so: seeding students, marking
 * an internship hired (the payment flow has its own suites), and moving a drive's end date into the past.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

import pg from "pg";
import { hash } from "@node-rs/argon2";

import { mailTo, waitForMail, otpFrom } from "./lib/mail.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3570";
const URL_DB = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost):\d+\//.test(URL_DB) || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  throw new Error("virtual-drive e2e runs only against a loopback database and server");
}
const pool = new pg.Pool({ connectionString: URL_DB, max: 4 });
const q = (text, params = []) => pool.query(text, params).then((r) => r.rows);
const one = async (text, params = []) => (await q(text, params))[0];

const RUN = Date.now().toString(36);
const PASSWORD = `Vd-E2e#${RUN}`;
const TERMS = "2026-11-06";
const DAY = 86_400_000;
let ipSeq = 1;
let phoneSeq = 7_100_000_000 + (Date.now() % 800_000_000);
const made = { users: [], employers: [], colleges: [], drives: [] };

/* ── HTTP: one cookie jar per account, CSRF from the ft_csrf cookie ─────── */
function client() {
  const jar = new Map();
  const ip = `10.77.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
  const keep = (r) => {
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const kv = c.split(";")[0];
      jar.set(kv.split("=")[0], kv);
    }
  };
  const cookie = () => [...jar.values()].join("; ");
  const csrf = () => decodeURIComponent((jar.get("ft_csrf") ?? "=").split("=")[1] ?? "");
  async function call(method, path, body) {
    const r = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: { "content-type": "application/json", origin: BASE, cookie: cookie(), "x-csrf-token": csrf(), "x-forwarded-for": ip },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    keep(r);
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: r.status, body: json };
  }
  return { call, has: (name) => jar.has(name) };
}
async function signIn(path, email, password) {
  const c = client();
  const res = await c.call("POST", path, { email, password });
  assert.equal(res.status, 200, `sign in ${email}: ${JSON.stringify(res.body)}`);
  return c;
}

/* ── Seeding (setup only) ───────────────────────────────────────────────── */
let pw;
const hashed = async () => (pw ??= await hash(PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 }));

async function seedCollege(label) {
  const c = await one("INSERT INTO colleges (name, slug, is_partner) VALUES ($1,$2,true) RETURNING id, name", [`VD College ${label} ${RUN}`, `vd-${label}-${RUN}`]);
  made.colleges.push(c.id);
  const tpoEmail = `tpo-${label}-${RUN}@vd-college.test`;
  await q("INSERT INTO college_admins (college_id, name, email, password, terms_accepted_version, terms_accepted_at) VALUES ($1,$2,$3,$4,$5,now())", [c.id, `Officer ${label}`, tpoEmail, await hashed(), TERMS]);
  return { ...c, tpoEmail };
}

/** A student in Findtern's candidate pool: scored, approved, fee paid, live, open to work. Optionally a verified member of a college. */
async function seedStudent(label, { collegeId = null, year = 2, branch = "B.Tech CSE" } = {}) {
  const email = `${label}-${RUN}@vd-student.test`;
  const u = await one(
    `INSERT INTO users (first_name, last_name, email, email_verified, is_active, country_code, phone_number, password, agreed_to_terms, role, profile_visibility, terms_accepted_version, terms_accepted_at)
     VALUES ($1,$2,$3,true,true,'+91',$4,$5,true,'intern','live',$6,now()) RETURNING id`,
    ["Vd", `Student${label.replace(/[^a-z0-9]/gi, "")}`, email, String(phoneSeq++), await hashed(), TERMS],
  );
  made.users.push(u.id);
  const extra = {
    payment: { isPaid: true },
    ratings: { aptitude: 8, interview: 8, communication: 8, coding: 8 },
    findternScore: 8,
    approvalStatus: "Approved",
    openToWork: true,
    academics: { level: "bachelors", score: "8.1", scoreType: "cgpa", degree: branch, status: "Pursuing" },
  };
  await q(
    `INSERT INTO intern_onboarding (user_id, pin_code, state, city, skills, location_types, preferred_locations, has_laptop, extra_data)
     VALUES ($1,'411001','Maharashtra','Pune','["SQL","Python"]','["remote"]','[]',true,$2)`,
    [u.id, JSON.stringify(extra)],
  );
  if (collegeId) {
    await q("INSERT INTO college_memberships (user_id, college_id, status, verified_by, year, branch) VALUES ($1,$2,'verified','tpo',$3,$4)", [u.id, collegeId, year, branch]);
  }
  return u.id;
}

async function seedEmployer(label, { email } = {}) {
  const addr = (email ?? `hr-${label}-${RUN}@vd-co-${label}.example.com`).toLowerCase();
  const e = await one(
    `INSERT INTO employers (name, company_name, company_email, email_verified, phone_number, password, agreed_to_terms, terms_accepted_version, terms_accepted_at, country, state, city, setup_completed, onboarding_completed,
       website_url, company_size, primary_contact_name, primary_contact_role)
     VALUES ($1,$2,$3,true,$4,$5,true,$6,now(),'India','Karnataka','Bengaluru',true,true,'https://example.com','11-50','HR Lead','HR') RETURNING id`,
    [`HR ${label}`, `VD Co ${label} ${RUN}`, addr, String(phoneSeq++), await hashed(), TERMS],
  );
  made.employers.push(e.id);
  const p = await one(
    `INSERT INTO projects (employer_id, project_name, skills, scope_of_work, location_type, status, timezone)
     VALUES ($1,$2,'["SQL","Python"]','Analysis work','remote','published','Asia/Kolkata') RETURNING id`,
    [e.id, `VD Project ${label} ${RUN}`],
  );
  return { id: e.id, email: addr, projectId: p.id };
}

/** The next weekday at least three days out (the offer start rule), as YYYY-MM-DD. */
function startDate() {
  const d = new Date(Date.now() + 3 * DAY);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const internshipOffer = (internId, projectId, extra = {}) => ({
  internId,
  projectId,
  agreedToPolicy: true,
  roleTitle: "Business Analyst Intern",
  jd: "Work on dashboards.",
  additionalInfo: "SQL, dashboards and how a product team decides.",
  mode: "remote",
  startDate: startDate(),
  duration: "3m",
  weeklySchedule: "mon_fri",
  shiftFrom: "09:00",
  shiftTo: "17:00",
  timezone: "Asia/Kolkata",
  laptop: "company",
  paidLeavesPerMonth: 0,
  ...extra,
});
const fullTimeOffer = (body) => ({
  jobTitle: "Analyst",
  jobMode: "remote",
  shiftFrom: "09:00",
  shiftTo: "17:00",
  ctcCurrency: "INR",
  annualCtc: 600000,
  ...body,
});

/* ── The world ──────────────────────────────────────────────────────────── */
const W = {};

before(async () => {
  W.A = await seedCollege("a");
  W.B = await seedCollege("b");
  // 50 College A students (the drive's cohort), 25 College B, 25 in no college (the open marketplace).
  W.aIds = [];
  for (let i = 0; i < 46; i++) W.aIds.push(await seedStudent(`a${i}`, { collegeId: W.A.id, year: 1 + (i % 3), branch: i % 2 ? "BBA" : "B.Tech CSE" }));
  // TC-B3's four: B.Tech 2nd, B.Tech 4th, BCA 2nd, BCA 3rd.
  W.btech2 = await seedStudent("btech2", { collegeId: W.A.id, year: 2, branch: "B.Tech CSE" });
  W.btech4 = await seedStudent("btech4", { collegeId: W.A.id, year: 4, branch: "B.Tech CSE" });
  W.bca2 = await seedStudent("bca2", { collegeId: W.A.id, year: 2, branch: "BCA" });
  W.bca3 = await seedStudent("bca3", { collegeId: W.A.id, year: 3, branch: "BCA" });
  W.aIds.push(W.btech2, W.btech4, W.bca2, W.bca3);
  W.bIds = [];
  for (let i = 0; i < 25; i++) W.bIds.push(await seedStudent(`b${i}`, { collegeId: W.B.id }));
  W.openIds = [];
  for (let i = 0; i < 25; i++) W.openIds.push(await seedStudent(`o${i}`));
  W.tpo = await signIn("/api/auth/college/login", W.A.tpoEmail, PASSWORD);
  // The officer creates the drive (live from a minute ago, 7 days long) through the app, inviting company X.
  W.x = await seedEmployer("x");
  W.xClient = await signIn("/api/auth/employer/login", W.x.email, PASSWORD); // signed in BEFORE the invite exists: no auto-join yet
  W.direct = `hr-direct-${RUN}@companyx-${RUN}.example.com`;
  const created = await W.tpo.call("POST", "/api/college/drives", {
    title: `VD Drive ${RUN}`,
    kind: "internship",
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 7 * DAY).toISOString(),
    eligibility: {},
    invitedEmployers: [
      { company: "Company X", email: W.x.email },
      // TC-A3: the officer typed it in capitals with spaces; the company signs up in lower case.
      { company: "Company Direct", email: `  ${W.direct.toUpperCase()} ` },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  W.driveId = created.body.drive?.id ?? created.body.id;
  assert.ok(W.driveId, "the create response names the drive");
  made.drives.push(W.driveId);
});

after(async () => {
  const { users, employers, colleges, drives } = made;
  await q("DELETE FROM drive_activity_logs WHERE drive_id = ANY($1) OR employer_id = ANY($2)", [drives, employers]);
  await q("DELETE FROM college_drive_shortlist WHERE drive_id = ANY($1)", [drives]);
  await q("DELETE FROM college_drive_employers WHERE drive_id = ANY($1) OR employer_id = ANY($2)", [drives, employers]);
  await q("DELETE FROM proposals WHERE employer_id = ANY($1)", [employers]);
  await q("DELETE FROM contact_messages WHERE last_name = ANY($1)", [employers]).catch(() => undefined);
  await q("DELETE FROM notifications WHERE recipient_id = ANY($1) OR recipient_id = ANY($2)", [users, employers]).catch(() => undefined);
  await q("DELETE FROM projects WHERE employer_id = ANY($1)", [employers]);
  await q("DELETE FROM college_drives WHERE id = ANY($1) OR college_id = ANY($2)", [drives, colleges]);
  await q("DELETE FROM college_memberships WHERE user_id = ANY($1)", [users]);
  await q("DELETE FROM intern_onboarding WHERE user_id = ANY($1)", [users]);
  await q("DELETE FROM users WHERE id = ANY($1)", [users]);
  await q("DELETE FROM email_otps WHERE subject_id LIKE $1", [`%${RUN}%`]).catch(() => undefined);
  await q("DELETE FROM employers WHERE id = ANY($1)", [employers]);
  await q("DELETE FROM college_admins WHERE college_id = ANY($1)", [colleges]);
  await q("DELETE FROM college_audit_log WHERE college_id = ANY($1)", [colleges]).catch(() => undefined);
  await q("DELETE FROM colleges WHERE id = ANY($1)", [colleges]);
  await pool.end();
});

/** Every id the candidate list returns for this company, all pages. */
async function candidateIds(c, qs = "") {
  const ids = new Set();
  let total = 0;
  for (let page = 1; page <= 40; page++) {
    const res = await c.call("GET", `/api/employer/candidates/results?pageSize=50&page=${page}${qs}`);
    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
    total = res.body.total;
    for (const r of res.body.rows) ids.add(r.candidate.id);
    if (page >= res.body.pages) break;
  }
  return { ids, total };
}
const joinRow = (driveId, employerId) => one("SELECT status, via, exited_at FROM college_drive_employers WHERE drive_id = $1 AND employer_id = $2", [driveId, employerId]);
const logs = (driveId, employerId, action) => q("SELECT * FROM drive_activity_logs WHERE drive_id = $1 AND employer_id = $2 AND action = $3", [driveId, employerId, action]);

/* ── Suite A: onboarding and auto-linking ───────────────────────────────── */
test("TC-A1 magic link: the invite email's link joins company X, locks it to College A and logs joined_drive", async () => {
  const mail = await waitForMail(W.x.email, { subject: /drive/i });
  const m = /\/drive\/invite\/([0-9a-f-]{36})\?e=([^&\s"]+)&s=([A-Za-z0-9_-]+)/.exec(mail.text ?? mail.body ?? JSON.stringify(mail));
  assert.ok(m, "the invite email carries the signed link");
  W.inviteSig = m[3];
  const page = await fetch(`${BASE}/drive/invite/${m[1]}?e=${m[2]}&s=${m[3]}`);
  assert.equal(page.status, 200, "the link's landing page opens");
  const join = await W.xClient.call("POST", "/api/drives/join", { driveId: m[1], email: decodeURIComponent(m[2]), sig: m[3] });
  assert.equal(join.status, 200, JSON.stringify(join.body));
  const row = await joinRow(W.driveId, W.x.id);
  assert.equal(row.status, "joined");
  assert.equal(row.via, "invite");
  assert.equal((await logs(W.driveId, W.x.id, "joined_drive")).length, 1);
  const status = await W.xClient.call("GET", "/api/employer/virtual-drive/status");
  assert.equal(status.body.locked, true);
  assert.equal(status.body.drives[0].driveId, W.driveId);
});

test("TC-A2 direct sign-up: an invited company that ignores the link and registers is bound to the drive, one account", async () => {
  const c = client();
  const sent = await c.call("POST", "/api/auth/signup/send-otp", { email: W.direct, subjectType: "employer" });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const otp = otpFrom(await waitForMail(W.direct, { subject: /code|verify/i }));
  assert.ok(otp, "the OTP arrives in the mail log");
  const ok = await c.call("POST", "/api/auth/signup/verify-otp", { email: W.direct, otp, subjectType: "employer" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const signup = await c.call("POST", "/api/auth/employer/signup", {
    name: "Direct HR",
    companyName: `Company Direct ${RUN}`,
    companyEmail: W.direct,
    countryCode: "+91",
    phoneNumber: String(phoneSeq++),
    password: PASSWORD,
    agreedToTerms: true,
  });
  assert.equal(signup.status, 200, JSON.stringify(signup.body));
  W.directId = signup.body.employer.id;
  made.employers.push(W.directId);
  W.directClient = c;
  const accounts = await q("SELECT id FROM employers WHERE lower(company_email) = $1", [W.direct]);
  assert.equal(accounts.length, 1, "no duplicate account");
  const row = await joinRow(W.driveId, W.directId);
  assert.equal(row?.status, "joined");
  assert.equal(row.via, "auto");
  assert.equal((await logs(W.driveId, W.directId, "joined_drive")).length, 1);
  assert.equal((await c.call("GET", "/api/employer/virtual-drive/status")).body.locked, true);
  // Signing up again with the same address is refused, not a second account.
  const again = await client().call("POST", "/api/auth/employer/signup", { name: "x", companyName: "x", companyEmail: W.direct, phoneNumber: "9999999999", password: PASSWORD, agreedToTerms: true });
  assert.notEqual(again.status, 200);
});

test("TC-A3 case and whitespace: '  HR@COMPANYX…  ' on the invite matches 'hr@companyx…' at sign-up", async () => {
  const [d] = await q("SELECT invited_employers FROM college_drives WHERE id = $1", [W.driveId]);
  assert.ok(d.invited_employers.some((i) => i.email === W.direct), "stored normalised");
  assert.equal((await joinRow(W.driveId, W.directId)).status, "joined", "and the lower-case sign-up linked (TC-A2)");
});

test("TC-A4 a tampered or expired link grants nothing", async () => {
  const intruder = await seedEmployer("intruder");
  const c = await signIn("/api/auth/employer/login", intruder.email, PASSWORD);
  const tampered = await c.call("POST", "/api/drives/join", { driveId: W.driveId, email: intruder.email, sig: `${W.inviteSig.slice(0, -2)}xx` });
  assert.ok([400, 401, 403, 404].includes(tampered.status), `tampered: ${tampered.status}`);
  const forged = await c.call("POST", "/api/drives/join", { driveId: W.driveId, email: W.x.email, sig: "A".repeat(43) });
  assert.ok([400, 401, 403, 404].includes(forged.status), `forged: ${forged.status}`);
  const badToken = await c.call("POST", "/api/drives/join", { token: randomBytes(24).toString("base64url") });
  assert.equal(badToken.status, 404);
  // Expired: a second drive whose window closed, joined with its real share token.
  const token = randomBytes(24).toString("base64url");
  const [{ id: adminId }] = await q("SELECT id FROM college_admins WHERE college_id = $1 LIMIT 1", [W.A.id]);
  const old = await one(
    "INSERT INTO college_drives (college_id, title, starts_at, ends_at, token_hash, created_by) VALUES ($1,'Old drive',(now() AT TIME ZONE 'UTC') - interval '10 days', (now() AT TIME ZONE 'UTC') - interval '1 day', $2, $3) RETURNING id",
    [W.A.id, createHash("sha256").update(token).digest("hex"), adminId],
  );
  made.drives.push(old.id);
  const expired = await c.call("POST", "/api/drives/join", { token });
  assert.equal(expired.status, 403);
  assert.equal((await q("SELECT 1 FROM college_drive_employers WHERE employer_id = $1", [intruder.id])).length, 0, "no drive privileges");
  assert.equal((await c.call("GET", "/api/employer/virtual-drive/status")).body.locked, false);
});

/* ── Suite B: data scoping ──────────────────────────────────────────────── */
test("TC-B1 a campus-locked company's candidate list is College A only, also with tampered parameters", async () => {
  const a = new Set(W.aIds);
  for (const qs of ["", `&college_id=${W.B.id}`, "&scope=all", `&colleges=${encodeURIComponent(W.B.name)}`, "&q=SQL"]) {
    const { ids } = await candidateIds(W.xClient, qs);
    const leaked = [...ids].filter((id) => !a.has(id));
    assert.deepEqual(leaked, [], `no one outside College A (${qs || "no filters"})`);
    if (qs === "") assert.equal(ids.size, W.aIds.length, "all 50 College A students");
  }
});

test("TC-B2 a College B profile is a 404 for the locked company, a College A one opens", async () => {
  const x = W.xClient;
  // The employer area streams (loading.tsx), so Next sends notFound() as the not-found page inside a 200 response; the
  // digest NEXT_HTTP_ERROR_FALLBACK;404 marks it. A real 404 status counts too.
  const page = async (id) => {
    const r = await x.call("GET", `/employer/intern/${id}`);
    return r.status === 404 || String(r.body).includes("NEXT_HTTP_ERROR_FALLBACK;404") ? 404 : r.status;
  };
  assert.equal(await page(W.bIds[0]), 404, "College B student");
  assert.equal(await page(W.openIds[0]), 404, "open-marketplace student");
  assert.equal(await page(W.aIds[0]), 200, "College A student");
  // The photo route uses the same gate.
  const photo = await x.call("GET", `/api/intern/avatar?id=${W.bIds[0]}`);
  assert.ok([403, 404].includes(photo.status), `College B photo: ${photo.status}`);
  // And nothing new can be started with them: an offer to College B is refused.
  const offer = await x.call("POST", `/api/employer/${W.x.id}/proposals`, internshipOffer(W.bIds[0], W.x.projectId));
  assert.equal(offer.status, 404);
});

test("TC-B3 the Full-time track is the final year only; a full-time offer to a 2nd year is refused", async () => {
  const ft = (internId) => W.xClient.call("POST", `/api/employer/${W.x.id}/full-time-offer`, fullTimeOffer({ driveId: W.driveId, internId, projectId: W.x.projectId, offerLetterKey: `${W.x.id.slice(0, 32)}-${internId}-letter.pdf` }));
  for (const id of [W.btech2, W.bca2]) {
    const r = await ft(id);
    assert.equal(r.status, 422, `2nd year refused: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.code, "not_final_year");
  }
  const page = await W.xClient.call("GET", `/employer/drives/${W.driveId}?track=full_time`);
  assert.equal(page.status, 200);
  W.ftBtech4 = await ft(W.btech4);
  assert.equal(W.ftBtech4.status, 201, JSON.stringify(W.ftBtech4.body));
  const bca3 = await ft(W.bca3);
  assert.equal(bca3.status, 201, JSON.stringify(bca3.body));
});

/* ── Suite C: pricing and attribution ───────────────────────────────────── */
test("TC-C1 drive hires store the drive id, 15% off and a 1% PPO fee; the money matches", async () => {
  const intern = W.aIds[0];
  const res = await W.xClient.call("POST", `/api/employer/${W.x.id}/proposals`, internshipOffer(intern, W.x.projectId));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  W.driveInternship = res.body.proposal.id;
  const p = await one("SELECT drive_id, pricing_tier, discount_percent, ppo_fee_percent::text AS ppo, offer_details FROM proposals WHERE id = $1", [W.driveInternship]);
  assert.equal(p.drive_id, W.driveId);
  assert.equal(p.pricing_tier, "virtual_drive");
  assert.equal(p.discount_percent, 15);
  assert.equal(p.ppo, "1.00");
  const o = p.offer_details;
  // Score 8 band: ₹200/h. Mon–Fri hours from the schedule; list = rate × hours, 15% off it; the hiring fee is not discounted.
  const list = Math.round(o.monthlyHours * o.hourlyRate * 100);
  assert.equal(Math.round(o.listMonthlyAmount * 100), list);
  assert.equal(Math.round(o.monthlyAmount * 100), Math.round(list * 0.85));
  assert.equal(Math.round(o.totalPrice * 100), Math.round(list * 0.85) * 3 + Math.round((o.perHireCharge ?? 0) * 100));
  const ft = await one("SELECT drive_id, discount_percent, ppo_fee_percent::text AS ppo, offer_details FROM proposals WHERE id = $1", [W.ftBtech4.body.proposal?.id ?? W.ftBtech4.body.id]);
  assert.equal(ft.drive_id, W.driveId);
  assert.equal(ft.discount_percent, 15);
  assert.equal(ft.ppo, "1.00");
  assert.equal(ft.offer_details.fullTimeOffer.feeRate, 0.01, "1% of ₹6,00,000 = ₹6,000 at checkout");
  assert.equal((await logs(W.driveId, W.x.id, "sent_internship_offer")).length, 1);
  assert.equal((await logs(W.driveId, W.x.id, "sent_fulltime_offer")).length, 2);
});

test("TC-C4 an open-marketplace company's pricing fields in the body are ignored: standard rate", async () => {
  const m = await seedEmployer("market");
  const c = await signIn("/api/auth/employer/login", m.email, PASSWORD);
  const res = await c.call("POST", `/api/employer/${m.id}/proposals`, internshipOffer(W.openIds[1], m.projectId, { discount_percent: 15, ppo_fee_percent: 1, discountPercent: 15, driveId: W.driveId, pricingTier: "virtual_drive" }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const p = await one("SELECT drive_id, pricing_tier, discount_percent, ppo_fee_percent::text AS ppo, offer_details FROM proposals WHERE id = $1", [res.body.proposal.id]);
  assert.equal(p.drive_id, null);
  assert.equal(p.pricing_tier, "standard");
  assert.equal(p.discount_percent, 0);
  assert.equal(p.ppo, "8.33");
  assert.equal(p.offer_details.driveDiscountPercent, undefined);
  assert.equal(Math.round(p.offer_details.monthlyAmount * 100), Math.round(p.offer_details.monthlyHours * p.offer_details.hourlyRate * 100));
  // A full-time "drive" offer from a company not in the drive is refused outright.
  const ft = await c.call("POST", `/api/employer/${m.id}/full-time-offer`, fullTimeOffer({ driveId: W.driveId, internId: W.btech4, projectId: m.projectId, offerLetterKey: `${m.id.slice(0, 32)}-letter.pdf`, feeRate: 0.01 }));
  assert.equal(ft.status, 403);
});

/* ── Suite D: lifecycle, exit, TPO audit ────────────────────────────────── */
test("TC-D4 (setup) shortlist 2 and hire 1 inside the drive", async () => {
  for (const id of [W.aIds[1], W.aIds[2]]) {
    const r = await W.xClient.call("POST", `/api/employer/drives/${W.driveId}/shortlist`, { userId: id, on: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.equal((await logs(W.driveId, W.x.id, "shortlisted_candidate")).length, 2);
  // Setup, not under test: the internship from TC-C1 is accepted and paid (the payment flow has its own suites).
  await q("UPDATE proposals SET status = 'hired', hired_at = now() WHERE id = $1", [W.driveInternship]);
});

test("TC-D2 Exit campus drive: exited + timestamp, the full pool at once, a log row and one email to the officer", async () => {
  const since = Date.now();
  const res = await W.xClient.call("POST", "/api/employer/virtual-drive/exit", { driveId: W.driveId });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const row = await joinRow(W.driveId, W.x.id);
  assert.equal(row.status, "exited");
  assert.ok(row.exited_at);
  assert.equal((await logs(W.driveId, W.x.id, "exited_drive_early")).length, 1);
  const { ids } = await candidateIds(W.xClient);
  for (const id of [W.bIds[0], W.openIds[0], W.aIds[3]]) assert.ok(ids.has(id), "College A + College B + open marketplace");
  assert.equal((await W.xClient.call("GET", "/api/employer/virtual-drive/status")).body.locked, false);
  const mail = await waitForMail(W.A.tpoEmail, { since, subject: /left your drive/i });
  assert.match(mail.text ?? JSON.stringify(mail), /VD Co x/);
  assert.match(mail.text ?? JSON.stringify(mail), /Shortlisted/);
  assert.equal((await mailTo(W.A.tpoEmail, { since, subject: /left your drive/i })).length, 1, "exactly once");
  // The link does not put it back.
  const back = await W.xClient.call("POST", "/api/drives/join", { driveId: W.driveId, email: W.x.email, sig: W.inviteSig });
  assert.equal(back.status, 403);
  assert.equal(back.body.reason, "exited");
});

test("TC-C2 after exiting, a marketplace hire is standard: no drive id, 0%, 8.33%", async () => {
  const res = await W.xClient.call("POST", `/api/employer/${W.x.id}/proposals`, internshipOffer(W.openIds[2], W.x.projectId));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const p = await one("SELECT drive_id, discount_percent, ppo_fee_percent::text AS ppo FROM proposals WHERE id = $1", [res.body.proposal.id]);
  assert.deepEqual(p, { drive_id: null, discount_percent: 0, ppo: "8.33" });
  // A College A student offered now, outside the drive, is standard too: the drive id comes from the drive, not the college.
  const a = await W.xClient.call("POST", `/api/employer/${W.x.id}/proposals`, internshipOffer(W.aIds[4], W.x.projectId));
  assert.equal(a.status, 201);
  assert.equal((await one("SELECT drive_id FROM proposals WHERE id = $1", [a.body.proposal.id])).drive_id, null);
});

test("TC-C3 a PPO of the drive intern, made after the drive, reads the internship's drive id: 1%, not 8.33%", async () => {
  // Setup: the drive itself is over by now (and the company left it).
  await q("UPDATE college_drives SET starts_at = (now() AT TIME ZONE 'UTC') - interval '100 days', ends_at = (now() AT TIME ZONE 'UTC') - interval '90 days' WHERE id = $1", [W.driveId]);
  const res = await W.xClient.call("POST", `/api/employer/${W.x.id}/full-time-offer`, fullTimeOffer({ proposalId: W.driveInternship, offerLetterKey: `${W.x.id.slice(0, 32)}-ppo-letter.pdf` }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const p = await one("SELECT drive_id, ppo_fee_percent::text AS ppo, offer_details FROM proposals WHERE id = $1", [res.body.proposal?.id ?? res.body.id]);
  assert.equal(p.drive_id, W.driveId);
  assert.equal(p.ppo, "1.00");
  assert.equal(p.offer_details.fullTimeOffer.feeRate, 0.01);
  assert.equal(p.offer_details.fullTimeOffer.baseProposalId, W.driveInternship);
  // A marketplace intern's PPO stays at 8.33%: covered by the pure rule (ppoRate) and by C2's stored 8.33.
});

/** After the drive: /employer/drives and /employer/drives/:id are not found (streamed 404 or a real one), the nav has no drive item. */
async function assertDriveSectionGone(client) {
  for (const path of ["/employer/drives", `/employer/drives/${W.driveId}`]) {
    const r = await client.call("GET", path);
    const body = String(r.body);
    assert.ok(r.status === 404 || body.includes("NEXT_HTTP_ERROR_FALLBACK;404"), `${path} must be not found, got ${r.status}`);
    assert.doesNotMatch(body, /VD Drive|Exit campus drive/);
  }
  const home = String((await client.call("GET", "/employer/proposals")).body);
  assert.doesNotMatch(home, /href="\/employer\/drives/, "no drive item in the nav");
}

test("TC-D4 everything from the drive is still in the company's account, badged with the college", async () => {
  // The drive section itself is gone once the drive is over (owner, 23 Nov): no nav item, and both URLs are not found.
  await assertDriveSectionGone(W.xClient);
  // React splits "Campus drive · {college}" with a <!-- --> marker in server HTML.
  const proposals = await W.xClient.call("GET", "/employer/proposals");
  assert.match(String(proposals.body), /Campus drive · (?:<!-- -->)?VD College a/);
  assert.equal((await q("SELECT 1 FROM college_drive_shortlist WHERE drive_id = $1 AND employer_id = $2", [W.driveId, W.x.id])).length, 2);
});

test("TC-D1 the ending-soon flag: 2 days left shows it, 6 days left does not (server time)", async () => {
  const c = W.directClient; // still inside the drive
  await q("UPDATE college_drives SET starts_at = (now() AT TIME ZONE 'UTC') - interval '1 day', ends_at = (now() AT TIME ZONE 'UTC') + interval '2 days' WHERE id = $1", [W.driveId]);
  let s = (await c.call("GET", "/api/employer/virtual-drive/status")).body;
  assert.equal(s.locked, true);
  assert.equal(s.drives[0].showExpiryWarning, true);
  assert.equal(s.drives[0].daysRemaining, 2);
  await q("UPDATE college_drives SET ends_at = (now() AT TIME ZONE 'UTC') + interval '6 days' WHERE id = $1", [W.driveId]);
  s = (await c.call("GET", "/api/employer/virtual-drive/status")).body;
  assert.equal(s.drives[0].showExpiryWarning, false);
  assert.equal(s.drives[0].daysRemaining, 6);
});

test("TC-D3 a drive that ended a minute ago lifts the lock on the next request, no cron; earlier work stays", async () => {
  const c = W.directClient;
  const before = await candidateIds(c);
  assert.ok([...before.ids].every((id) => W.aIds.includes(id)), "locked while live");
  const shortlisted = await c.call("POST", `/api/employer/drives/${W.driveId}/shortlist`, { userId: W.aIds[5], on: true });
  assert.equal(shortlisted.status, 200);
  await q("UPDATE college_drives SET ends_at = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE id = $1", [W.driveId]);
  const afterEnd = await candidateIds(c);
  assert.ok(afterEnd.ids.has(W.bIds[1]) && afterEnd.ids.has(W.openIds[3]), "the full marketplace opens");
  assert.equal((await c.call("GET", "/api/employer/virtual-drive/status")).body.locked, false);
  assert.equal((await joinRow(W.driveId, W.directId)).status, "completed", "recorded as completed");
  assert.equal((await logs(W.driveId, W.directId, "drive_auto_completed")).length, 1);
  await assertDriveSectionGone(c);
});
