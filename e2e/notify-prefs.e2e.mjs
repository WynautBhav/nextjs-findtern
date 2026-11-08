/**
 * Notification preferences + unread email fallback end to end (Chromium, scratch DB, MAIL_MODE=log).
 *
 *   E2E_BASE_URL=http://localhost:3152 DATABASE_URL=postgresql://findtern@127.0.0.1:55452/findtern_e2e \
 *   CRON_SECRET=<the server's> node --test --test-concurrency=1 e2e/notify-prefs.e2e.mjs   (npm run test:e2e:notify)
 *
 * Needs a migrated DB and a server started with TRUST_PROXY=1, MAIL_MODE=log, PUBLIC_ORIGIN, CRON_SECRET set and SCHEDULERS not "off"
 * (the outbox cron route is what runs the fallback scan). Creates its own employer / intern accounts and removes them.
 * The fallback tests need the server started with NOTIFY_FALLBACK=1 and E2E_NOTIFY_FALLBACK=1 here; without both, the
 * kill-switch test runs instead (default OFF: a tick queues nothing). Prefs UI/API tests run either way.
 * Messages are back-dated in SQL (the 15-minute delay is a constant), and the cron route is called directly.
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
let E, I, proposalId, threadId;

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
const fallbackMail = (who) => mailTo(who.email, { since: STARTED, subject: /unread message/i });
const outboxFor = (who) => rows(`SELECT status, idempotency_key FROM email_outbox WHERE campaign_id = 'notify-fallback' AND payload->>'recipientId' = $1 AND template = 'message_unread'`, [who.id]);
const setPrefs = (who, emailMessages, pushMessages = true) =>
  rows(
    `INSERT INTO notification_prefs (user_id, email_messages, push_messages) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET email_messages = $2, push_messages = $3`,
    [who.id, emailMessages, pushMessages],
  );
const heartbeat = (who, ago) =>
  rows(`INSERT INTO user_presence (user_id, last_seen_at) VALUES ($1, now() - $2::interval) ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now() - $2::interval`, [who.id, ago]);
/** A message from `from` in the thread, back-dated, unread. */
async function msg(from, ago = "20 minutes") {
  const m = await one(`INSERT INTO messages (thread_id, sender_id, body, created_at) VALUES ($1,$2,'hello','2000-01-01') RETURNING id`, [threadId, from.id]);
  await rows(`UPDATE messages SET created_at = now() - $2::interval WHERE id = $1`, [m.id, ago]);
  return m.id;
}
const reset = async () => {
  await rows(`DELETE FROM messages WHERE thread_id = $1`, [threadId]);
  await rows(`DELETE FROM email_outbox WHERE campaign_id = 'notify-fallback' AND payload->>'threadId' = $1`, [threadId]);
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
    const emailSwitch = section.getByRole("switch", { name: /Email me about/ });
    assert.equal(await emailSwitch.getAttribute("aria-checked"), "true", "defaults to on with no row");
    assert.equal(await section.getByRole("switch").count(), 2);
    assert.match(await section.innerText(), /new proposals and offers, payments, invoices, interviews and your account.s security are always sent/);

    await emailSwitch.click();
    await page.waitForFunction(() => document.querySelector('#notifications [data-pref="emailMessages"] [role="status"]')?.textContent?.trim());
    assert.equal((await one(`SELECT email_messages AS v FROM notification_prefs WHERE user_id = $1`, [user.id])).v, false);
    assert.equal((await one(`SELECT push_messages AS v FROM notification_prefs WHERE user_id = $1`, [user.id])).v, true, "the other switch is untouched");
    await page.reload({ waitUntil: "load" });
    assert.equal(await page.locator("#notifications").getByRole("switch", { name: /Email me about/ }).getAttribute("aria-checked"), "false", "persisted across reload");

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

/* ── email fallback ──────────────────────────────────────────────────── */

test("kill switch: NOTIFY_FALLBACK unset (default OFF) queues and sends nothing, however old the unread message", { skip: FALLBACK && "fallback is ON for this run" }, async () => {
  if (!threadId) {
    const t = await api(P.E.page, "POST", "/api/threads", { counterpartId: I.id, proposalId });
    threadId = t.body.thread?.id ?? t.body.id;
  }
  await rows(`DELETE FROM messages WHERE thread_id = $1`, [threadId]);
  await msg(E, "20 minutes");
  await msg(E, "30 hours");
  const r = await tick();
  assert.equal(r.skipped, false);
  assert.equal((await outboxFor(I)).length, 0, "nothing queued");
  assert.equal((await fallbackMail(I)).length, 0, "nothing mailed");
  await reset();
});


test("setup: the employer opens a thread and messages the intern through the real routes", ON, async () => {
  const t = await api(P.E.page, "POST", "/api/threads", { counterpartId: I.id, proposalId });
  assert.equal(t.status, 200, JSON.stringify(t.body));
  threadId = t.body.thread?.id ?? t.body.id;
  assert.ok(threadId, JSON.stringify(t.body));
  const m = await api(P.E.page, "POST", `/api/threads/${threadId}/messages`, { body: "Hi from the employer" });
  assert.ok([200, 201].includes(m.status), JSON.stringify(m.body));
  await reset();
});

test("a fresh message waits: nothing is emailed before 15 minutes", ON, async () => {
  await msg(E, "5 minutes");
  await tick();
  assert.equal((await fallbackMail(I)).length, 0);
  assert.equal((await outboxFor(I)).length, 0);
  await reset();
});

test("an unread message after 15 minutes: ONE email to the recipient, none to the sender, a link, no body text", ON, async () => {
  await msg(E, "20 minutes");
  await msg(E, "18 minutes");
  await msg(E, "16 minutes");
  const r = await tick();
  assert.equal(r.skipped, false);
  const mail = await fallbackMail(I);
  assert.equal(mail.length, 1, `got ${mail.length}`);
  assert.match(mail[0].subject, /3 unread messages/);
  assert.ok(mail[0].text.includes(`/intern/messages/${threadId}`), "deep link to the thread");
  assert.ok(!mail[0].text.includes("hello") && !mail[0].text.includes(E.company), "no message text, no company name before a hire");
  assert.equal((await fallbackMail(E)).length, 0, "the sender is never emailed");
  const ob = await outboxFor(I);
  assert.equal(ob.length, 1);
  assert.equal(ob[0].status, "sent");
});

test("dedupe: more ticks and a new message in the same unread run send nothing more", ON, async () => {
  await tick();
  await msg(E, "17 minutes");
  await tick();
  await tick();
  assert.equal((await fallbackMail(I)).length, 1);
  assert.equal((await outboxFor(I)).length, 1);
});

test("after the thread is read, a new unread run emails again (one per window)", ON, async () => {
  const r = await api(P.I.page, "POST", `/api/threads/${threadId}/read`);
  assert.ok(r.status < 300, `read → ${r.status}`);
  await msg(E, "20 minutes");
  await tick();
  assert.equal((await fallbackMail(I)).length, 2);
  assert.equal((await outboxFor(I)).length, 2);
});

test("a message that was read before the delay is never emailed", ON, async () => {
  await reset();
  const id = await msg(E, "30 minutes");
  await rows(`UPDATE messages SET read_at = now() WHERE id = $1`, [id]);
  const before = (await fallbackMail(I)).length;
  await tick();
  assert.equal((await fallbackMail(I)).length, before);
  assert.equal((await outboxFor(I)).length, 0);
});

test("an online recipient is not emailed, including one who hid their activity (the real heartbeat decides, silently)", ON, async () => {
  await reset();
  await msg(E, "20 minutes");
  await rows(`INSERT INTO user_presence (user_id, last_seen_at, show_activity) VALUES ($1, now(), false) ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now(), show_activity = false`, [I.id]);
  const before = (await fallbackMail(I)).length;
  await tick();
  assert.equal((await fallbackMail(I)).length, before, "live heartbeat, hidden: no email");
  assert.equal((await outboxFor(I)).length, 0);
  // Gone offline (stale heartbeat), still hidden: now they are emailed. The toggle never changes whether the mail is sent.
  await heartbeat(I, "10 minutes");
  await tick();
  assert.equal((await fallbackMail(I)).length, before + 1);
  const st = await one(`SELECT show_activity FROM user_presence WHERE user_id = $1`, [I.id]);
  assert.equal(st.show_activity, false, "the hide setting was not touched");
});

test("prefs off: no email and nothing queued; the message is still in the app", ON, async () => {
  await reset();
  await setPrefs(I, false);
  await msg(E, "20 minutes");
  const before = (await fallbackMail(I)).length;
  await tick();
  assert.equal((await fallbackMail(I)).length, before);
  assert.equal((await outboxFor(I)).length, 0);
  const t = await api(P.I.page, "GET", "/api/threads");
  assert.ok(t.body.threads.find((x) => x.id === threadId).unread >= 1, "still unread in the app");
});

test("switching it off after the row was queued: skipped at send time, not sent", ON, async () => {
  await reset();
  await msg(E, "20 minutes");
  await rows(`INSERT INTO email_outbox (campaign_id, entry_id, to_email, template, payload, idempotency_key, next_at)
              VALUES ('notify-fallback','k1',$1,'message_unread',$2::jsonb,$3, now() + interval '1 hour')`,
    [I.email, JSON.stringify({ threadId, recipientId: I.id, recipientType: "intern", firstMessageId: "x" }), `notify-fallback:q-${RUN}:v0`]);
  await setPrefs(I, false);
  await rows(`UPDATE email_outbox SET next_at = now() WHERE idempotency_key = $1`, [`notify-fallback:q-${RUN}:v0`]);
  const before = (await fallbackMail(I)).length;
  await tick();
  assert.equal((await fallbackMail(I)).length, before);
  const ob = await one(`SELECT status, provider_id FROM email_outbox WHERE idempotency_key = $1`, [`notify-fallback:q-${RUN}:v0`]);
  assert.equal(ob.status, "sent");
  assert.match(ob.provider_id, /^skipped:prefs:/);
});

test("the other direction: an unread candidate message emails the employer; employer prefs off stops it", ON, async () => {
  await reset();
  await msg(I, "20 minutes");
  const before = (await fallbackMail(E)).length;
  const senderBefore = (await fallbackMail(I)).length;
  await setPrefs(E, false);
  await tick();
  assert.equal((await fallbackMail(E)).length, before, "employer prefs off");
  await setPrefs(E, true);
  await tick();
  const mail = await fallbackMail(E);
  assert.equal(mail.length, before + 1);
  assert.ok(mail.at(-1).text.includes(`/employer/messages/${threadId}`));
  assert.equal((await fallbackMail(I)).length, senderBefore, "not the sender");
});

test("an unread proposal update: ONE email per proposal after 15 minutes; prefs off or read stops it", ON, async () => {
  await reset();
  const mk = async (ago) => {
    const n = await one(
      `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data, dedupe_key, created_at)
       VALUES ('intern',$1,'proposal_updated','Proposal updated','x',$2::jsonb,$3, now() - $4::interval) RETURNING id`,
      [I.id, JSON.stringify({ proposalId }), `np:${RUN}:${Math.random()}`, ago],
    );
    return n.id;
  };
  const offerMail = () => mailTo(I.email, { since: STARTED, subject: /proposal has an update/i });
  await mk("5 minutes");
  await tick();
  assert.equal((await offerMail()).length, 0, "too fresh");
  const first = await mk("20 minutes");
  await mk("19 minutes");
  await tick();
  await tick();
  const mail = await offerMail();
  assert.equal(mail.length, 1, "one email for two updates on one proposal");
  assert.ok(mail[0].text.includes(`/intern/proposals/${proposalId}`));
  assert.ok(!mail[0].text.includes(E.company), "company stays hidden");
  // Read, then a new one with prefs off: nothing more.
  await rows(`UPDATE notifications SET is_read = true WHERE recipient_id = $1`, [I.id]);
  await setPrefs(I, false);
  await mk("20 minutes");
  await tick();
  assert.equal((await offerMail()).length, 1);
  assert.ok(first);
  await rows(`DELETE FROM email_outbox WHERE template = 'offer_unread' AND payload->>'recipientId' = $1`, [I.id]);
  await reset();
});

test("lookback is 48 hours: a 30-hour-old unread message is emailed once, a 50-hour-old one is not", ON, async () => {
  await reset();
  const mailBefore = (await fallbackMail(I)).length;
  await msg(E, "50 hours");
  await tick();
  assert.equal((await outboxFor(I)).length, 0, "older than the window");
  await msg(E, "30 hours");
  await tick();
  await tick();
  assert.equal((await outboxFor(I)).length, 1, "inside the window, once");
  const mail = (await fallbackMail(I)).slice(mailBefore);
  assert.equal(mail.length, 1, "one email");
  assert.ok(mail.every((m) => !/15 minutes/.test(m.text ?? JSON.stringify(m))), "no claim about 15 minutes");
  await reset();
});
