/**
 * Presence visibility end to end (Chromium, QA stack).
 *
 *   E2E_BASE_URL=http://localhost:3541 DATABASE_URL=postgresql://findtern@127.0.0.1:55441/wpd \
 *     node --test --test-concurrency=1 e2e/presence.e2e.mjs        (npm run test:e2e:presence)
 *
 * Needs a migrated DB (0027) and a server started with TRUST_PROXY=1. Creates its own employer / intern accounts
 * by SQL and removes them. PRESENCE_SHOTS=<dir> also writes screenshots at 390 and 1440.
 * Story: the employer sees the candidate by default; stale heartbeats read as offline; the candidate hides it in
 * settings; the employer loses it everywhere (pages, threads API, SSE) and sees nothing in its place.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

import { chromium } from "playwright";

import { api, url } from "./lib/browser.mjs";
import { closeDb, one, rows } from "./lib/db.mjs";
import { seedAdmin } from "./lib/fixtures.mjs";
import { loginState } from "./lib/session.mjs";
import { RUN, cleanup, collectFrames, mkEmployer, mkIntern, mkProject, mkProposal, openStream, signedIn } from "./lib/fixtures2.mjs";

const SHOTS = process.env.PRESENCE_SHOTS;
let browser;
let E, I, P = {}, threadId, proposalId;
const VIEWS = [
  ["390", { width: 390, height: 844 }],
  ["1440", { width: 1440, height: 900 }],
];

const setSeen = (ago) =>
  one(`INSERT INTO user_presence (user_id, last_seen_at) VALUES ($1, now() - $2::interval) ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now() - $2::interval RETURNING 1 AS x`, [I.id, ago]);
const threadsOf = async () => {
  const r = await api(P.E.page, "GET", "/api/threads");
  assert.equal(r.status, 200);
  return r.body.threads.find((t) => t.id === threadId);
};
/** The pages hold an SSE stream open, so "networkidle" never comes: load, then give client fetches a moment. */
const settle = async (page, path) => {
  await page.goto(url(path), { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(2_500);
};
const text = async (path, vp) => {
  const page = await P.E.ctx.newPage();
  await page.setViewportSize(vp ?? { width: 1280, height: 900 });
  await settle(page, path);
  const body = await page.locator("body").innerText();
  return { page, body };
};
/** The employer pages that can carry the candidate's presence (labels may be sr-only, which innerText still returns). */
const EMPLOYER_PAGES = () => ["/employer/dashboard", "/employer/proposals", `/employer/proposal/${proposalId}`, `/employer/intern/${I.id}`, "/employer/candidates"];
const PRESENCE_RE = /Active now|Last seen|Offline|Online/;
const shot = async (page, name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

before(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
  E = await mkEmployer("prE");
  I = await mkIntern("prI");
  // In the employer pool: scored, interviewed, approved, activation paid.
  await one(
    `UPDATE intern_onboarding SET extra_data = $2::jsonb, city = 'Pune', state = 'Maharashtra' WHERE user_id = $1 RETURNING 1 AS x`,
    [I.id, JSON.stringify({ findternScore: 8.2, ratings: { interview: 8 }, approvalStatus: "Approved", payment: { isPaid: true }, openToWork: true })],
  );
  // The hiring screens bounce an employer whose company profile is incomplete (lib/employer-setup.ts).
  await one(
    `UPDATE employers SET website_url = 'https://example.com', company_size = '11-50', primary_contact_name = 'Pat Lee', primary_contact_role = 'Founder' WHERE id = $1 RETURNING 1 AS x`,
    [E.id],
  );
  const proj = await mkProject(E.id, `Presence project ${RUN}`);
  await mkProposal(E.id, I.id, proj);
  P.E = await signedIn(browser, E);
  P.I = await signedIn(browser, I);
  const prop = await one(`SELECT id FROM proposals WHERE employer_id = $1 AND intern_id = $2`, [E.id, I.id]);
  proposalId = prop.id;
  const r = await api(P.E.page, "POST", "/api/threads", { counterpartId: I.id, proposalId: prop.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  threadId = r.body.thread?.id ?? r.body.id ?? r.body.threadId;
  assert.ok(threadId, JSON.stringify(r.body));
});

after(async () => {
  for (const p of Object.values(P)) await p.ctx.close().catch(() => {});
  await browser?.close();
  await cleanup();
  await closeDb();
});

test("toggle API: auth, role, CSRF, validation", async () => {
  const anon = await browser.newContext();
  const noAuth = await anon.request.post(url("/api/intern/presence-visibility"), { data: { showActivity: false } });
  assert.ok([401, 403].includes(noAuth.status()), `anonymous → ${noAuth.status()}`);
  // Signed in but no CSRF header.
  const noCsrf = await P.I.ctx.request.post(url("/api/intern/presence-visibility"), { data: { showActivity: false } });
  assert.equal(noCsrf.status(), 403);
  // An employer cannot use it.
  const asEmployer = await api(P.E.page, "POST", "/api/intern/presence-visibility", { showActivity: false });
  assert.equal(asEmployer.status, 403);
  for (const bad of [{}, { showActivity: "no" }, { showActivity: false, userId: E.id }]) {
    const r = await api(P.I.page, "POST", "/api/intern/presence-visibility", bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  const row = await one(`SELECT show_activity FROM user_presence WHERE user_id = $1`, [I.id]);
  assert.ok(!row || row.show_activity === true, "rejected requests changed nothing");
  await anon.close();
});

test("default: the employer sees the candidate as active now (threads API, pages)", async () => {
  const hb = await api(P.I.page, "POST", "/api/presence/heartbeat");
  assert.equal(hb.status, 200);
  await setSeen("2 seconds");
  const t = await threadsOf();
  assert.equal(t.counterpartOnline, true);
  assert.equal(t.counterpartPresence, "Active now");

  for (const [name, vp] of VIEWS) {
    const msgs = await text(`/employer/messages/${threadId}`, vp);
    assert.match(msgs.body, /Active now/);
    await shot(msgs.page, `employer-thread-online-${name}`);
    await msgs.page.close();

    const cands = await text("/employer/candidates", vp);
    assert.match(cands.body, /Active now/, "candidate card shows the presence label");
    await shot(cands.page, `employer-candidates-online-${name}`);
    await cands.page.close();

    const prof = await text(`/employer/intern/${I.id}`, vp);
    assert.match(prof.body, /Active now/, "profile header shows the presence label");
    await shot(prof.page, `employer-profile-online-${name}`);
    await prof.page.close();
  }
  // Positive control for the hidden-state sweep below: these pages do render the label while it is visible.
  for (const path of ["/employer/proposals", `/employer/proposal/${proposalId}`]) {
    const pg = await text(path);
    assert.match(pg.body, /Active now/, `${path} shows the label while visible`);
    await pg.page.close();
  }
});

test("stale heartbeat reads as offline, never online", async () => {
  await setSeen("3 hours 10 minutes");
  const t = await threadsOf();
  assert.equal(t.counterpartOnline, false);
  assert.equal(t.counterpartPresence, "Last seen 3h ago");
  const cands = await text("/employer/candidates");
  assert.match(cands.body, /Last seen 3h ago/);
  assert.doesNotMatch(cands.body, /Active now/);
  await shot(cands.page, "employer-candidates-lastseen-1280");
  await cands.page.close();

  await setSeen("40 days");
  const old = await threadsOf();
  assert.equal(old.counterpartPresence, "Offline");
  const prof = await text(`/employer/intern/${I.id}`);
  assert.match(prof.body, /Offline/);
  assert.doesNotMatch(prof.body, /Last seen/);
  await prof.page.close();
});

test("the candidate sees the toggle in settings, on by default, and flips it", async () => {
  await setSeen("20 seconds");
  for (const [name, vp] of VIEWS) {
    const page = await P.I.ctx.newPage();
    await page.setViewportSize(vp);
    await settle(page, "/intern/settings#privacy");
    const sw = page.getByRole("switch", { name: "Show when I'm active to employers" });
    await sw.waitFor();
    assert.equal(await sw.getAttribute("aria-checked"), "true", "on by default");
    await shot(page, `candidate-settings-on-${name}`);
    if (name === "1440") {
      // Keyboard: focus and Space flip it.
      await sw.focus();
      await page.keyboard.press("Space");
      await page.getByText("Employers can no longer see when you're active.").waitFor();
      assert.equal(await sw.getAttribute("aria-checked"), "false");
      await shot(page, `candidate-settings-off-${name}`);
    }
    await page.close();
  }
  const row = await one(`SELECT show_activity FROM user_presence WHERE user_id = $1`, [I.id]);
  assert.equal(row.show_activity, false);
  // Reload: the choice is remembered, and the candidate always sees their own state.
  const again = await P.I.ctx.newPage();
  await settle(again, "/intern/settings#privacy");
  assert.equal(await again.getByRole("switch", { name: "Show when I'm active to employers" }).getAttribute("aria-checked"), "false");
  await again.close();
});

test("hidden: the employer sees nothing, anywhere, and no timestamp leaks", async () => {
  // A REAL heartbeat after the hide: it must refresh last_seen_at without flipping show_activity back on.
  await setSeen("1 hour");
  const hb = await api(P.I.page, "POST", "/api/presence/heartbeat");
  assert.equal(hb.status, 200, JSON.stringify(hb.body));
  const beat = await one(`SELECT show_activity, last_seen_at > now() - interval '30 seconds' AS fresh FROM user_presence WHERE user_id = $1`, [I.id]);
  assert.equal(beat.show_activity, false, "a heartbeat does not undo the hide");
  assert.equal(beat.fresh, true, "the heartbeat did record (so the hide is applied on read, not by not recording)");
  const t = await threadsOf();
  assert.equal(t.counterpartOnline, false);
  assert.equal(t.counterpartPresence, null);
  const raw = JSON.stringify((await api(P.E.page, "GET", "/api/threads")).body);
  assert.doesNotMatch(raw, /lastSeen|last_seen/);

  for (const [name, vp] of VIEWS) {
    const msgs = await text(`/employer/messages/${threadId}`, vp);
    assert.doesNotMatch(msgs.body, /Active now|Last seen|Offline|Online/);
    await shot(msgs.page, `employer-thread-hidden-${name}`);
    await msgs.page.close();

    const cands = await text("/employer/candidates", vp);
    assert.doesNotMatch(cands.body, /Active now|Last seen|Offline/);
    await shot(cands.page, `employer-candidates-hidden-${name}`);
    await cands.page.close();

    const prof = await text(`/employer/intern/${I.id}`, vp);
    assert.doesNotMatch(prof.body, /Active now|Last seen|Offline/);
    await shot(prof.page, `employer-profile-hidden-${name}`);
    await prof.page.close();
  }
  // Every employer page that can show presence (dashboard, proposals, proposal, profile, candidates), as rendered text.
  for (const path of EMPLOYER_PAGES()) {
    const pg = await text(path);
    assert.doesNotMatch(pg.body, PRESENCE_RE, `${path} shows no presence for a hidden candidate`);
    await pg.page.close();
  }
  // And the raw HTML plus the RSC (flight) payload, which would carry a prop even if no text were drawn.
  for (const path of EMPLOYER_PAGES()) {
    for (const headers of [{}, { RSC: "1" }]) {
      const res = await P.E.ctx.request.get(url(path), { headers });
      assert.equal(res.status(), 200, `${path} ${JSON.stringify(headers)}`);
      assert.doesNotMatch(await res.text(), /Last seen|Active now|last_seen|lastSeen/, `${path} ${JSON.stringify(headers)} leaks presence`);
    }
  }
  // The raw HTML of an employer page carries no presence for the hidden candidate either.
  const html = await (await P.E.ctx.request.get(url("/employer/candidates"))).text();
  assert.doesNotMatch(html, /Last seen|Active now|last_seen|lastSeen/);
});

test("hidden: SSE for the employer carries no presence while the candidate beats and flips", async () => {
  // The server allows 3 streams per user; the employer's open tab holds one and closed tabs release theirs a moment late.
  await P.E.page.goto("about:blank");
  let es = await openStream(P.E.state);
  for (let i = 0; i < 10 && es.res.status === 429; i++) {
    es.close();
    await new Promise((ok) => setTimeout(ok, 2_000));
    es = await openStream(P.E.state);
  }
  assert.equal(es.res.status, 200);
  await setSeen("3 seconds");
  // Even a presence.changed event written for the employer arrives as an empty nudge.
  await one(
    `INSERT INTO realtime_events (user_id, type, payload) VALUES ($1, 'presence.changed', $2::jsonb) RETURNING 1 AS x`,
    [E.id, JSON.stringify({ userId: I.id, lastSeenAt: new Date().toISOString(), online: true })],
  );
  const frames = await collectFrames(es.res, 5_000);
  es.close();
  const pc = frames.find((f) => f.event === "presence.changed");
  assert.ok(pc, "the nudge arrives");
  assert.deepEqual(pc.data, {});
  assert.doesNotMatch(JSON.stringify(frames), /lastSeen|last_seen|"online"/);
});

test("turning it back on restores the labels; admin and the candidate are unaffected", async () => {
  const on = await api(P.I.page, "POST", "/api/intern/presence-visibility", { showActivity: true });
  assert.equal(on.status, 200);
  assert.deepEqual(on.body, { showActivity: true });
  await setSeen("3 seconds");
  const t = await threadsOf();
  assert.equal(t.counterpartPresence, "Active now");
  // The candidate's own thread list still shows the employer (the employer has no toggle).
  const mine = await api(P.I.page, "GET", "/api/threads");
  assert.equal(mine.status, 200);
  const beat = await rows(`SELECT show_activity FROM user_presence WHERE user_id = $1`, [I.id]);
  assert.equal(beat.length, 1);
});

test("candidate side: an employer shows as Online / Offline only, never a last-seen label or timestamp", async () => {
  const beatE = (ago) =>
    one(`INSERT INTO user_presence (user_id, last_seen_at) VALUES ($1, now() - $2::interval) ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now() - $2::interval RETURNING 1 AS x`, [E.id, ago]);
  const mineOf = async () => (await api(P.I.page, "GET", "/api/threads")).body.threads.find((t) => t.id === threadId);
  await beatE("5 seconds");
  const on = await mineOf();
  assert.equal(on.counterpartOnline, true);
  assert.equal(on.counterpartPresence, "Online");
  for (const ago of ["3 hours", "2 days", "40 days"]) {
    await beatE(ago);
    const off = await mineOf();
    assert.equal(off.counterpartOnline, false);
    assert.equal(off.counterpartPresence, "Offline", `employer idle ${ago}`);
  }
  const raw = JSON.stringify((await api(P.I.page, "GET", "/api/threads")).body);
  assert.doesNotMatch(raw, /Last seen|lastSeen|last_seen/);
  const page = await P.I.ctx.newPage();
  await settle(page, `/intern/messages/${threadId}`);
  const body = await page.locator("body").innerText();
  assert.doesNotMatch(body, /Last seen|Active now/);
  await page.close();
});

test("toggle: the 21st change inside a minute is 429 and changes nothing", async () => {
  const fresh = await mkIntern("prR");
  const R = await signedIn(browser, fresh);
  P.R = R;
  let last;
  for (let i = 0; i < 21; i++) last = await api(R.page, "POST", "/api/intern/presence-visibility", { showActivity: i % 2 === 0 });
  assert.equal(last.status, 429, JSON.stringify(last.body));
  // 20 accepted changes: the 20th (i = 19) set false; the rejected 21st (would be true) did not apply.
  const row = await one(`SELECT show_activity FROM user_presence WHERE user_id = $1`, [fresh.id]);
  assert.equal(row.show_activity, false);
});

test("toggle: an admin viewing as the candidate (impersonation) cannot change it", async () => {
  const admin = await seedAdmin();
  try {
    const A = { ctx: null };
    const state = await loginState(browser, admin);
    A.ctx = await browser.newContext({ storageState: state });
    P.A = A;
    A.page = await A.ctx.newPage();
    const start = await api(A.page, "POST", "/api/admin/impersonate", { targetType: "intern", targetId: I.id });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    await A.page.goto(url("/intern/dashboard"), { waitUntil: "domcontentloaded" });
    const before = await one(`SELECT show_activity FROM user_presence WHERE user_id = $1`, [I.id]);
    const r = await api(A.page, "POST", "/api/intern/presence-visibility", { showActivity: !before.show_activity });
    assert.equal(r.status, 403, JSON.stringify(r.body));
    const after = await one(`SELECT show_activity FROM user_presence WHERE user_id = $1`, [I.id]);
    assert.equal(after.show_activity, before.show_activity, "the viewed-as candidate's choice is untouched");
  } finally {
    await rows(`DELETE FROM admin_audit_log WHERE admin_id = $1`, [admin.id]).catch(() => {});
    await rows(`DELETE FROM admins WHERE id = $1`, [admin.id]).catch(() => {});
  }
});
