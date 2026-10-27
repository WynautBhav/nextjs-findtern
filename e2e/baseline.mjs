#!/usr/bin/env node
/**
 * Baseline screenshots of every route at 390 / 768 / 1440, jpeg q60, so a
 * redesign can be diffed against what shipped before it.
 *
 *   node e2e/baseline.mjs                    -> docs/qa/current/
 *   node e2e/baseline.mjs --out=docs/qa/after   (same set, for the after side)
 *
 * Signed in as the three main personas (the QA copy is scrubbed: no real
 * person appears, which is what lets these be committed to a public repo).
 * Dynamic routes use the first real id. Animations are frozen, the page is
 * scrolled once top to bottom so scroll-reveal content exists, and a page taller
 * than MAX_H px is clipped there.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

import { ROOT, baseUrl } from "./lib/env.mjs";
import { closeDb } from "./lib/db.mjs";
import { MAIN_KEYS, PERSONAS } from "./lib/personas.mjs";
import { appRoutes, dynamicValues, fill, isDynamic, roleOf, situationIds } from "./lib/routes.mjs";
import { loginState } from "./lib/session.mjs";
import { execFileSync } from "node:child_process";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const OUT = join(ROOT, arg("out") ?? "docs/qa/current");
const WIDTHS = (arg("widths") ?? "390,768,1440").split(",").map(Number);
const MAX_H = 6000;
const QUALITY = 60;
const log = (...a) => console.log("[baseline]", ...a);
const slug = (s) => s.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 8000); y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await page.waitForTimeout(400);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  const ids = await situationIds();
  const routes = appRoutes();
  const browser = await chromium.launch();
  const index = [];
  const groups = [{ role: "public", persona: null }, ...MAIN_KEYS.map((k) => ({ role: PERSONAS.find((p) => p.key === k).role, persona: PERSONAS.find((p) => p.key === k) }))];
  let shots = 0;

  for (const g of groups) {
    const state = g.persona ? await loginState(browser, g.persona) : null;
    const jobs = [];
    for (const r of routes.filter((r) => roleOf(r) === g.role)) {
      if (!isDynamic(r)) jobs.push({ route: r, path: r });
      else {
        const v = (await dynamicValues(r, g.persona, ids))[0];
        if (v) jobs.push({ route: r, path: fill(r, v) });
      }
    }
    for (const width of WIDTHS) {
      const mobile = width <= 768;
      const ctx = await browser.newContext({ storageState: state ?? undefined, viewport: { width, height: mobile ? 844 : 900 }, isMobile: width <= 480, hasTouch: width <= 480, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      for (const j of jobs) {
        await page.goto(new URL(j.path, baseUrl()).toString(), { waitUntil: "load", timeout: 30_000 }).catch(() => {});
        await settle(page);
        const dir = join(OUT, g.role);
        mkdirSync(dir, { recursive: true });
        const file = `${slug(j.route)}__${width}.jpg`;
        const landed = new URL(page.url()).pathname;
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.screenshot({ path: join(dir, file), type: "jpeg", quality: QUALITY, fullPage: true, animations: "disabled", clip: height > MAX_H ? { x: 0, y: 0, width, height: MAX_H } : undefined }).catch((e) => log(`shot failed ${j.path} ${width}: ${e.message.split("\n")[0]}`));
        shots++;
        index.push({ role: g.role, route: j.route, width, file: `${g.role}/${file}`, landed: landed === j.path.split("?")[0] ? "" : landed, truncated: height > MAX_H });
      }
      await ctx.close();
    }
    log(`${g.role}: ${jobs.length} routes × ${WIDTHS.length} widths`);
  }
  await browser.close();
  await closeDb();
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
  const md = [
    `# Baseline screenshots`,
    ``,
    `${shots} images, widths ${WIDTHS.join(" / ")}, jpeg q${QUALITY}, build at commit \`${commit}\`, ${new Date().toISOString().slice(0, 10)}.`,
    `QA data (scrubbed copy): no real person, email or phone appears. Pages taller than ${MAX_H}px are clipped.`,
    `A route listed with "redirected to" did not render its own page for that persona.`,
    ``,
    `| role | route | ${WIDTHS.join(" | ")} |`,
    `|---|---|${WIDTHS.map(() => "---").join("|")}|`,
    ...[...new Map(index.map((i) => [`${i.role}|${i.route}`, i])).values()].map((i) => {
      const cells = WIDTHS.map((w) => { const e = index.find((x) => x.role === i.role && x.route === i.route && x.width === w); return e ? `[${w}](${e.file})${e.landed ? ` (redirected to ${e.landed})` : ""}` : ""; });
      return `| ${i.role} | \`${i.route}\` | ${cells.join(" | ")} |`;
    }),
  ].join("\n");
  writeFileSync(join(OUT, "INDEX.md"), md + "\n");
  log(`${shots} screenshots in ${OUT}`);
}
main().catch(async (e) => { console.error("[baseline] FAILED:", e); await closeDb(); process.exit(2); });
