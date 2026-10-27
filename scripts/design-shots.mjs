/**
 * Design screenshots: every signed-in route of a role at 390, 768 and 1440.
 *
 * At 390 two viewport shots are taken, at the top and scrolled to the bottom,
 * because the phone tab bar and the floating help button covering the last
 * rows is a known complaint (bug sheet 7). 768 and 1440 are full-page.
 * Alongside the shots it records what a person would notice first: 4xx/5xx,
 * console errors, uncaught page errors (hydration #418 shows up here) and
 * sideways scroll. The report lands in <out>/report.json.
 *
 * Usage:
 *   node scripts/design-shots.mjs <manifest.json> <out-dir>
 *
 * Manifest: { "roles": { "<role>": { "base": "http://localhost:3400",
 *   "login": "/api/auth/login", "email": "…", "password": "…",
 *   "routes": ["/intern/dashboard", "/intern/proposals/<uuid>"] } } }
 *
 * Files: <out>/<role>/<route-slug>-<width>[-top|-bottom].jpeg (quality 60).
 * Run it against a local copy only, never the live database.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";

const [manifestPath, out] = process.argv.slice(2);
if (!manifestPath || !out) {
  console.error("usage: node scripts/design-shots.mjs <manifest.json> <out-dir>");
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const only = process.env.SHOTS_ONLY ? new Set(process.env.SHOTS_ONLY.split(",")) : null;
const WIDTHS = (process.env.SHOTS_WIDTHS ?? "390,768,1440").split(",").map(Number);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** "/employer/proposal/<uuid>" → "proposal_id"; the role prefix is the folder. */
function slug(route, role) {
  const s = route.replace(UUID, "id").replace(new RegExp(`^/${role}/?`), "").replace(/^\/+|\/+$/g, "");
  return s.replaceAll("/", "_") || "home";
}

const browser = await chromium.launch();
const report = [];

for (const [role, cfg] of Object.entries(manifest.roles)) {
  if (only && !only.has(role)) continue;
  mkdirSync(join(out, role), { recursive: true });
  // One sign-in per role, reused at every width: admin sign-in is rate-limited.
  const auth = await browser.newContext();
  const login = await auth.request.post(cfg.base + cfg.login, { data: { email: cfg.email, password: cfg.password } });
  const storageState = await auth.storageState();
  await auth.close();
  if (!login.ok()) {
    report.push({ role, route: cfg.login, problems: [`login ${login.status()}`] });
    continue;
  }
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: width < 768 ? 844 : 900 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      isMobile: width < 768,
      hasTouch: width < 768,
      storageState,
    });
    for (const route of cfg.routes) {
      const page = await ctx.newPage();
      const problems = [];
      page.on("console", (m) => {
        if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`);
      });
      page.on("pageerror", (e) => problems.push(`pageerror: ${String(e.message).slice(0, 200)}`));
      page.on("response", (r) => {
        if (r.status() >= 400 && r.url().startsWith(cfg.base)) problems.push(`${r.status()} ${r.url().slice(cfg.base.length)}`);
      });
      let finalUrl = route;
      try {
        await page.goto(cfg.base + route, { waitUntil: "load", timeout: 45_000 });
        await page.waitForTimeout(900);
        finalUrl = page.url().slice(cfg.base.length);
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
          problems.push("sideways scroll");
        }
        const name = join(out, role, `${slug(route, role)}-${width}`);
        if (width < 768) {
          await page.screenshot({ path: `${name}-top.jpeg`, type: "jpeg", quality: 60 });
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${name}-bottom.jpeg`, type: "jpeg", quality: 60 });
        } else {
          await page.screenshot({ path: `${name}.jpeg`, type: "jpeg", quality: 60, fullPage: true });
        }
      } catch (err) {
        problems.push(`failed: ${String(err.message).split("\n")[0]}`);
      }
      report.push({ role, width, route, finalUrl, problems });
      await page.close();
    }
    await ctx.close();
  }
}

await browser.close();
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
const bad = report.filter((r) => r.problems.length);
console.log(`${report.length} page loads, ${bad.length} with problems`);
for (const r of bad) console.log(`- ${r.role} ${r.width} ${r.route}${r.finalUrl && r.finalUrl !== r.route ? ` → ${r.finalUrl}` : ""}: ${r.problems.join("; ")}`);
