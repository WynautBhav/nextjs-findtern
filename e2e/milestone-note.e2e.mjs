/**
 * Milestone notes on intern Home: for 7 days after a real, dated event one quiet note with the fact and the next
 * step; dismiss it and it never comes back.
 *
 * The note is server-rendered and a tiny inline script hides a dismissed one before first paint (no layout shift
 * after first paint); the "app scripts blocked" cases below load the page with every Next chunk aborted to prove it
 * is the HTML and that script, not React, that decides. CLS itself is measured by the WP5b cls.mjs script.
 *
 * Uses the situations seed (`npm run qa:seed`): intern-one has one open offer (created 30 days ago, so no note on a
 * fresh seed), intern-empty has no profile and no events. The test moves intern-one's offer date to 2 days ago
 * (note shows), 8 days ago (no note), and puts the original date back afterwards. Local, loopback DB only.
 *
 *   DATABASE_URL=postgresql://findtern@127.0.0.1:5435/<clone> E2E_BASE_URL=http://localhost:3115 \
 *     node --test --test-concurrency=1 e2e/milestone-note.e2e.mjs
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { chromium, firefox } from "playwright";

import { baseUrl } from "./lib/env.mjs";
import { closeDb, one, rows } from "./lib/db.mjs";
import { loginState, persona } from "./lib/session.mjs";

const browsers = {};
const states = {};
let internId;
let proposal; // { id, created_at } of intern-one's open offer, restored in after()

const setOfferAge = (days) =>
  rows(`UPDATE proposals SET created_at = now() - ($2 || ' days')::interval WHERE id = $1`, [proposal.id, String(days)]);

before(async () => {
  const intern = await one(`SELECT id FROM users WHERE lower(email) = lower($1)`, [persona("intern-one").email]);
  internId = intern.id;
  proposal = await one(`SELECT id, created_at FROM proposals WHERE intern_id = $1 AND status = 'sent' ORDER BY created_at LIMIT 1`, [intern.id]);
  assert.ok(proposal, "intern-one has an open offer (run npm run qa:seed)");
  for (const [name, type] of Object.entries({ chromium, firefox })) {
    browsers[name] = await type.launch();
    states[name] = {
      one: await loginState(browsers[name], persona("intern-one")),
      empty: await loginState(browsers[name], persona("intern-empty")),
    };
  }
});

after(async () => {
  if (proposal) await rows(`UPDATE proposals SET created_at = $2 WHERE id = $1`, [proposal.id, proposal.created_at]);
  for (const b of Object.values(browsers)) await b?.close();
  await closeDb();
});

const open = async (name, who, size = { width: 1440, height: 900 }) => {
  const context = await browsers[name].newContext({ viewport: size, storageState: states[name][who] });
  const page = await context.newPage();
  const go = async () => {
    await page.goto(new URL("/intern/dashboard", baseUrl()).toString(), { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /^Hello,/ }).waitFor({ timeout: 30_000 });
    // The note decides after browser storage is read, a tick after hydration.
    await page.waitForTimeout(1_500);
  };
  return { context, page, go, note: page.getByRole("region", { name: "Milestone" }) };
};

for (const name of ["chromium", "firefox"]) {
  test(`${name}: a first offer from 2 days ago shows one dated note with a next step`, async () => {
    await setOfferAge(2);
    const { context, page, go, note } = await open(name, "one");
    try {
      await go();
      await note.waitFor({ timeout: 5_000 });
      const text = (await note.innerText()).replace(/\s+/g, " ");
      assert.match(text, /^Your first offer, for .+ at .+, arrived on \d{1,2} \w{3} \d{4}\. Read the offer\.? Dismiss$/);
      assert.doesNotMatch(text, /!|activation|₹2,499|congrat|great|amazing/i);
      assert.equal(await page.getByRole("region", { name: "Milestone" }).count(), 1, "only one note");
      const link = note.getByRole("link", { name: "Read the offer" });
      assert.equal(new URL(await link.getAttribute("href"), baseUrl()).pathname, `/intern/proposals/${proposal.id}`);
      await link.focus(); // the link is keyboard reachable
    } finally {
      await context.close();
    }
  });

  test(`${name}: dismiss, then reload and a new tab show nothing`, async () => {
    await setOfferAge(2);
    const { context, go, note } = await open(name, "one");
    try {
      await go();
      await note.waitFor({ timeout: 5_000 });
      await note.getByRole("button", { name: "Dismiss" }).click();
      await note.waitFor({ state: "detached", timeout: 2_000 });
      await go(); // reload
      assert.equal(await note.count(), 0, "still dismissed after reload");
      const tab = await context.newPage();
      await tab.goto(new URL("/intern/dashboard", baseUrl()).toString(), { waitUntil: "domcontentloaded" });
      await tab.getByRole("heading", { name: /^Hello,/ }).waitFor({ timeout: 30_000 });
      await tab.waitForTimeout(1_500);
      assert.equal(await tab.getByRole("region", { name: "Milestone" }).count(), 0, "still dismissed in a new tab");
    } finally {
      await context.close();
    }
  });

  test(`${name}: an offer from 8 days ago shows no note`, async () => {
    await setOfferAge(8);
    const { context, go, note } = await open(name, "one");
    try {
      await go();
      assert.equal(await note.count(), 0);
    } finally {
      await context.close();
    }
  });

  test(`${name}: an intern with no events shows no note`, async () => {
    const { context, go, note } = await open(name, "empty");
    try {
      await go();
      assert.equal(await note.count(), 0);
    } finally {
      await context.close();
    }
  });

  test(`${name}: the note fits at 390px with a 44px dismiss target and no sideways scroll`, async () => {
    await setOfferAge(2);
    const { context, page, go, note } = await open(name, "one", { width: 390, height: 844 });
    try {
      await go();
      await note.waitFor({ timeout: 5_000 });
      const box = await note.getByRole("button", { name: "Dismiss" }).boundingBox();
      assert.ok(box && box.height >= 44, `dismiss target is ${box?.height}px tall`);
      const noteBox = await note.boundingBox();
      assert.ok(noteBox && noteBox.x >= 0 && noteBox.x + noteBox.width <= 390, "note stays inside the viewport");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal scroll");
    } finally {
      await context.close();
    }
  });
}

const nextChunks = (page) => page.route("**/_next/static/**/*.js", (route) => route.abort());
const noteKey = () => `findtern:milestones:${internId}`;
const section = (page) => page.locator('section[data-note-for="Milestone"]');
const visibleCount = (page) => section(page).evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== "none").length);

for (const name of ["chromium", "firefox"]) {
  test(`${name}: with app scripts blocked the note is in the server HTML; a dismissed one is hidden before hydration`, async () => {
    await setOfferAge(2);
    const { context, page } = await open(name, "one", { width: 390, height: 844 });
    try {
      await nextChunks(page);
      await page.goto(new URL("/intern/dashboard", baseUrl()).toString(), { waitUntil: "load" });
      assert.equal(await section(page).count(), 1, "the note is in the HTML");
      assert.equal(await visibleCount(page), 1, "and visible");
      await page.evaluate(([k, id]) => localStorage.setItem(k, JSON.stringify([id])), [noteKey(), `offer:${proposal.id}`]);
      await page.goto(new URL("/intern/dashboard", baseUrl()).toString(), { waitUntil: "load" });
      assert.equal(await section(page).count(), 1, "still in the HTML (the server cannot read storage)");
      assert.equal(await visibleCount(page), 0, "hidden by the inline guard, not by React (its scripts are blocked)");
    } finally {
      await context.close();
    }
  });

  test(`${name}: the guard shows only the first note that is not dismissed`, async () => {
    await setOfferAge(2);
    const { context, page } = await open(name, "one", { width: 390, height: 844 });
    try {
      await nextChunks(page);
      await page.goto(new URL("/intern/dashboard", baseUrl()).toString(), { waitUntil: "load" });
      const guard = await page.evaluate(() => [...document.scripts].map((s) => s.textContent).find((t) => t?.includes("data-note-for")));
      assert.ok(guard, "the guard script is in the page");
      const ids = ["a", "b", "c"];
      const run = (dismissed) =>
        page.evaluate(([js, key, ids, dismissed]) => {
          document.querySelectorAll('section[data-note-for="Milestone"]').forEach((e) => e.remove());
          ids.forEach((id, i) => {
            const el = document.createElement("section");
            el.dataset.noteFor = "Milestone";
            el.dataset.noteId = id;
            el.className = i > 0 ? "hidden" : "";
            el.textContent = id;
            document.body.append(el);
          });
          localStorage.setItem(key, JSON.stringify(dismissed));
          new Function(js)();
          return [...document.querySelectorAll('section[data-note-for="Milestone"]')].filter((e) => getComputedStyle(e).display !== "none").map((e) => e.textContent);
        }, [guard, noteKey(), ids, dismissed]);
      assert.deepEqual(await run([]), ["a"]);
      assert.deepEqual(await run(["a"]), ["b"]);
      assert.deepEqual(await run(["a", "b"]), ["c"]);
      assert.deepEqual(await run(["a", "b", "c"]), []);
      assert.deepEqual(await run(["b"]), ["a"]);
    } finally {
      await context.close();
    }
  });
}

test("chromium: the 200 ms fade is only for a note that appears after a client navigation, not a hard load", async () => {
  await setOfferAge(2);
  const probe = () => {
    window.__op = [];
    new MutationObserver(() => {
      const el = document.querySelector('section[data-note-for="Milestone"]');
      if (el && !el.__seen) {
        el.__seen = true;
        window.__op.push(+getComputedStyle(el).opacity);
      }
    }).observe(document, { subtree: true, childList: true });
  };
  for (const reduced of [false, true]) {
    const context = await browsers.chromium.newContext({ viewport: { width: 1440, height: 900 }, storageState: states.chromium.one, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await context.newPage();
    try {
      await page.addInitScript(probe);
      await page.goto(new URL("/intern/notifications", baseUrl()).toString(), { waitUntil: "load" });
      await page.waitForTimeout(2_000);
      await page.evaluate(() => { window.__op = []; });
      await page.evaluate(() => document.querySelector('a[href="/intern/dashboard"]').click());
      await section(page).first().waitFor({ timeout: 10_000 });
      const nav = await page.evaluate(() => window.__op[0]);
      await page.goto(new URL("/intern/dashboard", baseUrl()).toString(), { waitUntil: "load" });
      const hard = await page.evaluate(() => window.__op[0]);
      assert.equal(hard, 1, `hard load: note is fully opaque from the first frame (reduced=${reduced})`);
      if (reduced) assert.equal(nav, 1, "reduced motion: no fade on navigation");
      else assert.ok(nav < 1, `client navigation: starts transparent and fades in (opacity ${nav})`);
    } finally {
      await context.close();
    }
  }
});
