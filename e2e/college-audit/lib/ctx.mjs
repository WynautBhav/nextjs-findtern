// Multi-context browser helper for the college audit (Phase M).
// One independent Chromium context per role, each logged in through the real login form.
//
//   import { openRoles, ROLES, closeAll } from "<this file>";
//   const { browser, ctxs } = await openRoles(["tpo", "student", "employer"], { base: process.env.BASE });
//   const page = await ctxs.tpo.newPage(); await page.goto(base + "/college");
//   ...; await closeAll(browser);
//
// Run from a worktree that has node_modules (playwright-core is resolved from process.cwd()).
// Needs a PRODUCTION build (`next build && next start`): dev server cannot hydrate under the CSP.
// Browser: /usr/sbin/chromium, headless, --no-sandbox. Loopback only: refuses any non-localhost base.
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/");
const { chromium } = require("playwright-core");

export const PASSWORD = "Findtern@2026";
// role -> login URL (path+query) and default account in the seeded JKLU data.
export const ROLES = {
  tpo: { path: "/login?as=college", email: "tpo@jklu.edu.in", landing: /\/college/ },
  student: { path: "/login", email: "aarav.sharma1@jklu.edu.in", landing: /\/intern/ },
  employer: { path: "/login?as=employer", email: "hiring@northwind.dev", landing: /\/employer/ },
  employer2: { path: "/login?as=employer", email: "talent@meridian.dev", landing: /\/employer/ },
  admin: { path: "/admin/login", email: "admin@findtern.dev", landing: /^\/admin(?!\/login)/ },
};

export function guardBase(base) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):333\d(\/|$)/.test(base)) throw new Error(`refused: base must be http://localhost:333x (got ${base})`);
}

/** Log one context in via the form. role = key of ROLES, or {path,email,landing}. */
export async function login(ctx, base, role, overrides = {}) {
  const r = typeof role === "string" ? ROLES[role] : role;
  const email = overrides.email ?? r.email;
  const page = await ctx.newPage();
  await page.goto(base + r.path, { waitUntil: "load", timeout: 60000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', overrides.password ?? PASSWORD);
  await Promise.all([
    page.waitForURL((u) => r.landing.test(u.pathname), { timeout: 60000 }),
    page.locator('form:has(input[name="password"]) button[type="submit"]').first().click(),
  ]);
  await page.close();
  return email;
}

/**
 * roles: array of ROLES keys, or {name: {role|email overrides}}.
 * Returns { browser, ctxs: {name: BrowserContext} }; every context is isolated (own cookies/storage).
 */
export async function openRoles(roles, { base = process.env.BASE, headless = true, viewport = { width: 1440, height: 900 } } = {}) {
  if (!base) throw new Error("pass { base } or set BASE");
  guardBase(base);
  const browser = await chromium.launch({ executablePath: "/usr/sbin/chromium", headless, args: ["--no-sandbox", `--window-size=${viewport.width},${viewport.height}`] });
  const ctxs = {};
  const list = Array.isArray(roles) ? roles.map((k) => [k, { role: k }]) : Object.entries(roles);
  for (const [name, spec] of list) {
    const ctx = await browser.newContext({ viewport, extraHTTPHeaders: { "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}` } }); // fresh IP per context: sign-in limiter
    await login(ctx, base, spec.role ?? name, spec);
    ctxs[name] = ctx;
  }
  return { browser, ctxs };
}

export async function closeAll(browser) {
  await browser.close();
}

// Self-test: BASE=http://localhost:333N node ctx.mjs [role ...]
if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.env.BASE;
  const want = process.argv.slice(2).length ? process.argv.slice(2) : ["tpo", "student", "employer"];
  const { browser, ctxs } = await openRoles(want, { base });
  for (const [name, ctx] of Object.entries(ctxs)) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    const first = { tpo: "/college", student: "/intern/dashboard", employer: "/employer/dashboard", employer2: "/employer/dashboard", admin: "/admin/dashboard" }[name] ?? "/";
    await page.goto(base + first, { waitUntil: "load", timeout: 60000 });
    console.log(name, "->", page.url().replace(base, ""), "| title:", JSON.stringify((await page.title()).slice(0, 50)), "| pageerrors:", errs.length);
  }
  await closeAll(browser);
}
