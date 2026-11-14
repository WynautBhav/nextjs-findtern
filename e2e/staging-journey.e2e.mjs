/**
 * Findtern hiring journey against the deployed staging site, in a real
 * browser, with brand-new accounts. Existing data is never edited.
 *
 *   E2E_BROWSER=chromium|firefox|webkit  ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *     node --test e2e/staging-journey.e2e.mjs
 *
 * What it uses besides the page:
 *  - the staging Neon database (e2e/lib/staging.mjs) to read the signup code
 *    of OUR test addresses, to assert what the UI claims, and to move OUR OWN
 *    rows' dates into the past (feedback and timesheets need elapsed time);
 *  - the order API's `testPay` flag (PAYMENTS_TEST_BUTTON=1 on the staging
 *    server): the page's Pay button is pressed but the order request gets testPay:true
 *    added (payWithTestFlag), so Razorpay is never opened, the Razorpay key is live.
 *
 * Steps marked [UI] drive the page with role/label selectors; [API] steps call
 * the endpoint the page calls (see e2e/lib/browser.mjs). Credentials come from
 * the environment only.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";

import AxeBuilder from "@axe-core/playwright";
import { chromium, firefox, webkit } from "playwright";

import { singleWindow } from "./lib/one-window.mjs";
import { api as rawApi, expectOk, gotoWithRetry, pngBase64, stalls, upload, visit } from "./lib/browser.mjs";
import { STAGING_URL, closeDb, manifest, one as rawOne, own, ownedWrite, readSignupCode, rows as rawRows } from "./lib/staging.mjs";

/** Anything that takes this long is printed with what it was, so a slow run can be explained. */
const SLOW_MS = 2500;
function timed(label, fn) {
  return async (...args) => {
    const t = Date.now();
    try {
      return await fn(...args);
    } finally {
      const ms = Date.now() - t;
      if (ms > SLOW_MS) console.log(`[slow ${label}] ${ms}ms  ${String(args[1] ?? args[0]).slice(0, 90)} ${typeof args[2] === "string" ? args[2].slice(0, 70) : ""}`);
    }
  };
}
const api = timed("page request", rawApi);
const one = timed("database", rawOne);
const rows = timed("database", rawRows);

process.env.E2E_BASE_URL = STAGING_URL; // browser.mjs resolves paths against this

const BROWSER = (process.env.E2E_BROWSER || "chromium").toLowerCase();
assert.ok(["chromium", "firefox", "webkit"].includes(BROWSER), `E2E_BROWSER must be chromium, firefox or webkit (got ${BROWSER})`);
const HEADED = process.env.E2E_HEADED !== "0";
const OUT = process.env.E2E_OUT || join(process.cwd(), "e2e", ".artifacts", "staging");
mkdirSync(OUT, { recursive: true });

/* ── Run identity ─────────────────────────────────────────────────────────── */

const NOW = Date.now();
const RUN = NOW.toString(36).slice(-5);
const digits = String(NOW).slice(-8);
const letters = (n, k) => Array.from({ length: k }, (_, i) => String.fromCharCode(97 + (Math.floor(n / 26 ** i) % 26))).join("");
const GMAIL_BASE = process.env.QA_GMAIL_BASE || "guptaromil123";
const COMPANY_MAIL_BASE = process.env.QA_COMPANY_MAIL_BASE || "admin";
const COMPANY_MAIL_DOMAIN = process.env.QA_COMPANY_MAIL_DOMAIN || "findtern.in";
const PASSWORD = "Ftqa-Pass#2026";

function makeIntern(k) {
  const n = NOW + k * 7919;
  return {
    firstName: "Ira",
    // Different initials (IQ, IZ, IY) so the cart can tell the interns apart; they are hidden before a hire.
    lastName: `${{ 3: "Zu", 4: "Yo" }[k] ?? "Qa"}${letters(n, 5)}`,
    email: `${GMAIL_BASE}+ftqa-${BROWSER}-${RUN}-i${k}@gmail.com`,
    phone: `9${String(digits).padStart(8, "0")}${k}`,
    emergencyPhone: `8${String(digits).padStart(8, "0")}${k}`,
    aadhaar: `2${String(n).slice(-11)}`,
    pan: `${letters(Math.floor(n / 7), 5).toUpperCase()}${String(n).slice(-4)}P`,
  };
}
const INTERNS = { 1: makeIntern(1), 2: makeIntern(2), 3: makeIntern(3), 4: makeIntern(4) };
const EMPLOYER = {
  name: "Esha Employer",
  companyName: `Zentrova QA ${BROWSER} ${RUN.toUpperCase()}`,
  email: `${COMPANY_MAIL_BASE}+ftqa-${BROWSER}-${RUN}-e1@${COMPANY_MAIL_DOMAIN}`,
  phone: `8${String(digits).padStart(8, "0")}5`,
  escalationPhone: `7${String(digits).padStart(8, "0")}5`,
};

/** A second company, in the United States: New York time, dollars, no GSTIN. */
const EMPLOYER2 = {
  name: "Dana Employer",
  companyName: `Brightwell US QA ${BROWSER} ${RUN.toUpperCase()}`,
  email: `${COMPANY_MAIL_BASE}+ftqa-${BROWSER}-${RUN}-e2@${COMPANY_MAIL_DOMAIN}`,
  phone: `9${String(digits).padStart(8, "0")}6`,
  escalationPhone: `2125550${String(digits).slice(-3)}`,
};

/* ── State, steps, issue tracking ─────────────────────────────────────────── */

const state = {};
const STATE_FILE = join(OUT, `${BROWSER}-state.json`);
const RESUME = process.env.E2E_RESUME === "1";
const issues = []; // console errors, page errors, failed or 4xx/5xx requests, per page
let browser;
let oneWindow = null;
/** One window, roles taking turns, unless E2E_ONE_WINDOW=0. */
const ONE_WINDOW = process.env.E2E_ONE_WINDOW !== "0";
const pages = {};
let currentStep = "setup";

/** Requests that are expected to fail or be non-2xx; each needs a reason. */
const EXPECTED = [
  { match: /\/api\/intern\/avatar/, why: "no photo yet before the upload step" },
  { match: /\/_vercel\/(insights|speed-insights)/, why: "analytics beacons are blocked in automation" },
  { match: /facebook\.com\/tr/, why: "the Meta pixel beacon is aborted by the browser's tracking protection" },
];

function track(roleOrFn, page) {
  const roleNow = () => (typeof roleOrFn === "function" ? roleOrFn() : roleOrFn);
  page.on("console", (m) => {
    if (m.type() === "error" && /status of (400|409)/.test(m.text()) && /edge cases|refused|bad |second|a bad promo|cannot|before the job/i.test(currentStep)) return;
    if (m.type() === "error") issues.push({ role: roleNow(), step: currentStep, kind: "console", text: m.text().slice(0, 300), url: page.url() });
  });
  page.on("pageerror", (e) => issues.push({ role: roleNow(), step: currentStep, kind: "pageerror", text: String(e.message).slice(0, 300), url: page.url() }));
  page.on("response", (r) => {
    const status = r.status();
    // A request that took long is a finding even when it succeeded (a hung
    // signup call is what a person would feel as "the site is broken").
    const took = r.request().timing().responseEnd;
    if (took > 3000) {
      issues.push({ role: roleNow(), step: currentStep, kind: "slow", text: `${r.request().method()} ${r.url().replace(STAGING_URL, "")} took ${Math.round(took / 1000)}s`, url: page.url() });
    }
    if (status < 400) return;
    const url = r.url();
    if (EXPECTED.some((e) => e.match.test(url))) return;
    // Steps that probe a refusal on purpose (bad input, a second payment) expect these.
    if ((status === 400 || status === 409) && /edge cases|refused|bad |second|a bad promo|cannot|before the job/i.test(currentStep)) return;
    issues.push({ role: roleNow(), step: currentStep, kind: "http", status, text: `${r.request().method()} ${url.replace(STAGING_URL, "")}`, url: page.url() });
  });
  page.on("requestfailed", (r) => {
    const url = r.url();
    if (EXPECTED.some((e) => e.match.test(url))) return;
    // Next aborts its own link prefetches when the page navigates away first.
    if (url.includes("_rsc=") && r.failure()?.errorText === "net::ERR_ABORTED") return;
    if (/NS_BINDING_ABORTED|cancelled/i.test(r.failure()?.errorText ?? "") && url.includes("_rsc=")) return;
    issues.push({ role: roleNow(), step: currentStep, kind: "requestfailed", text: `${r.method()} ${url.replace(STAGING_URL, "")} ${r.failure()?.errorText}`, url: page.url() });
  });
}

function saveState() {
  writeFileSync(STATE_FILE, JSON.stringify({ run: RUN, state, accounts: { INTERNS, EMPLOYER, EMPLOYER2 }, owned: manifest() }, null, 2));
}

/**
 * One story step. `needs` names the state keys it depends on; `provides` is the
 * key it sets, so a resumed run (E2E_RESUME=1, same browser) skips what an
 * earlier run already did instead of creating more accounts.
 */
function step(name, needs, provides, fn, timeoutMs = 180_000) {
  test(name, { timeout: timeoutMs }, async (t) => {
    if (RESUME && provides && state[provides] !== undefined) {
      t.skip(`already done in the resumed run (${provides})`);
      return;
    }
    const missing = needs.filter((k) => state[k] === undefined);
    if (missing.length) {
      t.skip(`needs ${missing.join(", ")} from an earlier step that did not complete`);
      return;
    }
    currentStep = name;
    try {
      await fn(t);
      if (provides && state[provides] === undefined) state[provides] = true;
      saveState();
    } catch (err) {
      await shot(`FAIL-${name}`);
      throw err;
    }
  });
}

async function shot(name) {
  const safe = name.replace(/[^a-z0-9]+/gi, "-").slice(0, 70);
  if (oneWindow) {
    // One window: only what is on screen. Taking every role's turn would reload the page the step is working on.
    const role = oneWindow.activeRole() ?? "setup";
    if (!oneWindow.real.isClosed()) await oneWindow.real.screenshot({ path: join(OUT, `${BROWSER}-${safe}-${role}.png`), fullPage: true }).catch((err) => console.log(`[shot] ${safe}: ${String(err.message).slice(0, 80)}`));
    return;
  }
  for (const [role, page] of Object.entries(pages)) {
    try {
      if (!page.isClosed()) await page.screenshot({ path: join(OUT, `${BROWSER}-${safe}-${role}.png`), fullPage: true });
    } catch {
      // a screenshot is a courtesy
    }
  }
}

/** Click and wait for the request the click makes; returns {status, body}. */
async function clickFor(page, locator, match) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(match.path) && r.request().method() === match.method, { timeout: 30_000 }),
    locator.click(),
  ]);
  return { status: res.status(), body: await res.json().catch(() => null) };
}

/** The page's own Pay button (there is no test button any more). */
const PAY_BUTTON = /^(Pay [₹$]|Activate free)/;

/**
 * Press the real Pay button but add `testPay: true` to the order request the page sends, so the
 * server settles it at the real amount without Razorpay. Only works where the server has
 * PAYMENTS_TEST_BUTTON=1 on a test host (src/lib/razorpay.ts).
 */
async function payWithTestFlag(page, orderPath) {
  const pattern = `**${orderPath}`;
  const handler = async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fallback();
    const body = JSON.parse(req.postData() || "{}");
    return route.continue({ postData: JSON.stringify({ ...body, testPay: true }) });
  };
  await page.route(pattern, handler);
  try {
    return await clickFor(page, page.getByRole("button", { name: PAY_BUTTON }), { path: orderPath, method: "POST" });
  } finally {
    await page.unroute(pattern, handler);
  }
}

/**
 * Fill a field and make sure the value survives. A value typed into the
 * server-rendered form before React hydrates is wiped when it takes over, and
 * a person only types once the page is up, so wait until the value sticks.
 */
async function fillStable(locator, value) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await locator.fill(value);
    await locator.page().waitForTimeout(attempt === 0 ? 250 : 500);
    if ((await locator.inputValue()) === value) return;
  }
  throw new Error(`The field would not keep its value "${value}"`);
}

/**
 * Fill an input whose button only enables once the component has the value in
 * its state. Before hydration the DOM keeps what was typed but React never saw
 * it, so retype until the button wakes up.
 */
async function fillUntilEnabled(input, value, button) {
  const page = input.page();
  await page.waitForLoadState("load");
  for (let attempt = 0; attempt < 5; attempt++) {
    await input.fill("");
    await page.waitForTimeout(400);
    await input.fill(value);
    try {
      await button.waitFor({ state: "visible" });
      await page.waitForFunction((el) => !el.disabled, await button.elementHandle(), { timeout: 2500 });
      return;
    } catch {
      // not hydrated yet
    }
  }
  throw new Error(`The button never enabled after typing "${value}"`);
}

/** Fill a whole form, then check every field again just before it is submitted. */
async function fillForm(page, fields) {
  await page.waitForLoadState("load");
  for (let pass = 0; pass < 4; pass++) {
    for (const [locator, value] of fields) await fillStable(locator, value);
    await page.waitForTimeout(600);
    const values = await Promise.all(fields.map(([locator]) => locator.inputValue()));
    if (fields.every(([, value], i) => values[i] === value)) return;
  }
  throw new Error("The form would not keep the values it was given");
}

/** A 429 here means this machine's address is not in RATE_LIMIT_BYPASS_IPS. */
function assertNotRateLimited(label, res) {
  assert.notEqual(res.status, 429, `${label} was rate limited (429): this machine's address is not in RATE_LIMIT_BYPASS_IPS on Vercel`);
}

/**
 * A choice made before React has hydrated the page is kept by the browser but never seen by the page, so give
 * the page a moment first (a person needs it too). The headless runs, which have no slow-motion delay, hit this.
 */
async function settle(page) {
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
}

/** Tick a consent box until the form's submit button wakes up (it only enables once React has seen the tick). */
async function agreeUntilEnabled(box, button) {
  const page = box.page();
  await settle(page);
  for (let attempt = 0; attempt < 6; attempt++) {
    await box.check();
    try {
      await page.waitForFunction((el) => !el.disabled, await button.elementHandle(), { timeout: 2500 });
      return;
    } catch {
      await box.uncheck();
      await page.waitForTimeout(600);
    }
  }
  throw new Error("The submit button never enabled after agreeing to the terms");
}

/** YYYY-MM-DD in Asia/Kolkata, `days` from today. */
function istDate(days = 0) {
  return new Date(Date.now() + days * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

const ADMIN = { email: process.env.ADMIN_EMAIL || "", password: process.env.ADMIN_PASSWORD || "" };

/** Browser-state sessions for each role; `intern2` is a second candidate for the monthly plan. */
const ROLES = ["intern", "intern2", "employer", "admin", "intern3", "intern4", "employer2"];

async function apiLogin(page, path, email, password) {
  await gotoWithRetry(page, `${STAGING_URL}/login`, { timeout: 30_000 });
  const res = await api(page, "POST", path, { email, password });
  assertNotRateLimited(path, res);
  expectOk(`POST ${path}`, res);
}

before(async () => {
  const type = { chromium, firefox, webkit }[BROWSER];
  const opts = { headless: !HEADED, slowMo: HEADED ? Number(process.env.E2E_SLOWMO || 80) : 0 };
  // This machine reaches Vercel through NAT64, where HTTP/3 (UDP) now and then stalls a request for 30 s or more
  // while plain HTTP/2 keeps working. E2E_NO_QUIC=1 keeps the browsers on TCP, to tell that apart from a slow site.
  if (process.env.E2E_NO_QUIC === "1") {
    if (BROWSER === "chromium") opts.args = ["--disable-quic"];
    if (BROWSER === "firefox") opts.firefoxUserPrefs = { "network.http.http3.enable": false };
  }
  if (BROWSER === "chromium") {
    try {
      browser = await type.launch({ ...opts, channel: "chrome" }); // real Google Chrome when installed
    } catch {
      browser = await type.launch(opts);
    }
  } else {
    browser = await type.launch(opts);
  }
  const newRoleContext = async () => {
    const ctx = await browser.newContext({ baseURL: STAGING_URL, viewport: { width: 1440, height: 900 }, locale: "en-IN", timezoneId: "Asia/Kolkata" });
    ctx.setDefaultTimeout(20_000);
    // The invoice is printed from a hidden frame; a real print dialog would block the run, so count the call instead.
    await ctx.addInitScript(() => {
      window.__printed = 0;
      window.print = () => {
        window.__printed++;
      };
    });
    return ctx;
  };
  if (ONE_WINDOW) {
    // One window for every login: roles take turns (e2e/lib/one-window.mjs).
    oneWindow = await singleWindow({ context: await newRoleContext(), roles: ROLES, origin: STAGING_URL, track });
    Object.assign(pages, oneWindow.pages);
  } else {
    for (const role of ROLES) {
      const ctx = await newRoleContext();
      pages[role] = await ctx.newPage();
      track(role, pages[role]);
    }
  }

  if (RESUME && existsSync(STATE_FILE)) {
    const saved = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    Object.assign(state, saved.state);
    Object.assign(INTERNS[1], saved.accounts.INTERNS[1]);
    Object.assign(INTERNS[2], saved.accounts.INTERNS[2]);
    for (const k of [3, 4]) if (saved.accounts.INTERNS[k]) Object.assign(INTERNS[k], saved.accounts.INTERNS[k]);
    Object.assign(EMPLOYER, saved.accounts.EMPLOYER);
    if (saved.accounts.EMPLOYER2) Object.assign(EMPLOYER2, saved.accounts.EMPLOYER2);
    for (const [id, label] of Object.entries(saved.owned)) own(label, id);
    if (state.internId) await apiLogin(pages.intern, "/api/auth/login", INTERNS[1].email, PASSWORD);
    if (state.intern2Id) await apiLogin(pages.intern2, "/api/auth/login", INTERNS[2].email, PASSWORD);
    if (state.employerId) await apiLogin(pages.employer, "/api/auth/employer/login", EMPLOYER.email, PASSWORD);
    if (state.adminReady) await apiLogin(pages.admin, "/api/auth/admin/login", ADMIN.email, ADMIN.password);
    if (state.intern3Id) await apiLogin(pages.intern3, "/api/auth/login", INTERNS[3].email, PASSWORD);
    if (state.intern4Id) await apiLogin(pages.intern4, "/api/auth/login", INTERNS[4].email, PASSWORD);
    if (state.employer2Id) await apiLogin(pages.employer2, "/api/auth/employer/login", EMPLOYER2.email, PASSWORD);
    console.log(`[${BROWSER}] resumed run ${saved.run}`);
  }
});

after(async () => {
  writeFileSync(join(OUT, `${BROWSER}-manifest.json`), JSON.stringify({ run: RUN, browser: BROWSER, created: manifest() }, null, 2));
  writeFileSync(join(OUT, `${BROWSER}-issues.json`), JSON.stringify(issues, null, 2));
  console.log(`\n[${BROWSER}] run ${RUN}: ${issues.length} console/network issues recorded -> ${join(OUT, `${BROWSER}-issues.json`)}`);
  writeFileSync(join(OUT, `${BROWSER}-stalls-${RUN}.json`), JSON.stringify(stalls, null, 2));
  console.log(`[${BROWSER}] page loads that hung and were reloaded: ${stalls.length}${stalls.length ? ` (${stalls.map((s) => `${s.target.replace(STAGING_URL, "")} ${s.seconds}s`).join(", ")})` : ""}`);
  await browser?.close();
  await closeDb();
});

/* ── 1. Interns sign up, onboard, activate ────────────────────────────────── */

async function signUpIntern(page, who) {
  const started = Date.now();
  await visit(page, "/signup");
  await fillForm(page, [
    [page.getByLabel("First name"), who.firstName],
    [page.getByLabel("Last name"), who.lastName],
    [page.getByLabel("Email", { exact: true }), who.email],
    [page.locator("#phoneNumber"), who.phone],
    [page.locator("#password"), PASSWORD],
  ]);
  await agreeUntilEnabled(page.getByRole("checkbox", { name: /agree/i }), page.getByRole("button", { name: "Send verification code" }));
  const sent = await clickFor(page, page.getByRole("button", { name: "Send verification code" }), { path: "/api/auth/signup/send-otp", method: "POST" });
  assertNotRateLimited("send-otp", sent);
  assert.equal(sent.status, 200, `send-otp → ${sent.status} ${JSON.stringify(sent.body)}`);
  const code = await readSignupCode(who.email, "intern", started);
  await page.locator("#otp").fill(code);
  await page.getByRole("button", { name: /verify code|create account/i }).click();
  await page.waitForURL(/\/intern\/onboarding/, { timeout: 40_000 });
  const user = await one(`SELECT * FROM users WHERE email = $1`, [who.email]);
  assert.ok(user, "users row created in the staging database (so the site and this script share one database)");
  assert.equal(user.role, "intern");
  assert.equal(user.email_verified, true);
  assert.match(user.password, /^\$argon2/, "password is hashed");
  return own(`intern:${who.email}`, user.id);
}

async function onboardIntern(page, who, over = {}) {
  await visit(page, "/intern/onboarding");
  await page.getByText(/step 1 of/i).filter({ visible: true }).first().waitFor();
  for (const kind of ["profile_photo", "pan"]) {
    expectOk(`POST /api/uploads (${kind})`, await upload(page, { kind, base64: pngBase64(), type: "image/png", name: `${kind}.png` }), [201]);
  }
  const skills = ["Python", "SQL", "React", "Data Analysis"];
  expectOk(
    "POST /api/intern/onboarding (final)",
    await api(page, "POST", "/api/intern/onboarding", {
      linkedinUrl: "",
      city: "Pune",
      state: "Maharashtra",
      pinCode: "411001",
      aadhaarNumber: who.aadhaar,
      panNumber: who.pan,
      emergencyCountryCode: "+91",
      emergencyPhone: who.emergencyPhone,
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
      experiences: [],
      languages: [{ id: "lang-1", language: "English", level: "Professional", read: true, write: true, speak: true }],
      extracurriculars: [],
      locationTypes: ["remote"],
      preferredLocations: [],
      hasLaptop: true,
      openToWork: true,
      ndaAccepted: true,
      final: true,
      ...over,
    }),
  );
}

step("intern 1: signs up through the form, code from the database [UI]", [], "internId", async () => {
  state.internId = await signUpIntern(pages.intern, INTERNS[1]);
  await shot("intern1-signup");
});

step("intern 1: uploads photo + PAN and submits onboarding [API]", ["internId"], "internOnboarded", async () => {
  await onboardIntern(pages.intern, INTERNS[1]);
  const row = await one(`SELECT * FROM intern_onboarding WHERE user_id = $1`, [state.internId]);
  assert.ok(row?.extra_data?.ndaAcceptedAt, "NDA acceptance stamped");
  assert.equal(row.aadhaar_number, INTERNS[1].aadhaar);
  state.internOnboarded = true;
});

step("intern 1: dashboard shows Pay, settles it with the test flag, gets an invoice number [UI]", ["internOnboarded"], "internActivated", async () => {
  const page = pages.intern;
  const orderPath = `/api/intern/${state.internId}/payment/razorpay/order`;
  await visit(page, "/intern/dashboard");
  await shot("intern1-dashboard-before-pay");
  await page.getByRole("button", { name: PAY_BUTTON }).waitFor({ state: "visible" });
  const res = await payWithTestFlag(page, orderPath);
  assertNotRateLimited("order", res);
  assert.equal(res.status, 200, `order → ${res.status} ${JSON.stringify(res.body)}`);
  assert.equal(res.body?.free, true);

  const pay = await one(`SELECT * FROM intern_payments WHERE intern_id = $1 ORDER BY created_at DESC LIMIT 1`, [state.internId]);
  assert.equal(pay.status, "paid");
  assert.equal(pay.gateway, "test");
  assert.ok(pay.amount_minor > 0, "the real amount was settled, not zero");
  assert.match(String(pay.invoice_number), /^\d{6}-\d{2,}$/, `invoice number "${pay.invoice_number}" looks like DDMMYY-serial`);
  const ob = await one(`SELECT extra_data FROM intern_onboarding WHERE user_id = $1`, [state.internId]);
  assert.equal(ob.extra_data.payment?.isPaid, true, "legacy isPaid flag set");
  state.internFeeMinor = pay.amount_minor;
  state.internActivated = true;
  await shot("intern1-dashboard-after-pay");

  // Edge: paying again (a second tab, a double click) must not make a second invoice.
  const again = await api(page, "POST", orderPath, { testPay: true });
  assert.equal(again.status, 409, `a second payment is refused (got ${again.status} ${JSON.stringify(again.body)})`);
  const n = await one(`SELECT count(*)::int AS paid, count(invoice_number)::int AS invoices FROM intern_payments WHERE intern_id = $1 AND status = 'paid'`, [state.internId]);
  assert.deepEqual({ ...n }, { paid: 1, invoices: 1 }, "still one paid row and one invoice");
});

step("intern 2: signs up through the form [UI]", [], "intern2Id", async () => {
  state.intern2Id = await signUpIntern(pages.intern2, INTERNS[2]);
});

step("intern 2: uploads photo + PAN and submits onboarding [API]", ["intern2Id"], "intern2Onboarded", async () => {
  await onboardIntern(pages.intern2, INTERNS[2]);
  state.intern2Onboarded = true;
});

/* ── 2. Admin: sign in, create a promo code ───────────────────────────────── */

step("admin: signs in at /admin/login [UI]", [], "adminReady", async () => {
  assert.ok(ADMIN.email && ADMIN.password, "set ADMIN_EMAIL and ADMIN_PASSWORD in the environment");
  const page = pages.admin;
  await visit(page, "/admin/login");
  await fillForm(page, [
    [page.getByLabel("Email", { exact: true }), ADMIN.email],
    [page.locator("#password"), ADMIN.password],
  ]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 40_000 });
  await page.getByRole("link", { name: /\b(candidates|payouts|companies|proposals)\b/i }).filter({ visible: true }).first().waitFor();
  state.adminReady = true;
});

step("admin: creates a 10% promo code for both sides [API]", ["adminReady"], "promoId", async () => {
  const code = `FTQA${BROWSER.slice(0, 2).toUpperCase()}${RUN.toUpperCase()}`;
  const res = await api(pages.admin, "POST", "/api/admin/promo-codes", {
    code,
    description: `QA run ${RUN} (${BROWSER})`,
    discountType: "percentage",
    discountValue: 10,
    maxUsages: 20,
    appliesTo: "both",
    isActive: true,
  });
  const body = expectOk("POST /api/admin/promo-codes", res, [201]);
  state.promoId = own(`promo:${code}`, body.promo.id);
  state.promoCode = code;
  const dup = await api(pages.admin, "POST", "/api/admin/promo-codes", { code, discountType: "percentage", discountValue: 10, appliesTo: "both" });
  assert.equal(dup.status, 409, "a duplicate code name is refused");
});

step("intern 2: a bad promo is refused, the real one is applied, then pays with the test flag [UI]", ["intern2Onboarded", "promoId", "internFeeMinor"], "intern2Activated", async () => {
  const page = pages.intern2;
  const orderPath = `/api/intern/${state.intern2Id}/payment/razorpay/order`;
  await visit(page, "/intern/dashboard");
  const promo = page.getByLabel(/promo code/i);
  await promo.waitFor({ state: "visible" });
  const apply = page.getByRole("button", { name: "Apply", exact: true });
  await fillUntilEnabled(promo, "NOPE-FTQA", apply);
  await apply.click();
  await page.getByText(/invalid promo code/i).first().waitFor({ timeout: 15_000 });
  await shot("intern2-bad-promo");

  await fillUntilEnabled(promo, state.promoCode, apply);
  await apply.click();
  const appliedAt = Date.now();
  await page.getByText(new RegExp(state.promoCode, "i")).first().waitFor({ timeout: 60_000 });
  if (Date.now() - appliedAt > 5000) console.log(`[slow promo apply] the code took ${Math.round((Date.now() - appliedAt) / 1000)}s to show`);
  await shot("intern2-good-promo");

  const res = await payWithTestFlag(page, orderPath);
  assertNotRateLimited("order", res);
  assert.equal(res.status, 200, `order → ${res.status} ${JSON.stringify(res.body)}`);

  const discount = Math.floor((state.internFeeMinor * 10) / 100);
  const pay = await one(`SELECT * FROM intern_payments WHERE intern_id = $1 AND status = 'paid'`, [state.intern2Id]);
  assert.equal(pay.amount_minor, state.internFeeMinor - discount, "charged the fee less 10%");
  assert.match(String(pay.invoice_number), /^\d{6}-\d{2,}$/);
  const promoRow = await one(`SELECT used_count FROM promo_codes WHERE id = $1`, [state.promoId]);
  assert.equal(promoRow.used_count, 1, "the code's use was recorded");
  const use = await one(`SELECT discount_applied_minor FROM promo_code_usages WHERE promo_code_id = $1 AND user_id = $2`, [state.promoId, state.intern2Id]);
  assert.equal(use?.discount_applied_minor, discount, "the discount stored equals what was taken off");
  state.intern2Activated = true;
});

/* ── 3. Admin scores both interns → approved and visible ──────────────────── */

step("admin: scores both interns 8/10 → approved [API]", ["adminReady", "internActivated", "intern2Activated"], "scored", async () => {
  const page = pages.admin;
  for (const [id, who] of [[state.internId, INTERNS[1]], [state.intern2Id, INTERNS[2]]]) {
    await visit(page, `/admin/interns/${id}`);
    await page.getByText(who.email).first().waitFor();
    const res = await api(page, "PUT", `/api/admin/interns/${id}/ratings`, { communication: 8, coding: 8, aptitude: 8, interview: 8 });
    const body = expectOk(`PUT ratings ${id}`, res);
    assert.ok(body.findternScore >= 6, `score ${body.findternScore}`);
    const ob = await one(`SELECT extra_data FROM intern_onboarding WHERE user_id = $1`, [id]);
    assert.equal(ob.extra_data.approvalStatus, "Approved");
  }
  state.scored = true;
});

/* ── 4. Employer signs up and sets up the company ─────────────────────────── */

/** One GSTIN per browser, so the three runs cover IGST (other state) and CGST+SGST (Rajasthan, the seller's state "08"). */
const COMPANY = {
  chromium: { gstin: "29AABCU9603R1ZX", state: "Karnataka", city: "Bengaluru", pin: "560001", intra: false },
  firefox: { gstin: "08AABCU9603R1ZV", state: "Rajasthan", city: "Jaipur", pin: "302001", intra: true },
  webkit: { gstin: "27AAPFU0939F1ZV", state: "Maharashtra", city: "Mumbai", pin: "400001", intra: false },
}[BROWSER];

async function signUpEmployer(page, who) {
  const started = Date.now();
  await visit(page, "/signup?as=employer");
  await fillForm(page, [
    [page.getByLabel("Your name"), who.name],
    [page.getByLabel("Company name"), who.companyName],
    [page.locator("#companyEmail"), who.email],
    [page.locator("#phoneNumber"), who.phone],
    [page.locator("#password"), PASSWORD],
  ]);
  await agreeUntilEnabled(page.getByRole("checkbox", { name: /agree/i }), page.getByRole("button", { name: "Send verification code" }));
  const sent = await clickFor(page, page.getByRole("button", { name: "Send verification code" }), { path: "/api/auth/signup/send-otp", method: "POST" });
  assertNotRateLimited("send-otp", sent);
  assert.equal(sent.status, 200, `send-otp → ${sent.status} ${JSON.stringify(sent.body)}`);
  await page.locator("#otp").fill(await readSignupCode(who.email, "employer", started));
  await page.getByRole("button", { name: /verify and create account|create account/i }).click();
  await page.waitForURL(/\/employer\/onboarding/, { timeout: 40_000 });
  const emp = await one(`SELECT * FROM employers WHERE company_email = $1`, [who.email]);
  assert.ok(emp, "employers row created");
  assert.equal(emp.company_name, who.companyName);
  assert.match(emp.password, /^\$argon2/, "password is hashed");
  return own(`employer:${who.email}`, emp.id);
}

step("employer: signs up with a company email through the form [UI]", [], "employerId", async () => {
  state.employerId = await signUpEmployer(pages.employer, EMPLOYER);
  await shot("employer-signup");
});

step("employer: GSTIN edge cases, then company setup + first project [API]", ["employerId"], "projectId", async () => {
  const page = pages.employer;
  await visit(page, "/employer/onboarding");
  await page.getByLabel(/company name/i).first().waitFor();
  const base = {
    companyName: EMPLOYER.companyName,
    websiteUrl: `https://${EMPLOYER.email.split("@")[1]}`,
    logoUrl: null,
    companySize: "11-50",
    country: "India",
    state: COMPANY.state,
    city: COMPANY.city,
    primaryContactName: EMPLOYER.name,
    primaryContactRole: "Founder",
    countryCode: "+91",
    phoneNumber: EMPLOYER.phone,
    escalationContactName: "Ravi Ops",
    escalationContactRole: "Operations lead",
    escalationContactEmail: `ops+ftqa-${RUN}@findtern.in`,
    escalationContactCountryCode: "+91",
    escalationContactPhone: EMPLOYER.escalationPhone,
    billingPincode: COMPANY.pin,
  };
  const path = `/api/employer/${state.employerId}`;
  for (const [label, gst] of [["too short", "29AABCU9603R1Z"], ["not a GSTIN", "NOT-A-GSTIN-123"], ["state code that does not exist", "99AABCU9603R1ZX"]]) {
    const res = await api(page, "PATCH", path, { ...base, gstNumber: gst });
    assert.equal(res.status, 400, `a GSTIN that is ${label} is refused (got ${res.status} ${JSON.stringify(res.body).slice(0, 200)})`);
  }
  expectOk(`PATCH ${path}`, await api(page, "PATCH", path, { ...base, gstNumber: COMPANY.gstin }));

  const project = await api(page, "POST", `${path}/projects`, {
    projectName: `Ops dashboards ${RUN}`,
    skills: ["Python", "SQL", "React", "Data Analysis"],
    scopeOfWork: "upto-60",
    fullTimeOffer: false,
    locationType: "remote",
    preferredLocations: [],
    pincode: "",
    city: "",
    state: "",
    timezone: "Asia/Kolkata",
  });
  const body = expectOk(`POST ${path}/projects`, project, [201]);
  const emp = await one(`SELECT * FROM employers WHERE id = $1`, [state.employerId]);
  assert.equal(emp.gst_number, COMPANY.gstin);
  assert.equal(emp.onboarding_completed, true, "the first project completes onboarding");
  state.projectId = own(`project:${RUN}`, body.project.id);
  await visit(page, "/employer/dashboard");
  await shot("employer-dashboard");
});

/* ── 5. Shortlist, interviews, feedback ───────────────────────────────────── */

const bothInterns = () => [
  { key: "1", id: state.internId, who: INTERNS[1], page: pages.intern },
  { key: "2", id: state.intern2Id, who: INTERNS[2], page: pages.intern2 },
];

step("employer: shortlists both interns and sees them in the cart [API + UI]", ["projectId", "scored"], "shortlisted", async () => {
  const page = pages.employer;
  for (const { id, who } of bothInterns()) {
    await visit(page, `/employer/intern/${id}`);
    const text = await page.locator("body").innerText();
    assert.ok(!text.includes(who.lastName), "the intern's surname is hidden from an employer before the hire");
    const res = await api(page, "POST", "/api/employer/cart", { action: "add", projectId: state.projectId, internId: id, listType: "cart" });
    expectOk("POST /api/employer/cart (add)", res);
  }
  const inCart = await rows(`SELECT intern_id FROM employer_cart_items WHERE employer_id = $1 AND project_id = $2`, [state.employerId, state.projectId]);
  assert.equal(inCart.length, 2);
  await visit(page, "/employer/cart");
  // Candidates show as initials ("IQ") before a hire, never by name.
  await page.getByText(/\b2 candidates\b/i).first().waitFor(); // the shortlist heading counts distinct people
  assert.equal(await page.getByRole("button", { name: "Book meeting" }).count(), 2, "each shortlisted candidate can be booked");
  assert.ok(!(await page.locator("body").innerText()).includes(INTERNS[1].lastName), "the cart never shows a surname");
  await shot("employer-cart");
  state.shortlisted = true;
});

step("employer: interview request edge cases, then books both interns, 3 slots each [API]", ["shortlisted"], "interviewId", async () => {
  const page = pages.employer;
  const path = `/api/employer/${state.employerId}/interviews`;
  const day = istDate(2);
  const slots = (a, b, c) => ({ slot1: `${day}T${a}`, slot2: `${day}T${b}`, slot3: `${day}T${c}` });
  const ask = (internId, over) => api(page, "POST", path, { internId, projectId: state.projectId, timezone: "Asia/Kolkata", ...over });

  const past = await ask(state.internId, { slot1: `${istDate(-1)}T11:00`, slot2: `${day}T12:00`, slot3: `${day}T13:00` });
  assert.equal(past.status, 400, `a slot in the past is refused (got ${past.status})`);
  const same = await ask(state.internId, slots("11:00", "11:00", "13:00"));
  assert.equal(same.status, 400, `two identical slots are refused (got ${same.status})`);
  const odd = await ask(state.internId, slots("11:07", "12:00", "13:00"));
  assert.equal(odd.status, 400, `a slot off the quarter hour is refused (got ${odd.status})`);

  const booked = [];
  for (const { id } of bothInterns()) {
    const res = await ask(id, slots("11:00", "12:00", "13:00"));
    const body = expectOk(`POST ${path}`, res, [201]);
    const iv = await one(`SELECT * FROM interviews WHERE id = $1`, [body.interview.id]);
    assert.equal(iv.status, "pending");
    assert.equal(iv.slot1.toISOString(), new Date(`${day}T05:30:00Z`).toISOString(), "11:00 IST is stored as 05:30 UTC");
    booked.push(own(`interview:${id}`, iv.id));
  }
  [state.interviewId, state.interview2Id] = booked;
  const dup = await ask(state.internId, slots("14:00", "15:00", "16:00"));
  assert.equal(dup.status, 409, `a second open meeting with the same candidate is refused (got ${dup.status})`);
  const n = await one(`SELECT count(*)::int AS n FROM notifications WHERE recipient_id = $1 AND type = 'interview_pending'`, [state.internId]);
  assert.ok(n.n >= 1, "the intern was notified of the invitation");
});

step("intern 1: opens the invitation and books a time on /intern/interviews [UI]", ["interviewId"], "slotPicked", async () => {
  const page = pages.intern;
  const path = `/api/interviews/${state.interviewId}/select-slot`;
  await visit(page, "/intern/interviews");
  const body = await page.locator("body").innerText();
  assert.ok(!body.includes(EMPLOYER.companyName), "the interviews page hides the company before the hire");
  // A click before React has hydrated the page is dropped (the card highlights, nothing is selected),
  // so choose the time again until the confirm button names it.
  const confirm = page.getByRole("button", { name: /^Book (?!this time)/ });
  await page.waitForLoadState("load");
  for (let attempt = 0; attempt < 6 && !(await confirm.isVisible()); attempt++) {
    await page.getByRole("list", { name: "Offered times" }).getByRole("button").first().click();
    await confirm.waitFor({ state: "visible", timeout: 2500 }).catch(() => {});
  }
  const res = await clickFor(page, confirm, { path, method: "POST" });
  expectOk(`POST ${path}`, res);
  const iv = await one(`SELECT status, selected_slot, meeting_link FROM interviews WHERE id = $1`, [state.interviewId]);
  assert.equal(iv.status, "scheduled");
  assert.ok([1, 2, 3].includes(iv.selected_slot));
  state.meetingLinkOnStaging = iv.meeting_link ?? null; // reported: no Google Calendar on staging
  await shot("intern1-slot-booked");
});

step("intern 2: books a time [API]", ["interview2Id"], "slot2Picked", async () => {
  const path = `/api/interviews/${state.interview2Id}/select-slot`;
  expectOk(`POST ${path}`, await api(pages.intern2, "POST", path, { slot: 1 }));
  state.slot2Picked = true;
});

step("employer: feedback is refused before the meeting, accepted after it has happened [API]", ["slotPicked", "slot2Picked"], "interviewsDone", async () => {
  const page = pages.employer;
  for (const id of [state.interviewId, state.interview2Id]) {
    const early = await api(page, "POST", `/api/interviews/${id}/feedback`, { feedback: "Too early to say." });
    assert.ok([400, 403, 409].includes(early.status), `feedback before the meeting is refused (got ${early.status})`);
    const still = await one(`SELECT status FROM interviews WHERE id = $1`, [id]);
    assert.equal(still.status, "scheduled", "the meeting is not marked completed by early feedback");
    // Time travel on our own interview: all three slots a few hours in the past.
    await ownedWrite(
      id,
      `UPDATE interviews SET slot1 = (now() AT TIME ZONE 'UTC') - interval '3 hours',
         slot2 = (now() AT TIME ZONE 'UTC') - interval '2 hours 30 minutes',
         slot3 = (now() AT TIME ZONE 'UTC') - interval '2 hours' WHERE id = $1`,
      [id],
    );
    expectOk(`POST feedback ${id}`, await api(page, "POST", `/api/interviews/${id}/feedback`, { feedback: "Clear communicator, solid SQL." }));
    const done = await one(`SELECT status, notes FROM interviews WHERE id = $1`, [id]);
    assert.equal(done.status, "completed");
    assert.match(done.notes, /feedback_text:/);
  }
  state.interviewsDone = true;
});

/* ── 6. Offers: validation, send, accept ──────────────────────────────────── */

step("employer: bad offers are refused, then sends one offer to each intern [API]", ["interviewsDone"], "proposalId", async () => {
  const page = pages.employer;
  const path = `/api/employer/${state.employerId}/proposals`;
  const offer = (internId, over = {}) => ({
    internId,
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
    ...over,
  });
  const bad = [
    ["a start date in the past", { startDate: istDate(-3) }],
    ["a start date more than a year away", { startDate: istDate(400) }],
    ["an impossible date", { startDate: "2026-02-31" }],
    ["a time zone that does not exist", { timezone: "Mars/Phobos" }],
    ["a shift that starts and ends together", { shiftFrom: "10:00", shiftTo: "10:00" }],
    ["a laptop value nobody sends", { laptop: "banana" }],
    ["no agreement to the policy", { agreedToPolicy: false }],
  ];
  for (const [label, over] of bad) {
    const res = await api(page, "POST", path, offer(state.internId, over));
    assert.equal(res.status, 400, `${label} is refused (got ${res.status} ${JSON.stringify(res.body).slice(0, 160)})`);
  }
  const ids = [];
  for (const { id } of bothInterns()) {
    const body = expectOk(`POST ${path}`, await api(page, "POST", path, offer(id)), [201]);
    const p = await one(`SELECT * FROM proposals WHERE id = $1`, [body.proposal.id]);
    assert.equal(p.status, "sent");
    assert.equal(p.currency, "INR");
    const o = p.offer_details;
    assert.ok(o.hourlyRate > 0, `an 8/10 score has a real hourly rate (got ${o.hourlyRate})`);
    assert.equal(o.monthlyAmount, Math.round(o.hourlyRate * o.monthlyHours * 100) / 100, "monthly amount = hourly rate x monthly hours");
    ids.push(own(`proposal:${id}`, p.id));
  }
  [state.proposalId, state.proposal2Id] = ids;
});

step("intern 1: accepts the offer on /intern/proposals/[id] [UI]", ["proposalId"], "accepted", async () => {
  const page = pages.intern;
  const path = `/api/proposals/${state.proposalId}/status`;
  await visit(page, `/intern/proposals/${state.proposalId}`);
  const text = await page.locator("body").innerText();
  assert.ok(!text.includes(EMPLOYER.companyName), "the offer page hides the company before the hire");
  await shot("intern1-offer");
  await page.getByRole("button", { name: "Accept this offer" }).click();
  await page.getByRole("checkbox", { name: /intern terms/i }).check();
  expectOk(`PATCH ${path}`, await clickFor(page, page.getByRole("button", { name: "Yes, accept" }), { path, method: "PATCH" }));
  const p = await one(`SELECT status FROM proposals WHERE id = $1`, [state.proposalId]);
  assert.equal(p.status, "accepted");
  state.accepted = true;
});

step("intern 2: accepts the offer [API]", ["proposal2Id"], "accepted2", async () => {
  const path = `/api/proposals/${state.proposal2Id}/status`;
  expectOk(`PATCH ${path}`, await api(pages.intern2, "PATCH", path, { status: "accepted", agreedToTerms: true }));
  const p = await one(`SELECT status FROM proposals WHERE id = $1`, [state.proposal2Id]);
  assert.equal(p.status, "accepted");
  state.accepted2 = true;
});

/* ── 7. Checkout: one hire upfront with the promo, the other on the month-end stipend plan ──────── */

/** The intern page for a proposal's candidate. */
const internPageFor = (internId) => (internId === state.internId ? pages.intern : pages.intern2);

step("employer: pays one offer upfront with the promo, using the test flag [UI]", ["accepted", "accepted2", "promoCode"], "paidUpfront", async () => {
  const page = pages.employer;
  const orderPath = `/api/employer/${state.employerId}/payment/razorpay/order`;
  await visit(page, "/employer/checkout");
  await page.getByText(/2 ready to pay/i).first().waitFor();
  await settle(page);
  await page.getByRole("radio", { name: /Pay the whole internship now/ }).check();

  const main = await page.locator("main").innerText();
  const fee = Number((main.match(/Hiring charge \(one-time\)\s*₹([\d,]+)/)?.[1] ?? "").replace(/,/g, ""));
  assert.ok(fee > 0, "the hiring fee is shown");
  const offer = await one(`SELECT offer_details FROM proposals WHERE id = $1`, [state.proposalId]);
  const monthlyMinor = Math.round(offer.offer_details.monthlyAmount * 100);
  const discount = Math.floor((monthlyMinor * 10) / 100); // the promo discounts the first month, never the hiring fee
  const expected = monthlyMinor - discount + fee * 100;

  const apply = page.getByRole("button", { name: "Apply", exact: true });
  await fillUntilEnabled(page.getByLabel(/promo code/i), state.promoCode, apply);
  await apply.click();
  await page.getByText(new RegExp(state.promoCode, "i")).first().waitFor({ timeout: 15_000 });
  await shot("employer-checkout-upfront-promo");

  const res = await payWithTestFlag(page, orderPath);
  assertNotRateLimited("order", res);
  assert.equal(res.status, 200, `order → ${res.status} ${JSON.stringify(res.body)}`);
  assert.equal(res.body?.free, true);

  const pay = await one(`SELECT * FROM employer_payments WHERE employer_id = $1 AND status = 'paid' ORDER BY paid_at DESC LIMIT 1`, [state.employerId]);
  assert.equal(pay.gateway, "test");
  assert.equal(pay.amount_minor, expected, `charged the first month less 10%, plus the full hiring fee (${expected})`);
  assert.match(String(pay.invoice_number), /^\d{6}-\d{2,}$/, `invoice number "${pay.invoice_number}"`);
  assert.equal(pay.raw?.notes?.paymentMode, "total", "stored as total: the whole engagement paid at once");
  assert.equal(pay.raw?.promo?.promoCode, state.promoCode);
  const paidProposalId = pay.raw.notes.proposalIds[0];
  const p = await one(`SELECT status, hired_at, intern_id FROM proposals WHERE id = $1`, [paidProposalId]);
  assert.equal(p.status, "hired");
  assert.ok(p.hired_at, "hired_at stamped");
  const use = await one(`SELECT discount_applied_minor FROM promo_code_usages WHERE promo_code_id = $1 AND user_id = $2`, [state.promoId, state.employerId]);
  assert.equal(use?.discount_applied_minor, discount, "the employer's promo use was recorded with the right discount");

  state.hiredProposalId = paidProposalId;
  state.hiredInternId = p.intern_id;
  state.otherProposalId = [state.proposalId, state.proposal2Id].find((id) => id !== paidProposalId);
  state.upfrontInvoice = pay.invoice_number;
  state.upfrontPaymentId = pay.id;
  state.upfrontAmount = pay.amount_minor;
  await shot("employer-checkout-after-upfront");

  // Edge: paying the same hire again (double click, a second tab) is refused and makes no second invoice.
  const again = await api(page, "POST", orderPath, { currency: "INR", proposalIds: [paidProposalId], mode: "upfront", paymentIndex: 0, testPay: true });
  assert.ok([400, 409].includes(again.status), `paying a paid hire again is refused (got ${again.status} ${JSON.stringify(again.body).slice(0, 160)})`);
  const n = await one(`SELECT count(*)::int AS paid FROM employer_payments WHERE employer_id = $1 AND status = 'paid'`, [state.employerId]);
  assert.equal(n.paid, 1, "still exactly one paid order");
});

step("intern: after the hire the company name is revealed [UI]", ["paidUpfront"], "revealChecked", async () => {
  const page = internPageFor(state.hiredInternId);
  await visit(page, `/intern/proposals/${state.hiredProposalId}`);
  await page.getByText(EMPLOYER.companyName).first().waitFor({ timeout: 20_000 });
  await shot("intern-after-hire");
  const other = internPageFor(state.hiredInternId === state.internId ? state.intern2Id : state.internId);
  await visit(other, `/intern/proposals/${state.otherProposalId}`);
  assert.ok(!(await other.locator("body").innerText()).includes(EMPLOYER.companyName), "the other, unpaid candidate still does not see the company");
});

step("employer: pays the other offer with the month-end stipend plan, using the test flag [UI]", ["paidUpfront"], "paidMonthly", async () => {
  const page = pages.employer;
  const orderPath = `/api/employer/${state.employerId}/payment/razorpay/order`;
  await visit(page, "/employer/checkout");
  await page.getByText(/^Ready to pay/).first().waitFor();
  assert.equal(await page.getByRole("radio", { name: /Pay the whole internship now|charge due 2 days before the month.s pay date/ }).count(), 2, "one offer left, so only the two payment modes are choices");
  await settle(page);
  await page.getByRole("radio", { name: /charge due 2 days before the month.s pay date/ }).check();
  const offer = await one(`SELECT offer_details FROM proposals WHERE id = $1`, [state.otherProposalId]);
  const main = await page.locator("main").innerText();
  const fee = Number((main.match(/Hiring charge \(one-time\)\s*₹([\d,]+)/)?.[1] ?? "").replace(/,/g, ""));
  await shot("employer-checkout-monthly");

  const res = await payWithTestFlag(page, orderPath);
  assert.equal(res.status, 200, `order → ${res.status} ${JSON.stringify(res.body)}`);
  const pay = await one(`SELECT * FROM employer_payments WHERE employer_id = $1 AND status = 'paid' ORDER BY paid_at DESC LIMIT 1`, [state.employerId]);
  assert.notEqual(pay.id, state.upfrontPaymentId, "a second, separate order");
  assert.equal(pay.amount_minor, fee * 100 + Math.round(offer.offer_details.monthlyAmount * 100), "hiring charge + Month 1 charge are due now, no promo");
  assert.equal(pay.raw?.notes?.paymentMode, "hiring_fee");
  assert.deepEqual(pay.raw.notes.proposalIds, [state.otherProposalId]);
  assert.match(String(pay.invoice_number), /^\d{6}-\d{2,}$/);
  assert.notEqual(pay.invoice_number, state.upfrontInvoice, "each payment gets its own invoice number");
  const p = await one(`SELECT status FROM proposals WHERE id = $1`, [state.otherProposalId]);
  assert.equal(p.status, "hired");
  state.monthlyInvoice = pay.invoice_number;
  state.monthlyPaymentId = pay.id;
  const nums = await rows(`SELECT invoice_number FROM employer_payments WHERE employer_id = $1 AND status = 'paid' ORDER BY paid_at`, [state.employerId]);
  // DDMMYY-serial: payments of one run settle on one day, so the serial is what goes up.
  const seq = nums.map((r) => Number(String(r.invoice_number).split("-").pop()));
  assert.ok(seq[1] > seq[0], `invoice numbers go up (${nums.map((r) => r.invoice_number).join(", ")})`);
});

/* ── 8. Orders, tax invoices and the admin ledgers ────────────────────────── */

/** ₹ amount in en-IN grouping: 7688000 paise -> "76,880". */
const rupees = (minor) => (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: minor % 100 ? 2 : 0 });
const num = (text) => Number(String(text).replace(/[₹,\s]/g, "").replace("−", "-"));
const istLongDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
// The invoice itself prints dd-mm-yy (the reference PDF), not the long date.
const istInvoiceDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Asia/Kolkata" }).replace(/\//g, "-");

/** Click a "Tax invoice" button; the invoice is written to a hidden frame and printed (print is stubbed), so read that frame. */
async function readInvoice(page, invoiceNumber) {
  await page.evaluate(() => document.querySelectorAll("iframe").forEach((f) => f.remove()));
  await page.getByRole("row").filter({ hasText: invoiceNumber }).getByRole("button", { name: /tax invoice/i }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("iframe")].some((f) => f.contentDocument?.body?.innerText?.includes("INVOICE")), null, { timeout: 15_000 });
  const frame = page.frames().find((f) => f !== page.mainFrame());
  return frame.locator("body").innerText();
}

function checkInvoice(text, pay, { promoDiscountMinor = 0 } = {}) {
  assert.ok(text.includes(pay.invoice_number), "the invoice carries its number");
  const total = num(text.match(/(?:^|\n)Total\s*₹([\d,.]+)/)?.[1]);
  assert.equal(Math.round(total * 100), pay.amount_minor, "the invoice total is what was charged");
  assert.ok(text.includes(`GSTIN: ${COMPANY.gstin}`), "the buyer's GSTIN is printed");
  assert.ok(text.includes(`Place of supply: ${COMPANY.state} (${COMPANY.gstin.slice(0, 2)})`), "place of supply follows the GSTIN state");
  assert.ok(text.includes(istInvoiceDate(pay.paid_at)), `the invoice is dated in India time (${istInvoiceDate(pay.paid_at)}), like the Orders list`);
  const taxable = num(text.match(/Subtotal\s*₹([\d,.]+)\s*\n/)?.[1]);
  if (COMPANY.intra) {
    assert.match(text, /CGST 9%/);
    assert.match(text, /SGST 9%/);
    assert.doesNotMatch(text, /IGST/, "same-state buyer pays CGST + SGST, never IGST");
    const cgst = num(text.match(/CGST 9%\s*₹([\d,.]+)/)?.[1]);
    const sgst = num(text.match(/SGST 9%\s*₹([\d,.]+)/)?.[1]);
    assert.ok(Math.abs(taxable + cgst + sgst - total) < 0.011, `taxable + CGST + SGST = total (${taxable} + ${cgst} + ${sgst} vs ${total})`);
  } else {
    assert.match(text, /IGST 18%/);
    assert.doesNotMatch(text, /CGST|SGST/, "an out-of-state buyer pays IGST, never CGST + SGST");
    const igst = num(text.match(/IGST 18%\s*₹([\d,.]+)/)?.[1]);
    assert.ok(Math.abs(taxable + igst - total) < 0.011, `taxable + IGST = total (${taxable} + ${igst} vs ${total})`);
    assert.ok(Math.abs(igst - taxable * 0.18) < 0.02, "IGST is 18% of the taxable value");
  }
  if (promoDiscountMinor) assert.match(text, new RegExp(`Promo ${state.promoCode} applied\\s*[−-] ₹${rupees(promoDiscountMinor).replace(".", "\\.")}`));
  else assert.doesNotMatch(text, /Promo .* applied/);
}

step("employer: Orders totals equal what was charged, and both tax invoices are right [UI]", ["paidMonthly"], "invoicesChecked", async () => {
  const page = pages.employer;
  const pays = await rows(`SELECT * FROM employer_payments WHERE employer_id = $1 AND status = 'paid' ORDER BY paid_at`, [state.employerId]);
  assert.equal(pays.length, 2);
  const paidTotal = pays.reduce((s, p) => s + p.amount_minor, 0);

  await visit(page, "/employer/orders");
  // The summary band's "Total paid" is the sum of the paid orders (hiring fees included).
  const summary = page.getByRole("region", { name: "Payment summary" });
  await summary.getByText(`₹${rupees(paidTotal)}`, { exact: true }).first().waitFor({ timeout: 20_000 });
  assert.match(await summary.innerText(), /Across 2 hires/);
  await shot("employer-orders");
  await page.getByRole("tab", { name: /Invoices/ }).click();
  await page.getByRole("button", { name: /tax invoice/i }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: /tax invoice/i }).count(), 2);

  const [upfront, monthly] = [pays.find((p) => p.id === state.upfrontPaymentId), pays.find((p) => p.id === state.monthlyPaymentId)];
  checkInvoice(await readInvoice(page, upfront.invoice_number), upfront, { promoDiscountMinor: Math.floor((Math.round((await one(`SELECT offer_details FROM proposals WHERE id = $1`, [state.hiredProposalId])).offer_details.monthlyAmount * 100) * 10) / 100) });
  const monthlyText = await readInvoice(page, monthly.invoice_number);
  checkInvoice(monthlyText, monthly);
  assert.match(monthlyText, /Hiring charge/i, "the first invoice of a month-end hire is the hiring charge");
  assert.match(monthlyText, /Month 1 charge/i, "...plus the Month 1 charge");
  await shot("employer-invoices-tab");
});

step("admin: the ledgers list the test orders with their invoice numbers [UI]", ["invoicesChecked"], "ledgersChecked", async () => {
  const page = pages.admin;
  await visit(page, "/admin/transactions");
  // The page streams in behind a skeleton; wait for the real rows.
  await page.getByText(EMPLOYER.companyName).first().waitFor({ timeout: 45_000 }).catch(() => {});
  const text = await page.locator("main").innerText();
  assert.ok(text.includes(EMPLOYER.companyName), "the employer's payments are on /admin/transactions");
  assert.match(text, /\btest\b/i, "the gateway column shows these as test payments");
  await shot("admin-transactions");
  const internPays = await rows(`SELECT invoice_number FROM intern_payments WHERE intern_id = ANY($1) AND status = 'paid'`, [[state.internId, state.intern2Id]]);
  await visit(page, "/admin/intern-invoices");
  if (internPays[0]) await page.getByText(internPays[0].invoice_number).first().waitFor({ timeout: 45_000 }).catch(() => {});
  const inv = await page.locator("main").innerText();
  for (const r of internPays) assert.ok(inv.includes(r.invoice_number), `${r.invoice_number} is on /admin/intern-invoices`);
  await shot("admin-intern-invoices");
  await visit(page, "/admin/orders");
  await shot("admin-orders");
});

/* ── 9. Timesheets, approval, payout, earnings ────────────────────────────── */

step("intern: a timesheet cannot start before the job does; after time travel it is filled and submitted [API]", ["paidUpfront"], "timesheetId", async () => {
  const page = internPageFor(state.hiredInternId);
  // Resumable: a run that stalled after creating the sheet continues with it instead of starting over.
  const existing = await one(`SELECT id, status, entries FROM timesheets WHERE proposal_id = $1 ORDER BY created_at LIMIT 1`, [state.hiredProposalId]);
  let sheet;
  if (existing) {
    sheet = { id: existing.id, entries: existing.entries };
    own(`timesheet:${existing.id}`, existing.id);
    console.log(`[${BROWSER}] resuming with the existing timesheet (${existing.status}); the "refused before the start date" check was done by the earlier attempt`);
  } else {
    const early = await api(page, "POST", "/api/intern/timesheets", { proposalId: state.hiredProposalId });
    assert.ok(early.status >= 400 && early.status < 500, `a timesheet before the start date is refused (got ${early.status})`);

    // Time travel on our own proposal: the job started 40 days ago.
    await ownedWrite(
      state.hiredProposalId,
      `UPDATE proposals SET offer_details = jsonb_set(offer_details, '{startDate}', to_jsonb($2::text)) WHERE id = $1`,
      [state.hiredProposalId, istDate(-40)],
    );
    await visit(page, "/intern/timesheets");
    const created = await api(page, "POST", "/api/intern/timesheets", { proposalId: state.hiredProposalId });
    sheet = expectOk("POST /api/intern/timesheets", created, [201]).timesheet;
  }
  const start = (await one(`SELECT offer_details->>'startDate' AS d FROM proposals WHERE id = $1`, [state.hiredProposalId])).d;
  const entries = sheet.entries.map((e) => {
    const dow = new Date(`${e.date}T12:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    return { date: e.date, hours: weekend ? 0 : 8, note: "", status: weekend ? "Fixed off" : "Present" };
  });
  // A sheet an earlier attempt already submitted is locked: assert on it below instead of filling it again.
  if (!existing || existing.status === "draft") {
    expectOk("PATCH timesheet", await api(page, "PATCH", `/api/intern/timesheets/${sheet.id}`, { entries }));
    expectOk("POST submit", await api(page, "POST", `/api/intern/timesheets/${sheet.id}/submit`));
  }
  const ts = await one(`SELECT * FROM timesheets WHERE id = $1`, [sheet.id]);
  assert.equal(ts.status, "submitted");
  assert.equal(ts.employer_id, state.employerId);
  assert.equal(ts.entries[0].date, start, "the period starts on the joining date");
  state.timesheetId = own(`timesheet:${sheet.id}`, sheet.id);

  // Edge: a submitted sheet is locked against edits and against a second submit.
  const edit = await api(page, "PATCH", `/api/intern/timesheets/${sheet.id}`, { entries });
  assert.ok(edit.status >= 400 && edit.status < 500, `editing a submitted timesheet is refused (got ${edit.status})`);
  const resubmit = await api(page, "POST", `/api/intern/timesheets/${sheet.id}/submit`);
  assert.ok(resubmit.status >= 400 && resubmit.status < 500, `submitting twice is refused (got ${resubmit.status})`);
  await visit(page, `/intern/timesheets`);
  await shot("intern-timesheets");
});

step("employer: approves the timesheet on /employer/timesheets/[id] [UI]", ["timesheetId"], "approved", async () => {
  const page = pages.employer;
  const path = `/api/timesheets/${state.timesheetId}/decision`;
  await visit(page, `/employer/timesheets/${state.timesheetId}`);
  await shot("employer-timesheet");
  await page.getByRole("button", { name: "Approve timesheet" }).click();
  expectOk(`PATCH ${path}`, await clickFor(page, page.getByRole("button", { name: "Yes, approve and lock" }), { path, method: "PATCH" }));
  const ts = await one(`SELECT status, approved_at FROM timesheets WHERE id = $1`, [state.timesheetId]);
  assert.equal(ts.status, "approved");
  assert.ok(ts.approved_at);
  const n = await one(`SELECT 1 AS yes FROM notifications WHERE recipient_id = $1 AND type = 'timesheet_approved'`, [state.hiredInternId]);
  assert.ok(n, "the intern was notified of the approval");
  const edit = await api(internPageFor(state.hiredInternId), "PATCH", `/api/intern/timesheets/${state.timesheetId}`, { entries: [] });
  assert.ok(edit.status >= 400 && edit.status < 500, `an approved timesheet cannot be edited (got ${edit.status})`);
});

step("admin: creates a payout and marks it paid; the intern sees it on /intern/earnings [API + UI]", ["approved", "adminReady"], "payoutPaid", async () => {
  const page = pages.admin;
  const base = `/api/admin/interns/${state.hiredInternId}/payouts`;
  const AMOUNT = 734_500; // ₹7,345, under the ₹8,000 cap of either band
  const created = await api(page, "POST", base, {
    amountMinor: AMOUNT,
    currency: "INR",
    method: "bank",
    proposalId: state.hiredProposalId,
    scheduledFor: istDate(0),
    months: 1,
    opsNote: `QA run ${RUN}`,
  });
  const payout = expectOk(`POST ${base}`, created, [201]).payout;
  own(`payout:${payout.id}`, payout.id);
  const ref = `QA-UTR-${RUN}`;
  expectOk("PATCH payout paid", await api(page, "PATCH", `/api/admin/payouts/${payout.id}`, { status: "paid", referenceId: ref, opsNote: `QA run ${RUN}` }));
  const row = await one(`SELECT * FROM intern_payouts WHERE id = $1`, [payout.id]);
  assert.equal(row.status, "paid");
  assert.equal(row.reference_id, ref);
  assert.equal(row.amount_minor, AMOUNT);
  assert.ok(row.paid_at);

  const internPage = internPageFor(state.hiredInternId);
  await visit(internPage, "/intern/earnings");
  await internPage.getByText(/7,345/).first().waitFor({ timeout: 20_000 });
  await shot("intern-earnings");
  const n = await one(`SELECT 1 AS yes FROM notifications WHERE recipient_id = $1 AND type ILIKE '%payout%' OR (recipient_id = $1 AND type ILIKE '%stipend%')`, [state.hiredInternId]);
  assert.ok(n, "the intern was notified of the payout");
});

/* ── 10. Full-time offer ──────────────────────────────────────────────────── */

/** A tiny but valid one-page PDF, for the offer-letter upload. */
const PDF_BASE64 = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF\n",
).toString("base64");

step("employer: full-time offer to a hired intern, bad requests refused first [API]", ["approved"], "fteProposalId", async () => {
  const page = pages.employer;
  const path = `/api/employer/${state.employerId}/full-time-offer`;
  const up = await upload(page, { kind: "offer_letter", base64: PDF_BASE64, type: "application/pdf", name: "offer-letter.pdf" });
  const key = expectOk("POST /api/uploads (offer_letter)", up, [201]).key;
  const offer = (over = {}) => ({
    proposalId: state.hiredProposalId,
    jobTitle: "Associate Data Analyst",
    jobMode: "remote",
    jobLocationCity: "",
    jobLocationState: "",
    timezone: "Asia/Kolkata",
    shiftFrom: "10:00",
    shiftTo: "18:00",
    ctcCurrency: "INR",
    annualCtc: 600000,
    offerLetterKey: key,
    ...over,
  });
  const bad = [
    ["a CTC of zero", { annualCtc: 0 }],
    ["a negative CTC", { annualCtc: -5 }],
    ["a CTC over the cap", { annualCtc: 1_000_000_000 }],
    ["an on-site job with no city", { jobMode: "onsite" }],
    ["a one-letter job title", { jobTitle: "x" }],
    ["an offer letter key of someone else's folder", { offerLetterKey: `00000000-0000-0000-0000-000000000000/${key.split("/").pop()}` }],
    ["a proposal that was never hired", { proposalId: "00000000-0000-0000-0000-000000000000" }],
  ];
  for (const [label, over] of bad) {
    const res = await api(page, "POST", path, offer(over));
    assert.ok(res.status >= 400 && res.status < 500, `${label} is refused (got ${res.status} ${JSON.stringify(res.body).slice(0, 140)})`);
  }
  expectOk(`POST ${path}`, await api(page, "POST", path, offer()), [200, 201]);
  const p = await one(
    `SELECT id, status FROM proposals WHERE employer_id = $1 AND intern_id = $2 AND id <> $3 ORDER BY created_at DESC LIMIT 1`,
    [state.employerId, state.hiredInternId, state.hiredProposalId],
  );
  assert.ok(p, "a full-time proposal row exists");
  assert.equal(p.status, "sent");
  state.fteProposalId = own(`fte:${p.id}`, p.id);
});

step("intern: sees the full-time offer and accepts it [UI]", ["fteProposalId"], "fteAccepted", async () => {
  const page = internPageFor(state.hiredInternId);
  await visit(page, `/intern/proposals/${state.fteProposalId}`);
  await shot("intern-fte-offer");
  await page.getByRole("button", { name: /Accept the job offer/ }).click();
  await page.getByRole("checkbox", { name: /read, understood, and agreed/i }).check();
  expectOk("PATCH accept FTE", await clickFor(page, page.getByRole("button", { name: /^Accept the offer/ }), { path: `/api/proposals/${state.fteProposalId}/status`, method: "PATCH" }));
  const p = await one(`SELECT status FROM proposals WHERE id = $1`, [state.fteProposalId]);
  assert.ok(["accepted", "hired"].includes(p.status), `the full-time offer is ${p.status}`);
  await visit(page, "/intern/proposals");
  await shot("intern-proposals-after-fte");
});

/* ── 11. Notifications ────────────────────────────────────────────────────── */

step("notifications: each side has them in the database and on its page [UI]", ["fteAccepted"], "notificationsChecked", async () => {
  const hired = state.hiredInternId;
  const internTypes = (await rows(`SELECT DISTINCT type FROM notifications WHERE recipient_id = $1`, [hired])).map((r) => r.type);
  const employerTypes = (await rows(`SELECT DISTINCT type FROM notifications WHERE recipient_id = $1`, [state.employerId])).map((r) => r.type);
  assert.ok(internTypes.length >= 3, `the hired intern has several kinds of notification (${internTypes.join(", ")})`);
  assert.ok(employerTypes.length >= 2, `the employer has several kinds of notification (${employerTypes.join(", ")})`);
  const ip = internPageFor(hired);
  await visit(ip, "/intern/notifications");
  await ip.getByRole("heading", { level: 1 }).first().waitFor();
  assert.ok((await ip.locator("main").innerText()).length > 120, "the intern's notifications page has content");
  await shot("intern-notifications");
  await visit(pages.employer, "/employer/alerts");
  await pages.employer.getByRole("heading", { level: 1 }).first().waitFor();
  assert.ok((await pages.employer.locator("main").innerText()).length > 120, "the employer's alerts page has content");
  await shot("employer-alerts");
});

/* ── 12. Who may do what ──────────────────────────────────────────────────── */

step("security: roles, owners and CSRF are enforced [API + UI]", ["fteAccepted"], "securityChecked", async () => {
  const refused = (res, label) => assert.ok([401, 403, 404].includes(res.status), `${label} is refused (got ${res.status} ${JSON.stringify(res.body).slice(0, 120)})`);
  const intern = internPageFor(state.hiredInternId);
  const other = internPageFor(state.hiredInternId === state.internId ? state.intern2Id : state.internId);
  const otherInternId = state.hiredInternId === state.internId ? state.intern2Id : state.internId;
  const foreignEmployer = await one(`SELECT id FROM employers WHERE id <> $1 LIMIT 1`, [state.employerId]);

  // An intern is not an employer, and not another intern.
  refused(await api(intern, "POST", `/api/employer/${state.employerId}/payment/razorpay/order`, { currency: "INR", proposalIds: [state.hiredProposalId], mode: "upfront", paymentIndex: 0, testPay: true }), "an intern paying as an employer");
  refused(await api(intern, "POST", `/api/employer/${state.employerId}/interviews`, { internId: state.hiredInternId }), "an intern booking interviews as an employer");
  refused(await api(intern, "POST", `/api/intern/${otherInternId}/payment/razorpay/order`, { testPay: true }), "an intern paying for another intern");
  refused(await api(intern, "PATCH", `/api/proposals/${state.otherProposalId === state.hiredProposalId ? state.proposalId : state.otherProposalId}/status`, { status: "rejected" }), "an intern answering another intern's offer");
  refused(await api(intern, "PUT", `/api/admin/interns/${state.hiredInternId}/ratings`, { communication: 10, coding: 10, aptitude: 10, interview: 10 }), "an intern scoring themselves");
  // An employer is not another employer, not an intern, not an admin.
  refused(await api(pages.employer, "POST", `/api/employer/${foreignEmployer.id}/payment/razorpay/order`, { currency: "INR", proposalIds: [state.hiredProposalId], mode: "upfront", testPay: true }), "an employer paying as another company");
  refused(await api(pages.employer, "POST", `/api/intern/${state.hiredInternId}/payment/razorpay/order`, { testPay: true }), "an employer paying as an intern");
  refused(await api(pages.employer, "PUT", `/api/admin/interns/${state.hiredInternId}/ratings`, { communication: 1, coding: 1, aptitude: 1, interview: 1 }), "an employer rescoring a candidate");
  refused(await api(pages.employer, "POST", `/api/admin/promo-codes`, { code: "EVIL", discountType: "percentage", discountValue: 100, appliesTo: "both" }), "an employer creating a promo code");
  refused(await api(other, "PATCH", `/api/proposals/${state.hiredProposalId}/status`, { status: "rejected" }), "an intern answering an offer that is not theirs");

  // CSRF: a signed-in browser without the token header cannot change anything.
  const noToken = await pages.employer.evaluate(async (path) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", projectId: "x", internId: "y", listType: "cart" }) });
    return { status: r.status };
  }, "/api/employer/cart");
  assert.equal(noToken.status, 403, `a state change without the CSRF token is refused (got ${noToken.status})`);

  // Pages: the wrong role is turned away, and so is a stranger.
  for (const [page, path, label] of [[intern, "/employer/dashboard", "an intern on the employer area"], [intern, "/admin/dashboard", "an intern on the admin area"], [pages.employer, "/admin/dashboard", "an employer on the admin area"], [pages.employer, "/intern/dashboard", "an employer on the intern area"]]) {
    await page.goto(`${STAGING_URL}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    assert.ok(!new URL(page.url()).pathname.startsWith(path), `${label} is redirected (landed on ${new URL(page.url()).pathname})`);
  }
  const strangerCtx = ONE_WINDOW ? null : await browser.newContext({ baseURL: STAGING_URL, locale: "en-IN" });
  const stranger = ONE_WINDOW ? oneWindow.guest("stranger") : await strangerCtx.newPage();
  for (const path of ["/employer/dashboard", "/intern/dashboard", "/admin/dashboard", "/employer/orders", "/intern/earnings"]) {
    await stranger.goto(`${STAGING_URL}${path}`, { waitUntil: "domcontentloaded" });
    assert.match(new URL(stranger.url()).pathname, /login/, `${path} sends a signed-out visitor to sign in (landed on ${new URL(stranger.url()).pathname})`);
  }
  await stranger.goto(`${STAGING_URL}/login`, { waitUntil: "domcontentloaded" });
  const anon = await api(stranger, "POST", `/api/employer/${state.employerId}/payment/razorpay/order`, { testPay: true });
  assert.ok([401, 403].includes(anon.status), `a signed-out payment request is refused (got ${anon.status})`);
  const file = await stranger.evaluate(async () => (await fetch("/api/files/legacy/anything.pdf")).status);
  assert.ok([401, 403, 404].includes(file), `a private file is not served to a stranger (got ${file})`);
  await strangerCtx?.close();
});

step("signup: wrong codes lock out (even from the rate-limit-exempt address), duplicates are refused [API]", [], "signupEdgesChecked", async () => {
  const page = pages.admin;
  await page.goto(`${STAGING_URL}/login`, { waitUntil: "domcontentloaded" });
  const email = `${GMAIL_BASE}+ftqa-${BROWSER}-${RUN}-x@gmail.com`;
  const started = Date.now();
  const sent = await api(page, "POST", "/api/auth/signup/send-otp", { email, subjectType: "intern", purpose: "signup" });
  assert.equal(sent.status, 200, `send-otp → ${sent.status}`);
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await api(page, "POST", "/api/auth/signup/verify-otp", { email, subjectType: "intern", otp: "000000" })).status);
  assert.deepEqual(codes.slice(0, 4), [400, 400, 400, 400], `the first wrong guesses are plain misses (${codes.join(",")})`);
  assert.equal(codes[4], 429, `the fifth wrong guess locks the code (${codes.join(",")})`);
  assert.notEqual(codes[5], 200, "once locked, the code cannot be guessed on");
  void started;

  // A cooldown protects the inbox: asking for another code at once is refused.
  const again = await api(page, "POST", "/api/auth/signup/send-otp", { email, subjectType: "intern", purpose: "signup" });
  assert.equal(again.status, 429, `asking for another code at once is refused (got ${again.status})`);

  // Rules for who can register.
  // Not exercised on purpose: the employer send-otp accepts a personal mailbox and sends it a code,
  // so probing it would email a stranger.
  const work = await api(page, "POST", "/api/auth/signup/send-otp", { email: `x${RUN}@findtern.in`, subjectType: "intern", purpose: "signup" });
  assert.equal(work.status, 400, `an intern cannot register with a work address (got ${work.status})`);
  const taken = await api(page, "GET", `/api/users/exists/phone/${INTERNS[1].phone}`);
  assert.equal(taken.status, 200);
  assert.equal(taken.body?.exists, true, "a phone number already on an account is reported as taken");
  const login = await api(page, "POST", "/api/auth/login", { email: INTERNS[1].email, password: "definitely-wrong" });
  assert.equal(login.status, 401, `a wrong password is refused (got ${login.status})`);
});

step("employer: signing out ends the session, and the back button does not bring the page back [UI]", ["employerId"], "logoutChecked", async () => {
  const page = pages.employer;
  await visit(page, "/employer/dashboard");
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await page.waitForURL(/\/login|\/$/, { timeout: 20_000 });
  await page.goBack();
  await page.waitForLoadState("load");
  await page.goto(`${STAGING_URL}/employer/dashboard`, { waitUntil: "domcontentloaded" });
  assert.match(new URL(page.url()).pathname, /login/, "after signing out, the dashboard sends the visitor to sign in");
  const res = await api(page, "POST", `/api/employer/${state.employerId}/payment/razorpay/order`, { testPay: true });
  assert.ok([401, 403].includes(res.status), `the old session cannot pay (got ${res.status})`);
  // Sign back in with the password, through the form, so the session is real again.
  await visit(page, "/login?as=employer");
  await fillForm(page, [
    [page.getByLabel("Email", { exact: true }), EMPLOYER.email],
    [page.locator("#password"), PASSWORD],
  ]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/employer\/dashboard/, { timeout: 40_000 });
});

/* ── 12b. A US company: New York time, DST, dollars; a free-band candidate; offers edited and withdrawn ── */

const NY = "America/New_York";

/** The UTC instant of a wall-clock "YYYY-MM-DDTHH:MM" in `tz`, worked out here so it checks the app's own conversion. */
function zonedToUtc(local, tz) {
  const wall = Date.parse(`${local}:00Z`);
  const offsetAt = (t) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(t))
        .filter((x) => x.type !== "literal")
        .map((x) => [x.type, Number(x.value)]),
    );
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t);
}
const clockIst = (d) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d);
const dayIst = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const dmy = (iso) => iso.split("-").reverse().join("/");
/** "7:30 pm – 4:30 am (next day) IST": what an intern reads for a New York shift on `day`. */
function istRange(day, from, to, tz) {
  const start = zonedToUtc(`${day}T${from}`, tz);
  let end = zonedToUtc(`${day}T${to}`, tz);
  if (end <= start) end = new Date(end.getTime() + 86_400_000);
  return `${clockIst(start)} – ${clockIst(end)}${dayIst(end) !== dayIst(start) ? " (next day)" : ""} IST`;
}
/** The next quarter hour after `ms` in `tz`, then +1 h and +2 h, as "YYYY-MM-DDTHH:MM" (the booking form's own rule, re-derived). */
function suggestedWalls(ms, tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(ms))
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, Number(x.value)]),
  );
  const quarter = 15 * 60_000;
  const base = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const first = (Math.floor(base / quarter) + 1) * quarter;
  return [first, first + 3_600_000, first + 7_200_000].map((e) => new Date(e).toISOString().slice(0, 16));
}

/** Type into a field twice, a beat apart, so React has seen the value even if the first keystrokes beat hydration. */
async function typeInto(locator, value) {
  const page = locator.page();
  await page.waitForLoadState("load");
  for (let attempt = 0; attempt < 4; attempt++) {
    await locator.fill("");
    await page.waitForTimeout(300);
    await locator.fill(value);
    await page.waitForTimeout(400);
    if ((await locator.inputValue()) === value) return;
  }
  throw new Error(`The field would not keep "${value}"`);
}

/** Compose an offer in the form, agree to the policy, send it; resolves to the new proposal's id. */
async function composeAndSend(page, { internId, startIso, message, extra }) {
  await visit(page, `/employer/send-proposal?intern=${internId}&project=${state.project2Id}`);
  await page.locator("#startDate").waitFor();
  await typeInto(page.locator("#startDate"), dmy(startIso));
  await typeInto(page.locator("#message"), message);
  if (extra) await typeInto(page.locator("#additionalInfo"), extra);
  await page.getByRole("button", { name: "Review and send" }).filter({ visible: true }).first().click();
  await page.getByRole("checkbox", { name: /I have read and agree/i }).check();
  const sent = await clickFor(page, page.getByRole("button", { name: "Agree and send" }), { path: `/api/employer/${state.employer2Id}/proposals`, method: "POST" });
  assertNotRateLimited("send offer", sent);
  const body = expectOk("POST proposals (UI)", sent, [201]);
  await page.waitForURL(/\/employer\/proposals(\?|$)/, { timeout: 30_000 });
  return body.proposal.id;
}

step("interns 3 (score 8) and 4 (score 4, free band): sign up, onboard, pay the fee with the test flag, get scored [UI + API]", ["adminReady"], "usInternsReady", async () => {
  state.intern3Id = await signUpIntern(pages.intern3, INTERNS[3]);
  state.intern4Id = await signUpIntern(pages.intern4, INTERNS[4]);
  await onboardIntern(pages.intern3, INTERNS[3]);
  // Intern 4 says "on-site" and names a city: the free band must still only ever be offered remote work.
  await onboardIntern(pages.intern4, INTERNS[4], { locationTypes: ["onsite"], preferredLocations: ["Pune, Maharashtra"] });
  for (const [id, page] of [[state.intern3Id, pages.intern3], [state.intern4Id, pages.intern4]]) {
    const res = await api(page, "POST", `/api/intern/${id}/payment/razorpay/order`, { testPay: true });
    assertNotRateLimited("order", res);
    assert.equal(res.status, 200, `order → ${res.status} ${JSON.stringify(res.body)}`);
    assert.equal(res.body?.free, true);
  }
  for (const [id, rating] of [[state.intern3Id, 8], [state.intern4Id, 4]]) {
    await visit(pages.admin, `/admin/interns/${id}`);
    const res = await api(pages.admin, "PUT", `/api/admin/interns/${id}/ratings`, { communication: rating, coding: rating, aptitude: rating, interview: rating });
    const body = expectOk(`PUT ratings ${id}`, res);
    assert.equal(body.findternScore, rating);
    const ob = await one(`SELECT extra_data FROM intern_onboarding WHERE user_id = $1`, [id]);
    assert.equal(ob.extra_data.approvalStatus, "Approved", `a score of ${rating} is approved and visible`);
  }
  await shot("us-interns-ready");
});

step("US employer: signs up, picks United States on the onboarding form and is given New York time [UI]", [], "project2Id", async () => {
  const page = pages.employer2;
  state.employer2Id = await signUpEmployer(page, EMPLOYER2);
  await visit(page, "/employer/onboarding");
  await page.locator("#country").waitFor();
  // The form starts on India (a state dropdown). A choice made before the page hydrates is lost, so choose
  // again until outside India the state becomes a plain text box.
  const stateBox = page.locator("input#state");
  for (let attempt = 0; attempt < 6 && !(await stateBox.isVisible()); attempt++) {
    await page.locator("#country").selectOption("United States");
    await stateBox.waitFor({ state: "visible", timeout: 2500 }).catch(() => {});
  }
  await typeInto(page.locator("#state"), "New York");
  await typeInto(page.locator("#city"), "New York");
  assert.match(await page.getByText(/Your timezone:/).innerText(), /America\/New_York/, "the company's location sets its timezone");
  await shot("us-employer-onboarding");

  const base = {
    companyName: EMPLOYER2.companyName,
    websiteUrl: `https://${EMPLOYER2.email.split("@")[1]}`,
    logoUrl: null,
    companySize: "11-50",
    country: "United States",
    state: "New York",
    city: "New York",
    primaryContactName: EMPLOYER2.name,
    primaryContactRole: "Founder",
    countryCode: "+1",
    phoneNumber: `2125551${String(digits).slice(-3)}`,
    escalationContactName: "Sam Ops",
    escalationContactRole: "Operations lead",
    escalationContactEmail: `ops+ftqa-${RUN}-us@findtern.in`,
    escalationContactCountryCode: "+1",
    escalationContactPhone: EMPLOYER2.escalationPhone,
    billingPincode: "",
    gstNumber: "",
  };
  const path = `/api/employer/${state.employer2Id}`;
  expectOk(`PATCH ${path}`, await api(page, "PATCH", path, base));
  const project = await api(page, "POST", `${path}/projects`, {
    projectName: `Growth analytics ${RUN}`,
    skills: ["Python", "SQL", "React", "Data Analysis"],
    scopeOfWork: "upto-60",
    fullTimeOffer: false,
    locationType: "remote",
    preferredLocations: [],
    pincode: "",
    city: "",
    state: "",
    timezone: NY,
  });
  const body = expectOk(`POST ${path}/projects`, project, [201]);
  const emp = await one(`SELECT * FROM employers WHERE id = $1`, [state.employer2Id]);
  assert.equal(emp.country, "United States");
  assert.equal(emp.onboarding_completed, true);
  state.project2Id = own(`project:us-${RUN}`, body.project.id);
  await visit(page, "/employer/dashboard");
});

step("US employer: shortlists both, books intern 3 in the cart form (default times in New York time), intern 3 reads them in IST and picks [UI + API]", ["project2Id", "usInternsReady"], "usSlotsPicked", async () => {
  const page = pages.employer2;
  for (const id of [state.intern3Id, state.intern4Id]) {
    expectOk("POST /api/employer/cart (add)", await api(page, "POST", "/api/employer/cart", { action: "add", projectId: state.project2Id, internId: id, listType: "cart" }));
  }
  await visit(page, "/employer/cart");
  await page.getByText(/\b2 candidates\b/i).first().waitFor(); // the shortlist heading counts distinct people
  // The nearest block around the "IZ" initials that holds a Book meeting button is that candidate's card.
  const card3 = page.locator('xpath=(//*[normalize-space(text())="IZ"])[1]/ancestor::*[.//button[contains(., "Book meeting")]][1]');
  const before = Date.now();
  await settle(page);
  const zoneSelect = page.locator("#cart-timezone");
  // A click before the page has hydrated is dropped, so click again until the booking form opens.
  for (let attempt = 0; attempt < 6 && !(await zoneSelect.isVisible()); attempt++) {
    await card3.getByRole("button", { name: "Book meeting" }).click();
    await zoneSelect.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  }
  await zoneSelect.waitFor();
  assert.equal(await zoneSelect.inputValue(), NY, "the meeting form starts in the company's own timezone (New York)");
  // The suggested times: the next quarter hour, then one and two hours later, in New York time.
  const shown = [];
  for (const n of [1, 2, 3]) {
    const date = await page.getByRole("textbox", { name: `Slot ${n} date`, exact: true }).inputValue();
    const time = await page.getByLabel(`Slot ${n} time`).inputValue();
    shown.push(`${date.split("/").reverse().join("-")}T${time}`);
  }
  const wanted = [suggestedWalls(before, NY), suggestedWalls(Date.now(), NY)];
  assert.ok(wanted.some((w) => w.join() === shown.join()), `suggested slots ${shown.join(", ")} are the next quarter hour and the two after it in New York time (${wanted[0].join(", ")})`);
  state.slot1Wall = shown[0];
  const res = await clickFor(page, page.getByRole("button", { name: "Send meeting request" }), { path: `/api/employer/${state.employer2Id}/interviews`, method: "POST" });
  const sent = expectOk("POST interviews (UI)", res, [201]);
  const iv = await one(`SELECT * FROM interviews WHERE id = $1`, [sent.interview.id]);
  state.interview3Id = own(`interview:${state.intern3Id}`, iv.id);
  assert.equal(iv.slot1.toISOString(), zonedToUtc(shown[0], NY).toISOString(), "the stored time is the New York wall time converted to UTC, DST included");
  assert.equal(iv.slot3.toISOString(), zonedToUtc(shown[2], NY).toISOString());

  // Intern 4: the same, through the endpoint the form calls.
  const day = istDate(2);
  const booked = expectOk("POST interviews (intern 4)", await api(page, "POST", `/api/employer/${state.employer2Id}/interviews`, {
    internId: state.intern4Id, projectId: state.project2Id, timezone: NY, slot1: `${day}T09:00`, slot2: `${day}T10:00`, slot3: `${day}T11:00`,
  }), [201]);
  const iv4 = await one(`SELECT * FROM interviews WHERE id = $1`, [booked.interview.id]);
  assert.equal(iv4.slot1.toISOString(), zonedToUtc(`${day}T09:00`, NY).toISOString());
  state.interview4Id = own(`interview:${state.intern4Id}`, iv4.id);

  // Intern 3 sees every time in India time and says where it was converted from.
  const ip = pages.intern3;
  await visit(ip, "/intern/interviews");
  const body = await ip.locator("body").innerText();
  assert.match(body, /converted from the company's New York time/i, "the intern is told the times are converted from New York");
  assert.ok(!body.includes(EMPLOYER2.companyName), "the company is hidden before the hire");
  const offered = await ip.getByRole("list", { name: "Offered times" }).innerText();
  assert.ok(offered.toLowerCase().includes(clockIst(iv.slot1).toLowerCase()), `the first offered time reads ${clockIst(iv.slot1)} in India (got ${offered.replace(/\s+/g, " ")})`);
  await shot("us-intern3-converted-times");
  const confirm = ip.getByRole("button", { name: /^Book (?!this time)/ });
  for (let attempt = 0; attempt < 6 && !(await confirm.isVisible()); attempt++) {
    await ip.getByRole("list", { name: "Offered times" }).getByRole("button").first().click();
    await confirm.waitFor({ state: "visible", timeout: 2500 }).catch(() => {});
  }
  expectOk("select-slot (intern 3)", await clickFor(ip, confirm, { path: `/api/interviews/${state.interview3Id}/select-slot`, method: "POST" }));
  expectOk("select-slot (intern 4)", await api(pages.intern4, "POST", `/api/interviews/${state.interview4Id}/select-slot`, { slot: 1 }));
  assert.equal((await one(`SELECT status FROM interviews WHERE id = $1`, [state.interview3Id])).status, "scheduled");
});

step("US employer: the offer is held until the meeting happens; Mark completed (live) and Mark missed then Feedback (over) release it [UI + API]", ["usSlotsPicked"], "usInterviewsDone", async () => {
  const page = pages.employer2;
  const composer = `/employer/send-proposal?intern=${state.intern3Id}&project=${state.project2Id}`;
  await visit(page, composer);
  await page.getByText(/hasn't happened yet/i).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "Review and send" }).count(), 0, "no way to send the offer while the meeting is still ahead: the page says 'Meeting first' instead of the form");
  assert.ok(await page.getByRole("link", { name: /Open the schedule/ }).isVisible(), "and points to the schedule");
  const early = await api(page, "POST", `/api/employer/${state.employer2Id}/proposals`, {
    internId: state.intern3Id, projectId: state.project2Id, flowType: "interview_first", agreedToPolicy: true, roleTitle: "Growth analyst", jd: "Build funnel dashboards for the growth team.",
    mode: "remote", startDate: istDate(30), duration: "1m", weeklySchedule: "mon_fri", shiftFrom: "09:00", shiftTo: "18:00", timezone: NY, laptop: "company", paidLeavesPerMonth: 2, skills: ["SQL"],
  });
  assert.equal(early.status, 409, `an offer before the meeting is refused (got ${early.status} ${JSON.stringify(early.body).slice(0, 140)})`);

  // Intern 3: the booked half hour is running now, so the schedule offers Mark completed.
  const live = (id) => ownedWrite(id, `UPDATE interviews SET slot1 = (now() AT TIME ZONE 'UTC') - interval '5 minutes', slot2 = (now() AT TIME ZONE 'UTC') + interval '1 day', slot3 = (now() AT TIME ZONE 'UTC') + interval '2 days', selected_slot = 1 WHERE id = $1`, [id]);
  await live(state.interview3Id);
  await visit(page, "/employer/schedule");
  await page.getByRole("button", { name: "Mark completed" }).first().waitFor({ timeout: 20_000 });
  await shot("us-schedule-live");
  await page.getByRole("button", { name: "Mark completed" }).first().click();
  await page.getByText(/Marked as completed\. You can send a proposal now\./).waitFor({ timeout: 20_000 });
  assert.equal((await one(`SELECT status FROM interviews WHERE id = $1`, [state.interview3Id])).status, "completed");

  // Intern 4: the meeting is long over; the employer marks the candidate missed, then still leaves feedback.
  await ownedWrite(state.interview4Id, `UPDATE interviews SET slot1 = (now() AT TIME ZONE 'UTC') - interval '3 hours', slot2 = (now() AT TIME ZONE 'UTC') - interval '2 hours 30 minutes', slot3 = (now() AT TIME ZONE 'UTC') - interval '2 hours', selected_slot = 1 WHERE id = $1`, [state.interview4Id]);
  const missed = await api(page, "POST", `/api/interviews/${state.interview4Id}/mark-missed`, {});
  assert.equal(missed.status, 200, `Mark missed → ${missed.status} ${JSON.stringify(missed.body)}`);
  assert.equal((await one(`SELECT status FROM interviews WHERE id = $1`, [state.interview4Id])).status, "missed");
  expectOk("feedback after missed", await api(page, "POST", `/api/interviews/${state.interview4Id}/feedback`, { feedback: "Did not join the call; spoke later, solid basics." }));
  // Feedback with line breaks reaches the intern whole, with its breaks (bug sheet 30 Oct).
  expectOk("feedback with line breaks", await api(page, "POST", `/api/interviews/${state.interview3Id}/feedback`, { feedback: "Line one: clear communicator.\nLine two: strong SQL." }));
  const ip = pages.intern3;
  await visit(ip, "/intern/interviews");
  const fb = ip.getByText(/Line one: clear communicator/);
  await fb.waitFor({ timeout: 20_000 });
  assert.match(await fb.innerText(), /Line two: strong SQL/, "the second line of the feedback is shown to the intern, not cut at the first break");
  assert.equal(await fb.evaluate((el) => getComputedStyle(el).whiteSpace), "pre-line", "and its line breaks are kept");
  await shot("us-intern3-feedback");
  state.usInterviewsDone = true;
});

step("US employer composes the offer in the form: calendar, no flexible hours, New York time and DST in the IST preview, hours from the working week [UI]", ["usInterviewsDone"], "usOfferId", async () => {
  const page = pages.employer2;
  await visit(page, `/employer/send-proposal?intern=${state.intern3Id}&project=${state.project2Id}`);
  await page.locator("#startDate").waitFor();
  await page.waitForLoadState("load");
  const text = await page.locator("main").innerText();
  assert.doesNotMatch(text, /flexible/i, "the flexible-hours option is gone from the composer");
  assert.equal(await page.locator("#timezone").inputValue(), NY, "the offer's timezone is the company's (New York)");
  assert.match(text, /\$/, "a US company is quoted in dollars");
  assert.doesNotMatch(text, /₹/, "and never in rupees");

  // The calendar: its button is there and the picker's choice lands in the field as DD/MM/YYYY.
  await page.locator('button[aria-label^="Open calendar"]').first().waitFor({ state: "visible" });
  const pick = async (iso) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.locator('input[type="date"]').first().fill(iso);
      await page.waitForTimeout(300);
      if ((await page.locator("#startDate").inputValue()) === dmy(iso)) return;
    }
    throw new Error(`The calendar's choice ${iso} never reached the start date field`);
  };
  // Daylight saving: 9am-6pm in New York is 7:30 pm in India after the clocks go back (winter) and 6:30 pm after they go forward.
  const winter = istDate(10);
  const summer = "2027-03-16";
  await pick(winter);
  const previewFor = async () => (await page.getByText(/The intern sees these as/).first().innerText()).replace(/\s+/g, " ");
  assert.ok((await previewFor()).includes(istRange(winter, "09:00", "18:00", NY)), `winter preview is ${istRange(winter, "09:00", "18:00", NY)} (got ${await previewFor()})`);
  await pick(summer);
  assert.ok((await previewFor()).includes(istRange(summer, "09:00", "18:00", NY)), `summer preview is ${istRange(summer, "09:00", "18:00", NY)} (got ${await previewFor()})`);
  assert.notEqual(istRange(winter, "09:00", "18:00", NY), istRange(summer, "09:00", "18:00", NY), "the two seasons differ by an hour, so DST is in play");
  await shot("us-composer-dst");

  // Hours come from the working week: 22 days (Mon-Fri) or 26 days (Mon-Sat), less paid leave, at 8 h a day.
  await page.locator("#paidLeaves").selectOption("2");
  await page.locator("#weeklySchedule").selectOption("mon_fri");
  assert.equal(await page.getByLabel("Hours per month").inputValue(), "160 h");
  await page.locator("#weeklySchedule").selectOption("mon_sat");
  assert.equal(await page.getByLabel("Hours per month").inputValue(), "192 h");
  await page.locator("#weeklySchedule").selectOption("mon_fri");

  // A start date in the past is refused with a reason.
  await typeInto(page.locator("#startDate"), "01/01/2020");
  await typeInto(page.locator("#message"), "x".repeat(40));
  await page.getByRole("button", { name: "Review and send" }).filter({ visible: true }).first().click();
  await page.getByText(/Pick a start date after today/i).first().waitFor({ timeout: 10_000 });

  const start = istDate(10);
  state.usStart = start;
  state.usOfferId = own("proposal:us-intern3", await composeAndSend(page, {
    internId: state.intern3Id,
    startIso: start,
    message: "Build funnel dashboards for the growth team, owning the weekly metrics review.",
    extra: "No client data on personal devices.",
  }));
  assert.match(new URL(page.url()).pathname, /^\/employer\/proposals$/, "after sending, the employer lands on the proposals list, not back on the composer");
  const list = await page.locator("main").innerText();
  assert.ok(list.includes("Growth analytics") || /IZ/.test(list), "the sent offer is listed");
  await shot("us-proposals-list");

  const p = await one(`SELECT * FROM proposals WHERE id = $1`, [state.usOfferId]);
  assert.equal(p.status, "sent");
  assert.equal(p.currency, "USD");
  assert.equal(p.offer_details.timezone, NY);
  assert.equal(p.offer_details.monthlyHours, 160);
  assert.equal(p.offer_details.monthlyAmount, Math.round(p.offer_details.hourlyRate * p.offer_details.monthlyHours * 100) / 100);
  assert.match(String(p.offer_details.jd ?? p.offer_details.message ?? ""), /No client data on personal devices/, "the 'anything else' note is stored with the offer");
});

step("intern 3 reads the offer: IST hours, joining date, stipend is the fixed band figure in rupees, extra note, countdown; accepts [UI]", ["usOfferId"], "usAccepted", async () => {
  const page = pages.intern3;
  await visit(page, `/intern/proposals/${state.usOfferId}`);
  const body = await page.locator("body").innerText();
  const p = await one(`SELECT offer_details FROM proposals WHERE id = $1`, [state.usOfferId]);
  assert.ok(!body.includes(EMPLOYER2.companyName), "the company is hidden before the hire");
  // The intern's page writes it as "7:30 PM - 4:30 AM IST"; the clock times, worked out here, must be the same.
  const shiftFrom = clockIst(zonedToUtc(`${state.usStart}T09:00`, NY));
  const shiftTo = clockIst(zonedToUtc(`${state.usStart}T18:00`, NY));
  assert.match(body.replace(/\s+/g, " "), new RegExp(`${shiftFrom}\\s*[-–]\\s*${shiftTo}\\s*IST`, "i"), `the intern reads the New York shift 9-6 as ${shiftFrom} - ${shiftTo} IST`);
  assert.match(body, /No client data on personal devices/, "the employer's extra note is visible to the intern");
  assert.ok(body.includes(new Date(`${state.usStart}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })) || body.includes(dmy(state.usStart)) || /Joining date/i.test(body), "the joining date is shown");
  // The intern sees the fixed band stipend in rupees (score 8+: ₹15,000), whatever the dollar amount.
  assert.equal(p.offer_details.internStipendMonthly, 15000, "the offer carries the fixed stipend");
  assert.ok(body.includes("15,000"), "the stipend shown is the fixed ₹15,000");
  const countdown = await page.locator('[data-testid="offer-countdown"]').first().innerText();
  const closes = Date.parse(`${state.usStart}T00:00:00+05:30`);
  const days = Math.floor((closes - Date.now()) / 86_400_000);
  assert.match(countdown, new RegExp(`^(${days}|${days + 1}|${days - 1}) days? left to answer`), `the countdown counts down to the joining day (got "${countdown}", expected about ${days} days)`);
  await shot("us-intern3-offer");
  await page.getByRole("button", { name: "Accept this offer" }).click();
  await page.getByRole("checkbox", { name: /intern terms/i }).check();
  expectOk("accept offer", await clickFor(page, page.getByRole("button", { name: "Yes, accept" }), { path: `/api/proposals/${state.usOfferId}/status`, method: "PATCH" }));
  assert.equal((await one(`SELECT status FROM proposals WHERE id = $1`, [state.usOfferId])).status, "accepted");
});

step("free-band intern 4: the composer offers remote only, edits and withdrawals work before and after acceptance [UI + API]", ["usInterviewsDone"], "usFreeFlow", async () => {
  const page = pages.employer2;
  // A resumed run may have left an open offer between these two accounts from the attempt that failed: close it first.
  for (const left of await rows(`SELECT id FROM proposals WHERE employer_id = $1 AND intern_id = $2 AND status IN ('sent', 'accepted')`, [state.employer2Id, state.intern4Id])) {
    expectOk("withdraw leftover offer", await api(page, "PATCH", `/api/proposals/${left.id}/status`, { status: "withdrawn" }));
  }
  const composer = `/employer/send-proposal?intern=${state.intern4Id}&project=${state.project2Id}`;
  await visit(page, composer);
  await page.locator("#startDate").waitFor();
  const main = await page.locator("main").innerText();
  assert.match(main, /free Standard band/i, "the composer says why only remote is offered");
  assert.equal(await page.getByRole("button", { name: /^(Remote|Hybrid|On-site)$/ }).count(), 1, "only Remote can be chosen");
  assert.doesNotMatch(main, /flexible/i);
  assert.doesNotMatch(main, /\$0(\.00)?(?!\d)/, "a free candidate shows 'Free', not $0");
  await shot("us-free-band-composer");

  const offer = (over = {}) => ({
    internId: state.intern4Id, projectId: state.project2Id, flowType: "interview_first", agreedToPolicy: true, roleTitle: "Support analyst intern", jd: "Triage and tag support tickets for the growth team.",
    mode: "remote", startDate: istDate(12), duration: "1m", weeklySchedule: "mon_fri", shiftFrom: "09:00", shiftTo: "18:00", timezone: NY, laptop: "company", paidLeavesPerMonth: 0, skills: ["SQL"], ...over,
  });
  const path = `/api/employer/${state.employer2Id}/proposals`;
  const hybrid = await api(page, "POST", path, offer({ mode: "hybrid", city: "Pune", state: "Maharashtra", officeDays: 2, homeDays: 3 }));
  assert.equal(hybrid.status, 400, `a hybrid offer to a free-band candidate is refused (got ${hybrid.status})`);
  assert.match(JSON.stringify(hybrid.body), /remote work only/i);
  const onsite = await api(page, "POST", path, offer({ mode: "onsite", city: "Pune", state: "Maharashtra" }));
  assert.equal(onsite.status, 400, `an on-site offer is refused too (got ${onsite.status})`);

  state.usFreeOfferId = own("proposal:us-intern4", await composeAndSend(page, { internId: state.intern4Id, startIso: istDate(12), message: "Triage and tag support tickets for the growth team every week.", extra: "" }));

  // Edit it while it is still unanswered, in the form: no flexible-hours box, the calendar is there, and saving tells the intern.
  await visit(page, `/employer/proposal/${state.usFreeOfferId}?edit=1`);
  await page.getByRole("button", { name: "Save changes" }).waitFor();
  assert.doesNotMatch(await page.locator("main").innerText(), /flexible/i, "the edit form has no flexible-hours option either");
  assert.ok(await page.locator('button[aria-label^="Open calendar"]').first().isVisible(), "the edit form has the calendar too");
  const edited = "Triage and tag support tickets, then write the weekly summary for the growth team.";
  await typeInto(page.getByLabel("Job description"), edited);
  expectOk("edit offer (UI)", await clickFor(page, page.getByRole("button", { name: "Save changes" }), { path: `/api/proposals/${state.usFreeOfferId}`, method: "PATCH" }));
  const after = await one(`SELECT status, offer_details FROM proposals WHERE id = $1`, [state.usFreeOfferId]);
  assert.equal(after.status, "sent", "an edited offer is still open");
  assert.match(JSON.stringify(after.offer_details), /write the weekly summary/);

  // The intern accepts; the company may still withdraw until it has paid, and the intern is told.
  expectOk("accept (intern 4)", await api(pages.intern4, "PATCH", `/api/proposals/${state.usFreeOfferId}/status`, { status: "accepted", agreedToTerms: true }));
  await visit(page, `/employer/proposal/${state.usFreeOfferId}`);
  await page.getByRole("button", { name: "Withdraw offer" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText(/accepted this offer/i).waitFor();
  expectOk("withdraw after acceptance (UI)", await clickFor(page, dialog.getByRole("button", { name: "Yes, withdraw the offer" }), { path: `/api/proposals/${state.usFreeOfferId}/status`, method: "PATCH" }));
  assert.equal((await one(`SELECT status FROM proposals WHERE id = $1`, [state.usFreeOfferId])).status, "withdrawn");
  await visit(pages.intern4, `/intern/proposals/${state.usFreeOfferId}`);
  assert.equal(await pages.intern4.getByRole("button", { name: /Accept this offer/ }).count(), 0, "a withdrawn offer cannot be answered any more");
  await shot("us-free-withdrawn");
});

step("US employer pays in dollars with the test flag; Orders and the tax invoice are in USD with no GST [UI]", ["usAccepted"], "usPaid", async () => {
  const page = pages.employer2;
  const orderPath = `/api/employer/${state.employer2Id}/payment/razorpay/order`;
  await visit(page, "/employer/checkout");
  await page.getByText(/^Ready to pay/).first().waitFor();
  const main = await page.locator("main").innerText();
  assert.match(main, /\$/, "checkout is in dollars");
  assert.doesNotMatch(main, /₹|GST/, "no rupees and no GST for a US company");
  assert.match(main, /Hiring charge \(one-time\)/, "the one-time hiring fee is a line of its own");
  assert.doesNotMatch(main, /upfront discount/i, "there is no upfront discount any more");
  await settle(page);
  await page.getByRole("radio", { name: /charge due 2 days before the month.s pay date/ }).check();
  await shot("us-checkout");
  const res = await payWithTestFlag(page, orderPath);
  assert.equal(res.status, 200, `order → ${res.status} ${JSON.stringify(res.body)}`);
  const pay = await one(`SELECT * FROM employer_payments WHERE employer_id = $1 AND status = 'paid' ORDER BY paid_at DESC LIMIT 1`, [state.employer2Id]);
  assert.equal(pay.currency, "USD");
  assert.equal(pay.gateway, "test");
  assert.match(String(pay.invoice_number), /^\d{6}-\d{2,}$/);
  const offer = await one(`SELECT offer_details FROM proposals WHERE id = $1`, [state.usOfferId]);
  assert.ok(pay.amount_minor > 0 && pay.amount_minor < Math.round(offer.offer_details.monthlyAmount * 100), "only the hiring charge was charged, not the first month");
  assert.equal((await one(`SELECT status FROM proposals WHERE id = $1`, [state.usOfferId])).status, "hired");
  state.usPaymentId = pay.id;

  await visit(page, "/employer/orders");
  await page.getByRole("tab", { name: /Invoices/ }).click();
  await page.getByRole("button", { name: /tax invoice/i }).first().waitFor();
  const text = await readInvoice(page, pay.invoice_number);
  assert.ok(text.includes(pay.invoice_number));
  assert.doesNotMatch(text, /IGST|CGST|SGST/, "no Indian GST on a US company's invoice");
  const total = text.match(/(?:^|\n)Total\s*(?:US\$|USD|\$)\s*([\d,.]+)/)?.[1];
  assert.ok(total, `the invoice has a dollar total (got: ${text.replace(/\s+/g, " ").slice(0, 400)})`);
  assert.equal(Math.round(Number(total.replace(/,/g, "")) * 100), pay.amount_minor, "the invoice total is what was charged");
  await shot("us-invoice-tab");
});

step("US employer: a full-time offer in dollars; the intern accepts [API + UI]", ["usPaid"], "usFteAccepted", async () => {
  const page = pages.employer2;
  const up = await upload(page, { kind: "offer_letter", base64: PDF_BASE64, type: "application/pdf", name: "offer-letter.pdf" });
  const key = expectOk("POST /api/uploads (offer_letter)", up, [201]).key;
  const path = `/api/employer/${state.employer2Id}/full-time-offer`;
  const usd = () => api(page, "POST", path, {
    proposalId: state.usOfferId, jobTitle: "Growth Analyst", jobMode: "remote", jobLocationCity: "", jobLocationState: "", timezone: NY, shiftFrom: "09:00", shiftTo: "18:00",
    ctcCurrency: "USD", annualCtc: 60000, offerLetterKey: key,
  });
  // A dollar offer needs Findtern's International FTE approval: refused first, then the company applies and an admin approves.
  // (A resumed run adopts the offer an earlier attempt already sent, instead of sending a second one.)
  const sentBefore = await one(`SELECT id FROM proposals WHERE employer_id = $1 AND intern_id = $2 AND id <> $3`, [state.employer2Id, state.intern3Id, state.usOfferId]);
  if (!sentBefore) {
    const before = await usd();
    assert.equal(before.status, 403, `a USD full-time offer is refused until approved (got ${before.status} ${JSON.stringify(before.body)})`);
    expectOk("apply for International FTE", await api(page, "POST", `/api/employer/${state.employer2Id}/international-fte`, {}));
    assert.equal((await one(`SELECT international_fte_status AS s FROM employers WHERE id = $1`, [state.employer2Id])).s, "applied");
    assert.equal((await usd()).status, 403, "applying is not the same as being approved");
    expectOk("admin approves International FTE", await api(pages.admin, "PATCH", `/api/admin/companies/${state.employer2Id}`, { internationalFteStatus: "approved" }));
    expectOk(`POST ${path}`, await usd(), [200, 201]);
  }
  const p = await one(`SELECT id, status, currency FROM proposals WHERE employer_id = $1 AND intern_id = $2 AND id <> $3 ORDER BY created_at DESC LIMIT 1`, [state.employer2Id, state.intern3Id, state.usOfferId]);
  assert.ok(p, "a full-time proposal row exists");
  assert.equal(p.status, "sent");
  state.usFteId = own(`fte:${p.id}`, p.id);
  const ip = pages.intern3;
  await visit(ip, `/intern/proposals/${state.usFteId}`);
  await shot("us-intern3-fte");
  if ((await one(`SELECT status FROM proposals WHERE id = $1`, [state.usFteId])).status !== "sent") {
    console.log("[us full-time] the offer was already accepted by an earlier attempt; the click is not repeated");
    return;
  }
  await settle(ip);
  const agree = ip.getByRole("checkbox", { name: /read, understood, and agreed/i });
  for (let attempt = 0; attempt < 6 && !(await agree.isVisible()); attempt++) {
    await ip.getByRole("button", { name: /Accept the job offer/ }).click();
    await agree.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  }
  await agree.check();
  expectOk("accept FTE", await clickFor(ip, ip.getByRole("button", { name: /^Accept the offer/ }), { path: `/api/proposals/${state.usFteId}/status`, method: "PATCH" }));
  assert.ok(["accepted", "hired"].includes((await one(`SELECT status FROM proposals WHERE id = $1`, [state.usFteId])).status));
});

/* ── 13. Every page a role can reach, at 1440 and 390: HTTP, overflow, accessibility ───── */

const CRAWL_OUT = join(OUT, "crawl");
mkdirSync(CRAWL_OUT, { recursive: true });
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const crawlReport = [];
/** Accessibility rules we have decided to live with, each with its reason. None yet. */
const KNOWN_AXE = new Set();

/** The pages linked from a role's own navigation, plus the ones this run created. */
async function routesFor(page, prefix, start, extra) {
  await visit(page, start);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1000);
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  const found = hrefs
    .filter((h) => h && h.startsWith(`/${prefix}/`) && !h.includes("/api/"))
    .map((h) => h.split("#")[0].split("?")[0].replace(/\/$/, ""))
    .filter((h) => !UUID.test(h));
  return [...new Set([start, ...found, ...extra])];
}

async function auditPage(page, role, path) {
  const out = [];
  for (const [label, size] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]]) {
    await page.setViewportSize(size);
    const startedAt = Date.now();
    const res = await gotoWithRetry(page, `${STAGING_URL}${path}`, { timeout: 40_000 });
    // A page that never finishes loading is a finding, not a reason to stop looking at the rest.
    const loaded = await page.waitForLoadState("load", { timeout: 30_000 }).then(() => true, () => false);
    const loadMs = Date.now() - startedAt;
    await page.waitForTimeout(1200);
    const landed = new URL(page.url()).pathname;
    const overflow = await page.evaluate(() => {
      const w = window.innerWidth;
      if (document.documentElement.scrollWidth <= w + 1) return [];
      return [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > w + 1 && getComputedStyle(el).position !== "fixed")
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)}`);
    });
    await page.bringToFront();
    const axe = await new AxeBuilder({ page: page.__real ?? page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const violations = axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(" ")?.slice(0, 90) }));
    const slug = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
    await page.screenshot({ path: join(CRAWL_OUT, `${BROWSER}-${role}-${slug}-${label}.png`) });
    out.push({ role, path, width: label, status: res?.status() ?? 0, landed, overflow, violations, loaded, loadMs });
  }
  return out;
}

function crawlStep(role, startPath, prefix, extra) {
  step(`${role}: every page in the navigation, at 1440 and 390 [UI]`, ["adminReady"], `crawled_${role}`, async () => {
    const page = { intern: pages.intern, employer: pages.employer, admin: pages.admin }[role];
    const paths = await routesFor(page, prefix, startPath, extra());
    const results = [];
    for (const path of paths) results.push(...(await auditPage(page, role, path)));
    await page.setViewportSize({ width: 1440, height: 900 });
    crawlReport.push(...results);
    writeFileSync(join(OUT, `${BROWSER}-crawl-${role}.json`), JSON.stringify(results, null, 2));

    const broken = results.filter((r) => r.status >= 400);
    const stuck = results.filter((r) => !r.loaded);
    const slow = results.filter((r) => r.loadMs > 8000).map((r) => `${r.path} @${r.width}: ${Math.round(r.loadMs / 1000)}s`);
    if (slow.length) console.log(`[${BROWSER}] ${role}: slow pages (over 8 s): ${slow.join("; ")}`);
    const bounced = results.filter((r) => !r.landed.startsWith(`/${prefix}`) && !r.landed.startsWith("/login"));
    const wide = results.filter((r) => r.overflow.length);
    const axeBad = results.flatMap((r) => r.violations.filter((v) => ["critical", "serious"].includes(v.impact) && !KNOWN_AXE.has(v.id)).map((v) => ({ page: `${r.path} @${r.width}`, ...v })));
    console.log(`[${BROWSER}] ${role}: ${paths.length} pages x 2 widths; ${broken.length} http errors, ${wide.length} overflowing, ${axeBad.length} serious/critical accessibility findings`);
    assert.deepEqual(broken.map((r) => `${r.path} -> ${r.status}`), [], "pages that returned an error");
    assert.deepEqual(stuck.map((r) => `${r.path} @${r.width}`), [], "pages that never finished loading within 30 s");
    assert.deepEqual(wide.map((r) => `${r.path} @${r.width}: ${r.overflow.join(", ")}`), [], "pages wider than the screen");
    assert.deepEqual(axeBad.map((v) => `${v.page}: ${v.id} (${v.impact}) x${v.nodes} e.g. ${v.sample}`), [], "serious or critical accessibility findings");
    void bounced;
  }, 900_000);
}

crawlStep("intern", "/intern/dashboard", "intern", () => [`/intern/proposals/${state.hiredProposalId}`, `/intern/proposals/${state.fteProposalId}`]);
crawlStep("employer", "/employer/dashboard", "employer", () => [`/employer/intern/${state.hiredInternId}`, `/employer/timesheets/${state.timesheetId}`, `/employer/proposal/${state.hiredProposalId}`]);
crawlStep("admin", "/admin/dashboard", "admin", () => [`/admin/interns/${state.hiredInternId}`]);

/* ── 14. The public site: the sitemap's pages and the sign-in pages, signed out ───────── */

step("public site: every sitemap page and the sign-in pages, at 1440 and 390, no CSP violations [UI]", [], "crawled_public", async () => {
  const ctx = ONE_WINDOW ? null : await browser.newContext({ baseURL: STAGING_URL, viewport: { width: 1440, height: 900 }, locale: "en-IN", timezoneId: "Asia/Kolkata" });
  ctx?.setDefaultTimeout(20_000);
  const page = ONE_WINDOW ? oneWindow.guest("public") : await ctx.newPage();
  if (!ONE_WINDOW) track("public", page);

  const xml = await (await fetch(`${STAGING_URL}/sitemap.xml`)).text();
  const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/\/$/, "") || "/");
  const fixed = all.filter((p) => !p.startsWith("/blog/") && !p.startsWith("/opportunities/"));
  const some = (prefix) => all.filter((p) => p.startsWith(prefix)).slice(0, 3);
  await page.goto(`${STAGING_URL}/login`, { waitUntil: "load" });
  const authLinks = (await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")))).filter((h) => h && h.startsWith("/") && !h.startsWith("/api") && !h.includes("#"));
  const authPages = ["/login", "/login?as=employer", "/signup", "/signup?as=employer", "/admin/login", ...authLinks.filter((h) => /forgot|reset|verify/i.test(h))];
  let paths = [...new Set([...fixed, ...some("/blog/"), ...some("/opportunities/"), ...authPages])];
  if (BROWSER === "webkit") {
    // Playwright's Linux WebKit build crashes ("Page crashed") on the home page's <video> element and
    // renders every other page fine. Real Safari was not available, so the home page is the one page
    // this run could not check in WebKit.
    paths = paths.filter((p) => p !== "/");
    console.log("[webkit] skipping / : this WebKit build crashes on its hero <video>");
  }

  const results = [];
  for (const path of paths) results.push(...(await auditPage(page, "public", path)));
  writeFileSync(join(OUT, `${BROWSER}-crawl-public.json`), JSON.stringify(results, null, 2));
  await ctx?.close();

  const broken = results.filter((r) => r.status >= 400);
  const stuck = results.filter((r) => !r.loaded);
  const wide = results.filter((r) => r.overflow.length);
  const axeBad = results.flatMap((r) => r.violations.filter((v) => ["critical", "serious"].includes(v.impact) && !KNOWN_AXE.has(v.id)).map((v) => ({ page: `${r.path} @${r.width}`, ...v })));
  const csp = issues.filter((i) => /report.?only|content security policy/i.test(i.text));
  writeFileSync(join(OUT, `${BROWSER}-csp-violations.json`), JSON.stringify(csp, null, 2));
  console.log(`[${BROWSER}] public: ${paths.length} pages x 2 widths; ${broken.length} http errors, ${wide.length} overflowing, ${axeBad.length} serious/critical accessibility findings, ${csp.length} CSP report-only violations`);
  assert.deepEqual(broken.map((r) => `${r.path} -> ${r.status}`), [], "pages that returned an error");
  assert.deepEqual(stuck.map((r) => `${r.path} @${r.width}`), [], "pages that never finished loading within 30 s");
  assert.deepEqual(wide.map((r) => `${r.path} @${r.width}: ${r.overflow.join(", ")}`), [], "pages wider than the screen");
  assert.deepEqual(axeBad.map((v) => `${v.page}: ${v.id} (${v.impact}) x${v.nodes} e.g. ${v.sample}`), [], "serious or critical accessibility findings");
  assert.deepEqual([...new Set(csp.map((i) => i.text.slice(0, 160)))], [], "things the report-only CSP would block");
}, 900_000);
