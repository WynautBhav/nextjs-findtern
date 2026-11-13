/**
 * Upload progress bar (WP9), Chromium and Firefox, QA stack.
 *
 *   E2E_BASE_URL=http://localhost:3109 DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_wp9 \
 *     node --test --test-concurrency=1 e2e/upload-progress.e2e.mjs        (npm run test:e2e:upload)
 *
 * Needs a migrated LOCAL DB and a server started with TRUST_PROXY=1 (npm run qa:serve). Creates its own intern
 * by SQL and removes it. UPLOAD_SHOTS=<dir> also writes screenshots (1440 and 390) of the bar mid-upload.
 *
 * The page under test is the feedback dialog's "Screen recording" FileUpload (kind=support, 10 MB limit), present
 * on every signed-in page. Network speed is limited two ways so the upload takes seconds:
 *   - Chromium: CDP Network.emulateNetworkConditions (upload throughput).
 *   - Firefox: no CDP, so the browser is pointed at a small local proxy that releases the request body of
 *     POST /api/uploads at about 1 MB/s and passes everything else straight through.
 * An in-page sampler (every DOM change plus every 50 ms) records the progressbar (aria-valuenow / min / max) and the button text, so the
 * assertions read what a user and a screen reader would see, not an implementation detail.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, firefox } from "playwright";

import { baseUrl } from "./lib/env.mjs";
import { closeDb } from "./lib/db.mjs";
import { cleanup, mkIntern } from "./lib/fixtures2.mjs";
import { loginState } from "./lib/session.mjs";

const SHOTS = process.env.UPLOAD_SHOTS;
const MB = 1024 * 1024;
const FAB = 'button[aria-label="Report a problem or ask a question"]';
const VIDEO_INPUT = 'input[type="file"][accept^="video"]';
let intern;
let state;
const browsers = {};

/** A body the server accepts as video/mp4 (it sniffs `ftyp` at offset 4) of the given size. */
const mp4 = (bytes) => {
  const b = Buffer.alloc(bytes);
  b.writeUInt32BE(24, 0);
  b.write("ftypisom", 4, "latin1");
  return b;
};

before(async () => {
  intern = await mkIntern("upl");
  browsers.chromium = await chromium.launch();
  browsers.firefox = await firefox.launch();
  state = await loginState(browsers.chromium, intern); // cookies are not browser-specific
});
after(async () => {
  await Promise.all(Object.values(browsers).map((b) => b?.close().catch(() => {})));
  await cleanup();
  await closeDb();
});

/** Local proxy to the app; the body of POST /api/uploads is released at ~`kbPerSec`. Returns { origin, close }. */
async function startThrottlingProxy(kbPerSec = 1024) {
  const target = new URL(baseUrl());
  const srv = http.createServer((req, res) => {
    const headers = { ...req.headers, host: target.host };
    if (headers.origin) headers.origin = target.origin;
    if (headers.referer) headers.referer = headers.referer.replace(/^https?:\/\/[^/]+/, target.origin);
    const up = http.request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => res.destroy());
    // The page keeps an SSE stream open (/api/realtime/stream); drop the upstream side with the browser side or the run never ends.
    res.on("close", () => up.destroy());
    if (req.method === "POST" && req.url.startsWith("/api/uploads")) {
      (async () => {
        for await (const buf of req) {
          up.write(buf);
          await new Promise((ok) => setTimeout(ok, (buf.length / (kbPerSec * 1024)) * 1000));
        }
        up.end();
      })().catch(() => up.destroy());
    } else {
      req.pipe(up);
    }
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  return { origin: `http://localhost:${srv.address().port}`, close: () => new Promise((ok) => (srv.close(ok), srv.closeAllConnections())) };
}

/** The feedback button sits in the sidebar; on a phone the sidebar is the navigation drawer. */
async function openFeedback(page) {
  const visibleFab = page.locator(`${FAB}:visible`);
  if ((await visibleFab.count()) === 0) await page.getByRole("button", { name: "Open navigation" }).click();
  await visibleFab.first().click();
}

/**
 * Open the feedback dialog on the intern dashboard, upload `bytes` as a video, and return what the sampler saw.
 * `throttle(page, ctx)` runs after the page has loaded and before the file is chosen.
 */
async function runUpload(browser, { origin = baseUrl(), bytes, viewport = { width: 1440, height: 900 }, reducedMotion = "no-preference", throttle, shot }) {
  const ctx = await browser.newContext({ storageState: state, viewport, reducedMotion });
  const page = await ctx.newPage();
  try {
    await page.goto(new URL("/intern/dashboard", origin).toString(), { waitUntil: "domcontentloaded" });
    await openFeedback(page);
    const input = page.locator(VIDEO_INPUT);
    await input.waitFor({ state: "attached" });
    if (throttle) await throttle(page, ctx);

    await page.evaluate(() => {
      const sel = 'input[type="file"][accept^="video"]';
      const root = () => document.querySelector(sel)?.closest(".flex-col")?.parentElement;
      window.__t0 = null;
      window.__samples = [];
      window.__heightBefore = root()?.getBoundingClientRect().height;
      const snap = () => {
        const bar = document.querySelector('[role="progressbar"][aria-label^="Uploading"]');
        const label = document.querySelector(sel)?.closest("label");
        window.__samples.push({
          t: performance.now(),
          bar: bar !== null,
          now: bar ? bar.getAttribute("aria-valuenow") : null,
          min: bar ? bar.getAttribute("aria-valuemin") : null,
          max: bar ? bar.getAttribute("aria-valuemax") : null,
          name: bar ? bar.getAttribute("aria-label") : null,
          text: label?.textContent?.trim() ?? "",
          height: root()?.getBoundingClientRect().height,
          transition: bar?.firstElementChild ? getComputedStyle(bar.firstElementChild).transitionProperty : null,
          done: Boolean(document.querySelector('[role="status"] .sr-only')),
        });
      };
      // Every DOM change is a sample too, so a 100 that lasts less than one tick is still seen.
      window.__observer = new MutationObserver(snap);
      window.__observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ["aria-valuenow", "aria-label"] });
      window.__timer = setInterval(snap, 50);
      window.__t0 = performance.now();
    });
    await input.setInputFiles({ name: "recording.mp4", mimeType: "video/mp4", buffer: mp4(bytes) });
    if (shot) {
      // Mid-upload picture: wait for the bar, then shoot while it is still going.
      await page.locator('[role="progressbar"][aria-label^="Uploading"]').waitFor({ state: "visible", timeout: 30_000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: shot });
    }
    await page.waitForFunction(() => window.__samples.some((s) => s.done) || document.querySelector('p[role="alert"]'), null, { timeout: 90_000 });
    const out = await page.evaluate(() => {
      clearInterval(window.__timer);
      window.__observer.disconnect();
      return { t0: window.__t0, heightBefore: window.__heightBefore, samples: window.__samples, alert: document.querySelector('p[role="alert"]')?.textContent ?? null };
    });
    return out;
  } finally {
    await ctx.close();
  }
}

/** The progressbar samples of a run, with the claims every run must satisfy. */
function assertProgress(run, label) {
  const withBar = run.samples.filter((s) => s.bar);
  assert.ok(withBar.length > 0, `${label}: no [role=progressbar] ever appeared during a ${run.samples.length}-sample upload`);
  for (const s of withBar) {
    assert.equal(s.min, "0", `${label}: aria-valuemin`);
    assert.equal(s.max, "100", `${label}: aria-valuemax`);
    assert.match(s.now ?? "", /^\d{1,3}$/, `${label}: aria-valuenow is a whole number`);
    assert.match(s.name ?? "", /^Uploading /, `${label}: the bar has an accessible name`);
  }
  const values = withBar.map((s) => Number(s.now));
  for (let i = 1; i < values.length; i++) assert.ok(values[i] >= values[i - 1], `${label}: aria-valuenow went backwards at sample ${i}: ${values.slice(Math.max(0, i - 3), i + 1)}`);
  assert.ok(values[0] < 100, `${label}: the bar should be seen below 100 first, saw ${values[0]}`);
  assert.equal(values.at(-1), 100, `${label}: the bar ends at 100, saw ${values.at(-1)}`);
  const between = new Set(values.filter((v) => v > 0 && v < 100));
  assert.ok(between.size >= 2, `${label}: expected several in-between values, saw ${[...new Set(values)]}`);

  // Appears only after about a second.
  const firstBarMs = withBar[0].t - run.t0;
  assert.ok(firstBarMs >= 900, `${label}: the bar showed ${Math.round(firstBarMs)} ms after the upload began; it should wait ~1 s`);

  // The visible percent is the same number as aria-valuenow.
  const withText = withBar.filter((s) => /Uploading \d+%/.test(s.text));
  assert.ok(withText.length > 0, `${label}: no "Uploading N%" text in the button; saw ${JSON.stringify([...new Set(withBar.map((s) => s.text))])}`);
  for (const s of withText) assert.equal(s.text.match(/Uploading (\d+)%/)[1], s.now, `${label}: text percent equals aria-valuenow`);

  // No layout shift: the uploader's box keeps its height from before the file was chosen until the upload ends.
  const busy = run.samples.filter((s) => !s.done && s.height !== undefined);
  assert.ok(busy.length > 5);
  for (const s of busy) assert.equal(s.height, run.heightBefore, `${label}: uploader height changed ${run.heightBefore} -> ${s.height}`);

  assert.equal(run.alert, null, `${label}: no error expected, got ${run.alert}`);
  return { values, firstBarMs: Math.round(firstBarMs), distinct: [...new Set(values)].length };
}

const shotPath = (name) => {
  if (!SHOTS) return undefined;
  mkdirSync(SHOTS, { recursive: true });
  return join(SHOTS, name);
};

test("Chromium: a throttled upload shows a progressbar that climbs from below 100 to 100", async () => {
  const run = await runUpload(browsers.chromium, {
    bytes: 6 * MB,
    throttle: async (page, ctx) => {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      // ~1.5 MB/s up: 6 MB takes about 4 s.
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: -1, uploadThroughput: 1.5 * MB });
    },
    shot: shotPath("chromium-1440.png"),
  });
  const r = assertProgress(run, "chromium");
  console.log("chromium", JSON.stringify(r));
});

test("Firefox: through a ~0.5 MB/s local proxy the bar climbs from below 100 to 100", async () => {
  const proxy = await startThrottlingProxy(512);
  try {
    // Loopback socket buffers swallow the first few MB before the proxy's pacing is felt, so the file is near the 10 MB limit.
    const run = await runUpload(browsers.firefox, { origin: proxy.origin, bytes: Math.floor(9.5 * MB), shot: shotPath("firefox-1440.png") });
    const r = assertProgress(run, "firefox");
    console.log("firefox", JSON.stringify(r));
  } finally {
    await proxy.close();
  }
});

test("Chromium at 390 wide: the bar shows and the uploader keeps its height", async () => {
  const run = await runUpload(browsers.chromium, {
    bytes: 4 * MB,
    viewport: { width: 390, height: 844 },
    throttle: async (page, ctx) => {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: -1, uploadThroughput: 1 * MB });
    },
    shot: shotPath("chromium-390.png"),
  });
  assertProgress(run, "chromium-390");
});

test("Firefox at 390 wide through the proxy", async () => {
  const proxy = await startThrottlingProxy(512);
  try {
    const run = await runUpload(browsers.firefox, { origin: proxy.origin, bytes: Math.floor(9.5 * MB), viewport: { width: 390, height: 844 }, shot: shotPath("firefox-390.png") });
    assertProgress(run, "firefox-390");
  } finally {
    await proxy.close();
  }
});

test("reduced motion: the bar's fill does not animate; with motion allowed it does", async () => {
  const slow = async (page, ctx) => {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: -1, uploadThroughput: 1.5 * MB });
  };
  const calm = await runUpload(browsers.chromium, { bytes: 5 * MB, throttle: slow, reducedMotion: "reduce" });
  const lively = await runUpload(browsers.chromium, { bytes: 5 * MB, throttle: slow });
  const tp = (run) => [...new Set(run.samples.filter((s) => s.bar).map((s) => s.transition))];
  assert.deepEqual(tp(calm), ["none"], "reduced motion: no transition on the fill");
  assert.ok(tp(lively).every((v) => v.includes("width")), `motion allowed: the fill transitions width, saw ${tp(lively)}`);
});

test("a quick upload never shows the bar", async () => {
  const run = await runUpload(browsers.chromium, { bytes: 64 * 1024 });
  assert.equal(run.samples.filter((s) => s.bar).length, 0, "no progressbar for an upload that finishes in under a second");
  assert.equal(run.alert, null);
});

test("errors read as before: server message, and unreachable server", async () => {
  for (const [label, handler, expected] of [
    ["server error", (route) => route.fulfill({ status: 413, contentType: "application/json", body: JSON.stringify({ error: "The file must be under 10 MB" }) }), "The file must be under 10 MB"],
    ["no JSON body", (route) => route.fulfill({ status: 500, contentType: "text/html", body: "<h1>boom</h1>" }), "Upload failed. Try again."],
    ["network down", (route) => route.abort("connectionrefused"), "Couldn't reach the server. Check your connection and try again."],
  ]) {
    const ctx = await browsers.chromium.newContext({ storageState: state });
    const page = await ctx.newPage();
    try {
      await page.goto(new URL("/intern/dashboard", baseUrl()).toString(), { waitUntil: "domcontentloaded" });
      await openFeedback(page);
      await page.route("**/api/uploads", handler);
      await page.locator(VIDEO_INPUT).setInputFiles({ name: "r.mp4", mimeType: "video/mp4", buffer: mp4(2048) });
      const alert = page.locator('p[role="alert"]').filter({ hasText: expected });
      await alert.waitFor({ timeout: 10_000 });
      assert.equal(await page.locator('[role="progressbar"][aria-label^="Uploading"]').count(), 0, `${label}: no bar left behind`);
    } finally {
      await ctx.close();
    }
  }
});
