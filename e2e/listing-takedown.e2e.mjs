/**
 * Admin listing takedown end to end (WP-I). Scratch DB only (lib/env.mjs refuses a non-loopback host).
 *
 *   E2E_BASE_URL=http://localhost:3154 DATABASE_URL=postgresql://findtern@127.0.0.1:55454/findtern_wpi \
 *     node --test --test-concurrency=1 e2e/listing-takedown.e2e.mjs      (npm run test:e2e:takedown)
 *
 * Needs a server with TRUST_PROXY=1. Creates its own admin (SQL), employer, intern and projects, removes them after.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { hash } from "@node-rs/argon2";
import { chromium } from "playwright";

import { api, url } from "./lib/browser.mjs";
import { closeDb, db, one, rows } from "./lib/db.mjs";
import { RUN, SKILLS, PASSWORD, cleanup, mkEmployer, mkIntern, mkProject, mkProposal, signedIn } from "./lib/fixtures2.mjs";

let browser;
const P = {};
const S = {}; // ids shared between tests (P holds browser sessions only)
let E, I, I2, ADMIN, pid, hiredPid;
const NAME = `Takedown Role ${RUN}`;
const REASON = `Misleading stipend ${RUN}`;
const td = (id, body) => api(P.A.page, "POST", `/api/admin/projects/${id}/takedown`, body);
const restore = (id) => api(P.A.page, "POST", `/api/admin/projects/${id}/restore`, {});
const row = (id) => one(`SELECT taken_down_at, taken_down_by, taken_down_reason, status FROM projects WHERE id = $1`, [id]);

/** Is the project on the signed-in intern's open-roles list? Filters by name so the 60-row cap cannot hide it. */
async function internSees(name) {
  await P.I.page.goto(url(`/intern/opportunities?q=${encodeURIComponent(name)}`), { waitUntil: "domcontentloaded" });
  await P.I.page.locator("main").waitFor();
  await P.I.page.getByRole("search").waitFor({ timeout: 20_000 });
  return ((await P.I.page.locator("main").textContent()) ?? "").includes(name);
}
const publicStatus = async (id) => (await fetch(url(`/opportunities/${id}`), { redirect: "manual" })).status;

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  E = await mkEmployer("tdE");
  I = await mkIntern("tdI");
  I2 = await mkIntern("tdI2");
  ADMIN = { key: "td-admin", role: "admin", email: `td-admin-${RUN}@findtern.test`, password: PASSWORD };
  const a = await one(`INSERT INTO admins (email, password, name, role) VALUES ($1,$2,'Takedown Admin','super_admin') RETURNING id`, [ADMIN.email, await hash(PASSWORD)]);
  ADMIN.id = a.id;
  pid = await mkProject(E.id, NAME);
  // The intern reaches /intern/opportunities once hired somewhere (stage "working").
  hiredPid = await mkProject(E.id, `Hired Role ${RUN}`);
  const proposalId = await mkProposal(E.id, I.id, hiredPid);
  await one(`UPDATE proposals SET status = 'hired', hired_at = now() WHERE id = $1 RETURNING id`, [proposalId]);
  P.E = await signedIn(browser, E);
  P.I = await signedIn(browser, I);
  P.A = await signedIn(browser, ADMIN);
  P.I2 = await signedIn(browser, I2);
});

after(async () => {
  for (const p of Object.values(P)) await p.ctx.close().catch(() => {});
  await browser?.close();
  await rows(`DELETE FROM interviews WHERE employer_id = $1`, [E?.id]).catch(() => {});
  await rows(`DELETE FROM employer_payments WHERE employer_id = $1`, [E?.id]).catch(() => {});
  await rows(`DELETE FROM admin_audit_log WHERE admin_id = $1`, [ADMIN?.id]).catch(() => {});
  await rows(`DELETE FROM admins WHERE id = $1`, [ADMIN?.id]).catch(() => {});
  await cleanup();
  await closeDb();
});

test("before the takedown the listing is public and on the intern's list", async () => {
  assert.equal(await publicStatus(pid), 200);
  assert.equal(await internSees(NAME), true);
});

test("non-admins get 403, bad bodies 400/422, unknown id 404; nothing is written", async () => {
  for (const who of ["E", "I"]) {
    const r = await api(P[who].page, "POST", `/api/admin/projects/${pid}/takedown`, { reason: REASON });
    assert.ok([401, 403].includes(r.status), `${who}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  assert.equal((await restore(pid)).status, 200, "admin restore of a live listing is a no-op");
  assert.equal((await td(pid, {})).status, 400);
  assert.equal((await td(pid, { reason: "   " })).status, 400);
  assert.equal((await td(pid, { reason: REASON, extra: 1 })).status, 400, "strict body");
  assert.equal((await td(pid, { reason: "x".repeat(501) })).status, 400);
  assert.equal((await td("00000000-0000-0000-0000-000000000000", { reason: REASON })).status, 404);
  assert.equal((await row(pid)).taken_down_at, null);
});

test("admin takes it down: fields, audit row, employer notification, status untouched", async () => {
  const r = await td(pid, { reason: REASON });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { ok: true, takenDown: true });
  const p = await row(pid);
  assert.ok(p.taken_down_at);
  assert.equal(p.taken_down_by, ADMIN.id);
  assert.equal(p.taken_down_reason, REASON);
  assert.equal(p.status, "published");
  const audit = await rows(`SELECT meta FROM admin_audit_log WHERE action = 'project.takedown' AND target_id = $1`, [pid]);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].meta.reason, REASON);
  const notes = await rows(`SELECT title, message FROM notifications WHERE recipient_id = $1 AND type = 'project_taken_down'`, [E.id]);
  assert.equal(notes.length, 1);
  assert.match(notes[0].message, new RegExp(REASON));
});

test("taking down again is a no-op 200: no second audit row, no second notification, same stamp", async () => {
  const before = await row(pid);
  const r = await td(pid, { reason: "A different reason" });
  assert.equal(r.status, 200);
  assert.equal(r.body.unchanged, true);
  const after = await row(pid);
  assert.equal(after.taken_down_reason, REASON);
  assert.equal(after.taken_down_at.getTime(), before.taken_down_at.getTime());
  assert.equal((await rows(`SELECT 1 FROM admin_audit_log WHERE action = 'project.takedown' AND target_id = $1`, [pid])).length, 1);
  assert.equal((await rows(`SELECT 1 FROM notifications WHERE recipient_id = $1 AND type = 'project_taken_down'`, [E.id])).length, 1);
});

test("the listing is gone for candidates at once: public page 404, not on the intern's list", async () => {
  assert.equal(await publicStatus(pid), 404);
  assert.equal(await internSees(NAME), false);
  await P.I.page.goto(url(`/intern/opportunities/${pid}`), { waitUntil: "domcontentloaded" });
  assert.doesNotMatch((await P.I.page.locator("main").textContent()) ?? "", new RegExp(NAME));
});

test("the employer sees why, cannot send an offer (409) and cannot delete it (409)", async () => {
  await P.E.page.goto(url("/employer/projects"), { waitUntil: "domcontentloaded" });
  await P.E.page.getByText("Taken down by Findtern").waitFor({ timeout: 20_000 });
  assert.match((await P.E.page.locator("main").textContent()) ?? "", new RegExp(REASON));
  const start = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const offer = await api(P.E.page, "POST", `/api/employer/${E.id}/proposals`, {
    internId: I.id, projectId: pid, flowType: "direct", agreedToPolicy: true, roleTitle: "Engineer", jd: "Build things.", mode: "remote",
    startDate: start, duration: "1m", shiftFrom: "09:00", shiftTo: "17:00", timezone: "Asia/Kolkata", laptop: "company", skills: SKILLS.slice(0, 4),
  });
  assert.equal(offer.status, 409, JSON.stringify(offer.body));
  assert.match(offer.body.error, /took this listing down/);
  const del = await api(P.E.page, "DELETE", `/api/employer/projects/${pid}`);
  assert.equal(del.status, 409, JSON.stringify(del.body));
  assert.ok((await row(pid)), "still there");
});

test("admin UI: the projects list shows Taken down and a Restore action", async () => {
  await P.A.page.goto(url(`/admin/projects?q=${encodeURIComponent(NAME)}`), { waitUntil: "domcontentloaded" });
  await P.A.page.getByText("Taken down", { exact: true }).waitFor({ timeout: 20_000 });
  assert.ok(await P.A.page.getByRole("button", { name: "Restore" }).isVisible());
});

test("restore clears the fields, audits, notifies, and the listing is back for candidates", async () => {
  const r = await restore(pid);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { ok: true, takenDown: false });
  const p = await row(pid);
  assert.equal(p.taken_down_at, null);
  assert.equal(p.taken_down_by, null);
  assert.equal(p.taken_down_reason, null);
  assert.equal((await rows(`SELECT 1 FROM admin_audit_log WHERE action = 'project.restore' AND target_id = $1`, [pid])).length, 1);
  assert.equal((await rows(`SELECT 1 FROM notifications WHERE recipient_id = $1 AND type = 'project_restored'`, [E.id])).length, 1);
  assert.equal(await publicStatus(pid), 200);
  assert.equal(await internSees(NAME), true);
  assert.equal((await restore(pid)).body.unchanged, true, "restore twice is a no-op");
});

test("admin UI: take down through the dialog", async () => {
  await P.A.page.goto(url(`/admin/projects?q=${encodeURIComponent(NAME)}`), { waitUntil: "domcontentloaded" });
  await P.A.page.getByRole("button", { name: "Take down…" }).first().click();
  const take = P.A.page.getByRole("button", { name: "Take down…" }).first();
  assert.equal(await take.isDisabled(), true, "needs a reason");
  await P.A.page.getByLabel("Reason for the employer (required)").fill("UI reason");
  await take.click();
  await P.A.page.getByRole("dialog").getByRole("button", { name: "Take down", exact: true }).click();
  await P.A.page.getByText("Taken down", { exact: true }).waitFor({ timeout: 20_000 });
  assert.equal((await row(pid)).taken_down_reason, "UI reason");
});

// ── A taken-down listing also freezes offers already made on it. The listing is down here (UI test above). ──
const accept = (who, proposalId) => api(P[who].page, "PATCH", `/api/proposals/${proposalId}/status`, { status: "accepted", agreedToTerms: true });
const decline = (who, proposalId) => api(P[who].page, "PATCH", `/api/proposals/${proposalId}/status`, { status: "rejected" });
const status = async (id) => (await one(`SELECT status FROM proposals WHERE id = $1`, [id])).status;

test("taken down: the intern cannot accept an existing offer (409), nothing changes, and the UI shows it as unavailable", async () => {
  assert.ok((await row(pid)).taken_down_at, "precondition: listing is down");
  const offerId = await mkProposal(E.id, I.id, pid);
  const r = await accept("I", offerId);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.match(r.body.error, /took this listing down/);
  assert.equal(await status(offerId), "sent", "still open, not accepted");
  assert.equal(await one(`SELECT 1 AS x FROM proposals WHERE id = $1 AND offer_details ? 'termsAcceptedAt'`, [offerId]), null, "no terms stamp");

  await P.I.page.goto(url(`/intern/proposals/${offerId}`), { waitUntil: "domcontentloaded" });
  const btn = P.I.page.getByRole("button", { name: /Accept this offer/ });
  await btn.waitFor({ timeout: 20_000 });
  assert.equal(await btn.getAttribute("aria-disabled"), "true", "Accept is marked unavailable");
  assert.equal(await btn.getAttribute("disabled"), null, "not natively disabled, so Tab still reaches it and its reason");
  await btn.focus();
  assert.equal(await btn.evaluate((el) => el === document.activeElement), true, "the button takes keyboard focus");
  const reasonId = await btn.getAttribute("aria-describedby");
  assert.match((await P.I.page.locator(`[id="${reasonId}"]`).textContent()) ?? "", /took this listing down/, "aria-describedby points at the reason");
  await btn.click({ force: true }); // force: Playwright otherwise waits for an enabled button
  assert.equal(await P.I.page.getByRole("dialog").count(), 0, "clicking the unavailable Accept opens nothing");
  assert.match((await P.I.page.locator("main").textContent()) ?? "", /took this listing down/);
  assert.equal(await P.I.page.getByRole("button", { name: "Turn it down" }).isDisabled(), false, "declining stays available");
  // On a 390 px phone the reason is in the same block as the buttons, above them, so it is on screen with the Accept button.
  await P.I.page.setViewportSize({ width: 390, height: 844 });
  try {
    await P.I.page.goto(url(`/intern/proposals/${offerId}`), { waitUntil: "domcontentloaded" });
    const reason = P.I.page.locator(`[id="${await P.I.page.getByRole("button", { name: /Accept this offer/ }).getAttribute("aria-describedby")}"]`);
    await reason.waitFor({ timeout: 20_000 });
    // The reason sits directly above the buttons in the same bar, so wherever the Accept button is on screen, the reason is too.
    await P.I.page.getByRole("button", { name: /Accept this offer/ }).scrollIntoViewIfNeeded();
    const box = await reason.boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= 844, `reason is inside the 390x844 viewport: ${JSON.stringify(box)}`);
  } finally {
    await P.I.page.setViewportSize({ width: 1280, height: 900 });
  }
  S.offerId = offerId;
});

test("taken down: the intern can still decline an offer on it", async () => {
  const other = await mkProposal(E.id, I2.id, pid);
  const r = await decline("I2", other);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await status(other), "rejected");
});

const order = (proposalId) =>
  api(P.E.page, "POST", `/api/employer/${E.id}/payment/razorpay/order`, { currency: "INR", proposalIds: [proposalId], mode: "upfront", paymentIndex: 0 });

test("taken down: the employer cannot open a payment for an accepted offer (409), and nothing is written", async () => {
  const intern = await mkIntern("tdI3");
  const offerId = await mkProposal(E.id, intern.id, pid);
  await one(
    `UPDATE proposals SET status = 'accepted', currency = 'INR', offer_details = $2::jsonb WHERE id = $1 RETURNING id`,
    [offerId, JSON.stringify({ roleTitle: "Role", duration: "1m", monthlyAmount: 10000, startDate: "2099-01-01" })],
  );
  const r = await order(offerId);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, "listing_taken_down");
  assert.match(r.body.error, /took this listing down/);
  assert.equal(await status(offerId), "accepted", "not hired");
  assert.equal((await one(`SELECT count(*)::int AS n FROM employer_payments WHERE employer_id = $1`, [E.id])).n, 0, "no order row opened");
  S.payOfferId = offerId;
});

test("taken down: the intern cannot book an interview slot (409); the interview stays pending", async () => {
  const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
  const iv = await one(
    `INSERT INTO interviews (employer_id, intern_id, project_id, status, slot1, slot2, slot3, timezone) VALUES ($1,$2,$3,'pending',$4,$5,$6,'Asia/Kolkata') RETURNING id`,
    [E.id, I.id, pid, day(3), day(4), day(5)],
  );
  S.interviewId = iv.id;
  const r = await api(P.I.page, "POST", `/api/interviews/${iv.id}/select-slot`, { slot: 1 });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, "listing_taken_down");
  assert.equal((await one(`SELECT status FROM interviews WHERE id = $1`, [iv.id])).status, "pending");
});

test("taken down: the full-time fee of an offer the intern accepted BEFORE the takedown is still payable", async () => {
  const intern = await mkIntern("tdI5");
  const offerId = await mkProposal(E.id, intern.id, pid);
  await one(
    `UPDATE proposals SET status = 'accepted', currency = 'INR', offer_details = $2::jsonb WHERE id = $1 RETURNING id`,
    [offerId, JSON.stringify({ roleTitle: "Engineer", startDate: "2099-01-01", fullTimeOffer: { jobTitle: "Engineer", annualCtcMinor: 60000000 } })],
  );
  const r = await api(P.E.page, "POST", `/api/employer/${E.id}/payment/razorpay/order`, { currency: "INR", proposalIds: [offerId], mode: "upfront", paymentIndex: 0 });
  assert.notEqual(r.body?.code, "listing_taken_down", `refused as taken down: ${JSON.stringify(r.body)}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await status(offerId), "hired", "the hire the intern already made is completed");
});

test("accept race: a takedown that commits after the early check but before the write still refuses the accept", async () => {
  const racePid = await mkProject(E.id, `Race Role ${RUN}`);
  const intern = await mkIntern("tdI4");
  P.I4 = await signedIn(browser, intern);
  const offerId = await mkProposal(E.id, intern.id, racePid);
  const client = await db().connect();
  let reply;
  try {
    // An admin takedown in flight: it holds the project row and has not committed.
    await client.query("BEGIN");
    await client.query(`UPDATE projects SET taken_down_at = now(), taken_down_by = $2, taken_down_reason = 'race' WHERE id = $1`, [racePid, ADMIN.id]);
    // The intern accepts now. The early read cannot see the uncommitted takedown, so it passes.
    const inflight = api(P.I4.page, "PATCH", `/api/proposals/${offerId}/status`, { status: "accepted", agreedToTerms: true });
    const early = await Promise.race([inflight, new Promise((ok) => setTimeout(() => ok("waiting"), 2500))]);
    assert.equal(early, "waiting", `the accept should wait on the project row lock, got ${JSON.stringify(early)}`);
    await client.query("COMMIT");
    reply = await inflight;
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
  assert.equal(reply.status, 409, JSON.stringify(reply.body));
  assert.equal(reply.body.code, "listing_taken_down");
  assert.equal(await status(offerId), "sent", "not accepted");
});

test("restored: the same offer can be accepted, paid for and its interview booked again", async () => {
  assert.equal((await restore(pid)).status, 200);
  const r = await accept("I", S.offerId);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await status(S.offerId), "accepted");
  const paid = await order(S.payOfferId);
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(await status(S.payOfferId), "hired");
  const slot = await api(P.I.page, "POST", `/api/interviews/${S.interviewId}/select-slot`, { slot: 1 });
  assert.equal(slot.status, 200, JSON.stringify(slot.body));
  assert.equal((await one(`SELECT status FROM interviews WHERE id = $1`, [S.interviewId])).status, "scheduled");
});

// ── Roster-import retention (WP-I part 3): the cron route against the real table. ──
test("roster-import purge cron: 401 without the secret; deletes only expired rows, audited, idempotent", { skip: !process.env.CRON_SECRET && "CRON_SECRET not set for this run" }, async () => {
  const mk = (tag, interval) =>
    one(
      `INSERT INTO college_roster_imports (college_id, file_name, file_sha256, mapping, rows, counts, created_by, expires_at)
       VALUES ('td-college-${RUN}', $1, $2, '{"name":0,"email":1,"phone":null}'::jsonb, '[{"name":"Asha","email":"asha@example.com"}]'::jsonb, '{}'::jsonb, 'td-admin', now() + $3::interval) RETURNING id`,
      [`${tag}.csv`, `${tag}-${RUN}`, interval],
    );
  const old = await mk("old", "-1 day");
  const fresh = await mk("fresh", "10 days");
  try {
    const call = (auth) => fetch(url("/api/cron/roster-import-purge"), { headers: auth ? { authorization: auth } : {} });
    assert.equal((await call(null)).status, 401);
    assert.equal((await call("Bearer wrong")).status, 401);
    assert.equal((await one(`SELECT 1 AS x FROM college_roster_imports WHERE id = $1`, [old.id])).x, 1, "unauthorised call deleted nothing");

    const auditBefore = (await rows(`SELECT 1 FROM admin_audit_log WHERE action = 'roster_import.purge'`)).length;
    const ok = await call(`Bearer ${process.env.CRON_SECRET}`);
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.ok(body.deleted >= 1, JSON.stringify(body));
    assert.equal(await one(`SELECT 1 AS x FROM college_roster_imports WHERE id = $1`, [old.id]), null);
    assert.ok(await one(`SELECT 1 AS x FROM college_roster_imports WHERE id = $1`, [fresh.id]), "unexpired row kept");
    const audits = await rows(`SELECT admin_id, meta FROM admin_audit_log WHERE action = 'roster_import.purge'`);
    assert.equal(audits.length, auditBefore + 1);
    assert.doesNotMatch(JSON.stringify(audits), /asha|example\.com/i, "no personal data in the audit trail");

    const again = await (await call(`Bearer ${process.env.CRON_SECRET}`)).json();
    assert.deepEqual(again, { deleted: 0, more: false });
    assert.equal((await rows(`SELECT 1 FROM admin_audit_log WHERE action = 'roster_import.purge'`)).length, auditBefore + 1, "idempotent: no second audit row");
  } finally {
    await rows(`DELETE FROM college_roster_imports WHERE college_id = $1`, [`td-college-${RUN}`]);
    await rows(`DELETE FROM admin_audit_log WHERE action = 'roster_import.purge'`);
  }
});
