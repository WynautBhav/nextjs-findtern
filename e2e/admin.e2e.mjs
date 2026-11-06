/**
 * Admin console end to end (Chromium only), against the QA stack:
 *
 *   E2E_BASE_URL=http://localhost:3500 DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_qa \
 *     node --test e2e/admin.e2e.mjs        (npm run e2e:admin)
 *
 * Signs in as the seeded super admin (lib/personas.mjs "admin"). Everything the
 * suite creates (a restricted staff role + account, one blog post) is removed
 * again, and the paid/failed and notification paths are only exercised up to
 * their cancel / rejection, so nothing is settled or broadcast.
 *
 * Output: e2e/.artifacts/qa/admin/{results.json, fail-<test>-<n>.png}.
 *
 * Money windows (test 9): Dashboard "Collected" is the last 7 India days
 * (data-testid="collected-week", checked against the same window in SQL).
 * Transactions "Received", Reports "Revenue collected" and Reports/Money
 * "Received" are all-time (Money needs ?period=all; its default is the last 18 months) and
 * are checked against lib/admin/revenue.ts's rules in SQL: paid rows of
 * employer_payments (real employers only) + intern_payments, USD at 100 INR.
 * Orders "Collected" is the employer half and Intern invoices "Collected" the
 * intern half, so they must add up to Transactions "Received".
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";

import { api, url } from "./lib/browser.mjs";
import { closeDb, one, rows } from "./lib/db.mjs";
import { ARTIFACTS, ROOT } from "./lib/env.mjs";
import { appRoutes, dynamicValues, isDynamic, roleOf, situationIds } from "./lib/routes.mjs";
import { loginState, persona } from "./lib/session.mjs";

const OUT = join(ARTIFACTS, "qa", "admin");
const AI_EMAIL = "ai-interview@findtern.ai";
const stamp = Date.now().toString(36);
const STAFF = { email: `e2e-staff-${stamp}@findtern.test`, name: "E2E Staff", password: "Stf#Pass2026e2e", role: `e2e_${stamp}` };
const NOT_SEEDED = "the QA database has none";

let browser;
let adminState;
let current = "";
const live = new Set();
const results = [];
const notes = [];
let staffId = null;

// ------------------------------------------------------------------ helpers

const slug = (s) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 70).toLowerCase();
const note = (msg) => notes.push({ test: current, note: msg });
const skip = (t, reason) => {
  results.push({ test: current, status: "skipped", reason });
  return t.skip(reason);
};
const fail = (problems) => {
  if (problems.length) assert.fail(`${problems.length} problem(s):\n - ${problems.join("\n - ")}`);
};

/** A test whose failure screenshots every open page and names the step. */
function it(name, fn, timeout = 120_000) {
  test(name, { timeout }, async (t) => {
    current = name;
    const started = Date.now();
    try {
      await fn(t);
      if (!results.some((r) => r.test === name)) results.push({ test: name, status: "pass", ms: Date.now() - started });
    } catch (err) {
      let n = 0;
      for (const p of live) await p.screenshot({ path: join(OUT, `fail-${slug(name)}-${n++}.png`), fullPage: true }).catch(() => {});
      results.push({ test: name, status: "fail", ms: Date.now() - started, error: String(err.message).slice(0, 2000) });
      err.message = `"${name}": ${err.message}`;
      throw err;
    } finally {
      for (const p of live) await p.context().close().catch(() => {});
      live.clear();
    }
  });
}

/** A page in a fresh context at `width`, signed in with `state` (the admin by default). */
async function open(width = 1440, { state = adminState, reducedMotion } = {}) {
  const phone = width <= 768;
  const ctx = await browser.newContext({
    storageState: state,
    viewport: { width, height: phone ? 800 : 900 },
    isMobile: phone,
    hasTouch: phone,
    reducedMotion,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15_000);
  live.add(page);
  const bag = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) bag.push(`console error: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => bag.push(`page error: ${String(e.message ?? e).slice(0, 300)}`));
  page.on("response", (r) => {
    // /api/intern/avatar answers 404 "No avatar uploaded" for a candidate with no photo (the UI falls back to initials): known noise, not an admin defect.
    if (r.url().startsWith(url("/")) && r.status() >= 400 && !(r.status() === 404 && r.url().includes("/api/intern/avatar"))) bag.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(url("/"), "/")}`);
  });
  page.problems = bag;
  page.nativeDialogs = [];
  page.on("dialog", (d) => {
    page.nativeDialogs.push(`${d.type()}: ${d.message().slice(0, 80)}`);
    d.dismiss().catch(() => {});
  });
  return page;
}

async function go(page, path) {
  const res = await page.goto(url(path), { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  assert.ok(res && res.status() < 400, `GET ${path} -> HTTP ${res?.status()}`);
  return res;
}

const mainText = (page) => page.locator("main").innerText();
const navLink = (page, label) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: new RegExp(`^${label}\\b`) });

/** Polls `fn` until it returns a truthy value; the last value goes into the failure message. */
async function until(fn, what, ms = 8_000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`timed out waiting for ${what} (last value: ${JSON.stringify(last)})`);
}

/** "₹1,23,456.50" on the line after `label`, in minor units; null when absent. */
function figure(text, label) {
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== label) continue;
    for (let k = i + 1; k <= i + 3 && k < lines.length; k++) {
      const m = /^[₹$]\s?(-?[\d,]+(?:\.\d+)?)$/.exec(lines[k]);
      if (m) return Math.round(Number(m[1].replace(/,/g, "")) * 100);
    }
  }
  return null;
}

const formatBadge = (n) => (n > 99 ? "99+" : String(n));
const railBadge = (page, href) => page.locator(`nav[aria-label="Main"] a[href="${href}"] .nums [aria-hidden="true"]`);

/**
 * A dashboard figure (a `Count`): the settled value sits in its sr-only span and the tween in an
 * aria-hidden one, so read the sr-only one. Missing (an empty queue draws no group) is null.
 */
async function testidText(page, id) {
  const el = page.locator(`[data-testid="${id}"] .sr-only`).first();
  return (await el.count()) ? ((await el.textContent()) ?? "").trim() : null;
}
const testidNumber = async (page, id) => Number((await testidText(page, id))?.replace(/[^\d.-]/g, "") || 0);

async function overflow(page) {
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
}

/** The numbers queue-counts.ts and the dashboard's "Needs you" list define, in SQL. */
async function queueFromDb() {
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const real = `employer_id <> 'admin' AND employer_id NOT IN (SELECT id FROM employers WHERE lower(company_email) = '${AI_EMAIL}')`;
  const [p, c, l] = await Promise.all([
    one(`SELECT count(*)::int n FROM intern_payouts WHERE status = 'pending' AND coalesce(nullif(raw->>'scheduledFor', ''), '0000-01-01') <= $1`, [soon]),
    one(
      `SELECT count(*)::int n FROM users u LEFT JOIN intern_onboarding o ON o.user_id = u.id
         JOIN LATERAL (SELECT lower(i.status) status FROM interviews i WHERE i.intern_id = u.id
              AND (i.employer_id = 'admin' OR i.employer_id IN (SELECT id FROM employers WHERE lower(company_email) = $1))
            ORDER BY i.created_at DESC NULLS LAST LIMIT 1) latest ON true
        WHERE u.role = 'intern' AND latest.status = 'completed' AND coalesce(jsonb_typeof(o.extra_data->'findternScore'), '') <> 'number'`,
      [AI_EMAIL],
    ),
    one(
      `SELECT ((SELECT count(*) FROM interviews WHERE status = 'scheduled' AND ${real}
                 AND (CASE selected_slot WHEN 1 THEN slot1 WHEN 2 THEN slot2 WHEN 3 THEN slot3 END) > now()
                 AND coalesce(trim(meeting_link), '') = '')
             + (SELECT count(*) FROM proposals WHERE status = 'accepted' AND ${real}))::int n`,
    ),
  ]);
  return { payouts: p.n, candidates: c.n, pipeline: l.n };
}

/** Paid money in INR minor units (revenue.ts: paid rows, real employers, USD at 100, plus paid college seat batches), optionally from `since`. */
async function receivedFromDb({ since = null } = {}) {
  const inr = (a, c) => `(CASE WHEN upper(coalesce(${c}, 'INR')) = 'USD' THEN ${a} * 100 ELSE ${a} END)`;
  const at = (t) => (since ? `AND coalesce(${t}.paid_at, ${t}.created_at) >= $1` : "");
  const args = since ? [since] : [];
  const emp = await one(
    `SELECT coalesce(sum(${inr("e.amount_minor", "e.currency")}), 0)::bigint v FROM employer_payments e
      WHERE e.status = 'paid' AND e.employer_id <> 'admin'
        AND e.employer_id NOT IN (SELECT id FROM employers WHERE lower(company_email) = '${AI_EMAIL}') ${at("e")}`,
    args,
  );
  const int = await one(`SELECT coalesce(sum(${inr("i.amount_minor", "i.currency")}), 0)::bigint v FROM intern_payments i WHERE i.status = 'paid' ${at("i")}`, args);
  // College seat sales are money received too (INR): paid batches, dated by paid_at, else created_at.
  const college = await one(
    `SELECT coalesce(sum(c.amount_minor), 0)::bigint v FROM college_seat_batches c WHERE c.status = 'paid' ${at("c")}`,
    args,
  );
  return { employer: Number(emp.v), intern: Number(int.v), college: Number(college.v), total: Number(emp.v) + Number(int.v) + Number(college.v) };
}

async function ensureStaff() {
  if (staffId) return;
  const page = await open(1440);
  await page.goto(url("/admin/roles"), { waitUntil: "domcontentloaded" });
  const role = await api(page, "POST", "/api/admin/roles", { key: STAFF.role, name: `E2E ${stamp}`, permissions: ["dashboard:read", "users:read"] });
  assert.equal(role.status, 201, `create staff role -> ${JSON.stringify(role.body)}`);
  const staff = await api(page, "POST", "/api/admin/staff", { name: STAFF.name, email: STAFF.email, password: STAFF.password, role: STAFF.role });
  assert.equal(staff.status, 201, `create staff account -> ${JSON.stringify(staff.body)}`);
  staffId = staff.body.staff.id;
}

async function cleanup() {
  await rows(`DELETE FROM admins WHERE lower(email) LIKE 'e2e-staff-%@findtern.test'`).catch(() => {});
  await rows(`DELETE FROM admin_roles WHERE key LIKE 'e2e\\_%'`).catch(() => {});
  await rows(`DELETE FROM website_blog_posts WHERE slug LIKE 'e2e-sanitise-%'`).catch(() => {});
}

before(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const f of ["results.json"]) rmSync(join(OUT, f), { force: true });
  assert.ok(await one("SELECT 1 AS ok"), "the QA database (DATABASE_URL) does not answer");
  await cleanup();
  browser = await chromium.launch();
  adminState = await loginState(browser, persona("admin")).catch((e) => {
    throw new Error(`cannot sign in as the admin persona (is the QA seed loaded?): ${e.message}`);
  });
});

after(async () => {
  await cleanup();
  await browser?.close();
  await closeDb();
  writeFileSync(join(OUT, "results.json"), JSON.stringify({ at: new Date().toISOString(), results, notes }, null, 2));
});

// -------------------------------------------------------------------- tests

it("1 shell: rail labels, one <main>, and queue badges equal the DB definitions and the dashboard", async () => {
  const page = await open(1440);
  await go(page, "/admin/dashboard");
  const layout = readFileSync(join(ROOT, "src", "app", "admin", "layout.tsx"), "utf8");
  const nav = layout.slice(layout.indexOf("const NAV: "), layout.indexOf("const NAV_LABELS"));
  const labels = [...nav.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(labels.length >= 20, `could not read the rail labels from layout.tsx (got ${labels.length})`);
  const problems = [];
  for (const label of labels) {
    if ((await navLink(page, label).count()) !== 1) problems.push(`rail link "${label}" not found exactly once`);
  }
  const mains = await page.locator("main").count();
  if (mains !== 1) problems.push(`expected exactly one <main>, found ${mains}`);

  const want = await queueFromDb();
  // The Triage desk prints each queue's count under data-testid="queue-count-<key>" (an empty queue has no group, so it reads 0).
  const onDash = {
    payouts: await testidNumber(page, "queue-count-payouts"),
    candidates: await testidNumber(page, "queue-count-unscored"),
    pipeline: (await testidNumber(page, "queue-count-nolink")) + (await testidNumber(page, "queue-count-accepted")),
  };
  const hrefs = { payouts: "/admin/payouts", candidates: "/admin/interns", pipeline: "/admin/proposal-tracker" };
  for (const key of Object.keys(hrefs)) {
    const badge = railBadge(page, hrefs[key]);
    const shown = (await badge.count()) ? (await badge.first().innerText()).trim() : null;
    if (want[key] === 0) {
      if (shown !== null) problems.push(`${key}: DB says 0 so no badge, but the rail shows "${shown}"`);
    } else if (shown !== formatBadge(want[key])) {
      problems.push(`${key}: DB says ${want[key]}, rail badge shows ${JSON.stringify(shown)}`);
    }
    if (shown !== null && !/^\d+\+?$/.test(shown)) problems.push(`${key}: badge "${shown}" is not an integer`);
    if (onDash[key] !== want[key]) problems.push(`${key}: DB says ${want[key]}, dashboard queue counts say ${onDash[key]}`);
  }
  note(`queue from DB: ${JSON.stringify(want)}`);
  fail(problems);
});

it("2 top-bar search: Ctrl+K and click open the palette; a candidate is found, Enter opens the record, Esc returns focus", async (t) => {
  const person = await one(
    `WITH n AS (SELECT id, trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) AS name FROM users WHERE role = 'intern')
     SELECT id, name FROM n
      WHERE length(name) >= 5 AND name !~ '[%_\\\\]'
        AND (SELECT count(*) FROM n n2 WHERE lower(n2.name) = lower(n.name)) = 1
      ORDER BY name LIMIT 1`,
  );
  if (!person) return skip(t, `no candidate with a unique name: ${NOT_SEEDED}`);
  const page = await open(1440);
  await go(page, "/admin/dashboard");
  const dialog = page.getByRole("dialog", { name: "Search the admin portal" });
  const input = page.getByRole("combobox", { name: "Search the admin portal" });
  const field = page.locator("header").getByRole("button", { name: /Command K/ });

  await page.keyboard.press("Control+k");
  await dialog.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  await field.click();
  await dialog.waitFor({ state: "visible" });
  await input.fill(person.name);
  const option = page.getByRole("option", { name: new RegExp(person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
  await option.waitFor({ state: "visible" });
  for (let i = 0; i < 40 && (await option.getAttribute("aria-selected")) !== "true"; i++) await page.keyboard.press("ArrowDown");
  assert.equal(await option.getAttribute("aria-selected"), "true", `could not move the highlight to "${person.name}"`);
  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`/admin/interns/${person.id}$`), { timeout: 15_000 });
  await page.locator("h1").first().waitFor({ timeout: 15_000 }).catch(() => assert.fail("the candidate record has no heading"));

  // Back on a list page: open with the click, Escape must return focus to the search field.
  await go(page, "/admin/dashboard");
  await field.click();
  await dialog.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const back = await until(
    () => field.evaluate((el) => el === document.activeElement),
    "focus to return to the top-bar search field after Escape",
    3_000,
  ).catch(async () => {
    const active = await page.evaluate(() => `${document.activeElement?.tagName}:${(document.activeElement?.textContent ?? "").trim().slice(0, 40)}`);
    assert.fail(`focus did not return to the search field after Escape (active element: ${active})`);
  });
  assert.ok(back);
});

it("3 every admin route at 1440 and 390: 200, one h1, no error text, no console/page errors, no sideways scroll", async () => {
  const ids = await situationIds().catch(() => ({}));
  const problems = [];
  const targets = [];
  for (const route of appRoutes().filter((r) => r.startsWith("/admin") && roleOf(r) === "admin")) {
    if (!isDynamic(route)) {
      targets.push({ route, path: route });
      continue;
    }
    const vals = await dynamicValues(route, persona("admin"), ids).catch(() => []);
    let id = vals.find(Boolean);
    if (!id && route === "/admin/companies/[id]") id = (await one(`SELECT id FROM employers WHERE id <> 'admin' AND lower(coalesce(company_email,'')) <> $1 ORDER BY created_at LIMIT 1`, [AI_EMAIL]))?.id;
    if (!id && route === "/admin/interns/[id]") id = (await one(`SELECT id FROM users WHERE role = 'intern' ORDER BY created_at LIMIT 1`))?.id;
    if (!id) note(`${route}: skipped, ${NOT_SEEDED}`);
    else targets.push({ route, path: route.replace(/\[[^\]]+\]/, encodeURIComponent(id)) });
  }
  assert.ok(targets.length >= 20, `only ${targets.length} admin routes found; routes.mjs derives them from src/app`);
  for (const width of [1440, 390]) {
    const page = await open(width);
    for (const { path } of targets) {
      page.problems.length = 0;
      const res = await page.goto(url(path), { waitUntil: "load", timeout: 30_000 }).catch((e) => ({ status: () => `nav failed: ${e.message.split("\n")[0]}` }));
      await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
      await page.waitForTimeout(300);
      const where = `${path} @${width}`;
      if (res.status() !== 200) problems.push(`${where}: HTTP ${res.status()}`);
      const h1 = await page.locator("h1").count();
      if (h1 !== 1) problems.push(`${where}: ${h1} <h1> elements (want 1)`);
      const body = await page.evaluate(() => document.body?.innerText ?? "");
      if (/something went wrong|application error|this page couldn.t load/i.test(body)) problems.push(`${where}: error text on the page`);
      const o = await overflow(page);
      if (o.sw > o.iw + 1) problems.push(`${where}: sideways scroll (scrollWidth ${o.sw} > innerWidth ${o.iw})`);
      for (const p of page.problems) problems.push(`${where}: ${p}`);
    }
    await page.context().close();
  }
  fail(problems);
}, 300_000);

it("4 candidates list: row checkbox is named for the person; the bulk bar clears on filter, sort and page change", async (t) => {
  const page = await open(1440);
  await go(page, "/admin/interns");
  const boxes = page.getByRole("checkbox", { name: /^Select (?!all )\S/ });
  if (!(await boxes.count())) return skip(t, `no candidate rows: ${NOT_SEEDED}`);
  const label = await boxes.first().getAttribute("aria-label");
  const name = label.replace(/^Select /, "").trim();
  assert.notEqual(name.toLowerCase(), "row", `row checkbox is named "${label}" instead of the person`);
  const hit = await one(`SELECT 1 AS ok FROM users WHERE role = 'intern' AND lower(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))) = lower($1)`, [name]);
  assert.ok(hit, `checkbox name "${label}" is not a candidate's name in the DB`);

  const bar = page.getByRole("region", { name: /^Actions for \d+ selected/ });
  const tick = async (why) => {
    await boxes.first().click();
    await bar.waitFor({ state: "visible", timeout: 5_000 }).catch(() => assert.fail(`ticking a row did not show the bulk bar (${why})`));
    assert.match(await bar.innerText(), /1 selected/, `bulk bar count (${why})`);
  };
  const gone = (why) => bar.waitFor({ state: "detached", timeout: 5_000 }).catch(() => assert.fail(`the bulk bar stayed after ${why}`));

  await tick("first tick");
  await page.locator("#filter-approval").selectOption("Approved");
  await page.waitForURL(/approval=Approved/);
  await gone("changing the Review filter");

  await page.locator("#filter-approval").selectOption("");
  await page.waitForURL((u) => !u.searchParams.has("approval"));
  await boxes.first().waitFor();
  await tick("after clearing the filter");
  if (!(await page.locator("#filter-sort").isVisible())) await page.getByRole("button", { name: /More filters/ }).click();
  await page.locator("#filter-sort").selectOption("name");
  await page.waitForURL(/sort=name/);
  await gone("changing the sort");

  const next = page.getByRole("link", { name: "Next page" });
  if ((await next.count()) && (await next.first().isVisible())) {
    await boxes.first().waitFor();
    await tick("before paging");
    await next.first().click();
    await page.waitForURL(/page=2/);
    await gone("moving to the next page");
  } else note("only one page of candidates: the pager step was not exercised");
});

it("5 DataTable at 390: sort select changes the URL; 'Nothing matches' only when filtered", async (t) => {
  const page = await open(390);
  await go(page, "/admin/users");
  assert.doesNotMatch(await mainText(page), /Nothing matches/, "the unfiltered /admin/users says 'Nothing matches'");
  const sort = page.getByLabel("Sort by", { exact: true });
  assert.ok(await sort.isVisible(), "the sort control is not visible at 390 wide");
  await sort.selectOption("name:asc");
  await page.waitForURL((u) => u.searchParams.get("sort") === "name" && u.searchParams.get("dir") === "asc");
  await sort.selectOption("name:desc");
  await page.waitForURL((u) => u.searchParams.get("dir") === "desc");
  await sort.selectOption("");
  await page.waitForURL((u) => !u.searchParams.has("sort"));

  await page.getByRole("searchbox", { name: /^Search name, email/ }).fill("zzqxj-no-such-person-9917");
  await page.waitForURL(/q=zzqxj/);
  await page.getByText("Nothing matches", { exact: true }).waitFor();
  const clear = page.getByRole("link", { name: "Clear search and filters" });
  assert.ok(await clear.isVisible(), "no clear link under 'Nothing matches'");
  assert.ok(!(await clear.getAttribute("href")).includes("q="), "the clear link still carries the search");
  await clear.click();
  await page.waitForURL((u) => !u.searchParams.has("q"));
  assert.doesNotMatch(await mainText(page), /Nothing matches/, "'Nothing matches' stays after clearing the search");

  // An empty table with no filter must say it is empty, not that nothing matches.
  const candidates = ["/admin/promo-codes", "/admin/notification-history", "/admin/colleges", "/admin/projects", "/admin/payouts", "/admin/orders"];
  let checked = null;
  for (const path of candidates) {
    await go(page, path);
    const text = await mainText(page);
    if (/\bNo (data|[\w ]+) yet\b/i.test(text)) {
      assert.doesNotMatch(text, /Nothing matches/, `${path} is empty with no filter but says 'Nothing matches'`);
      checked = path;
      break;
    }
  }
  if (!checked) note("no list page is empty without a filter in this data: that half of the check was not exercised");
  else note(`unfiltered empty table checked on ${checked}`);
  void t;
});

it("6 payouts: mark-paid asks first (Cancel focused), cancel leaves the DB alone, status is a native radio group", async (t) => {
  const row = await one(
    `SELECT p.id, p.reference_id, u.email FROM intern_payouts p JOIN users u ON u.id = p.intern_id
      WHERE p.status = 'pending' AND coalesce(u.email, '') <> ''
        AND (SELECT count(*) FROM intern_payouts x WHERE x.intern_id = p.intern_id AND x.status = 'pending') = 1
      ORDER BY p.created_at LIMIT 1`,
  );
  if (!row) return skip(t, `no pending payout whose intern has just one: ${NOT_SEEDED}`);
  const page = await open(1440);
  const patches = [];
  page.on("request", (r) => r.method() !== "GET" && /\/api\/admin\/payouts/.test(r.url()) && patches.push(`${r.method()} ${r.url()}`));
  await go(page, `/admin/payouts?status=pending&q=${encodeURIComponent(row.email)}`);
  await page.getByRole("button", { name: /Mark paid or failed/ }).first().click();
  const form = page.getByRole("form", { name: "Edit payout status" });
  await form.waitFor();
  const group = form.getByRole("radiogroup", { name: "New status" });
  const radios = group.locator('input[type="radio"]');
  assert.equal(await radios.count(), 2, "the status control should be two native radio inputs");
  await radios.first().focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await group.getByRole("radio", { name: "Failed" }).isChecked(), true, "ArrowRight did not select Failed");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await group.getByRole("radio", { name: "Paid" }).isChecked(), true, "ArrowLeft did not select Paid");

  await form.getByLabel(/^Bank reference/).fill(`E2E-UTR-${stamp}`);
  await form.getByRole("button", { name: "Done" }).click();
  const dialog = page.getByRole("dialog", { name: /Mark this payout as paid/ });
  await dialog.waitFor({ state: "visible" });
  await until(() => page.evaluate(() => document.activeElement?.textContent?.trim() === "Cancel"), "Cancel to hold focus in the confirm dialog", 3_000);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForTimeout(500);
  const after = await one(`SELECT status, reference_id, paid_at FROM intern_payouts WHERE id = $1`, [row.id]);
  assert.equal(after.status, "pending", "cancelling the confirmation changed the payout status");
  assert.equal(after.reference_id, row.reference_id, "cancelling changed the bank reference");
  assert.equal(after.paid_at, null, "cancelling set paid_at");
  assert.deepEqual(patches, [], "a payout request was sent although the admin cancelled");
  assert.deepEqual(page.nativeDialogs, [], "a native browser dialog was used");
});

it("7 roles: reset password is an in-page dialog, masked, mismatch sends nothing, Cancel changes nothing", async () => {
  await ensureStaff();
  const before = (await one(`SELECT password FROM admins WHERE id = $1`, [staffId])).password;
  const page = await open(1440);
  const sent = [];
  page.on("request", (r) => r.method() === "PATCH" && r.url().includes("/api/admin/staff") && sent.push(r.url()));
  await go(page, "/admin/roles");
  await page.locator("li", { hasText: STAFF.email }).getByRole("button", { name: "Reset password" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset password" });
  await dialog.waitFor();
  const pw = dialog.getByLabel("New password", { exact: true });
  const confirm = dialog.getByLabel("Confirm new password", { exact: true });
  assert.equal(await pw.getAttribute("type"), "password", "new-password input is not type=password");
  assert.equal(await confirm.getAttribute("type"), "password", "confirm input is not type=password");

  await pw.fill("abc");
  await confirm.fill("abc");
  await dialog.getByRole("button", { name: "Set password" }).click();
  await dialog.getByRole("alert").waitFor();
  await pw.fill("Valid#Pass2026x");
  await confirm.fill("Different#Pass2026y");
  await dialog.getByRole("button", { name: "Set password" }).click();
  await until(async () => /don.t match/i.test((await dialog.getByRole("alert").innerText().catch(() => "")) || ""), "the mismatch error", 3_000);
  await page.waitForTimeout(400);
  assert.deepEqual(sent, [], "a request was sent for a weak or mismatched password");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForTimeout(400);
  assert.deepEqual(sent, [], "Cancel sent a request");
  assert.equal((await one(`SELECT password FROM admins WHERE id = $1`, [staffId])).password, before, "Cancel changed the stored password");
  assert.deepEqual(page.nativeDialogs, [], "a native prompt/confirm/alert fired");
});

it("8 sanitising: CMS body loses onerror/script and keeps <p>; notification links off-site are refused", async (t) => {
  const page = await open(1440);
  await go(page, "/admin/cms");
  const dirty = "<img src=x onerror=alert(1)><script>alert(1)</script><p>ok</p>";
  const clean = (body) => !/onerror/i.test(body) && !/<script/i.test(body) && /<p[^>]*>ok<\/p>/.test(body);
  const slugValue = `e2e-sanitise-${stamp}`;
  let id = null;
  try {
    const made = await api(page, "POST", "/api/admin/cms", { type: "blog", title: `E2E sanitise ${stamp}`, slug: slugValue, status: "draft", body: dirty });
    assert.equal(made.status, 201, `POST /api/admin/cms -> ${made.status} ${JSON.stringify(made.body)}`);
    id = made.body.item.id;
    const stored = (await one(`SELECT body FROM website_blog_posts WHERE id = $1`, [id])).body;
    assert.ok(clean(stored), `stored body after POST is not clean: ${stored}`);
    const edited = await api(page, "PATCH", "/api/admin/cms", { type: "blog", id, body: `${dirty}<p>second</p>` });
    assert.equal(edited.status, 200, `PATCH /api/admin/cms -> ${edited.status} ${JSON.stringify(edited.body)}`);
    const restored = (await one(`SELECT body FROM website_blog_posts WHERE id = $1`, [id])).body;
    assert.ok(clean(restored), `stored body after PATCH is not clean: ${restored}`);
  } finally {
    if (id) await api(page, "DELETE", "/api/admin/cms", { type: "blog", id }).catch(() => {});
    await rows(`DELETE FROM website_blog_posts WHERE slug = $1`, [slugValue]);
  }
  assert.equal((await one(`SELECT count(*)::int n FROM website_blog_posts WHERE slug = $1`, [slugValue])).n, 0, "the test blog post was not deleted");

  // Notifications: only refusals are asserted, and the valid shape goes to nobody (an id that does not exist).
  const before = (await one(`SELECT count(*)::int n FROM notifications`)).n;
  const send = (link) =>
    api(page, "POST", "/api/admin/notifications", {
      recipientType: "intern",
      interns: { all: false, ids: ["e2e-no-such-intern"] },
      title: "E2E link check",
      message: "Never delivered.",
      type: "custom",
      data: { link },
    });
  for (const link of ["/\\evil.example", "//evil.example", "javascript:alert(1)", "https://evil.example"]) {
    const res = await send(link);
    assert.ok(res.status >= 400 && res.status < 500, `link ${JSON.stringify(link)} -> HTTP ${res.status}, want a 4xx`);
    assert.match(String(res.body?.error), /path on this site/, `link ${JSON.stringify(link)} was not refused for its link`);
  }
  const ok = await send("/intern/dashboard");
  assert.equal(ok.status, 400, `a valid link with no real recipient -> ${ok.status}`);
  assert.match(String(ok.body?.error), /Nobody to send/, "a valid /intern/dashboard link was refused for its shape");
  assert.equal((await one(`SELECT count(*)::int n FROM notifications`)).n, before, "the notifications table changed");

  // The composer blocks the same links before it ever asks to confirm or sends.
  if (!(await one(`SELECT 1 AS ok FROM users WHERE role = 'intern' AND is_active = true LIMIT 1`))) {
    note("no active candidate: the composer check was not exercised");
    return void t;
  }
  const requests = [];
  page.on("request", (r) => r.method() === "POST" && r.url().includes("/api/admin/notifications") && requests.push(r.url()));
  await go(page, "/admin/notifications");
  await page.getByLabel(/^Every active candidate/).check();
  await page.getByLabel("Title", { exact: true }).fill("E2E link check");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Never delivered.");
  for (const link of ["//evil.example", "/\\evil.example"]) {
    await page.getByLabel(/^Link/).fill(link);
    await page.getByRole("button", { name: /^Send to/ }).click();
    await page.getByRole("alert").filter({ hasText: "path on this site" }).waitFor({ timeout: 5_000 }).catch(() => assert.fail(`composer did not block ${JSON.stringify(link)}`));
    assert.equal(await page.getByRole("dialog").count(), 0, `composer opened a send confirmation for ${JSON.stringify(link)}`);
  }
  assert.deepEqual(requests, [], "the composer sent a request for an off-site link");
});

it("9 one money layer: Dashboard, Transactions, Reports, Reports/Money, Orders and Intern invoices agree with revenue.ts", async () => {
  const page = await open(1440);
  const read = async (path, label) => {
    await go(page, path);
    return figure(await mainText(page), label);
  };
  const want = await receivedFromDb();
  const problems = [];
  const close = (name, got, expected, tol) => {
    if (got === null) problems.push(`${name}: figure not found on the page`);
    else if (Math.abs(got - expected) > tol) problems.push(`${name}: page shows ${got / 100}, DB rules give ${expected / 100}`);
  };
  // Dashboard and Transactions round to whole rupees (decimals 0 / compact); the others print paise.
  // The dashboard's "Collected" is the last 7 India days (today and the six before): the window
  // loadCollectedLastDays(7) and Transactions' 7-day range use. It is no longer an all-time figure.
  const IST_MS = 330 * 60_000;
  const istToday = new Date(Date.now() + IST_MS);
  const weekStart = new Date(Date.UTC(istToday.getUTCFullYear(), istToday.getUTCMonth(), istToday.getUTCDate() - 6) - IST_MS);
  const week = await receivedFromDb({ since: weekStart });
  await go(page, "/admin/dashboard");
  const collectedText = await testidText(page, "collected-week");
  close("Dashboard Collected (last 7 India days)", collectedText === null ? null : figure(`Collected\n${collectedText}`, "Collected"), week.total, 50);
  close("Transactions Received (all time)", await read("/admin/transactions", "Received"), want.total, 50);
  close("Reports Revenue collected (all time)", await read("/admin/reports", "Revenue collected"), want.total, 1);
  close("Reports/Money Received (period=all)", await read("/admin/reports/money?period=all", "Received"), want.total, 1);
  const orders = await read("/admin/orders", "Collected");
  const invoices = await read("/admin/intern-invoices", "Collected");
  close("Orders Collected (employer orders)", orders, want.employer, 1);
  close("Intern invoices Collected", invoices, want.intern, 1);
  if (orders !== null && invoices !== null && Math.abs(orders + invoices - (want.employer + want.intern)) > 1) {
    problems.push(`Orders + Intern invoices (${(orders + invoices) / 100}) differ from the employer + intern part of Received (${(want.employer + want.intern) / 100})`);
  }
  // The last 30 days, on the two pages that take a period (both start from now - 30 days).
  const since = new Date(Date.now() - 30 * 86_400_000);
  const month = await receivedFromDb({ since });
  close("Reports Revenue collected (30d)", await read("/admin/reports?period=30d", "Revenue collected"), month.total, 1);
  close("Reports/Money Received (30d)", await read("/admin/reports/money?period=30d", "Received"), month.total, 1);
  if (want.total === 0) note("QA data has no paid receipts: every figure is 0, so the equality is weak");
  fail(problems);
});

it("10 permissions: a staff role with two permissions sees no-access, a trimmed rail and no queue badges", async () => {
  await ensureStaff();
  const state = await loginState(browser, { key: "e2e-staff", role: "admin", email: STAFF.email, password: STAFF.password });
  const page = await open(1440, { state });
  await go(page, "/admin/dashboard");
  const problems = [];
  for (const label of ["Dashboard", "Users"]) if ((await navLink(page, label).count()) !== 1) problems.push(`rail should show "${label}" for this role`);
  for (const label of ["Payouts", "Candidates", "Proposal pipeline", "Messages", "Transactions", "Orders", "Roles and access"]) {
    if (await navLink(page, label).count()) problems.push(`rail shows "${label}" although the role lacks it`);
  }
  const badges = await page.locator('nav[aria-label="Main"] .nums').count();
  if (badges) problems.push(`${badges} queue badge(s) shown to a role without those permissions`);
  for (const path of ["/admin/payouts", "/admin/interns", "/admin/transactions"]) {
    await go(page, path);
    const h1 = (await page.locator("h1").first().innerText()).trim();
    if (!/can.t open this page/i.test(h1)) problems.push(`${path}: expected the no-access page, got heading "${h1}"`);
  }
  const denied = await api(page, "GET", "/api/admin/all-payouts");
  if (denied.status !== 403) problems.push(`GET /api/admin/all-payouts -> ${denied.status}, want 403`);
  fail(problems);
});

it("11 reduced motion: dashboard and payouts stay visible and the rail badge shows its final number at once", async () => {
  const page = await open(1440, { reducedMotion: "reduce" });
  assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true, "reduced motion is not emulated");
  const want = await queueFromDb();
  const problems = [];
  const hrefs = { payouts: "/admin/payouts", candidates: "/admin/interns", pipeline: "/admin/proposal-tracker" };
  for (const path of ["/admin/dashboard", "/admin/payouts"]) {
    await page.goto(url(path), { waitUntil: "domcontentloaded" });
    for (const [key, href] of Object.entries(hrefs)) {
      if (!want[key]) continue;
      const badge = railBadge(page, href);
      await badge.first().waitFor({ state: "attached" });
      const first = (await badge.first().innerText()).trim();
      if (first !== formatBadge(want[key])) problems.push(`${path}: ${key} badge reads "${first}" on first paint, want ${formatBadge(want[key])}`);
    }
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const hidden = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("main *")) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own || el.closest('[aria-hidden="true"], [hidden], [inert]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        let opacity = 1;
        for (let n = el; n && n !== document.body; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
        if (opacity < 0.05) out.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}"`);
      }
      return out.slice(0, 5);
    });
    if (hidden.length) problems.push(`${path}: content stuck invisible: ${hidden.join(", ")}`);
    if (path === "/admin/dashboard") {
      // The Triage figures tick on arrival; under reduced motion the visible figure must already be the settled one.
      for (const id of ["collected-week", "queue-total"]) {
        const shown = (await page.locator(`[data-testid="${id}"] [aria-hidden="true"]`).first().innerText()).trim();
        const settled = await testidText(page, id);
        if (shown !== settled) problems.push(`${path}: ${id} shows "${shown}" but settles at "${settled}" under reduced motion`);
      }
      if ((await page.locator('[data-testid="owed-bar"]').count()) === 0 && (await testidNumber(page, "queue-total")) > 0) {
        problems.push(`${path}: the owed bar is missing although ${await testidNumber(page, "queue-total")} items need attention`);
      }
    }
    for (const [key, href] of Object.entries(hrefs)) {
      if (!want[key]) continue;
      const later = (await railBadge(page, href).first().innerText()).trim();
      if (later !== formatBadge(want[key])) problems.push(`${path}: ${key} badge reads "${later}" after load, want ${formatBadge(want[key])}`);
    }
  }
  if (!Object.values(want).some(Boolean)) note("all three queues are 0 in this data: the badge half was not exercised");
  fail(problems);
});

it("12 regression: /college and /intern/dashboard still render cleanly", async (t) => {
  const problems = [];
  for (const [key, path] of [["college", "/college"], ["intern-hired", "/intern/dashboard"]]) {
    let state;
    try {
      state = await loginState(browser, persona(key));
    } catch (e) {
      if (key === "college") return skip(t, `college persona cannot sign in (${e.message.slice(0, 120)})`);
      throw e;
    }
    const page = await open(1440, { state });
    const res = await page.goto(url(path), { waitUntil: "load", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
    await page.waitForTimeout(300);
    if (res.status() !== 200) problems.push(`${path}: HTTP ${res.status()}`);
    if (new URL(page.url()).pathname !== path) problems.push(`${path}: redirected to ${new URL(page.url()).pathname}`);
    if (!(await page.locator("main").count())) problems.push(`${path}: no <main>`);
    if (/something went wrong|application error/i.test(await page.evaluate(() => document.body.innerText))) problems.push(`${path}: error text on the page`);
    for (const p of page.problems) problems.push(`${path}: ${p}`);
  }
  fail(problems);
});
