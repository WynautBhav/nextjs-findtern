#!/usr/bin/env node
/**
 * prefers-reduced-motion run of 15 console pages (intern, employer, college, admin): Chromium at 390 + 1440, Firefox at 1440.
 *
 * With `reducedMotion: "reduce"` the page must:
 *   - still show its content (nothing stuck at opacity 0 / translated off-screen
 *     because a reveal animation never ran);
 *   - have no running animation longer than 0.1s or infinite (spinners that
 *     convey progress are the only tolerated exception: role=progressbar /
 *     aria-busy / [data-allow-motion]);
 *   - not smooth-scroll (scroll-behavior: smooth, Lenis) on the document;
 *   - no console errors / error boundary (same checks as the crawler).
 * With normal motion it also records every CSS animation / transition the page starts and flags one longer than
 * 300 ms that is not infinite, not a progress bar and not on the allow list (scripts/check-motion-budget.mjs is the
 * static twin of this check).
 * It also compares against the normal-motion render: content that exists with
 * motion must exist with reduced motion (text length within 15%).
 *
 * Output: e2e/.artifacts/qa/motion/{results.json,report.md}; exit 1 on findings.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, firefox } from "playwright";

import { ARTIFACTS, baseUrl } from "./lib/env.mjs";
import { COLLEGE_HOME, DASHBOARDS, cookieHeader, loginState, persona } from "./lib/session.mjs";

/** The three dashboards plus the intern pages whose figures also animate (QA-002), then more of each console (15 pages). */
const PAGES = [
  ...DASHBOARDS,
  { key: "intern-hired", path: "/intern/record" },
  { key: "intern-hired", path: "/intern/earnings" },
  { key: "intern-hired", path: "/intern/profile" },
  { key: "intern-hired", path: "/intern/notifications" },
  { key: "employer-main", path: "/employer/candidates" },
  { key: "employer-main", path: "/employer/schedule" },
  { key: "employer-main", path: "/employer/projects" },
  COLLEGE_HOME,
  { key: "college", path: "/college/earnings" },
  { key: "admin", path: "/admin/reports" },
  { key: "admin", path: "/admin/payouts" },
  { key: "admin", path: "/admin/roles" },
];
/** Longer than 300 ms on purpose, and documented in scripts/check-motion-budget.mjs: the nav bar creeps while a page loads; the thread mark breathes once. */
const LONG_OK = /^(nav-progress|thread-breath)$/;
const BROWSERS = [
  { name: "chromium", type: chromium, widths: [390, 1440] },
  { name: "firefox", type: firefox, widths: [1440] },
];

const OUT = join(ARTIFACTS, "qa", "motion");
const findings = [];
const notes = [];
const log = (...a) => console.log("[motion]", ...a);

async function inspect(page) {
  return page.evaluate(() => {
    const textLen = (document.body.innerText || "").trim().length;
    const hidden = [];
    for (const el of document.querySelectorAll("main *, [role=main] *")) {
      if (!el.textContent?.trim() || el.children.length > 3) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (parseFloat(cs.opacity) < 0.05 && !el.closest("[aria-hidden=true], [hidden], .sr-only")) {
        hidden.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/)[0] : ""} "${el.textContent.trim().slice(0, 30)}"`);
      }
    }
    const anims = document.getAnimations().filter((a) => a.playState === "running").map((a) => {
      const t = a.effect?.getComputedTiming?.() ?? {};
      const target = a.effect?.target;
      const allowed = target?.closest?.("[role=progressbar], [aria-busy=true], [data-allow-motion]");
      return { name: a.animationName || a.transitionProperty || a.constructor.name, duration: t.duration, iterations: t.iterations, target: target ? `${target.tagName.toLowerCase()}${typeof target.className === "string" && target.className ? "." + target.className.split(/\s+/)[0] : ""}` : "?", allowed: Boolean(allowed) };
    });
    const html = getComputedStyle(document.documentElement);
    return {
      textLen,
      hidden: hidden.slice(0, 8),
      anims: anims.filter((a) => !a.allowed && (a.iterations === Infinity || Number(a.duration) > 100)),
      smooth: html.scrollBehavior === "smooth" || document.documentElement.classList.contains("lenis-smooth") || document.documentElement.classList.contains("lenis"),
    };
  });
}

/** Runs before the page: collects the duration of every CSS animation / transition the page starts. */
const RECORD = () => {
  window.__motion = [];
  const grab = (e) => {
    try {
      const el = e.target;
      for (const a of el.getAnimations?.() ?? []) {
        const t = a.effect?.getComputedTiming?.() ?? {};
        const name = a.animationName || a.transitionProperty || "";
        const key = `${name}|${t.duration}|${t.delay}`;
        if (!window.__motion.some((x) => x.key === key && x.el === el)) window.__motion.push({ key, el, name, duration: Number(t.duration), delay: Number(t.delay) || 0, iterations: t.iterations, target: `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className ? "." + el.className.split(/\s+/)[0] : ""}`, allowed: Boolean(el.closest?.("[role=progressbar], [aria-busy=true], [data-allow-motion]")) });
      }
    } catch {}
  };
  addEventListener("animationstart", grab, true);
  addEventListener("transitionrun", grab, true);
};

async function load(ctx, path, record = false) {
  const page = await ctx.newPage();
  if (record) await page.addInitScript(RECORD);
  const errors = [];
  page.on("console", (m) => m.type() === "error" && !/^Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(new URL(path, baseUrl()).toString(), { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return { page, errors };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const states = {};
  for (const { name: bname, type, widths } of BROWSERS) {
  const browser = await type.launch();
  for (const d of PAGES) {
    states[d.key] ??= await loginState(browser, persona(d.key));
    const state = states[d.key];
    for (const width of widths) {
      const where = `${d.path} @${width} ${bname}`;
      const mk = (reducedMotion) => browser.newContext({ storageState: state, viewport: { width, height: 900 }, reducedMotion });
      const [normalCtx, reducedCtx] = [await mk("no-preference"), await mk("reduce")];
      await reducedCtx.tracing.start({ screenshots: true, snapshots: true });
      const n = await load(normalCtx, d.path, true);
      const r = await load(reducedCtx, d.path);
      // The figures in the server HTML must be the real ones, not the animation's starting 0 (QA-002).
      const ssr = await (await fetch(new URL(d.path, baseUrl()), { headers: { cookie: cookieHeader(state) } })).text();
      const ssrText = ssr.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&amp;|&nbsp;/g, " ");
      const shown = await r.page.evaluate(() => (document.querySelector("main")?.innerText ?? ""));
      const figures = [...new Set(shown.match(/[₹$]\s?[\d,]+(?:\.\d+)?|\b\d{1,3}(?:,\d{2,3})+\b/g) ?? [])];
      const missing = figures.filter((f) => !ssrText.includes(f.replace(/\s/g, "")) && !ssrText.includes(f));
      if (missing.length) findings.push({ where, kind: "figure-not-in-server-html", detail: `shown after hydration but absent from the server HTML: ${missing.slice(0, 6).join(", ")}` });
      const ni = await inspect(n.page);
      const ri = await inspect(r.page);
      const longs = await n.page.evaluate(() => (window.__motion ?? []).filter((m) => !m.allowed && m.iterations !== Infinity && (m.duration > 300 || m.delay > 150)).map(({ name, duration, delay, target }) => ({ name, duration, delay, target })));
      for (const m of longs.filter((m) => !LONG_OK.test(m.name)).slice(0, 6)) findings.push({ where, kind: "animation-over-budget", detail: `${m.name || "(unnamed)"} on ${m.target}: ${m.duration} ms${m.delay ? ` + ${m.delay} ms delay` : ""}; budget 300 ms, delay 150 ms` });
      await r.page.screenshot({ path: join(OUT, `${d.key}-${d.path.replace(/\W+/g, "_")}-${width}-${bname}-reduced.png`), fullPage: true }).catch(() => {});
      notes.push(`${where}: ${n.page.url() === r.page.url() ? "" : "(URLs differ) "}text ${ni.textLen} (motion) vs ${ri.textLen} (reduced); running long animations with reduce: ${ri.anims.length}; smooth scroll: ${ri.smooth}`);
      if (ri.hidden.length) findings.push({ where, kind: "content-hidden-with-reduced-motion", detail: ri.hidden.join("; ") });
      for (const a of ri.anims.slice(0, 6)) findings.push({ where, kind: "animation-not-reduced", detail: `${a.name} on ${a.target}, duration ${a.duration}ms, iterations ${a.iterations}` });
      if (ri.smooth) findings.push({ where, kind: "smooth-scroll-not-reduced", detail: "document scroll-behavior is smooth / Lenis is active" });
      if (ni.textLen > 200 && ri.textLen < ni.textLen * 0.85) findings.push({ where, kind: "content-missing-with-reduced-motion", detail: `${ri.textLen} characters vs ${ni.textLen} with motion` });
      for (const e of r.errors) findings.push({ where, kind: "console-error", detail: e });
      const before = findings.length;
      if (findings.some((f) => f.where === where)) {
        const trace = join(OUT, `${d.key}-${d.path.replace(/\W+/g, "_")}-${width}-${bname}-reduced-trace.zip`);
        await reducedCtx.tracing.stop({ path: trace }).catch(() => {});
        for (const f of findings.filter((x) => x.where === where)) f.trace = trace.replace(`${ARTIFACTS}/`, "e2e/.artifacts/");
      } else {
        await reducedCtx.tracing.stop().catch(() => {});
      }
      void before;
      await normalCtx.close();
      await reducedCtx.close();
    }
  }
  await browser.close();
  }
  writeFileSync(join(OUT, "results.json"), JSON.stringify({ findings, notes }, null, 2));
  writeFileSync(join(OUT, "report.md"), ["# prefers-reduced-motion", "", ...notes.map((n) => `- ${n}`), "", findings.length ? "## Findings" : "No findings.", ...findings.map((f) => `- **${f.where}** ${f.kind}: ${f.detail}${f.trace ? ` (trace: ${f.trace})` : ""}`)].join("\n") + "\n");
  for (const n of notes) log(n);
  log(`${findings.length} findings; report ${join(OUT, "report.md")}`);
  process.exit(findings.length ? 1 : 0);
}
main().catch((e) => { console.error("[motion] FAILED:", e); process.exit(2); });
