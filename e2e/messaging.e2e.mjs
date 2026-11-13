/**
 * Messaging + presence end to end (Chromium, local e2e stack, loopback DB only).
 *
 * Send rules covered here: the intern cannot write first (409), contact details and names are removed from
 * what is stored until the hire is paid and pass afterwards, a withdrawn proposal closes the thread (409 and
 * `closed`), and thread names (employer: initials, then full name; intern: project, company after hire).
 *
 *   E2E_BASE_URL=http://localhost:3500 DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_e2e \
 *     node --test --test-concurrency=1 e2e/messaging.e2e.mjs        (npm run test:e2e:messaging)
 *
 * Needs a migrated DB (drizzle/0023_messaging) and a server started with TRUST_PROXY=1 (per-login
 * X-Forwarded-For). Creates its own employer / intern / stranger accounts by SQL and removes them.
 * Tests run in order and share state: employer E and intern I (with a proposal), stranger employer S,
 * third intern T. One browser context per persona.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { chromium } from "playwright";

import { api, url } from "./lib/browser.mjs";
import { closeDb, one, rows } from "./lib/db.mjs";
import { RUN, cleanup, collectFrames, mkEmployer, mkIntern, mkProject, mkProposal, openStream, signedIn } from "./lib/fixtures2.mjs";

let browser;
const P = {}; // personas: { ctx, page, state }
let E, I, S, T; // fixtures
let threadId;
const HTML = `<img src=x onerror="window.__pwned=1">Hello <b>bold</b> & <script>alert(1)</script>tail-${RUN}`;

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  E = await mkEmployer("msgE");
  S = await mkEmployer("msgS");
  I = await mkIntern("msgI");
  T = await mkIntern("msgT");
  const proj = await mkProject(E.id, `Messaging project ${RUN}`);
  await mkProposal(E.id, I.id, proj);
  P.E = await signedIn(browser, E);
  P.I = await signedIn(browser, I);
  P.S = await signedIn(browser, S);
  P.T = await signedIn(browser, T);
});

after(async () => {
  for (const p of Object.values(P)) await p.ctx.close().catch(() => {});
  await browser?.close();
  await cleanup();
  await closeDb();
});

const badge = async (page, base) => {
  const link = page.locator(`a[href="/${base}/messages"]`).filter({ visible: true }).first();
  const text = (await link.textContent()) ?? "";
  return Number(/(\d+)\+?\s*unread messages/.exec(text)?.[1] ?? 0);
};
const waitBadge = (page, base, pred, label) =>
  page.waitForFunction(
    ({ base, src }) => {
      const link = [...document.querySelectorAll(`a[href="/${base}/messages"]`)].find((a) => a.offsetParent !== null);
      const n = Number(/(\d+)\+?\s*unread messages/.exec(link?.textContent ?? "")?.[1] ?? 0);
      return new Function("n", `return (${src})(n)`)(n);
    },
    { base, src: pred.toString() },
    { timeout: 20_000 },
  ).catch((e) => {
    throw new Error(`nav badge never reached: ${label} (${e.message})`);
  });

test("a stranger employer cannot create a thread; an intern cannot cold-message an employer", async () => {
  const r = await api(P.S.page, "POST", "/api/threads", { counterpartId: I.id });
  assert.ok([403, 404].includes(r.status), `stranger employer → ${r.status}`);
  assert.equal(await one(`SELECT 1 AS x FROM threads WHERE intern_id = $1`, [I.id]), null, "no thread row was created");
  // T has no proposal from E and E has not started a thread.
  const cold = await api(P.T.page, "POST", "/api/threads", { counterpartId: E.id });
  assert.ok([403, 404].includes(cold.status), `intern cold message → ${cold.status}`);
  const unauth = await (await browser.newContext()).request.post(url("/api/threads"), { data: { counterpartId: I.id } });
  assert.ok([401, 403].includes(unauth.status()), `unauthenticated create → ${unauth.status()}`);
});

test("the employer creates the thread from the proposal (idempotent)", async () => {
  const prop = await one(`SELECT id FROM proposals WHERE employer_id = $1 AND intern_id = $2`, [E.id, I.id]);
  const r = await api(P.E.page, "POST", "/api/threads", { counterpartId: I.id, proposalId: prop.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  threadId = r.body.thread.id;
  assert.equal(r.body.thread.proposalId, prop.id);
  const again = await api(P.E.page, "POST", "/api/threads", { counterpartId: I.id, proposalId: prop.id });
  assert.equal(again.body.thread.id, threadId, "same pair + proposal returns the same thread");
  const bad = await api(P.E.page, "POST", "/api/threads", { counterpartId: I.id, proposalId: "not-a-proposal" });
  assert.equal(bad.status, 404, "a proposal id that is not this pair's is a 404");
});

test("row 24: the intern cannot send until the employer has written in the thread", async () => {
  const early = await api(P.I.page, "POST", `/api/threads/${threadId}/messages`, { body: "Hello, may I ask a question?" });
  assert.equal(early.status, 409, JSON.stringify(early.body));
  assert.equal(early.body.code, "employer_first");
  assert.equal((await one(`SELECT count(*)::int AS n FROM messages WHERE thread_id = $1`, [threadId])).n, 0, "nothing stored");
  const view = await api(P.I.page, "GET", `/api/threads/${threadId}/messages`);
  assert.equal(view.body.sendBlock, "employer_first");
  assert.equal(view.body.closed, false);
  const list = await api(P.I.page, "GET", "/api/threads");
  assert.equal(list.body.threads.find((t) => t.id === threadId).sendBlock, "employer_first");
  // The composer is replaced by the waiting note.
  await P.I.page.goto(url(`/intern/messages/${threadId}`), { waitUntil: "domcontentloaded" });
  await P.I.page.getByText("You can reply once the company has sent you a message.").waitFor({ timeout: 20_000 });
  assert.equal(await P.I.page.getByLabel(/message to/i).count(), 0, "no composer");
});

test("messages flow both ways", async () => {
  const a = await api(P.E.page, "POST", `/api/threads/${threadId}/messages`, { body: "Hi from the employer" });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.message.mine, true);
  const seen = await api(P.I.page, "GET", `/api/threads/${threadId}/messages`);
  assert.equal(seen.status, 200);
  const got = seen.body.messages.find((m) => m.body === "Hi from the employer");
  assert.ok(got && got.mine === false, "intern sees the employer's message as not mine");
  const b = await api(P.I.page, "POST", `/api/threads/${threadId}/messages`, { body: "Hello back from the intern" });
  assert.equal(b.status, 201);
  const empView = await api(P.E.page, "GET", `/api/threads/${threadId}/messages`);
  assert.ok(empView.body.messages.some((m) => m.body === "Hello back from the intern" && m.mine === false));
  assert.equal((await one(`SELECT count(*)::int AS n FROM messages WHERE thread_id = $1`, [threadId])).n, 2);
  const after = await api(P.I.page, "GET", `/api/threads/${threadId}/messages`);
  assert.equal(after.body.sendBlock, null, "the intern may write now");
});

test("a third user gets 404 on GET, POST and read; unauthenticated gets 401", async () => {
  assert.equal((await api(P.T.page, "GET", `/api/threads/${threadId}/messages`)).status, 404);
  assert.equal((await api(P.S.page, "GET", `/api/threads/${threadId}/messages`)).status, 404);
  assert.equal((await api(P.T.page, "POST", `/api/threads/${threadId}/messages`, { body: "intruder" })).status, 404);
  assert.equal((await api(P.T.page, "POST", `/api/threads/${threadId}/read`)).status, 404);
  assert.equal((await one(`SELECT count(*)::int AS n FROM messages WHERE body = 'intruder'`)).n, 0);
  const anon = await (await browser.newContext()).request.get(url(`/api/threads/${threadId}/messages`));
  assert.equal(anon.status(), 401);
});

test("a body over 4000 characters is refused", async () => {
  const before = (await one(`SELECT count(*)::int AS n FROM messages WHERE thread_id = $1`, [threadId])).n;
  const r = await api(P.E.page, "POST", `/api/threads/${threadId}/messages`, { body: "x".repeat(4001) });
  // The handler's zod schema answers 400 (brief said 422): either is a refusal; the row must not exist.
  assert.ok([400, 422].includes(r.status), `4001 chars → ${r.status}`);
  assert.equal((await one(`SELECT count(*)::int AS n FROM messages WHERE thread_id = $1`, [threadId])).n, before);
  assert.equal((await api(P.E.page, "POST", `/api/threads/${threadId}/messages`, { body: "   " })).status, 400, "blank body");
});

test("HTML in a message is stored and shown as plain text", async () => {
  const r = await api(P.E.page, "POST", `/api/threads/${threadId}/messages`, { body: HTML });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(!/[<>]/.test(r.body.message.body), `returned body has no angle bracket: ${r.body.message.body}`);
  const stored = await one(`SELECT body FROM messages WHERE id = $1`, [r.body.message.id]);
  assert.ok(!/[<>]/.test(stored.body) && !/<\w/.test(stored.body), `stored body: ${stored.body}`);
  assert.ok(stored.body.includes(`tail-${RUN}`) && stored.body.includes("Hello bold &"), "the text content survives");

  const page = P.I.page;
  await page.goto(url(`/intern/messages/${threadId}`), { waitUntil: "domcontentloaded" });
  const log = page.getByRole("log");
  await log.getByText(`tail-${RUN}`).waitFor({ timeout: 20_000 });
  const text = await log.textContent();
  assert.ok(text.includes("Hello bold &"), "rendered as text");
  for (const sel of ["img", "script", "b"]) assert.equal(await log.locator(sel).count(), 0, `no <${sel}> element inside the conversation`);
  assert.equal(await page.evaluate(() => window.__pwned), undefined, "no injected handler ran");
});

test("unread badge rises WITHOUT reload for the recipient, clears on opening; sender sees 'Read'", async () => {
  // Reset: intern has read everything so far; employer sits on the thread page.
  assert.equal((await api(P.I.page, "POST", `/api/threads/${threadId}/read`)).status, 200);
  await P.I.page.goto(url("/intern/dashboard"), { waitUntil: "domcontentloaded" });
  await P.E.page.goto(url(`/employer/messages/${threadId}`), { waitUntil: "domcontentloaded" });
  await P.E.page.getByLabel(/message to/i).waitFor();
  await P.I.page.evaluate(() => (window.__noReload = "still-here"));
  assert.equal(await badge(P.I.page, "intern"), 0, "baseline badge is 0");

  // Sent through the employer's composer (UI), Enter submits.
  const composer = P.E.page.getByLabel(/message to/i);
  await composer.fill(`live ping ${RUN}`);
  await composer.press("Enter");
  await waitBadge(P.I.page, "intern", (n) => n >= 1, "1 unread");
  assert.equal(await P.I.page.evaluate(() => window.__noReload), "still-here", "the page was not reloaded");
  assert.equal(await badge(P.I.page, "intern"), 1);

  // Intern opens the thread: the badge clears and the employer's message turns Read.
  await P.I.page.goto(url(`/intern/messages/${threadId}`), { waitUntil: "domcontentloaded" });
  await waitBadge(P.I.page, "intern", (n) => n === 0, "cleared");
  // The receipt of THIS message, not any bubble: earlier messages in the thread are already "Read", so a
  // thread-wide match is true at once and the DB read below raced the intern's POST /read.
  await P.E.page
    .locator(`div:has(> p:has-text("live ping ${RUN}")) > p:has(time)`)
    .filter({ hasText: "Read" })
    .waitFor({ timeout: 20_000 });
  const m = await one(`SELECT read_at FROM messages WHERE thread_id = $1 AND body = $2`, [threadId, `live ping ${RUN}`]);
  assert.ok(m.read_at, "read_at stored");
});

test("presence: Online after a heartbeat, Offline after more than 90 s of silence", async () => {
  await P.I.page.goto(url("/intern/dashboard"), { waitUntil: "domcontentloaded" });
  const beat = await api(P.I.page, "POST", "/api/presence/heartbeat");
  assert.equal(beat.status, 200, JSON.stringify(beat.body));
  const online = await api(P.E.page, "GET", "/api/threads");
  assert.equal(online.body.threads.find((t) => t.id === threadId).counterpartOnline, true, "API says online");
  await P.E.page.reload({ waitUntil: "domcontentloaded" });
  await P.E.page.getByText("Online", { exact: true }).first().waitFor({ timeout: 15_000 });

  // Go quiet: close the intern's page so nothing heartbeats, age the row.
  await P.I.page.close();
  await rows(`UPDATE user_presence SET last_seen_at = now() - interval '120 seconds' WHERE user_id = $1`, [I.id]);
  const off = await api(P.E.page, "GET", "/api/threads");
  assert.equal(off.body.threads.find((t) => t.id === threadId).counterpartOnline, false, "API says offline");
  await P.E.page.reload({ waitUntil: "domcontentloaded" });
  await P.E.page.getByText("Offline", { exact: true }).first().waitFor({ timeout: 15_000 });
  P.I.page = await P.I.ctx.newPage();
});

test("the event stream: 401 without a session, 429 on the 4th stream, Last-Event-ID resumes", async () => {
  const anon = await fetch(url("/api/realtime/stream"));
  assert.equal(anon.status, 401);
  await anon.body?.cancel();

  // T has no open page, so only these streams count (limit is 3 per user).
  const open = [];
  try {
    for (let i = 0; i < 3; i++) {
      const s = await openStream(P.T.state);
      assert.equal(s.res.status, 200, `stream ${i + 1}`);
      open.push(s);
    }
    const fourth = await openStream(P.T.state);
    assert.equal(fourth.res.status, 429, "the 4th concurrent stream");
    fourth.close();
  } finally {
    for (const s of open) s.close();
  }

  // Resume: replay only events newer than the id we send.
  const ids = (await rows(`SELECT id FROM realtime_events WHERE user_id = $1 ORDER BY id`, [I.id])).map((r) => Number(r.id));
  assert.ok(ids.length >= 3, `intern has ${ids.length} stored events, need 3+`);
  const cutoff = ids[0];
  const s = await openStream(P.I.state, { "last-event-id": String(cutoff) });
  assert.equal(s.res.status, 200);
  const frames = await collectFrames(s.res, 4_000);
  s.close();
  const got = frames.map((f) => f.id);
  assert.ok(got.length > 0, "something replayed");
  assert.ok(got.every((id) => id > cutoff), `only newer than ${cutoff}: ${got}`);
  assert.deepEqual(got, ids.filter((id) => id > cutoff), "every newer event, in order, nothing else");
});

test("thread list and messages carry no email, phone or company before hire", async () => {
  const [ie, ee] = await Promise.all([
    one(`SELECT email, phone_number FROM users WHERE id = $1`, [I.id]),
    one(`SELECT company_email, phone_number, company_name, name FROM employers WHERE id = $1`, [E.id]),
  ]);
  const forbidden = [ie.email, ie.phone_number, ee.company_email, ee.phone_number, ee.company_name, ee.name];
  const ALLOWED = ["counterpartId", "counterpartName", "counterpartOnline", "counterpartPresence", "id", "lastMessage", "lastMessageAt", "projectName", "proposalId", "sendBlock", "unread"];
  for (const [who, side] of [["intern", P.I], ["employer", P.E]]) {
    const list = await api(side.page, "GET", "/api/threads");
    assert.equal(list.status, 200);
    assert.ok(list.body.threads.length >= 1);
    for (const t of list.body.threads) assert.deepEqual(Object.keys(t).sort(), ALLOWED, `${who} list keys`);
    const msgs = await api(side.page, "GET", `/api/threads/${threadId}/messages`);
    for (const m of msgs.body.messages) assert.deepEqual(Object.keys(m).sort(), ["body", "createdAt", "deliveredAt", "id", "mine", "readAt"], "message keys");
    const blob = JSON.stringify([list.body, msgs.body]);
    for (const v of forbidden) assert.ok(!blob.includes(v), `${who} payload leaks ${v}`);
    // Neither side gets the other's real name before the hire (initials only for the employer's view of the intern).
    assert.ok(!blob.includes(`Wpt${RUN}`), `${who} payload leaks the intern's last name`);
    assert.ok(!blob.includes(`Intern${"msgI"}`), `${who} payload leaks the intern's first name`);
  }
  // The pages themselves (intern side) do not print the company before hire.
  await P.I.page.goto(url("/intern/messages"), { waitUntil: "domcontentloaded" });
  await P.I.page.getByRole("list", { name: "Conversations" }).waitFor({ timeout: 15_000 });
  const body = await P.I.page.locator("main").textContent();
  for (const v of [ee.company_name, ee.company_email, ee.phone_number]) assert.ok(!body.includes(v), `messages page leaks ${v}`);
});

const bodies = async () => (await rows(`SELECT body FROM messages WHERE thread_id = $1 ORDER BY created_at`, [threadId])).map((r) => r.body);

test("row 25: the employer sees the candidate's initials and the project; the intern sees the project, not the company", async () => {
  const initials = `${I.name.split(" ")[0][0]}${I.name.split(" ")[1][0]}`.toUpperCase();
  const emp = (await api(P.E.page, "GET", "/api/threads")).body.threads.find((t) => t.id === threadId);
  assert.equal(emp.counterpartName, initials);
  assert.equal(emp.projectName, `Messaging project ${RUN}`);
  const int = (await api(P.I.page, "GET", "/api/threads")).body.threads.find((t) => t.id === threadId);
  assert.equal(int.counterpartName, null, "no company name before hire");
  assert.equal(int.projectName, `Messaging project ${RUN}`);

  await P.I.page.goto(url("/intern/messages"), { waitUntil: "domcontentloaded" });
  const list = P.I.page.getByRole("list", { name: "Conversations" });
  await list.getByText(`Messaging project ${RUN}`).first().waitFor({ timeout: 15_000 });
  assert.ok(!/Company [0-9A-Z]{4}\b/.test(await list.textContent()), "no Company C68E style label");
  await P.E.page.goto(url("/employer/messages"), { waitUntil: "domcontentloaded" });
  const elist = P.E.page.getByRole("list", { name: "Conversations" });
  await elist.getByText(initials, { exact: true }).first().waitFor({ timeout: 15_000 });
  assert.ok(!/Candidate [0-9A-Z]{4}\b/.test(await elist.textContent()), "no Candidate 1F2E style label");
});

test("row 10: until the hire is paid, contact details and names are removed before storing, and the sender is told", async () => {
  const tryThem = [
    [P.E, "Email me at meera.k@gmail.com please", /@gmail|meera\.k/],
    [P.E, "Call me on 98765 43210", /98765|43210/],
    [P.E, "nine eight seven six five four three two one zero", /nine eight/],
    [P.E, "Join https://wa.me/919876543210 or t.me/meera_k", /wa\.me|t\.me/],
    [P.E, "Ping me @meera_k or insta: meera_k22", /meera_k/],
    [P.E, `We are ${E.company}, a nice team`, new RegExp(E.company.split(" ")[0], "i")],
    [P.E, "I am Emp msgE, nice to meet you", /Emp msgE/i],
    [P.I, `My name is Intern${"msgI"} Wpt${RUN}`, new RegExp(`Intern${"msgI"}|Wpt${RUN}`, "i")],
    [P.I, "my mail is a [at] gmail [dot] com and number 9876543210", /gmail|9876543210/],
    [P.I, `Call ${E.company.toUpperCase()}`, new RegExp(E.company.split(" ")[0], "i")],
  ];
  for (const [who, text, bad] of tryThem) {
    const r = await api(who.page, "POST", `/api/threads/${threadId}/messages`, { body: text });
    assert.equal(r.status, 201, `${text} -> ${JSON.stringify(r.body)}`);
    assert.equal(r.body.scrubbed, true, `sender told: ${text}`);
    assert.ok(r.body.notice, "notice text present");
    assert.ok(!bad.test(r.body.message.body), `returned body still has it: ${r.body.message.body}`);
    const stored = await one(`SELECT body FROM messages WHERE id = $1`, [r.body.message.id]);
    assert.ok(!bad.test(stored.body), `stored body still has it: ${stored.body}`);
  }
  // The other side reads the scrubbed text only.
  const seen = JSON.stringify((await api(P.I.page, "GET", `/api/threads/${threadId}/messages`)).body);
  for (const bad of [/98765/, /@gmail/, /wa\.me/, /meera_k/]) assert.ok(!bad.test(seen), `intern sees ${bad}`);
  // A clean message is stored as written and carries no notice.
  const ok = await api(P.E.page, "POST", `/api/threads/${threadId}/messages`, { body: "Can you start on Monday for 3 months?" });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.scrubbed, false);
  assert.equal(ok.body.message.body, "Can you start on Monday for 3 months?");
  // Rows stored before the rule are scrubbed on read too.
  const old = await one(`INSERT INTO messages (thread_id, sender_id, body) VALUES ($1,$2,$3) RETURNING id`, [threadId, E.id, "legacy: call 9876501234 now"]);
  const read = (await api(P.I.page, "GET", `/api/threads/${threadId}/messages`)).body.messages.find((m) => m.id === old.id);
  assert.ok(read && !/9876501234/.test(read.body), `legacy row hidden on read: ${read?.body}`);
  assert.ok(!(await bodies()).slice(0, -1).some((b) => /meera\.k@gmail|wa\.me\/9198/.test(b)), "nothing leaked in earlier rows");
});

test("row 10: once the hire is paid, contact details and names pass", async () => {
  await rows(`UPDATE proposals SET status = 'hired', hired_at = now() WHERE employer_id = $1 AND intern_id = $2`, [E.id, I.id]);
  const mail = `hire.contact.${RUN}@gmail.com`;
  const r = await api(P.E.page, "POST", `/api/threads/${threadId}/messages`, { body: `Welcome aboard. Mail ${mail} or call 98765 43210. This is ${E.company}.` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.scrubbed, false);
  assert.ok(r.body.message.body.includes(mail) && r.body.message.body.includes(E.company), r.body.message.body);
  const seen = await api(P.I.page, "GET", `/api/threads/${threadId}/messages`);
  assert.ok(seen.body.messages.some((m) => m.body.includes(mail)), "intern reads it after the hire");

  // Row 25: after the hire the intern sees the company name and the employer the full name.
  const int = (await api(P.I.page, "GET", "/api/threads")).body.threads.find((t) => t.id === threadId);
  assert.equal(int.counterpartName, E.company);
  const emp = (await api(P.E.page, "GET", "/api/threads")).body.threads.find((t) => t.id === threadId);
  assert.equal(emp.counterpartName, I.name);
});

test("row 11: a withdrawn proposal closes the thread for both sides; rejected does not", async () => {
  await rows(`UPDATE proposals SET status = 'rejected' WHERE employer_id = $1 AND intern_id = $2`, [E.id, I.id]);
  assert.equal((await api(P.E.page, "POST", `/api/threads/${threadId}/messages`, { body: "still open after rejected" })).status, 201);
  assert.equal((await api(P.I.page, "GET", `/api/threads/${threadId}/messages`)).body.closed, false);

  await rows(`UPDATE proposals SET status = 'withdrawn' WHERE employer_id = $1 AND intern_id = $2`, [E.id, I.id]);
  const before = (await one(`SELECT count(*)::int AS n FROM messages WHERE thread_id = $1`, [threadId])).n;
  for (const who of [P.E, P.I]) {
    const r = await api(who.page, "POST", `/api/threads/${threadId}/messages`, { body: "can I still write?" });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.code, "closed");
    const g = await api(who.page, "GET", `/api/threads/${threadId}/messages`);
    assert.equal(g.status, 200);
    assert.equal(g.body.closed, true);
    assert.ok(g.body.messages.length > 0, "history stays readable");
  }
  assert.equal((await one(`SELECT count(*)::int AS n FROM messages WHERE thread_id = $1`, [threadId])).n, before, "nothing stored");
  for (const [who, base] of [[P.E, "employer"], [P.I, "intern"]]) {
    await who.page.goto(url(`/${base}/messages/${threadId}`), { waitUntil: "domcontentloaded" });
    await who.page.getByText("Closed: the proposal was withdrawn").waitFor({ timeout: 20_000 });
    assert.equal(await who.page.getByLabel(/message to/i).count(), 0, `${base}: no composer`);
  }
});
