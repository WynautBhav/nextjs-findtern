/**
 * Messaging, presence and live updates (PLAN §2, WP-A; owner answers OA1, OA2).
 *
 *   employer sends a proposal → opens the thread (one per pair) → the intern
 *   receives the message WITHOUT reloading and the Messages badge goes +1 →
 *   the intern replies, the employer receives it without reloading → "Seen";
 *   phone numbers / emails are hidden until the hire is paid; non-participants
 *   get 404; one email per unread burst and none while the recipient is online;
 *   presence is activity based, never a time, switchable off by the student.
 *
 * Specs for contracts that are not merged yet fail here until they are (the
 * report names which); assertions are not weakened to pass.
 *
 * Run through e2e/run.mjs (`npm run e2e`, E2E_SPECS=messaging-presence).
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { chromium } from "playwright";

import { baseUrl, ROOT, testDatabaseUrl } from "./lib/env.mjs";
import { visit } from "./lib/browser.mjs";
import { mailTo } from "./lib/mail.mjs";
import {
  closeDb, dateOnly, db, eventually, expectNoText, expectText, one, rows, seedAdmin, seedCollege, seedEmployer, seedIntern,
  seedProject, send, sendOk, signedInContext,
} from "./lib/fixtures.mjs";

testDatabaseUrl();

const SINCE = Date.now() - 2000;
const state = {};
let browser;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => page.screenshot({ path: join(ROOT, "e2e", ".artifacts", `fail-messaging-${name}.png`), fullPage: true }).catch(() => {});

/** An intern's presence row, set directly (time travel: the labels are worked out at query time). */
async function setPresence(internId, { seenAgoMs, activeAgoMs, hidden = false }) {
  await db().query(
    `INSERT INTO user_presence (user_type, user_id, last_seen_at, last_active_at, hidden)
     VALUES ('intern', $1, now() - ($2::int * interval '1 millisecond'), CASE WHEN $3::int IS NULL THEN NULL ELSE now() - ($3::int * interval '1 millisecond') END, $4)
     ON CONFLICT (user_type, user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, last_active_at = excluded.last_active_at, hidden = excluded.hidden`,
    [internId, seenAgoMs, activeAgoMs ?? null, hidden],
  );
}

const thread = (ctx, id, after = "") => send(ctx, "GET", `/api/messages/threads/${id}${after ? `?after=${after}` : ""}`);
const post = (ctx, id, body, clientId = randomUUID()) => send(ctx, "POST", `/api/messages/threads/${id}/messages`, { body, clientId });
const counts = async (ctx) => (await send(ctx, "GET", "/api/live?once=1")).body;
const mailsToIntern = (since) => mailTo(state.intern.email, { since, subject: /message/i });

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  state.employer = await seedEmployer({ label: "msg-emp" });
  state.otherEmployer = await seedEmployer({ label: "msg-emp2" });
  state.intern = await seedIntern({ label: "msg-int", firstName: "Asha", score: 8, paid: true, skills: ["React", "SQL", "Python", "Excel"] });
  state.stranger = await seedIntern({ label: "msg-stranger", firstName: "Zoya", score: 8, paid: true });
  state.projectId = await seedProject(state.employer.id, { name: "Messaging Analytics Role", skills: ["React", "SQL", "Python", "Excel"] });
  state.employerCtx = await signedInContext(browser, state.employer);
  state.internCtx = await signedInContext(browser, state.intern);
  state.strangerCtx = await signedInContext(browser, state.stranger);
  state.otherEmployerCtx = await signedInContext(browser, state.otherEmployer);
});

after(async () => {
  await browser?.close();
  await closeDb();
});

/* ── Opening a thread ───────────────────────────────────────────────────── */

test("an employer sends a proposal (the thing that opens messaging)", async () => {
  const res = await sendOk(state.employerCtx, "POST", `/api/employer/${state.employer.id}/proposals`, {
    internId: state.intern.id,
    projectId: state.projectId,
    flowType: "direct",
    agreedToPolicy: true,
    roleTitle: "Analytics Intern",
    jd: "Build and maintain weekly dashboards for the analytics team.",
    mode: "remote",
    location: "Remote",
    startDate: dateOnly(21),
    duration: "3m",
    weeklySchedule: "mon_fri",
    shiftFrom: "09:00",
    shiftTo: "18:00",
    timezone: "Asia/Kolkata",
    laptop: "candidate",
    paidLeavesPerMonth: 1,
    skills: ["React", "SQL"],
  }, [201]);
  state.proposalId = res.proposal.id;
  assert.ok(state.proposalId);
});

test("no proposal, no thread: another employer or intern cannot open one on it (404)", async () => {
  assert.ok(state.proposalId);
  const other = await send(state.otherEmployerCtx, "POST", "/api/messages/threads", { proposalId: state.proposalId });
  assert.equal(other.status, 404, `another employer: ${JSON.stringify(other.body)}`);
  const stranger = await send(state.strangerCtx, "POST", "/api/messages/threads", { proposalId: state.proposalId });
  assert.equal(stranger.status, 404, `another intern: ${JSON.stringify(stranger.body)}`);
  const bogus = await send(state.employerCtx, "POST", "/api/messages/threads", { proposalId: "00000000-0000-0000-0000-000000000000" });
  assert.equal(bogus.status, 404);
  const none = await rows(`SELECT id FROM message_threads WHERE employer_id = $1 AND intern_id = $2`, [state.employer.id, state.intern.id]);
  assert.equal(none.length, 0, "refused attempts opened nothing");
  const noCsrf = await state.employerCtx.request.post(new URL("/api/messages/threads", baseUrl()).toString(), {
    data: { proposalId: state.proposalId }, headers: { origin: baseUrl() }, failOnStatusCode: false,
  });
  assert.equal(noCsrf.status(), 403, "a write without the CSRF header is refused");
});

test("the employer opens the thread from the proposal page with the Message button [UI]", async () => {
  assert.ok(state.proposalId);
  const page = await state.employerCtx.newPage();
  try {
    await visit(page, `/employer/proposal/${state.proposalId}`);
    await page.getByRole("button", { name: /^message/i }).first().click();
    await page.waitForURL(/\/employer\/messages\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    state.threadId = page.url().split("/").pop();
  } catch (err) {
    await shot(page, "open-thread");
    throw err;
  } finally {
    await page.close();
  }
  const t = await rows(`SELECT id, proposal_id FROM message_threads WHERE employer_id = $1 AND intern_id = $2`, [state.employer.id, state.intern.id]);
  assert.equal(t.length, 1);
  assert.equal(t[0].proposal_id, state.proposalId, "the thread remembers the proposal that opened it");
});

test("one thread per pair: opening again (either side) returns the same thread, 200 not 201", async () => {
  assert.ok(state.threadId);
  const again = await send(state.employerCtx, "POST", "/api/messages/threads", { proposalId: state.proposalId });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.threadId, state.threadId);
  const fromIntern = await send(state.internCtx, "POST", "/api/messages/threads", { proposalId: state.proposalId });
  assert.equal(fromIntern.status, 200, JSON.stringify(fromIntern.body));
  assert.equal(fromIntern.body.threadId, state.threadId);
  assert.equal((await rows(`SELECT id FROM message_threads WHERE employer_id = $1 AND intern_id = $2`, [state.employer.id, state.intern.id])).length, 1);
});

/* ── Masking and who may read ───────────────────────────────────────────── */

test("masking: the employer sees initials, the intern sees 'A company on Findtern' and the role, never the company", async () => {
  assert.ok(state.threadId);
  const asEmployer = await thread(state.employerCtx, state.threadId);
  assert.equal(asEmployer.status, 200, JSON.stringify(asEmployer.body));
  const empView = JSON.stringify(asEmployer.body);
  assert.ok(!empView.includes(state.intern.lastName), "the employer does not get the intern's surname before hire");

  const asIntern = await thread(state.internCtx, state.threadId);
  assert.equal(asIntern.status, 200, JSON.stringify(asIntern.body));
  const internView = JSON.stringify(asIntern.body);
  assert.match(asIntern.body.counterpart?.name ?? "", /A company on Findtern/);
  assert.ok(!internView.includes(state.employer.companyName), "the intern never gets the company name before hire");
  assert.ok(!internView.includes(state.employer.name), "…nor the employer's name");
});

test("non-participants get 404 on every thread route (no id probing); guests 401; a placement officer never sees messages", async () => {
  assert.ok(state.threadId);
  for (const [label, ctx] of [["another intern", state.strangerCtx], ["another employer", state.otherEmployerCtx]]) {
    assert.equal((await thread(ctx, state.threadId)).status, 404, `${label}: GET thread`);
    assert.equal((await post(ctx, state.threadId, "let me in")).status, 404, `${label}: POST message`);
    assert.equal((await send(ctx, "POST", `/api/messages/threads/${state.threadId}/read`, {})).status, 404, `${label}: POST read`);
  }
  assert.equal((await thread(state.strangerCtx, "00000000-0000-0000-0000-000000000000")).status, 404, "an unknown id looks the same");
  const guest = await browser.newContext({ baseURL: baseUrl() });
  const g = await guest.request.get(new URL(`/api/messages/threads/${state.threadId}`, baseUrl()).toString(), { failOnStatusCode: false });
  assert.equal(g.status(), 401, "signed out");
  await guest.close();

  const admin = await seedAdmin();
  const adminCtx = await signedInContext(browser, admin);
  const college = await seedCollege(adminCtx, { name: undefined, seats: 5 });
  const tpoCtx = await signedInContext(browser, college.tpo);
  const asTpo = await thread(tpoCtx, state.threadId);
  assert.ok([401, 403, 404].includes(asTpo.status), `a TPO got ${asTpo.status}`);
  assert.equal((await post(tpoCtx, state.threadId, "hello")).status === 201, false, "a TPO cannot post");
  assert.ok(!JSON.stringify(asTpo.body).includes("messages"), "no message payload for a TPO");
  await adminCtx.close();
  await tpoCtx.close();
});

/* ── Presence labels ────────────────────────────────────────────────────── */

test("heartbeat: every intern beats (no college needed), active beats set last_active_at, rate limit is one write per 10 s", async () => {
  await db().query(`DELETE FROM user_presence WHERE user_id = $1`, [state.intern.id]);
  const first = await send(state.internCtx, "POST", "/api/intern/college/heartbeat", { active: false });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  let row = await one(`SELECT last_seen_at, last_active_at, hidden FROM user_presence WHERE user_type = 'intern' AND user_id = $1`, [state.intern.id]);
  assert.ok(row, "a presence row exists for an intern with no college");
  assert.equal(row.last_active_at, null, "an inactive beat never marks the intern active");
  assert.equal(row.hidden, false);
  await sleep(10_500);
  const active = await send(state.internCtx, "POST", "/api/intern/college/heartbeat", { active: true });
  assert.equal(active.status, 200);
  row = await one(`SELECT last_seen_at, last_active_at FROM user_presence WHERE user_type = 'intern' AND user_id = $1`, [state.intern.id]);
  assert.ok(row.last_active_at && Date.now() - row.last_active_at.getTime() < 5000, "an active beat sets last_active_at");
  const seenAt = row.last_seen_at.getTime();
  const burst = await send(state.internCtx, "POST", "/api/intern/college/heartbeat", { active: true });
  assert.equal(burst.status, 200, "an extra beat inside 10 s is a 200 no-op");
  const after = await one(`SELECT last_seen_at FROM user_presence WHERE user_type = 'intern' AND user_id = $1`, [state.intern.id]);
  assert.equal(after.last_seen_at.getTime(), seenAt, "…and writes nothing");
  const asEmployer = await send(state.employerCtx, "POST", "/api/intern/college/heartbeat", { active: true });
  assert.ok([401, 403].includes(asEmployer.status), "an employer cannot beat as an intern");
});

test("labels: Online now / Active today / Active this week, then nothing; never a time", async () => {
  assert.ok(state.threadId);
  const label = async () => (await thread(state.employerCtx, state.threadId)).body.counterpart?.presence ?? null;
  await setPresence(state.intern.id, { seenAgoMs: 5_000, activeAgoMs: 10_000 });
  assert.equal(await label(), "Online now");
  await setPresence(state.intern.id, { seenAgoMs: 76_000, activeAgoMs: 76_000 });
  assert.equal(await label(), "Active today", "seen more than 75 s ago is no longer online");
  await setPresence(state.intern.id, { seenAgoMs: 5_000, activeAgoMs: 121_000 });
  assert.equal(await label(), "Active today", "a tab open but idle for 2 minutes is not online");
  await setPresence(state.intern.id, { seenAgoMs: 2 * 86_400_000, activeAgoMs: 2 * 86_400_000 });
  assert.equal(await label(), "Active this week");
  await setPresence(state.intern.id, { seenAgoMs: 8 * 86_400_000, activeAgoMs: 8 * 86_400_000 });
  assert.equal(await label(), null, "older than a week shows nothing");
  await setPresence(state.intern.id, { seenAgoMs: 5_000, activeAgoMs: null });
  assert.equal(await label(), null, "never active shows nothing");
  assert.ok(!/\d+\s*(min|sec|hour|day)s?\s*ago/i.test(JSON.stringify((await thread(state.employerCtx, state.threadId)).body)), "no exact time in the payload");
});

test("opt-out: PATCH /api/intern/presence hides the label; showing again restores it", async () => {
  assert.ok(state.threadId);
  await setPresence(state.intern.id, { seenAgoMs: 5_000, activeAgoMs: 10_000 });
  const off = await send(state.internCtx, "PATCH", "/api/intern/presence", { visible: false });
  assert.equal(off.status, 200, JSON.stringify(off.body));
  assert.equal(off.body.visible, false);
  assert.equal((await one(`SELECT hidden FROM user_presence WHERE user_id = $1`, [state.intern.id])).hidden, true);
  assert.equal((await thread(state.employerCtx, state.threadId)).body.counterpart?.presence ?? null, null, "hidden: no label even when active right now");
  const bad = await send(state.internCtx, "PATCH", "/api/intern/presence", { visible: "yes" });
  assert.equal(bad.status, 400);
  const on = await send(state.internCtx, "PATCH", "/api/intern/presence", { visible: true });
  assert.equal(on.body.visible, true);
  assert.equal((await thread(state.employerCtx, state.threadId)).body.counterpart?.presence, "Online now");
  const asEmployer = await send(state.employerCtx, "PATCH", "/api/intern/presence", { visible: false });
  assert.ok([401, 403].includes(asEmployer.status), "only an intern can change this");
});

test("Settings has the switch 'Show employers when I'm active' and it saves [UI]", async () => {
  const page = await state.internCtx.newPage();
  try {
    await setPresence(state.intern.id, { seenAgoMs: 5_000, activeAgoMs: 10_000 });
    await visit(page, "/intern/settings");
    const toggle = page.getByRole("switch", { name: /show employers when i.m active/i }).or(page.getByRole("checkbox", { name: /show employers when i.m active/i })).first();
    await toggle.waitFor();
    assert.equal(await toggle.isChecked(), true, "on by default");
    await toggle.click();
    await eventually("hidden saved", async () => (await one(`SELECT hidden FROM user_presence WHERE user_id = $1`, [state.intern.id])).hidden === true);
    assert.equal((await thread(state.employerCtx, state.threadId)).body.counterpart?.presence ?? null, null, "the employer no longer sees a label");
    await page.reload();
    assert.equal(await page.getByRole("switch", { name: /show employers/i }).or(page.getByRole("checkbox", { name: /show employers/i })).first().isChecked(), false, "stays off after a reload");
    await page.getByRole("switch", { name: /show employers/i }).or(page.getByRole("checkbox", { name: /show employers/i })).first().click();
    await eventually("shown again", async () => (await one(`SELECT hidden FROM user_presence WHERE user_id = $1`, [state.intern.id])).hidden === false);
  } catch (err) {
    await shot(page, "settings-toggle");
    throw err;
  } finally {
    await page.close();
  }
});

test("a hidden tab stops beating and a visible one beats at once (no 'online forever') [UI]", async () => {
  const page = await state.internCtx.newPage();
  const beats = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/intern/college/heartbeat")) beats.push(Date.now());
  });
  try {
    await visit(page, "/intern/dashboard");
    await eventually("the first beat on load", () => beats.length >= 1, { timeoutMs: 8_000 });
    // The tab goes to the background.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const hiddenAt = Date.now();
    await sleep(36_000); // longer than the 30 s beat interval
    const duringHidden = beats.filter((t) => t > hiddenAt + 500);
    assert.equal(duringHidden.length, 0, `a hidden tab sent ${duringHidden.length} beat(s)`);
    // Back to the foreground: an immediate beat.
    const visibleAt = Date.now();
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await eventually("a beat when the tab is visible again", () => beats.some((t) => t >= visibleAt), { timeoutMs: 5_000 });
  } catch (err) {
    await shot(page, "hidden-tab");
    throw err;
  } finally {
    await page.close();
  }
});

/* ── Messages, live ─────────────────────────────────────────────────────── */

test("live: the intern gets the employer's message WITHOUT reloading, the Messages badge goes to 1, and a toast/alert surfaces it [UI]", async () => {
  assert.ok(state.threadId);
  const internPage = await state.internCtx.newPage();
  const employerPage = await state.employerCtx.newPage();
  const text = "Hello Asha, we liked your profile. Free for a quick chat?";
  try {
    await visit(internPage, "/intern/dashboard");
    await internPage.evaluate(() => (window.__e2eSameDocument = "yes"));
    assert.equal((await counts(state.internCtx)).messages, 0, "nothing unread yet");

    await visit(employerPage, `/employer/messages/${state.threadId}`);
    const box = employerPage.getByRole("textbox", { name: /message/i });
    await box.fill(text);
    await box.press("Enter");
    await employerPage.getByText(text).first().waitFor();

    // The badge on the intern's nav, within 5 s, with no reload.
    const nav = internPage.getByRole("link", { name: /^Messages/ }).filter({ visible: true }).first();
    await eventually("a badge of 1 on Messages", async () => /\b1\b/.test(await nav.innerText()), { timeoutMs: 8_000 });
    assert.equal(await internPage.evaluate(() => window.__e2eSameDocument), "yes", "the page was not reloaded");
    assert.equal((await counts(state.internCtx)).messages, 1, "the live counts say 1 unread message");
    assert.ok((await counts(state.internCtx)).latest, "the newest unread notification is offered for a toast");
  } catch (err) {
    await shot(internPage, "live-intern");
    await shot(employerPage, "live-employer");
    throw err;
  } finally {
    await internPage.close();
    await employerPage.close();
  }
});

test("live: an open thread receives the reply without reloading; the sender sees 'Seen' once it is read [UI]", async () => {
  assert.ok(state.threadId);
  const internPage = await state.internCtx.newPage();
  const employerPage = await state.employerCtx.newPage();
  const reply = "Thanks! Yes, I am free tomorrow afternoon.";
  try {
    await visit(employerPage, `/employer/messages/${state.threadId}`);
    await employerPage.evaluate(() => (window.__e2eSameDocument = "yes"));
    await visit(internPage, `/intern/messages/${state.threadId}`);
    await internPage.getByText("Hello Asha, we liked your profile").first().waitFor();
    // Opening the thread read it.
    await eventually("the intern's unread count back to 0", async () => (await counts(state.internCtx)).messages === 0, { timeoutMs: 8_000 });
    await eventually("the employer's thread shows Seen", async () => /\bSeen\b/.test(await employerPage.locator("main").innerText()), { timeoutMs: 8_000 });
    assert.ok((await thread(state.employerCtx, state.threadId)).body.counterpartReadAt, "counterpartReadAt is set");

    const box = internPage.getByRole("textbox", { name: /message/i });
    await box.fill(reply);
    await box.press("Enter");
    await employerPage.getByText(reply).first().waitFor({ timeout: 8_000 });
    assert.equal(await employerPage.evaluate(() => window.__e2eSameDocument), "yes", "the employer's page was not reloaded");
  } catch (err) {
    await shot(internPage, "reply-intern");
    await shot(employerPage, "reply-employer");
    throw err;
  } finally {
    await internPage.close();
    await employerPage.close();
  }
});

test("GET ?after=<messageId> returns only newer messages; every message has a timestamp", async () => {
  const all = await thread(state.employerCtx, state.threadId);
  assert.equal(all.status, 200);
  assert.ok(all.body.messages.length >= 2);
  assert.ok(all.body.messages.every((m) => m.createdAt && !Number.isNaN(Date.parse(m.createdAt))), "every message carries a timestamp");
  assert.ok(all.body.messages.some((m) => m.mine) && all.body.messages.some((m) => !m.mine), "mine/theirs flags both ways");
  const firstId = all.body.messages[0].id;
  const newer = await thread(state.employerCtx, state.threadId, firstId);
  assert.equal(newer.body.messages.length, all.body.messages.length - 1);
  assert.ok(!newer.body.messages.some((m) => m.id === firstId));
});

/* ── Send rules ─────────────────────────────────────────────────────────── */

test("sending: a retry with the same clientId is one message (201 then 200); bad bodies are 400", async () => {
  const clientId = randomUUID();
  const first = await post(state.employerCtx, state.threadId, "Idempotent hello", clientId);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const replay = await post(state.employerCtx, state.threadId, "Idempotent hello", clientId);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.message.id, first.body.message.id, "the same message comes back");
  assert.equal((await rows(`SELECT id FROM messages WHERE thread_id = $1 AND client_id = $2`, [state.threadId, clientId])).length, 1);
  assert.equal((await post(state.employerCtx, state.threadId, "   ")).status, 400, "blank");
  assert.equal((await post(state.employerCtx, state.threadId, "x".repeat(2001))).status, 400, "over 2000 characters");
  assert.equal((await send(state.employerCtx, "POST", `/api/messages/threads/${state.threadId}/messages`, { body: "no id" })).status, 400, "no clientId");
  assert.equal((await post(state.employerCtx, state.threadId, "y".repeat(2000))).status, 201, "exactly 2000 is fine");
});

test("sending: more than 20 a minute is a 429", async () => {
  // A fresh pair, so the earlier sends do not count.
  const emp = await seedEmployer({ label: "msg-rate" });
  const intern = await seedIntern({ label: "msg-rate-i", score: 8, paid: true });
  const projectId = await seedProject(emp.id, { name: "Rate Limit Role" });
  const ctx = await signedInContext(browser, emp);
  try {
    const proposal = await sendOk(ctx, "POST", `/api/employer/${emp.id}/proposals`, {
      internId: intern.id, projectId, flowType: "direct", agreedToPolicy: true, roleTitle: "Rate Intern", jd: "Rate test.", mode: "remote", location: "Remote",
      startDate: dateOnly(21), duration: "3m", weeklySchedule: "mon_fri", shiftFrom: "09:00", shiftTo: "18:00", timezone: "Asia/Kolkata", laptop: "candidate", paidLeavesPerMonth: 0, skills: [],
    }, [201]);
    const { threadId } = await sendOk(ctx, "POST", "/api/messages/threads", { proposalId: proposal.proposal.id }, [200, 201]);
    const statuses = [];
    for (let i = 0; i < 24; i++) statuses.push((await post(ctx, threadId, `burst ${i}`)).status);
    assert.equal(statuses.filter((s) => s === 201).length, 20, `statuses: ${statuses.join(",")}`);
    assert.ok(statuses.slice(20).every((s) => s === 429), "the 21st and later are 429");
  } finally {
    await ctx.close();
  }
});

/* ── Contact details ────────────────────────────────────────────────────── */

test("contact scrub: phone and email are hidden until the hire is paid; the original is never stored", async () => {
  const raw = "Call me on 98765 43210 or write to hiring.manager@acme-example.com, also wa.me/919876543210";
  const sent = await post(state.employerCtx, state.threadId, raw);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const seen = await thread(state.internCtx, state.threadId);
  const m = seen.body.messages.find((x) => x.id === sent.body.message.id);
  assert.ok(m, "the intern sees the message");
  assert.match(m.body, /\[hidden until hire\]/);
  assert.equal(m.redacted, true);
  for (const secret of ["98765", "43210", "hiring.manager", "acme-example", "wa.me"]) {
    assert.ok(!m.body.includes(secret), `the intern got "${secret}"`);
    assert.ok(!sent.body.message.body.includes(secret), `the sender's echo kept "${secret}"`);
  }
  const stored = await one(`SELECT body, redacted FROM messages WHERE id = $1`, [sent.body.message.id]);
  assert.equal(stored.redacted, true);
  for (const secret of ["98765", "43210", "hiring.manager"]) assert.ok(!stored.body.includes(secret), `the database kept "${secret}"`);
  // The same rule for the intern writing to the employer.
  const back = await post(state.internCtx, state.threadId, "My number is +91-98765-43210");
  const empView = (await thread(state.employerCtx, state.threadId)).body.messages.find((x) => x.id === back.body.message.id);
  assert.ok(!empView.body.includes("98765"), "an intern's number is hidden from the employer too");
  // Ordinary numbers are untouched.
  const plain = await post(state.employerCtx, state.threadId, "The internship is 3 months, 20 hours a week, from 2026.");
  assert.equal(plain.body.message.redacted, false);
  assert.match(plain.body.message.body, /3 months, 20 hours a week/);
});

test("contact scrub: after a paid hire the same details go through", async () => {
  await db().query(`UPDATE proposals SET status = 'hired', hired_at = now() WHERE id = $1`, [state.proposalId]);
  const raw = "Now that you are hired: 98765 43210 or hiring.manager@acme-example.com";
  const sent = await post(state.employerCtx, state.threadId, raw);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const m = (await thread(state.internCtx, state.threadId)).body.messages.find((x) => x.id === sent.body.message.id);
  assert.ok(m.body.includes("98765 43210") && m.body.includes("hiring.manager@acme-example.com"), "details visible after hire");
  assert.equal(m.redacted, false);
  // Back to a pre-hire state for the email tests below.
  await db().query(`UPDATE proposals SET status = 'sent', hired_at = NULL WHERE id = $1`, [state.proposalId]);
});

/* ── Email fallback ─────────────────────────────────────────────────────── */

test("email: none while the recipient is online; one per unread burst while they are not; another after they read", async () => {
  assert.ok(state.threadId);
  await send(state.internCtx, "POST", `/api/messages/threads/${state.threadId}/read`, {});

  // (a) online → no email
  await setPresence(state.intern.id, { seenAgoMs: 2_000, activeAgoMs: 5_000 });
  const t0 = Date.now();
  assert.equal((await post(state.employerCtx, state.threadId, "Ping while you are online")).status, 201);
  await sleep(3_000);
  assert.equal((await mailsToIntern(t0 - 500)).length, 0, "no email to an online recipient");

  // (b) offline → exactly one email for a burst of two
  await send(state.internCtx, "POST", `/api/messages/threads/${state.threadId}/read`, {});
  await setPresence(state.intern.id, { seenAgoMs: 10 * 60_000, activeAgoMs: 10 * 60_000 });
  const t1 = Date.now();
  assert.equal((await post(state.employerCtx, state.threadId, "First message while you are away")).status, 201);
  assert.equal((await post(state.employerCtx, state.threadId, "Second message, same burst")).status, 201);
  await eventually("one email to the offline intern", async () => (await mailsToIntern(t1 - 500)).length >= 1, { timeoutMs: 15_000 });
  await sleep(2_500);
  const burst = await mailsToIntern(t1 - 500);
  assert.equal(burst.length, 1, `a burst of two messages sent ${burst.length} emails`);
  expectNoText(burst[0].text, /98765|@acme-example/, "the email carries no contact details");
  expectNoText(burst[0].text, new RegExp(state.employer.companyName), "the email never names the company before hire");

  // (c) after the intern reads, the next away-message emails again
  await send(state.internCtx, "POST", `/api/messages/threads/${state.threadId}/read`, {});
  await sleep(1_100);
  const t2 = Date.now();
  assert.equal((await post(state.employerCtx, state.threadId, "A new message after you read")).status, 201);
  await eventually("a second email after a read", async () => (await mailsToIntern(t2 - 500)).length >= 1, { timeoutMs: 15_000 });
  expectText(burst[0].subject, /message/i, "the subject says it is a message");
});

/* ── Notifications ──────────────────────────────────────────────────────── */

test("notifications: marking another person's notification read is refused (recipient type is checked too)", async () => {
  const mine = await one(`SELECT id FROM notifications WHERE recipient_type = 'intern' AND recipient_id = $1 AND is_read = false ORDER BY created_at DESC LIMIT 1`, [state.intern.id]);
  assert.ok(mine, "the intern has an unread notification");
  const asStranger = await send(state.strangerCtx, "POST", `/api/notifications/${mine.id}/read`, {});
  assert.ok([403, 404].includes(asStranger.status), `a stranger got ${asStranger.status}`);
  assert.equal((await one(`SELECT is_read FROM notifications WHERE id = $1`, [mine.id])).is_read, false, "still unread");
  const asEmployer = await send(state.employerCtx, "POST", `/api/notifications/${mine.id}/read`, {});
  assert.ok([403, 404].includes(asEmployer.status), `an employer got ${asEmployer.status}`);
  assert.equal((await one(`SELECT is_read FROM notifications WHERE id = $1`, [mine.id])).is_read, false);
});

test("live stream: /api/live?once=1 answers LiveCounts for both roles; SSE sends an initial counts event; guests get 401", async () => {
  for (const ctx of [state.internCtx, state.employerCtx]) {
    const c = await counts(ctx);
    assert.equal(typeof c.notifications, "number");
    assert.equal(typeof c.messages, "number");
    assert.ok("latest" in c && "lastMessageAt" in c);
  }
  const page = await state.internCtx.newPage();
  try {
    await visit(page, "/intern/dashboard");
    const first = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const es = new EventSource("/api/live");
          const t = setTimeout(() => (es.close(), resolve({ timeout: true })), 8000);
          es.addEventListener("counts", (e) => (clearTimeout(t), es.close(), resolve({ data: JSON.parse(e.data) })));
          es.onerror = () => {};
        }),
    );
    assert.ok(!first.timeout, "no counts event within 8 s");
    assert.equal(typeof first.data.messages, "number");
  } finally {
    await page.close();
  }
  const guest = await browser.newContext({ baseURL: baseUrl() });
  const g = await guest.request.get(new URL("/api/live?once=1", baseUrl()).toString(), { failOnStatusCode: false });
  assert.equal(g.status(), 401);
  await guest.close();
});

test("inbox: the list shows the thread with the last message and an unread dot; one pane on a phone, no sideways scroll [UI]", async () => {
  const ctx = await signedInContext(browser, state.intern, { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  try {
    await send(state.employerCtx, "POST", `/api/messages/threads/${state.threadId}/messages`, { body: "Inbox preview message", clientId: randomUUID() });
    await visit(page, "/intern/messages");
    await page.getByText(/Inbox preview message/).first().waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, "no horizontal scroll at 390 px");
    const body = await page.locator("main").innerText();
    expectNoText(body, new RegExp(state.employer.companyName), "the inbox never names the company before hire");
  } catch (err) {
    await shot(page, "inbox-390");
    throw err;
  } finally {
    await ctx.close();
  }
});
