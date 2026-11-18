/**
 * Notification preferences + unread proposal-update email fallback end to end (Chromium, scratch DB, MAIL_MODE=log).
 *
 *   E2E_BASE_URL=http://localhost:3152 DATABASE_URL=postgresql://findtern@127.0.0.1:55452/findtern_e2e \
 *   CRON_SECRET=<the server's> node --test --test-concurrency=1 e2e/notify-prefs.e2e.mjs   (npm run test:e2e:notify)
 *
 * Needs a migrated DB and a server started with TRUST_PROXY=1, MAIL_MODE=log, PUBLIC_ORIGIN, CRON_SECRET set and SCHEDULERS not "off"
 * (the outbox cron route is what runs the fallback scan). Creates its own employer / intern accounts and removes them.
 * The fallback tests need the server started with NOTIFY_FALLBACK=1 and E2E_NOTIFY_FALLBACK=1 here; without both, the
 * kill-switch test runs instead (default OFF: a tick queues nothing). Prefs UI/API tests run either way.
 * Notifications are back-dated in SQL (the 15-minute delay is a constant), and the cron route is called directly.
 * Employer-intern Messages (and its unread-message email) is removed; only the unread proposal-update fallback is left.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { chromium } from "playwright";

import { api, url } from "./lib/browser.mjs";
import { closeDb, one, rows } from "./lib/db.mjs";
import { mailTo } from "./lib/mail.mjs";
import { RUN, cleanup, mkEmployer, mkIntern, mkProject, mkProposal, signedIn } from "./lib/fixtures2.mjs";

const SECRET = process.env.CRON_SECRET ?? "";
const FALLBACK = process.env.E2E_NOTIFY_FALLBACK === "1";
const ON = { skip: !FALLBACK && "needs NOTIFY_FALLBACK=1 on the server (E2E_NOTIFY_FALLBACK=1)" };
const STARTED = Date.now() - 2_000;
let browser;
const P = {};
let E, I, proposalId;

before(async () => {
  assert.ok(SECRET, "CRON_SECRET must match the server's");
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  E = await mkEmployer("npE");
  I = await mkIntern("npI");
  proposalId = await mkProposal(E.id, I.id, await mkProject(E.id, `Notify project ${RUN}`));
  P.E = await signedIn(browser, E);
  P.I = await signedIn(browser, I);
});

after(async () => {
  for (const p of Object.values(P)) await p.ctx.close().catch(() => {});
  await browser?.close();
  await rows(`DELETE FROM notification_prefs WHERE user_id = ANY($1)`, [[E?.id, I?.id].filter(Boolean)]).catch(() => {});
  await rows(`DELETE FROM email_outbox WHERE campaign_id = 'notify-fallback' AND payload->>'recipientId' = ANY($1)`, [[E?.id, I?.id].filter(Boolean)]).catch(() => {});
  await cleanup();
  await closeDb();
});

const tick = async () => {
  const r = await fetch(url("/api/cron/email-outbox"), { headers: { authorization: `Bearer ${SECRET}` } });
  assert.equal(r.status, 200, `cron tick → ${r.status}`);
  return r.json();
};
const offerOutbox = (who) => rows(`SELECT status, idempotency_key FROM email_outbox WHERE campaign_id = 'notify-fallback' AND payload->>'recipientId' = $1 AND template = 'offer_unread'`, [who.id]);
const mkUpdate = async (ago) =>
  (await one(
    `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data, dedupe_key, created_at)
     VALUES ('intern',$1,'proposal_updated','Proposal updated','x',$2::jsonb,$3, now() - $4::interval) RETURNING id`,
    [I.id, JSON.stringify({ proposalId }), `np:${RUN}:${Math.random()}`, ago],
  )).id;
const offerMail = () => mailTo(I.email, { since: STARTED, subject: /proposal has an update/i });
const setPrefs = (who, emailMessages, pushMessages = true) =>
  rows(
    `INSERT INTO notification_prefs (user_id, email_messages, push_messages) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET email_messages = $2, push_messages = $3`,
    [who.id, emailMessages, pushMessages],
  );
const heartbeat = (who, ago) =>
  rows(`INSERT INTO user_presence (user_id, last_seen_at) VALUES ($1, now() - $2::interval) ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now() - $2::interval`, [who.id, ago]);
const reset = async () => {
  await rows(`DELETE FROM email_outbox WHERE campaign_id = 'notify-fallback' AND payload->>'recipientId' = ANY($1)`, [[E.id, I.id]]);
  await rows(`DELETE FROM notifications WHERE recipient_id = ANY($1)`, [[E.id, I.id]]);
  await rows(`DELETE FROM notification_prefs WHERE user_id = ANY($1)`, [[E.id, I.id]]);
  await rows(`DELETE FROM user_presence WHERE user_id = ANY($1)`, [[E.id, I.id]]);
};

/* ── settings UI + API ───────────────────────────────────────────────── */

for (const [who, path, label] of [
  ["I", "/intern/settings", "student settings"],
  ["E", "/employer/account", "employer account"],
]) {
  test(`${label}: the Notifications section toggles, persists, and rolls back on a failed save`, async () => {
    const user = who === "I" ? I : E;
    const page = await P[who].ctx.newPage();
    await page.goto(url(path), { waitUntil: "load", timeout: 60_000 });
    const section = page.locator("#notifications");
    await section.scrollIntoViewIfNeeded();
    // The employer has one switch (Tips and reminders): proposal-update reminder mail is for students.
    const first = who === "I" ? "emailMessages" : "pushMessages";
    const firstSwitch = section.getByRole("switch", { name: who === "I" ? /Email me about/ : /Tips and reminders/ });
    assert.equal(await firstSwitch.getAttribute("aria-checked"), "true", "defaults to on with no row");
    assert.equal(await section.getByRole("switch").count(), who === "I" ? 2 : 1);
    assert.match(await section.innerText(), /new proposals and offers, payments, invoices, interviews and your account.s security are always sent/);

    await firstSwitch.click();
    await page.waitForFunction((k) => document.querySelector(`#notifications [data-pref="${k}"] [role="status"]`)?.textContent?.trim(), first);
    const col = who === "I" ? "email_messages" : "push_messages";
    assert.equal((await one(`SELECT ${col} AS v FROM notification_prefs WHERE user_id = $1`, [user.id])).v, false);
    if (who === "I") assert.equal((await one(`SELECT push_messages AS v FROM notification_prefs WHERE user_id = $1`, [user.id])).v, true, "the other switch is untouched");
    await page.reload({ waitUntil: "load" });
    assert.equal(await page.locator("#notifications").getByRole("switch", { name: who === "I" ? /Email me about/ : /Tips and reminders/ }).getAttribute("aria-checked"), "false", "persisted across reload");
    if (who === "E") {
      await rows(`UPDATE notification_prefs SET push_messages = true WHERE user_id = $1`, [user.id]);
      await page.reload({ waitUntil: "load" }); // switch back on for the rollback check below
    }

    // A failed save snaps the switch back and says so.
    await page.route("**/api/notifications/prefs", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Boom" }) }));
    const tips = page.locator("#notifications").getByRole("switch", { name: /Tips and reminders/ });
    assert.equal(await tips.getAttribute("aria-checked"), "true");
    await tips.click();
    await page.locator('#notifications [role="alert"]').waitFor();
    assert.equal(await tips.getAttribute("aria-checked"), "true", "rolled back");
    assert.equal((await one(`SELECT push_messages AS v FROM notification_prefs WHERE user_id = $1`, [user.id])).v, true);
    await page.unroute("**/api/notifications/prefs");
    await page.close();
    await rows(`DELETE FROM notification_prefs WHERE user_id = $1`, [user.id]);
  });
}

test("the prefs API: session user only, strict body, no id, no required category", async () => {
  const ok = await api(P.I.page, "POST", "/api/notifications/prefs", { pushMessages: false });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body, { emailMessages: true, pushMessages: false });
  for (const bad of [{}, { emailMessages: "no" }, { userId: E.id, emailMessages: false }, { emailMessages: false, payments: false }, { required: false }]) {
    const r = await api(P.I.page, "POST", "/api/notifications/prefs", bad);
    assert.equal(r.status, 400, `${JSON.stringify(bad)} → ${r.status}`);
  }
  assert.equal(await one(`SELECT 1 AS x FROM notification_prefs WHERE user_id = $1`, [E.id]), null, "nobody else's row was written");
  const anon = await (await browser.newContext()).request.post(url("/api/notifications/prefs"), { data: { emailMessages: false } });
  assert.ok([401, 403].includes(anon.status()), `unauthenticated → ${anon.status()}`);
  await rows(`DELETE FROM notification_prefs WHERE user_id = $1`, [I.id]);
});

/* ── email fallback (unread proposal updates) ───────────────────────── */

test("kill switch: NOTIFY_FALLBACK unset (default OFF) queues and sends nothing, however old the unread update", { skip: FALLBACK && "fallback is ON for this run" }, async () => {
  await reset();
  await mkUpdate("20 minutes");
  await mkUpdate("30 hours");
  const r = await tick();
  assert.equal(r.skipped, false);
  assert.equal((await offerOutbox(I)).length, 0, "nothing queued");
  assert.equal((await offerMail()).length, 0, "nothing mailed");
  await reset();
});

test("a fresh update waits: nothing is emailed before 15 minutes", ON, async () => {
  await reset();
  await mkUpdate("5 minutes");
  await tick();
  assert.equal((await offerMail()).length, 0);
  assert.equal((await offerOutbox(I)).length, 0);
});

test("an unread proposal update: ONE email per proposal after 15 minutes; prefs off or read stops it", ON, async () => {
  await reset();
  await mkUpdate("20 minutes");
  await mkUpdate("19 minutes");
  await tick();
  await tick();
  const mail = await offerMail();
  assert.equal(mail.length, 1, "one email for two updates on one proposal");
  assert.ok(mail[0].text.includes(`/intern/proposals/${proposalId}`));
  assert.ok(!mail[0].text.includes(E.company), "company stays hidden");
  assert.equal((await offerOutbox(I)).length, 1);
  // Read, then a new one with prefs off: nothing more.
  await rows(`UPDATE notifications SET is_read = true WHERE recipient_id = $1`, [I.id]);
  await setPrefs(I, false);
  await mkUpdate("20 minutes");
  await tick();
  assert.equal((await offerMail()).length, 1);
  await reset();
});

test("an online recipient is not emailed, including one who hid their activity; offline and hidden is emailed", ON, async () => {
  await reset();
  await mkUpdate("20 minutes");
  await rows(`INSERT INTO user_presence (user_id, last_seen_at, show_activity) VALUES ($1, now(), false) ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now(), show_activity = false`, [I.id]);
  const before = (await offerMail()).length;
  await tick();
  assert.equal((await offerMail()).length, before, "live heartbeat, hidden: no email");
  await heartbeat(I, "10 minutes");
  await tick();
  assert.equal((await offerMail()).length, before + 1);
  assert.equal((await one(`SELECT show_activity FROM user_presence WHERE user_id = $1`, [I.id])).show_activity, false, "the hide setting was not touched");
  await reset();
});

test("lookback is 48 hours: a 30-hour-old unread update is emailed once, a 50-hour-old one is not", ON, async () => {
  await reset();
  const mailBefore = (await offerMail()).length;
  await mkUpdate("50 hours");
  await tick();
  assert.equal((await offerOutbox(I)).length, 0, "older than the window");
  await mkUpdate("30 hours");
  await tick();
  await tick();
  assert.equal((await offerOutbox(I)).length, 1, "inside the window, once");
  assert.equal((await offerMail()).length - mailBefore, 1, "one email");
  await reset();
});
