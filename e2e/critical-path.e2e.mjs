/**
 * Findtern critical hiring path, end to end, as one ordered story.
 *
 *   intern signs up → onboards → activates (free) → requests AI interview
 *   admin scores → employer signs up → sets up company + project
 *   → books an interview → intern picks a slot → (interview happens)
 *   → employer offers → intern accepts → employer checks out monthly (free)
 *   → hired → intern timesheet → employer approves → admin pays out
 *   → intern sees it on the earnings page
 *
 * Run through e2e/run.mjs (`npm run e2e`), which starts the server against
 * the local test DB. Each step is a node:test test; a step whose inputs an
 * earlier failure never produced skips with the reason. Every value is unique
 * per run, so the story re-runs against the same database.
 *
 * Steps marked [UI] drive the real page with role/label selectors. Steps
 * marked [API] call the same endpoint the page calls, from inside the page
 * (session cookie + ft_csrf echoed as x-csrf-token) - see README for why.
 * When a UI step fails it says so, then recovers the state through the API so
 * the rest of the story still runs: the step stays FAILED.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { chromium } from "playwright";

import { closeDb, one, rows } from "./lib/db.mjs";
import { ARTIFACTS, ROOT, baseUrl, testDatabaseUrl } from "./lib/env.mjs";
import { api, expectOk, pngBase64, upload, visit } from "./lib/browser.mjs";
import { mailTo, otpFrom, waitForMail } from "./lib/mail.mjs";

testDatabaseUrl(); // throws unless the DB is local - before anything else runs

/* ── Run identity: every unique field derives from this ─────────────────── */

const NOW = Date.now();
const RUN = NOW.toString(36);
const SINCE = Number(process.env.E2E_RUN_STARTED) || NOW - 1000;
const digits9 = String(NOW).slice(-9);
const phone = (lead) => `${lead}${digits9}`;
const letters = (n, k) => Array.from({ length: k }, (_, i) => String.fromCharCode(65 + (Math.floor(n / 26 ** i) % 26))).join("");

const PASSWORD = "E2e-Pass#2026";
const INTERN = {
  firstName: "Ira",
  lastName: `Testwala${letters(NOW, 4).toLowerCase()}`,
  email: `e2e-intern-${RUN}@e2e-mail.test`,
  phone: phone(9),
  emergencyPhone: phone(6),
  aadhaar: `2${String(NOW).slice(-11)}`,
  pan: `${letters(Math.floor(NOW / 7), 5)}${String(NOW).slice(-4)}P`,
};
const DOMAIN = `e2e${RUN}.example.com`;
const EMPLOYER = {
  name: "Esha Employer",
  // Distinctive, so "the company name never reached the intern" is a
  // meaningful text search.
  companyName: `Zentrova Labs ${RUN.toUpperCase()}`,
  email: `owner@${DOMAIN}`,
  phone: phone(8),
  escalationPhone: phone(7),
};
const ADMIN = { email: `e2e-admin-${RUN}@e2e-mail.test`, password: `E2e-Admin#${RUN}` };
const PAYOUT_MINOR = 1_234_500; // ₹12,345

/* ── State, steps, skipping ─────────────────────────────────────────────── */

const state = {};
let browser;
const pages = {};

/**
 * One story step. `needs` names the state keys it depends on; when an
 * earlier step failed to produce one, this step skips and says which.
 */
function step(name, needs, fn) {
  test(name, { timeout: 120_000 }, async (t) => {
    const missing = needs.filter((k) => state[k] === undefined);
    if (missing.length) {
      t.skip(`needs ${missing.join(", ")} from an earlier step that did not complete`);
      return;
    }
    try {
      await fn(t);
    } catch (err) {
      await shot(name);
      throw err;
    }
  });
}

/**
 * A UI action with an API fallback. The UI error still fails the step; the
 * fallback only restores state so later steps can run.
 */
async function uiOr(t, label, uiFn, apiFn) {
  try {
    await uiFn();
  } catch (uiErr) {
    let recovered = "";
    try {
      await apiFn();
      recovered = " - state recovered through the API so later steps run";
    } catch (apiErr) {
      recovered = ` - API recovery also failed: ${apiErr.message}`;
    }
    throw new Error(`[UI] ${label} failed: ${uiErr.message.split("\n")[0]}${recovered}`);
  }
}

async function shot(name) {
  try {
    mkdirSync(ARTIFACTS, { recursive: true });
    const safe = name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
    for (const [role, page] of Object.entries(pages)) {
      if (!page.isClosed()) await page.screenshot({ path: join(ARTIFACTS, `fail-${safe}-${role}.png`), fullPage: true });
    }
  } catch {
    // a screenshot is a courtesy
  }
}

/** A nav link only that role's area has (several names: the UI is being restyled). */
const INTERN_NAV = /\b(offers|interviews|stipend|timesheets)\b/i;
const EMPLOYER_NAV = /\b(proposals|candidates|schedule)\b/i;
const ADMIN_NAV = /candidate directory|hiring partners|intern disbursements|\binterns\b/i;

/** The role area renders for this role (no bounce to a login page). */
async function assertRoleArea(page, path, navName) {
  await visit(page, path);
  await page.getByRole("link", { name: navName }).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
}

/** Click and wait for the request the click makes; returns {status, body}. */
async function clickFor(page, locator, match) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(match.path) && r.request().method() === match.method, { timeout: 20_000 }),
    locator.click(),
  ]);
  return { status: res.status(), body: await res.json().catch(() => null) };
}

/** YYYY-MM-DD in Asia/Kolkata, `days` from today. */
function istDate(days = 0) {
  return new Date(Date.now() + days * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  for (const role of ["intern", "employer", "admin"]) {
    const ctx = await browser.newContext({ baseURL: baseUrl(), viewport: { width: 1280, height: 900 } });
    ctx.setDefaultTimeout(15_000);
    pages[role] = await ctx.newPage();
  }
});

after(async () => {
  await browser?.close();
  await closeDb();
});

/* ── 1. Intern ──────────────────────────────────────────────────────────── */

step("intern: signs up through the form, code read from the mail log [UI]", [], async () => {
  const page = pages.intern;
  const started = Date.now();
  await visit(page, "/signup");
  await page.getByLabel("First name").fill(INTERN.firstName);
  await page.getByLabel("Last name").fill(INTERN.lastName);
  await page.getByLabel("Email", { exact: true }).fill(INTERN.email);
  await page.locator("#phoneNumber").fill(INTERN.phone);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /agree/i }).check();
  await page.getByRole("button", { name: "Send verification code" }).click();

  const mail = await waitForMail(INTERN.email, { since: started, subject: /verify your findtern email/i });
  await page.locator("#otp").fill(otpFrom(mail));
  await page.getByRole("button", { name: /verify code|create account/i }).click();
  await page.waitForURL(/\/intern\/onboarding/, { timeout: 30_000 });

  const user = await one(`SELECT * FROM users WHERE email = $1`, [INTERN.email]);
  assert.ok(user, "users row created");
  assert.equal(user.role, "intern");
  assert.equal(user.email_verified, true);
  assert.equal(user.phone_number, INTERN.phone);
  assert.match(user.password, /^\$argon2/, "password is hashed, never plaintext");
  const otp = await one(`SELECT used_at FROM email_otps WHERE subject_id = $1 AND subject_type = 'intern' ORDER BY created_at DESC LIMIT 1`, [INTERN.email]);
  assert.ok(otp?.used_at, "the OTP was consumed");
  state.internId = user.id;
});

step("intern: completes onboarding (photo + PAN uploads, final submit) [API]", ["internId"], async () => {
  const page = pages.intern;
  await visit(page, "/intern/onboarding");
  await page.getByText(/step 1 of/i).first().waitFor();

  for (const kind of ["profile_photo", "pan"]) {
    const res = await upload(page, { kind, base64: pngBase64(), type: "image/png", name: `${kind}.png` });
    expectOk(`POST /api/uploads (${kind})`, res, [201]);
  }
  const docs = await one(`SELECT profile_photo_name, pan_image_name, pan_image_type FROM intern_document WHERE user_id = $1`, [state.internId]);
  assert.ok(docs?.profile_photo_name && docs.pan_image_name, "photo and PAN stored on intern_document");
  assert.equal(docs.pan_image_type, "image/webp", "uploaded images are re-encoded to WebP");

  const skills = ["Python", "SQL", "React", "Data Analysis"];
  const res = await api(page, "POST", "/api/intern/onboarding", {
    bio: "Final-year engineering student who builds data pipelines and small dashboards.",
    linkedinUrl: "",
    city: "Pune",
    state: "Maharashtra",
    pinCode: "411001",
    aadhaarNumber: INTERN.aadhaar,
    panNumber: INTERN.pan,
    emergencyCountryCode: "+91",
    emergencyPhone: INTERN.emergencyPhone,
    photoUrl: "/api/intern/avatar",
    academics: {
      qualificationLevel: "Bachelor's",
      institution: "College of Engineering Pune",
      degree: "B.Tech / B.E.",
      branch: "Computer Engineering",
      startYear: "2023",
      yearOfGraduation: "2027",
      status: "Pursuing",
      scoreType: "cgpa",
      cgpa: "8.2",
      professional: [],
      certifications: [],
    },
    skills,
    skillsWithRatings: skills.map((name) => ({ name, rating: "Intermediate" })),
    experiences: [],
    languages: [{ id: "lang-1", language: "English", level: "Professional", read: true, write: true, speak: true }],
    extracurriculars: [],
    locationTypes: ["remote"],
    preferredLocations: [],
    hasLaptop: true,
    openToWork: true,
    ndaAccepted: true,
    final: true,
  });
  expectOk("POST /api/intern/onboarding (final)", res);

  const row = await one(`SELECT * FROM intern_onboarding WHERE user_id = $1`, [state.internId]);
  assert.ok(row, "intern_onboarding row");
  assert.equal(row.aadhaar_number, INTERN.aadhaar);
  assert.equal(row.pan_number, INTERN.pan);
  assert.equal(row.skills.length, 4);
  assert.deepEqual(row.location_types, ["remote"]);
  assert.equal(row.has_laptop, true);
  assert.ok(row.extra_data.ndaAcceptedAt, "NDA acceptance stamped");
  assert.equal(row.extra_data.emergencyPhone, INTERN.emergencyPhone);

  await assertRoleArea(page, "/intern/dashboard", INTERN_NAV);
  state.internOnboarded = true;
});

step("intern: activates the profile for free (PAYMENTS_MODE=free) [UI]", ["internOnboarded"], async (t) => {
  const page = pages.intern;
  const orderPath = `/api/intern/${state.internId}/payment/razorpay/order`;
  await uiOr(
    t,
    'dashboard "Activate free (test mode)"',
    async () => {
      await visit(page, "/intern/dashboard");
      const res = await clickFor(page, page.getByRole("button", { name: /activate free/i }), { path: orderPath, method: "POST" });
      expectOk(`POST ${orderPath}`, res);
      assert.equal(res.body?.free, true, "free-mode order");
    },
    async () => expectOk(`POST ${orderPath}`, await api(page, "POST", orderPath, {})),
  ).finally(async () => {
    const pay = await one(`SELECT * FROM intern_payments WHERE intern_id = $1 AND status = 'paid'`, [state.internId]);
    if (pay) state.internActivated = true;
  });

  const pay = await one(`SELECT * FROM intern_payments WHERE intern_id = $1`, [state.internId]);
  assert.equal(pay.status, "paid");
  assert.equal(pay.gateway, "free");
  assert.equal(pay.amount_minor, 0, "nothing charged in free mode");
  const ob = await one(`SELECT extra_data FROM intern_onboarding WHERE user_id = $1`, [state.internId]);
  assert.equal(ob.extra_data.payment?.isPaid, true, "legacy extraData.payment.isPaid flag set");
});

step("intern: requests the AI interview [UI]", ["internActivated"], async (t) => {
  const page = pages.intern;
  const applyPath = `/api/intern/${state.internId}/ai-interview/apply`;
  await uiOr(
    t,
    '"Request my AI interview"',
    async () => {
      await visit(page, "/intern/dashboard");
      const res = await clickFor(page, page.getByRole("button", { name: /request my ai interview/i }), { path: applyPath, method: "POST" });
      expectOk(`POST ${applyPath}`, res);
    },
    async () => expectOk(`POST ${applyPath}`, await api(page, "POST", applyPath)),
  ).finally(async () => {
    if (await aiInterview()) state.aiRequested = true;
  });
  const iv = await aiInterview();
  assert.equal(iv.status, "waiting");
  const n = await one(`SELECT 1 FROM notifications WHERE recipient_id = $1 AND type = 'ai_interview_applied'`, [state.internId]);
  assert.ok(n, "ai_interview_applied notification");
});

function aiInterview() {
  return one(
    `SELECT i.* FROM interviews i JOIN employers e ON e.id = i.employer_id
     WHERE i.intern_id = $1 AND e.company_email = 'ai-interview@findtern.ai' ORDER BY i.created_at DESC LIMIT 1`,
    [state.internId],
  );
}

/* ── 2. Admin ───────────────────────────────────────────────────────────── */

step("admin: throwaway admin (scripts/make-admin.ts) signs in at /admin/login [UI]", [], async () => {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", "scripts/make-admin.ts", ADMIN.email, ADMIN.password], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
      stdio: "inherit",
    });
    child.on("exit", (c) => resolve(c));
  });
  assert.equal(code, 0, "make-admin.ts exited 0");
  // make-admin inserts role 'admin'; the story needs every permission.
  await one(`UPDATE admins SET role = 'super_admin' WHERE lower(email) = lower($1) RETURNING id`, [ADMIN.email]);

  const page = pages.admin;
  await visit(page, "/admin/login");
  await page.getByLabel("Email", { exact: true }).fill(ADMIN.email);
  await page.locator("#password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 30_000 });
  await assertRoleArea(page, "/admin/dashboard", ADMIN_NAV);
  state.adminReady = true;
});

step("admin: scores the intern (ratings PUT) → auto-approved, AI interview closed [API]", ["adminReady", "aiRequested"], async () => {
  const page = pages.admin;
  await visit(page, `/admin/interns/${state.internId}`);
  await page.getByText(INTERN.email).first().waitFor();

  const path = `/api/admin/interns/${state.internId}/ratings`;
  const res = await api(page, "PUT", path, { communication: 8, coding: 8, aptitude: 8, interview: 8 });
  const body = expectOk(`PUT ${path}`, res);
  assert.ok(body.findternScore > 0, "score returned");

  const ob = await one(`SELECT extra_data FROM intern_onboarding WHERE user_id = $1`, [state.internId]);
  assert.equal(ob.extra_data.ratings?.interview, 8);
  assert.ok(ob.extra_data.findternScore >= 6, `score ${ob.extra_data.findternScore} is 6+ (monthly checkout needs it)`);
  assert.equal(ob.extra_data.approvalStatus, "Approved", "a live score approves the profile");
  assert.equal((await aiInterview()).status, "completed", "the AI interview row is closed");
  state.internScored = true;
});

/* ── 3. Employer ────────────────────────────────────────────────────────── */

step("employer: signs up through the form, company-email code from the mail log [UI]", [], async () => {
  const page = pages.employer;
  const started = Date.now();
  await visit(page, "/employer/signup");
  await page.getByLabel("Your name").fill(EMPLOYER.name);
  await page.getByLabel("Company name").fill(EMPLOYER.companyName);
  await page.locator("#companyEmail").fill(EMPLOYER.email);
  await page.locator("#phoneNumber").fill(EMPLOYER.phone);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /agree/i }).check();
  await page.getByRole("button", { name: "Send verification code" }).click();

  const mail = await waitForMail(EMPLOYER.email, { since: started, subject: /verify your company email/i });
  await page.locator("#otp").fill(otpFrom(mail));
  await page.getByRole("button", { name: /verify and create account|create account/i }).click();
  await page.waitForURL(/\/employer\/onboarding/, { timeout: 30_000 });

  const emp = await one(`SELECT * FROM employers WHERE company_email = $1`, [EMPLOYER.email]);
  assert.ok(emp, "employers row created");
  assert.equal(emp.company_name, EMPLOYER.companyName);
  assert.match(emp.password, /^\$argon2/, "password is hashed, never plaintext");
  state.employerId = emp.id;
});

step("employer: company setup + first project (onboarding) [API]", ["employerId"], async () => {
  const page = pages.employer;
  await visit(page, "/employer/onboarding");
  await page.getByLabel(/company name/i).first().waitFor();

  const company = await api(page, "PATCH", `/api/employer/${state.employerId}`, {
    companyName: EMPLOYER.companyName,
    websiteUrl: `https://${DOMAIN}`,
    logoUrl: null,
    companySize: "11-50",
    country: "India",
    state: "Karnataka",
    city: "Bengaluru",
    primaryContactName: EMPLOYER.name,
    primaryContactRole: "Founder",
    countryCode: "+91",
    phoneNumber: EMPLOYER.phone,
    escalationContactName: "Ravi Ops",
    escalationContactRole: "Operations lead",
    escalationContactEmail: `ops@${DOMAIN}`,
    escalationContactCountryCode: "+91",
    escalationContactPhone: EMPLOYER.escalationPhone,
    gstNumber: null,
    billingPincode: "560001",
  });
  expectOk(`PATCH /api/employer/${state.employerId}`, company);

  const project = await api(page, "POST", `/api/employer/${state.employerId}/projects`, {
    projectName: `Ops dashboards ${RUN}`,
    skills: ["Python", "SQL"],
    scopeOfWork: "upto-60",
    fullTimeOffer: false,
    locationType: "remote",
    preferredLocations: [],
    pincode: "",
    city: "",
    state: "",
    timezone: "Asia/Kolkata",
  });
  const body = expectOk(`POST /api/employer/${state.employerId}/projects`, project, [201]);

  const emp = await one(`SELECT * FROM employers WHERE id = $1`, [state.employerId]);
  assert.equal(emp.country, "India");
  assert.equal(emp.website_url, `https://${DOMAIN}`);
  assert.equal(emp.onboarding_completed, true, "first project completes onboarding");
  const p = await one(`SELECT * FROM projects WHERE id = $1`, [body.project.id]);
  assert.equal(p.employer_id, state.employerId);

  await assertRoleArea(page, "/employer/dashboard", EMPLOYER_NAV);
  state.projectId = p.id;
});

step("employer: books an interview with the intern, 3 slots [API]", ["projectId", "internScored"], async () => {
  const page = pages.employer;
  await visit(page, `/employer/intern/${state.internId}`);
  const text = await page.locator("body").innerText();
  assert.ok(!text.includes(INTERN.lastName), "intern's surname is hidden from an employer before hire");

  const day = istDate(2);
  const path = `/api/employer/${state.employerId}/interviews`;
  const res = await api(page, "POST", path, {
    internId: state.internId,
    projectId: state.projectId,
    slot1: `${day}T11:00`,
    slot2: `${day}T12:00`,
    slot3: `${day}T13:00`,
    timezone: "Asia/Kolkata",
  });
  const body = expectOk(`POST ${path}`, res, [201]);

  const iv = await one(`SELECT * FROM interviews WHERE id = $1`, [body.interview.id]);
  assert.equal(iv.status, "pending");
  assert.ok(iv.slot1 && iv.slot2 && iv.slot3, "three slots stored");
  assert.equal(iv.slot1.toISOString(), new Date(`${day}T05:30:00Z`).toISOString(), "11:00 IST stored as 05:30 UTC");
  const mail = await waitForMail(INTERN.email, { since: SINCE, subject: /interview invitation/i });
  assert.ok(!`${mail.subject}\n${mail.text}`.includes(EMPLOYER.companyName), "invitation hides the company");
  state.interviewId = iv.id;
});

/* ── 4. Interview → offer → hire ────────────────────────────────────────── */

step("intern: picks a slot on /intern/interviews [UI]", ["interviewId"], async (t) => {
  const page = pages.intern;
  const path = `/api/interviews/${state.interviewId}/select-slot`;
  await uiOr(
    t,
    'slot picker "Choose this"',
    async () => {
      await visit(page, "/intern/interviews");
      const body = await page.locator("body").innerText();
      assert.ok(!body.includes(EMPLOYER.companyName), "interviews page hides the company before hire");
      const res = await clickFor(page, page.getByRole("button", { name: /choose this/i }).first(), { path, method: "POST" });
      expectOk(`POST ${path}`, res);
    },
    async () => expectOk(`POST ${path}`, await api(page, "POST", path, { slot: 1 })),
  ).finally(async () => {
    const iv = await one(`SELECT status FROM interviews WHERE id = $1`, [state.interviewId]);
    if (iv?.status === "scheduled") state.slotPicked = true;
  });

  const iv = await one(`SELECT * FROM interviews WHERE id = $1`, [state.interviewId]);
  assert.equal(iv.status, "scheduled");
  assert.ok([1, 2, 3].includes(iv.selected_slot));
  const toIntern = await waitForMail(INTERN.email, { since: SINCE, subject: /meeting scheduled successfully/i });
  assert.match(toIntern.attachments, /\.ics/i, "calendar invite attached");
  await waitForMail(EMPLOYER.email, { since: SINCE, subject: /candidate confirmed a slot/i });
});

step("employer: the interview takes place (slots moved into the past), feedback recorded [API]", ["slotPicked"], async () => {
  // Time travel: a booked slot is always in the future, and an open meeting
  // blocks the offer until it ends (employer-interview-rules). Move all three
  // slots into the past, as if the meeting had happened.
  await one(
    `UPDATE interviews SET slot1 = (now() AT TIME ZONE 'UTC') - interval '3 hours',
       slot2 = (now() AT TIME ZONE 'UTC') - interval '2 hours 30 minutes',
       slot3 = (now() AT TIME ZONE 'UTC') - interval '2 hours'
     WHERE id = $1 RETURNING id`,
    [state.interviewId],
  );
  const page = pages.employer;
  const path = `/api/interviews/${state.interviewId}/feedback`;
  expectOk(`POST ${path}`, await api(page, "POST", path, { feedback: "Clear communicator, solid SQL." }));
  const iv = await one(`SELECT status, notes FROM interviews WHERE id = $1`, [state.interviewId]);
  assert.equal(iv.status, "completed");
  assert.match(iv.notes, /feedback_text:/);
  state.interviewDone = true;
});

step("employer: sends an offer (proposal; offer_details money in rupees) [API]", ["interviewDone"], async () => {
  const page = pages.employer;
  await visit(page, `/employer/send-proposal?internId=${state.internId}`, { allowRedirectTo: true });
  const path = `/api/employer/${state.employerId}/proposals`;
  const res = await api(page, "POST", path, {
    internId: state.internId,
    projectId: state.projectId,
    flowType: "interview_first",
    agreedToPolicy: true,
    roleTitle: "Data Analyst Intern",
    jd: "Build and maintain SQL dashboards for the operations team.",
    mode: "remote",
    startDate: istDate(7),
    duration: "1m",
    weeklySchedule: "mon_fri",
    shiftFrom: "10:00",
    shiftTo: "18:00",
    timezone: "Asia/Kolkata",
    laptop: "company",
    paidLeavesPerMonth: 0,
    skills: ["Python", "SQL"],
  });
  const body = expectOk(`POST ${path}`, res, [201]);

  const p = await one(`SELECT * FROM proposals WHERE id = $1`, [body.proposal.id]);
  assert.equal(p.status, "sent");
  assert.equal(p.currency, "INR", "an Indian company is billed in INR");
  const o = p.offer_details;
  const plans = (await rows(`SELECT price_hourly_minor FROM pricing_plans WHERE is_active AND currency = 'INR'`)).map((r) => r.price_hourly_minor);
  assert.ok(plans.includes(Math.round(o.hourlyRate * 100)), `hourlyRate ${o.hourlyRate} is rupees of an active INR plan (${plans.join(", ")} paise)`);
  assert.equal(o.monthlyAmount, Math.round(o.hourlyRate * o.monthlyHours * 100) / 100, "monthlyAmount = hourlyRate x monthlyHours, in rupees");
  assert.ok(o.monthlyAmount < 1_000_000, `monthlyAmount ${o.monthlyAmount} looks like rupees, not paise`);
  const mail = await waitForMail(INTERN.email, { since: SINCE, subject: /new internship proposal/i });
  assert.ok(!`${mail.subject}\n${mail.text}`.includes(EMPLOYER.companyName), "proposal email hides the company");
  state.proposalId = p.id;
});

step("intern: accepts the offer on /intern/proposals/[id] [UI]", ["proposalId"], async (t) => {
  const page = pages.intern;
  const path = `/api/proposals/${state.proposalId}/status`;
  await uiOr(
    t,
    '"Accept this offer" → terms → "Yes, accept"',
    async () => {
      await visit(page, `/intern/proposals/${state.proposalId}`);
      const text = await page.locator("body").innerText();
      assert.ok(!text.includes(EMPLOYER.companyName), "offer page hides the company before hire");
      await page.getByRole("button", { name: "Accept this offer" }).click();
      await page.getByRole("checkbox", { name: /intern terms/i }).check();
      const res = await clickFor(page, page.getByRole("button", { name: "Yes, accept" }), { path, method: "PATCH" });
      expectOk(`PATCH ${path}`, res);
    },
    async () => expectOk(`PATCH ${path}`, await api(page, "PATCH", path, { status: "accepted", agreedToTerms: true })),
  ).finally(async () => {
    const p = await one(`SELECT status FROM proposals WHERE id = $1`, [state.proposalId]);
    if (p?.status === "accepted") state.accepted = true;
  });
  const p = await one(`SELECT status FROM proposals WHERE id = $1`, [state.proposalId]);
  assert.equal(p.status, "accepted");
  await waitForMail(EMPLOYER.email, { since: SINCE, subject: /candidate decision update/i });
});

step("employer: checks out monthly in free mode → proposal hired [UI]", ["accepted"], async (t) => {
  const page = pages.employer;
  const path = `/api/employer/${state.employerId}/payment/razorpay/order`;
  await uiOr(
    t,
    'checkout "Monthly" → "Complete for free (test mode)"',
    async () => {
      await visit(page, "/employer/checkout");
      await page.getByRole("radio", { name: /monthly/i }).check();
      const res = await clickFor(page, page.getByRole("button", { name: /complete for free/i }), { path, method: "POST" });
      expectOk(`POST ${path}`, res);
      assert.equal(res.body?.free, true);
    },
    async () =>
      expectOk(`POST ${path}`, await api(page, "POST", path, { currency: "INR", proposalIds: [state.proposalId], mode: "monthly" })),
  ).finally(async () => {
    const p = await one(`SELECT status, hired_at FROM proposals WHERE id = $1`, [state.proposalId]);
    if (p?.status === "hired") state.hiredAt = p.hired_at;
  });

  const p = await one(`SELECT status, hired_at FROM proposals WHERE id = $1`, [state.proposalId]);
  assert.equal(p.status, "hired");
  assert.ok(p.hired_at, "hired_at stamped");
  const pay = await one(
    `SELECT * FROM employer_payments WHERE employer_id = $1 AND gateway = 'free' ORDER BY created_at DESC LIMIT 1`,
    [state.employerId],
  );
  assert.equal(pay.status, "paid");
  assert.equal(pay.raw?.notes?.paymentMode, "monthly");
  assert.deepEqual(pay.raw?.notes?.proposalIds, [state.proposalId]);
  const hired = await waitForMail(INTERN.email, { since: SINCE, subject: /you.re hired/i });
  assert.ok(hired.text.includes(EMPLOYER.companyName), "after the hire the intern is told the company");
  await waitForMail(EMPLOYER.email, { since: SINCE, subject: /payment received/i });
});

step("intern: no email before the hire named the company", ["hiredAt"], async () => {
  const before = (await mailTo(INTERN.email, { since: SINCE })).filter((m) => m.at < state.hiredAt.getTime());
  assert.ok(before.length >= 4, `expected the pre-hire emails (code, invitation, scheduled, proposal); got ${before.length}`);
  const leaks = before.filter((m) => `${m.subject}\n${m.text}`.toLowerCase().includes(EMPLOYER.companyName.toLowerCase()));
  assert.deepEqual(
    leaks.map((m) => m.subject),
    [],
    "company name leaked to the intern before the hire",
  );
});

/* ── 5. Engagement: timesheet → approval → payout ───────────────────────── */

step("intern: fills every day of a timesheet and submits it [API]", ["hiredAt"], async () => {
  // Time travel: the offer starts after today, and a timesheet period can be
  // logged only once it has started and submitted only once it has ended.
  // Move the start date back so the first month is complete.
  const start = istDate(-40);
  await one(
    `UPDATE proposals SET offer_details = jsonb_set(offer_details, '{startDate}', to_jsonb($2::text)) WHERE id = $1 RETURNING id`,
    [state.proposalId, start],
  );

  const page = pages.intern;
  await assertRoleArea(page, "/intern/timesheets", INTERN_NAV);
  const created = await api(page, "POST", "/api/intern/timesheets", { proposalId: state.proposalId });
  const sheet = expectOk("POST /api/intern/timesheets", created, [201]).timesheet;

  const entries = sheet.entries.map((e) => {
    const dow = new Date(`${e.date}T12:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    return { date: e.date, hours: weekend ? 0 : 8, note: "", status: weekend ? "Fixed off" : "Present" };
  });
  expectOk(`PATCH /api/intern/timesheets/${sheet.id}`, await api(page, "PATCH", `/api/intern/timesheets/${sheet.id}`, { entries }));
  expectOk(`POST /api/intern/timesheets/${sheet.id}/submit`, await api(page, "POST", `/api/intern/timesheets/${sheet.id}/submit`));

  const ts = await one(`SELECT * FROM timesheets WHERE id = $1`, [sheet.id]);
  assert.equal(ts.status, "submitted");
  assert.ok(ts.submitted_at);
  assert.equal(ts.employer_id, state.employerId);
  assert.ok(ts.entries.every((e) => e.status), "every day has a status");
  assert.equal(ts.entries[0].date, start, "period starts on the joining date");
  await waitForMail(EMPLOYER.email, { since: SINCE, subject: /timesheet submitted/i });
  state.timesheetId = sheet.id;
});

step("employer: approves the timesheet on /employer/timesheets/[id] [UI]", ["timesheetId"], async (t) => {
  const page = pages.employer;
  const path = `/api/timesheets/${state.timesheetId}/decision`;
  await uiOr(
    t,
    '"Approve"',
    async () => {
      await visit(page, `/employer/timesheets/${state.timesheetId}`);
      const res = await clickFor(page, page.getByRole("button", { name: "Approve", exact: true }), { path, method: "PATCH" });
      expectOk(`PATCH ${path}`, res);
    },
    async () => expectOk(`PATCH ${path}`, await api(page, "PATCH", path, { decision: "approved" })),
  ).finally(async () => {
    const ts = await one(`SELECT status FROM timesheets WHERE id = $1`, [state.timesheetId]);
    if (ts?.status === "approved") state.approved = true;
  });
  const ts = await one(`SELECT status, approved_at FROM timesheets WHERE id = $1`, [state.timesheetId]);
  assert.equal(ts.status, "approved");
  assert.ok(ts.approved_at);
  const n = await one(`SELECT 1 FROM notifications WHERE recipient_id = $1 AND type = 'timesheet_approved'`, [state.internId]);
  assert.ok(n, "intern notified of the approval");
});

step("admin: creates a payout and marks it paid [API]", ["approved", "adminReady"], async () => {
  const page = pages.admin;
  await assertRoleArea(page, "/admin/payouts", ADMIN_NAV);
  const base = `/api/admin/interns/${state.internId}/payouts`;
  const created = await api(page, "POST", base, {
    amountMinor: PAYOUT_MINOR,
    currency: "INR",
    status: "pending",
    method: "bank",
    proposalId: state.proposalId,
    employerId: state.employerId,
    scheduledFor: new Date().toISOString(),
    notes: `e2e ${RUN}`,
  });
  const payout = expectOk(`POST ${base}`, created, [201]).payout;
  const ref = `E2E-UTR-${RUN}`;
  expectOk(`POST ${base}/${payout.id}/mark-paid`, await api(page, "POST", `${base}/${payout.id}/mark-paid`, { referenceId: ref }));

  const row = await one(`SELECT * FROM intern_payouts WHERE id = $1`, [payout.id]);
  assert.equal(row.status, "paid");
  assert.equal(row.reference_id, ref);
  assert.equal(row.amount_minor, PAYOUT_MINOR);
  assert.ok(row.paid_at);
  await waitForMail(INTERN.email, { since: SINCE, subject: /stipend transferred/i });
  state.paid = true;
});

step("intern: earnings page shows the payout [UI]", ["paid"], async () => {
  const page = pages.intern;
  await assertRoleArea(page, "/intern/earnings", INTERN_NAV);
  await page.getByText(/12,345/).first().waitFor({ timeout: 15_000 });
});
