/**
 * College Partners end to end, three roles in one story:
 *
 *   1. Placement officer signs in, builds a live drive that shows only Sana.
 *   2. Employer opens the link signed out, signs in, enters, shortlists Sana
 *      and asks for a call now.
 *   3. Sana (phone-sized screen) sees the call, accepts, gets the join link.
 *   4. Officer sees the call and Sana online, then closes the link; the
 *      employer is locked out at once.
 *
 * Needs a running app on E2E_BASE (default :3200) and its database on
 * E2E_DATABASE_URL; it re-runs scripts/seed-colleges.ts first so every run
 * starts from the same JKLU demo.
 *
 *   E2E_BASE=http://localhost:3200 E2E_DATABASE_URL=postgresql://findtern:findtern_dev@localhost:5433/findtern \
 *     node --test e2e/college-partners.e2e.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { chromium, devices } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3200";
const DB = process.env.E2E_DATABASE_URL ?? "postgresql://findtern:findtern_dev@localhost:5433/findtern";
const PASSWORD = "Findtern@2026";
const T = 30_000;

let browser;
let tpo; // officer page
let emp; // employer page
let stu; // student page
let driveLink;
let drivePath;
let employerDriveId;

/** IST wall-clock for a datetime-local input, `offsetMin` from now. */
function istInput(offsetMin) {
  return new Date(Date.now() + offsetMin * 60_000 + 330 * 60_000).toISOString().slice(0, 16);
}

before(async () => {
  execFileSync("node", ["--experimental-strip-types", "scripts/seed-colleges.ts"], {
    env: { ...process.env, DATABASE_URL: DB, PUBLIC_ORIGIN: BASE },
    stdio: "ignore",
  });
  browser = await chromium.launch();
  tpo = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  emp = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  stu = await (await browser.newContext({ ...devices["Pixel 7"] })).newPage();
  for (const p of [tpo, emp, stu]) p.setDefaultTimeout(T);
});

after(async () => {
  await browser?.close();
});

test("officer: signs in and sees the console", async () => {
  await tpo.goto(`${BASE}/college/login`);
  await tpo.getByLabel(/email/i).fill("tpo@jklu.edu.in");
  await tpo.getByLabel(/^password/i).fill(PASSWORD);
  await tpo.getByRole("button", { name: /sign in/i }).first().click();
  await tpo.waitForURL(`${BASE}/college`);
  await tpo.getByRole("heading", { name: "JK Lakshmipat University" }).waitFor();
  const main = await tpo.locator("main").innerText();
  assert.match(main, /Joined Findtern/);
  assert.match(main, /61\/73/, "61 of 73 roster students joined in the seed");
  // Cohort tabs filter the table.
  await tpo.getByRole("tab", { name: /4th year/ }).click();
  assert.match(await tpo.locator("main").innerText(), /Showing \d+ of 61/);
});

test("officer: builds a live drive that shows only Sana", async () => {
  await tpo.goto(`${BASE}/college/drives/new`);
  await tpo.getByLabel("Name").fill("E2E campus drive");
  await tpo.getByLabel("Opens (IST)").fill(istInput(-5));
  await tpo.getByLabel("Closes (IST)").fill(istInput(120));
  await tpo.getByLabel("Minimum Findtern score").fill("10"); // nobody scores a perfect 10, so nobody qualifies by rule…
  await tpo.getByRole("tab", { name: /^Left out/ }).click();
  await tpo.getByPlaceholder("Search").fill("Sana");
  await tpo.getByRole("button", { name: "Add anyway" }).click(); // …Sana is added by hand
  await tpo.getByRole("tab", { name: /^In the drive \(1\)/ }).waitFor();
  await tpo.getByRole("button", { name: "Create drive and get link" }).click();
  const link = tpo.getByLabel("Drive link");
  await link.waitFor();
  driveLink = await link.inputValue();
  assert.match(driveLink, /\/drive\/[A-Za-z0-9_-]{43}$/);
  drivePath = new URL(tpo.url()).pathname;
  assert.match(drivePath, /^\/college\/drives\/[0-9a-f-]{36}$/);
});

test("employer: link → sign in → enter, sees exactly the one student", async () => {
  await emp.goto(driveLink);
  assert.equal(await emp.locator('meta[name="referrer"]').getAttribute("content"), "no-referrer");
  await emp.getByRole("link", { name: "Sign in to enter" }).click();
  await emp.getByLabel(/email/i).fill("hiring@northwind.dev");
  await emp.getByLabel(/^password/i).fill(PASSWORD);
  await emp.getByRole("button", { name: /sign in/i }).first().click();
  await emp.waitForURL(driveLink);
  await emp.getByRole("button", { name: "Enter drive" }).click();
  await emp.waitForURL(/\/employer\/drives\/[0-9a-f-]{36}$/);
  employerDriveId = emp.url().split("/").pop();
  assert.ok(!emp.url().includes(new URL(driveLink).pathname.split("/").pop()), "token is not in the workspace URL");
  await emp.getByText(/^Showing 1 of 1 students?/).waitFor();
  assert.doesNotMatch(await emp.content(), /@findtern\.dev|@jklu\.edu\.in/, "no student emails reach the employer");
});

test("employer: shortlists and asks for a call now", async () => {
  const card = emp.locator("main ul > li").first();
  await card.getByRole("button", { name: /^Shortlist / }).click();
  await card.getByRole("button", { name: /from shortlist$/ }).waitFor();
  await card.getByRole("button", { name: /Call/ }).click();
  await emp.getByRole("menuitem", { name: "Now" }).click();
  await emp.getByRole("status").filter({ hasText: "Call request sent" }).waitFor();
});

test("student: sees the call on a phone and accepts", async () => {
  const login = await stu.request.post(`${BASE}/api/auth/login`, { data: { email: "candidate@findtern.dev", password: PASSWORD } });
  assert.equal(login.status(), 200);
  await stu.goto(`${BASE}/intern/dashboard`);
  await stu.getByText(/E2E campus drive is live/).waitFor();
  const call = stu.getByRole("alertdialog");
  await call.waitFor();
  assert.match(await call.innerText(), /now/i);
  await call.getByRole("button", { name: "Accept" }).click();
  const join = call.getByRole("link", { name: "Join call" });
  await join.waitFor();
  assert.match(await join.getAttribute("href"), /^https:\/\//);
  const overflow = await stu.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, "no sideways scroll on the phone");
});

test("employer: the call shows as accepted with a join link", async () => {
  await emp.reload();
  await emp.getByText("Accepted").first().waitFor();
  await emp.getByRole("link", { name: "Join call" }).first().waitFor();
});

test("employer: can cancel the call; the student's card goes away", async () => {
  const calls = emp.locator('section[aria-labelledby="calls-title"]');
  await calls.getByRole("button", { name: "Cancel" }).first().click();
  await emp.getByRole("status").filter({ hasText: "Call cancelled" }).waitFor();
  await calls.getByText("Cancelled").first().waitFor();
  await stu.reload();
  await stu.getByText(/E2E campus drive is live/).waitFor();
  await stu.waitForTimeout(1500);
  assert.equal(await stu.getByRole("alertdialog").count(), 0, "cancelled call no longer shown to the student");
});

test("officer: sees Sana online and the employer inside; closes the link", async () => {
  await tpo.goto(`${BASE}${drivePath}`);
  const main = tpo.locator("main");
  await main.getByText("Northwind Labs").waitFor();
  assert.match(await main.innerText(), /1 shortlisted · 1 call/);
  await main.getByText(/^1\s*\/1$/).waitFor(); // presence: 1 of 1 eligible online
  tpo.once("dialog", (d) => d.accept());
  await tpo.getByRole("button", { name: "Close link now" }).click();
  await main.getByText("Closed. No employer can get in.").waitFor();
});

test("employer: locked out the moment the link is closed", async () => {
  await emp.reload();
  assert.doesNotMatch(await emp.locator("main").innerText(), /Showing \d+ of/);
  const csrf = (await emp.context().cookies()).find((c) => c.name === "ft_csrf")?.value;
  const res = await emp.request.post(`${BASE}/api/employer/drives/${employerDriveId}/meetings`, {
    headers: { "x-csrf-token": csrf, "content-type": "application/json" },
    data: { userId: "anyone", inMinutes: 0 },
  });
  assert.equal(res.status(), 403);
  const rejoin = await emp.request.post(`${BASE}/api/drives/join`, {
    headers: { "x-csrf-token": csrf, "content-type": "application/json" },
    data: { token: new URL(driveLink).pathname.split("/").pop() },
  });
  assert.equal(rejoin.status(), 403, "the old link can't be used to get back in");
});
