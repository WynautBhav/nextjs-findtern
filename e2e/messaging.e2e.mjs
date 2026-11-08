/**
 * Messaging + presence end to end (Chromium, QA stack). WRITTEN, NOT YET RUN.
 *
 *   E2E_BASE_URL=http://localhost:3500 DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_qa \
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
  const ALLOWED = ["counterpartId", "counterpartOnline", "counterpartPresence", "id", "lastMessage", "lastMessageAt", "proposalId", "unread"];
  for (const [who, side] of [["intern", P.I], ["employer", P.E]]) {
    const list = await api(side.page, "GET", "/api/threads");
    assert.equal(list.status, 200);
    assert.ok(list.body.threads.length >= 1);
    for (const t of list.body.threads) assert.deepEqual(Object.keys(t).sort(), ALLOWED, `${who} list keys`);
    const msgs = await api(side.page, "GET", `/api/threads/${threadId}/messages`);
    for (const m of msgs.body.messages) assert.deepEqual(Object.keys(m).sort(), ["body", "createdAt", "deliveredAt", "id", "mine", "readAt"], "message keys");
    const blob = JSON.stringify([list.body, msgs.body]);
    for (const v of forbidden) assert.ok(!blob.includes(v), `${who} payload leaks ${v}`);
  }
  // The pages themselves (intern side) do not print the company before hire.
  await P.I.page.goto(url("/intern/messages"), { waitUntil: "domcontentloaded" });
  await P.I.page.getByRole("list", { name: "Conversations" }).waitFor({ timeout: 15_000 });
  const body = await P.I.page.locator("main").textContent();
  for (const v of [ee.company_name, ee.company_email, ee.phone_number]) assert.ok(!body.includes(v), `messages page leaks ${v}`);
});
