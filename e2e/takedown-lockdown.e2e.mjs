/**
 * Takedown lockdown end to end. Scratch DB only (lib/env.mjs refuses a non-loopback host).
 *
 *   E2E_BASE_URL=http://localhost:3224 DATABASE_URL=postgresql://findtern:...@127.0.0.1:54392/findtern_td \
 *     TD_SHOTS=/path/to/shots node --test --test-concurrency=1 e2e/takedown-lockdown.e2e.mjs
 *
 * An employer with a project that has a hired intern (timesheet), a scheduled interview, a cart entry and proposals.
 * Admin takes the project down in the admin UI; the employer then tries every action (API: 409 project_taken_down with
 * the real CSRF token; UI: disabled), uses Contact admin, admin restores, everything works again; an intern sees the
 * on-hold offer. Needs a server with TRUST_PROXY=1.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

import { hash } from "@node-rs/argon2";
import { chromium } from "playwright";

import { api, url } from "./lib/browser.mjs";
import { businessStartDate } from "./lib/start-date.mjs";
import { closeDb, one, rows } from "./lib/db.mjs";
import { RUN, PASSWORD, cleanup, mkEmployer, mkIntern, mkProject, mkProposal, signedIn } from "./lib/fixtures2.mjs";

const SHOTS = process.env.TD_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let browser;
const P = {};
let E, I1, I2, I3, I4, ADMIN, pid, qid, hiredId, tsId, ivId, sentId, acceptedId;
const NAME = `Growth Lab Intern ${RUN}`;
const QNAME = `Control Project ${RUN}`;
const REASON = `Misleading stipend ${RUN}`;
const CODE = "project_taken_down";
const futureDay = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

async function shot(name, who, path, width) {
  if (!SHOTS) return;
  const ctx = await browser.newContext({ storageState: P[who].state, viewport: { width, height: width > 500 ? 900 : 844 } });
  const page = await ctx.newPage();
  await page.goto(url(path), { waitUntil: "load" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true });
  await ctx.close();
}
const shots = async (n, who, path) => {
  await shot(n, who, path, 1440);
  await shot(n, who, path, 390);
};

before(async () => {
  browser = await chromium.launch({ headless: true });
  E = await mkEmployer("tl");
  await one(`UPDATE employers SET website_url='https://qorvex.example.com', company_size='11-50', primary_contact_name='Asha Rao', primary_contact_role='Founder' WHERE id=$1 RETURNING id`, [E.id]);
  [I1, I2, I3, I4] = [await mkIntern("tl1"), await mkIntern("tl2"), await mkIntern("tl3"), await mkIntern("tl4")];
  ADMIN = { key: "tl-admin", role: "admin", email: `tl-admin-${RUN}@findtern.test`, password: PASSWORD };
  const a = await one(`INSERT INTO admins (email, password, name, role) VALUES ($1,$2,'Takedown Admin','super_admin') RETURNING id`, [ADMIN.email, await hash(PASSWORD)]);
  ADMIN.id = a.id;
  pid = await mkProject(E.id, NAME);
  qid = await mkProject(E.id, QNAME);
  // Hired placement on P with a submitted timesheet, a scheduled interview, a cart entry.
  hiredId = await mkProposal(E.id, I3.id, pid);
  const offer = { roleTitle: "Growth Intern", duration: "3m", startDate: futureDay(-10), monthlyAmount: 17600, currency: "INR" };
  await one(`UPDATE proposals SET status='hired', hired_at=now(), offer_details=$2::jsonb WHERE id=$1 RETURNING id`, [hiredId, JSON.stringify(offer)]);
  const ts = await one(
    `INSERT INTO timesheets (proposal_id, employer_id, intern_id, period_start, period_end, status, entries, submitted_at)
     VALUES ($1,$2,$3, now() - interval '8 days', now() - interval '1 day', 'submitted', '[]'::jsonb, now()) RETURNING id`,
    [hiredId, E.id, I3.id],
  );
  tsId = ts.id;
  const iv = await one(
    `INSERT INTO interviews (employer_id, intern_id, project_id, status, slot1, slot2, slot3, selected_slot, timezone)
     VALUES ($1,$2,$3,'scheduled', now() + interval '2 days', now() + interval '3 days', now() + interval '4 days', 1, 'Asia/Kolkata') RETURNING id`,
    [E.id, I1.id, pid],
  );
  ivId = iv.id;
  await one(`INSERT INTO employer_cart_items (employer_id, project_id, intern_id, list_type) VALUES ($1,$2,$3,'cart') RETURNING id`, [E.id, pid, I2.id]);
  // A control: a sent offer on the project that is NOT taken down.
  await mkProposal(E.id, I2.id, qid);
  P.E = await signedIn(browser, E);
  P.A = await signedIn(browser, ADMIN);
  P.I2 = await signedIn(browser, I2);
});

after(async () => {
  for (const p of Object.values(P)) await p.ctx.close().catch(() => {});
  await browser?.close();
  await rows(`DELETE FROM timesheets WHERE employer_id = $1`, [E?.id]).catch(() => {});
  await rows(`DELETE FROM interviews WHERE employer_id = $1`, [E?.id]).catch(() => {});
  await rows(`DELETE FROM employer_cart_items WHERE employer_id = $1`, [E?.id]).catch(() => {});
  await rows(`DELETE FROM employer_payments WHERE employer_id = $1`, [E?.id]).catch(() => {});
  await rows(`DELETE FROM contact_messages WHERE subject LIKE $1`, [`Takedown: %${RUN}`]).catch(() => {});
  await rows(`DELETE FROM admin_audit_log WHERE admin_id = $1`, [ADMIN?.id]).catch(() => {});
  await rows(`DELETE FROM admins WHERE id = $1`, [ADMIN?.id]).catch(() => {});
  await cleanup();
  await closeDb();
});

const emp = (method, path, body) => api(P.E.page, method, path, body);
const text = async (page, path) => {
  await page.goto(url(path), { waitUntil: "load" });
  await page.waitForTimeout(1000);
  return (await page.locator("body").innerText()) ?? "";
};

test("01 before the takedown: the project page is editable and there is no banner", async () => {
  const body = await text(P.E.page, `/employer/projects/${pid}/edit`);
  assert.doesNotMatch(body, /Taken down by Findtern/);
  assert.equal(await P.E.page.locator("fieldset[disabled]").count(), 0);
  await shots("01-before-edit", "E", `/employer/projects/${pid}/edit`);
});

test("02 admin takes the project down in the admin UI, with a reason", async () => {
  const page = P.A.page;
  await page.goto(url(`/admin/projects?q=${encodeURIComponent(NAME)}`), { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await shots("02-admin-projects", "A", `/admin/projects?q=${encodeURIComponent(NAME)}`);
  const row = page.locator("tr").filter({ hasText: NAME }).first();
  await row.getByRole("button", { name: /take down/i }).first().click();
  await row.getByLabel(/reason for the employer/i).fill(REASON);
  await row.getByRole("button", { name: /take down/i }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^take down$/i }).click();
  await page.waitForTimeout(2000);
  const p = await one(`SELECT taken_down_at, taken_down_reason FROM projects WHERE id=$1`, [pid]);
  assert.ok(p.taken_down_at, "takedown applied through the admin UI");
  assert.equal(p.taken_down_reason, REASON);
  // What the takedown leaves: the hired placement stays. Offers made after it (by the legacy app, or a race) are inserted next.
  sentId = await mkProposal(E.id, I2.id, pid);
  acceptedId = await mkProposal(E.id, I4.id, pid);
  await one(`UPDATE proposals SET status='accepted' WHERE id=$1 RETURNING id`, [acceptedId]);
});

test("03 every employer API action on the taken-down project answers 409 project_taken_down", async () => {
  const slot = (d) => `${futureDay(d)}T10:00`;
  const offerBody = {
    internId: I1.id, projectId: pid, flowType: "direct", agreedToPolicy: true, roleTitle: "Growth Intern", jd: "Build growth experiments.",
    additionalInfo: "You will learn to run growth experiments and read the results.", mode: "remote", startDate: businessStartDate(14), duration: "1m",
    weeklySchedule: "mon_fri", shiftFrom: "10:00", shiftTo: "18:00", timezone: "Asia/Kolkata", laptop: "company", skills: [],
  };
  const calls = [
    ["edit project", "PUT", `/api/employer/projects/${pid}`, {}],
    ["delete project", "DELETE", `/api/employer/projects/${pid}`],
    ["publish", "POST", `/api/employer/projects/${pid}/transition`, { to: "published" }],
    ["pause", "POST", `/api/employer/projects/${pid}/transition`, { to: "inactive" }],
    ["resume", "POST", `/api/employer/projects/${pid}/transition`, { to: "published", reason: "x" }],
    ["close", "POST", `/api/employer/projects/${pid}/transition`, { to: "closed" }],
    ["send proposal", "POST", `/api/employer/${E.id}/proposals`, offerBody],
    ["edit proposal", "PATCH", `/api/proposals/${sentId}`, {}],
    ["withdraw proposal", "PATCH", `/api/proposals/${sentId}/status`, { status: "withdrawn" }],
    ["shortlist add", "POST", `/api/employer/cart`, { action: "add", projectId: pid, internId: I4.id }],
    ["shortlist remove", "POST", `/api/employer/cart`, { action: "remove", projectId: pid, internId: I2.id }],
    ["book interview", "POST", `/api/employer/${E.id}/interviews`, { internId: I4.id, projectId: pid, slot1: slot(3), slot2: slot(4), slot3: slot(5) }],
    ["reschedule interview", "POST", `/api/interviews/${ivId}/reschedule`, { slot1: slot(6) }],
    ["interview reminder", "POST", `/api/interviews/${ivId}/send-reminder`, {}],
    ["join interview", "POST", `/api/interviews/${ivId}/join`, {}],
    ["interview feedback", "POST", `/api/interviews/${ivId}/feedback`, { feedback: "Strong candidate." }],
    ["mark completed", "POST", `/api/interviews/${ivId}/mark-completed`, {}],
    ["mark missed", "POST", `/api/interviews/${ivId}/mark-missed`, {}],
    ["full-time offer", "POST", `/api/employer/${E.id}/full-time-offer`, { proposalId: hiredId, jobTitle: "Growth Lead", jobMode: "remote", shiftFrom: "10:00", shiftTo: "18:00", ctcCurrency: "INR", annualCtc: 600000, offerLetterKey: `${E.id.replace(/[^a-z0-9_-]/gi, "").slice(0, 32)}-letter.pdf` }],
    ["pay: order", "POST", `/api/employer/${E.id}/payment/razorpay/order`, { currency: "INR", proposalIds: [acceptedId], mode: "upfront", paymentIndex: 0 }],
    ["pay: promo", "POST", `/api/employer/${E.id}/payment/validate-promo`, { code: "ANYCODE", currency: "INR", proposalIds: [acceptedId], mode: "upfront" }],
    ["approve timesheet", "PATCH", `/api/timesheets/${tsId}/decision`, { decision: "approved" }],
    ["reject timesheet", "PATCH", `/api/timesheets/${tsId}/decision`, { decision: "rejected", reason: "no" }],
    ["adjust timesheet", "PATCH", `/api/timesheets/${tsId}`, { entries: [{ date: futureDay(-3), status: "Present" }] }],
    ["message intern (new thread on its proposal)", "POST", `/api/threads`, { counterpartId: I3.id, proposalId: hiredId }],
  ];
  const results = [];
  for (const [label, method, path, body] of calls) {
    const r = await emp(method, path, body);
    results.push({ label, status: r.status, code: r.body?.code });
    assert.equal(r.status, 409, `${label}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.equal(r.body.code, CODE, label);
    assert.match(r.body.error, /taken down by Findtern.*view it but not change it.*Contact admin/);
  }
  console.log(JSON.stringify(results));
  // Nothing was written.
  const p = await one(`SELECT status FROM projects WHERE id=$1`, [pid]);
  assert.equal(p.status, "published");
  assert.equal((await one(`SELECT status FROM timesheets WHERE id=$1`, [tsId])).status, "submitted");
  assert.equal((await one(`SELECT status FROM proposals WHERE id=$1`, [sentId])).status, "sent");
  assert.equal((await rows(`SELECT 1 FROM employer_payments WHERE employer_id=$1`, [E.id])).length, 0);
  assert.equal((await rows(`SELECT 1 FROM employer_cart_items WHERE employer_id=$1 AND project_id=$2`, [E.id, pid])).length, 1);
});

test("04 a project that is NOT taken down is unaffected: pause and resume still work", async () => {
  const paused = await emp("POST", `/api/employer/projects/${qid}/transition`, { to: "inactive" });
  assert.equal(paused.status, 200, JSON.stringify(paused.body));
  const resumed = await emp("POST", `/api/employer/projects/${qid}/transition`, { to: "published" });
  assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
});

test("05 read-only pages: banner, reason, disabled form, no pay or approve, view-only rows", async () => {
  const page = P.E.page;
  let body = await text(page, `/employer/projects/${pid}/edit`);
  assert.match(body, /Taken down by Findtern: view only/);
  assert.match(body, new RegExp(REASON));
  assert.match(body, /Contact admin/);
  assert.ok((await page.locator("fieldset[disabled]").count()) >= 1, "form is inside a disabled fieldset");
  assert.equal(await page.getByRole("button", { name: /save changes|save draft|submit and publish/i }).count(), 0, "no save or publish button");
  await shots("03-project-view", "E", `/employer/projects/${pid}/edit`);

  body = await text(page, "/employer/projects");
  assert.match(body, /Taken down/);
  const row = page.locator("li, tr, article").filter({ hasText: NAME }).first();
  assert.equal(await row.getByRole("link", { name: /^edit$/i }).count(), 0);
  assert.equal(await row.getByRole("button", { name: /pause|resume|close|publish/i }).count(), 0);
  assert.ok((await row.getByRole("button", { name: /contact admin/i }).count()) >= 1);
  await shots("04-projects-list", "E", "/employer/projects");

  body = await text(page, `/employer/proposal/${hiredId}`);
  assert.match(body, /Taken down by Findtern: view only/);
  await shots("05-hired-proposal", "E", `/employer/proposal/${hiredId}`);

  body = await text(page, `/employer/proposal/${acceptedId}`);
  assert.equal(await page.getByRole("link", { name: /pay to confirm hire|pay now/i }).count(), 0, "no pay CTA on a taken-down project's accepted offer");
  await shots("06-accepted-proposal", "E", `/employer/proposal/${acceptedId}`);

  body = await text(page, "/employer/proposals");
  assert.match(body, /View only/, body.slice(0, 1500));
  await shots("07-proposals", "E", "/employer/proposals");

  body = await text(page, "/employer/checkout");
  assert.match(body, /Taken down: contact admin/);
  assert.equal(await page.getByRole("button", { name: /^pay/i }).count(), 0);
  await shots("08-checkout", "E", "/employer/checkout");

  body = await text(page, `/employer/timesheets/${tsId}`);
  assert.match(body, /Taken down by Findtern: view only/);
  assert.equal(await page.getByRole("button", { name: /approve|send back|reject/i }).count(), 0, "no approve on the timesheet");
  await shots("09-timesheet", "E", `/employer/timesheets/${tsId}`);

  body = await text(page, "/employer/schedule");
  assert.match(body, /Taken down: contact admin/);
  assert.equal(await page.getByRole("button", { name: /reschedule|send reminder|join/i }).count(), 0);
  await shots("10-schedule", "E", "/employer/schedule");
});

test("06 Contact admin: sent from the banner, arrives in the admin inbox tied to the project and company; rate limited", async () => {
  const page = P.E.page;
  await page.goto(url(`/employer/projects/${pid}/edit`), { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /contact admin/i }).first().click();
  await page.getByLabel(/what would you like to tell admin/i).fill(`Please restore this project, the stipend text was fixed. ${RUN}`);
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/11-contact-dialog-1440.png` });
    const ctx = await browser.newContext({ storageState: P.E.state, viewport: { width: 390, height: 844 } });
    const m = await ctx.newPage();
    await m.goto(url(`/employer/projects/${pid}/edit`), { waitUntil: "load" });
    await m.waitForTimeout(1000);
    await m.getByRole("button", { name: /contact admin/i }).first().click();
    await m.getByLabel(/what would you like to tell admin/i).fill("Please restore this project. The stipend wording was corrected.");
    await m.screenshot({ path: `${SHOTS}/11-contact-dialog-390.png` });
    await ctx.close();
  }
  await page.getByRole("button", { name: /send to admin/i }).click();
  await page.getByText(/Sent\. Findtern admin will reply by email/).waitFor({ timeout: 10_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/12-contact-sent-1440.png` });
  const m = await one(`SELECT subject, message, query_type, first_name FROM contact_messages WHERE subject = $1 ORDER BY created_at DESC LIMIT 1`, [`Takedown: ${NAME}`]);
  assert.ok(m, "a contact message exists");
  assert.match(m.message, new RegExp(pid));
  assert.match(m.message, new RegExp(E.id));
  assert.match(m.message, new RegExp(REASON));
  assert.equal(m.first_name, E.company);
  const admin = P.A.page;
  const body = await text(admin, `/admin/messages?q=${encodeURIComponent(pid)}`);
  assert.match(body, new RegExp(`Takedown: ${NAME}`));
  await shots("13-admin-inbox", "A", `/admin/messages?q=${encodeURIComponent(pid)}`);
  // Rate limit: five an hour; the one above was the first.
  let last;
  for (let i = 0; i < 6; i++) last = await emp("POST", `/api/employer/projects/${pid}/contact-admin`, { message: `again ${i}` });
  assert.equal(last.status, 429, JSON.stringify(last.body));
  // CSRF: no token, refused.
  const bare = await P.E.page.evaluate(async (path) => (await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "x" }) })).status, `/api/employer/projects/${pid}/contact-admin`);
  assert.equal(bare, 403);
});

test("07 the intern sees the offer on hold and cannot accept it", async () => {
  const page = P.I2.page;
  const body = await text(page, `/intern/proposals/${sentId}`);
  assert.match(body, /On hold/);
  assert.doesNotMatch(body, new RegExp(REASON), "the takedown reason is never shown to the intern");
  const accept = page.getByRole("button", { name: /accept/i }).first();
  if (await accept.count()) assert.equal(await accept.getAttribute("aria-disabled"), "true");
  await shots("14-intern-offer", "I2", `/intern/proposals/${sentId}`);
  const r = await api(page, "PATCH", `/api/proposals/${sentId}/status`, { status: "accepted", agreedToTerms: true });
  assert.equal(r.status, 409, JSON.stringify(r.body));
});

test("08 admin restores: the employer's actions work again at once and the banner is gone", async () => {
  const r = await api(P.A.page, "POST", `/api/admin/projects/${pid}/restore`, {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await one(`SELECT taken_down_at FROM projects WHERE id=$1`, [pid])).taken_down_at, null);
  // Not 409 any more: an empty body is now a plain 400 validation error, the shortlist add goes through or is refused on its merits.
  const edit = await emp("PUT", `/api/employer/projects/${pid}`, {});
  assert.notEqual(edit.status, 409, JSON.stringify(edit.body));
  const paused = await emp("POST", `/api/employer/projects/${pid}/transition`, { to: "inactive" });
  assert.equal(paused.status, 200, JSON.stringify(paused.body));
  const resumed = await emp("POST", `/api/employer/projects/${pid}/transition`, { to: "published" });
  assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
  const rem = await emp("POST", `/api/employer/cart`, { action: "remove", projectId: pid, internId: I2.id });
  assert.equal(rem.status, 200, JSON.stringify(rem.body));
  // The sheet has unfilled days, so approving is refused for THAT reason (its own 409), not the takedown's.
  const ts = await emp("PATCH", `/api/timesheets/${tsId}/decision`, { decision: "approved" });
  assert.notEqual(ts.body.code, CODE, JSON.stringify(ts.body));
  const back = await emp("PATCH", `/api/timesheets/${tsId}/decision`, { decision: "rejected", reason: "Please fill every day." });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  const body = await text(P.E.page, `/employer/projects/${pid}/edit`);
  assert.doesNotMatch(body, /Taken down by Findtern/);
  assert.equal(await P.E.page.locator("fieldset[disabled]").count(), 0);
  await shots("15-after-restore", "E", `/employer/projects/${pid}/edit`);
});
