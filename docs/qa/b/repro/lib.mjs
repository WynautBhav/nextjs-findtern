/**
 * Tester B repro helpers. LOCAL servers only (loopback). Usage:
 *   import { open, shot, text } from "./lib.mjs";
 *   const s = await open({ port: 3502, role: "admin", email, password, width: 1440 });
 *   await s.page.goto(s.url("/admin/dashboard")); await shot(s, "qa-007-dashboard");
 *   await s.close();                      // writes the trace zip
 * Traces go to e2e/.artifacts/qa-b/ (git-ignored); screenshots to docs/qa/b/screens/.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, webkit, devices } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..", "..", "..");
export const SHOTS = join(ROOT, "docs", "qa", "b", "screens");
export const TRACES = join(ROOT, "e2e", ".artifacts", "qa-b");
mkdirSync(SHOTS, { recursive: true });
mkdirSync(TRACES, { recursive: true });

export const API = {
  intern: "/api/auth/login",
  employer: "/api/auth/employer/login",
  admin: "/api/auth/admin/login",
  college: "/api/auth/college/login",
};

const xff = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;

export async function open({ port, role, email, password, width = 1440, height = 900, engine = "chromium", name, reduced = false, device }) {
  if (!/^\d+$/.test(String(port))) throw new Error("port");
  const origin = `http://localhost:${port}`;
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const ctx = await browser.newContext({
    ...(device ? devices[device] : { viewport: { width, height }, hasTouch: width <= 768, isMobile: width <= 768 && engine === "chromium" }),
    reducedMotion: reduced ? "reduce" : "no-preference",
    extraHTTPHeaders: { "x-forwarded-for": xff(), "x-forwarded-proto": "http" },
  });
  await ctx.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 200)}`));
  page.on("response", (r) => r.status() >= 400 && r.url().startsWith(origin) && errors.push(`${r.status()} ${r.url().replace(origin, "")}`));
  if (role) {
    const res = await ctx.request.post(origin + API[role], { data: { email, password }, headers: { origin } });
    if (!res.ok()) throw new Error(`login ${role} → ${res.status()}`);
  }
  const traceName = name ?? `${role ?? "anon"}-${port}-${Date.now()}`;
  return {
    page, ctx, browser, errors, origin,
    url: (p) => origin + p,
    async close() {
      await ctx.tracing.stop({ path: join(TRACES, `${traceName}-trace.zip`) });
      await browser.close();
    },
  };
}

export async function shot(s, name, opts = {}) {
  await s.page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: opts.fullPage ?? true });
  return `docs/qa/b/screens/${name}.png`;
}

/** Visible text of the page body, whitespace-collapsed. */
export const text = (s) => s.page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());

export const PERSONA = {
  intern: { role: "intern", email: "ritika.launchtest@gmail.com", password: "Launch#2026pw" },
  employer: { role: "employer", email: "neha@acmerobotics-launchtest.in", password: "Launch#2026pw" },
  admin: { role: "admin", email: "e2e-admin@findtern.test", password: "E2e#Admin2026" },
  college: { role: "college", email: "tpo@jklu.edu.in", password: "Findtern@2026" },
};

/** The seed-DB (scripts/seed.ts) accounts; pass `SEED=1` to scripts that use `pick()`. */
export const SEED = {
  intern: { role: "intern", email: "candidate@findtern.dev", password: "Findtern@2026" },
  employer: { role: "employer", email: "hiring@northwind.dev", password: "Findtern@2026" },
  admin: { role: "admin", email: "admin@findtern.dev", password: "Findtern@2026" },
  college: { role: "college", email: "tpo@jklu.edu.in", password: "Findtern@2026" },
};
export const pick = (role) => (process.env.SEED ? SEED : PERSONA)[role];

/** EMAIL=... PASSWORD=... overrides `pick()` for a freshly signed-up account. */
const basePick = pick;
export const pickOr = (role) => (process.env.EMAIL ? { role, email: process.env.EMAIL, password: process.env.PASSWORD ?? "Qa#Tester2026" } : basePick(role));
