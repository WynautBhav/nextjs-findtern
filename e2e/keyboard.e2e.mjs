#!/usr/bin/env node
/**
 * Keyboard-only pass (Tab order + Enter on the critical path), Chromium.
 *
 * Per role, with no mouse:
 *   1. Sign-in form: Tab to email, type, Tab to password, type, Enter → lands on the dashboard.
 *   2. Dashboard: Tab through every stop (cap 200). Each stop must have an
 *      accessible name and a visible focus indicator; Tab must not get trapped
 *      (focus must leave and reach a different element each press until it
 *      wraps to the browser chrome / start).
 *   3. Enter on the first navigation link inside <nav> goes somewhere else.
 *   4. Shift+Tab walks back one stop.
 * Public: the marketing home page gets 2 and 3 (header link Enter).
 *
 * Output: e2e/.artifacts/qa/keyboard/{results.json,report.md}; exit 1 on any finding.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

import { ARTIFACTS, baseUrl } from "./lib/env.mjs";
import { LOGIN } from "./lib/personas.mjs";
import { DASHBOARDS, nextIp, persona } from "./lib/session.mjs";

const OUT = join(ARTIFACTS, "qa", "keyboard");
const MAX_STOPS = 200;
const findings = [];
const notes = [];
const log = (...a) => console.log("[keyboard]", ...a);
const add = (where, kind, detail) => findings.push({ where, kind, detail });

const describeFocus = () => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const cs = getComputedStyle(el);
  const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 && cs.outlineColor !== "rgba(0, 0, 0, 0)";
  const shadow = cs.boxShadow && cs.boxShadow !== "none";
  const label =
    el.getAttribute("aria-label") ||
    (el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent) ||
    el.labels?.[0]?.textContent ||
    el.textContent ||
    el.getAttribute("title") ||
    el.getAttribute("placeholder") ||
    el.getAttribute("alt") ||
    "";
  const r = el.getBoundingClientRect();
  const id = el.id ? `#${el.id}` : "";
  return {
    sel: `${el.tagName.toLowerCase()}${id}${el.getAttribute("href") ? `[href=${el.getAttribute("href")}]` : ""}`,
    name: label.trim().replace(/\s+/g, " ").slice(0, 60),
    visibleRing: Boolean(outline || shadow || el.matches(":focus-visible") && (cs.outlineStyle !== "none")),
    inViewport: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
    key: `${el.tagName}|${id}|${Math.round(r.x)}|${Math.round(r.y + scrollY)}|${(el.textContent || "").slice(0, 20)}`,
  };
};

async function tabWalk(page, where) {
  const seen = new Set();
  let stops = 0;
  let nameless = 0;
  let noRing = 0;
  let wrapped = false;
  await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  for (let i = 0; i < MAX_STOPS; i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(describeFocus);
    if (!f) { wrapped = true; break; }
    if (seen.has(f.key)) {
      if (seen.size > 2) { wrapped = true; break; }
    }
    seen.add(f.key);
    stops++;
    if (!f.name) { nameless++; add(where, "no-accessible-name", `tab stop ${stops}: ${f.sel}`); }
    if (!f.visibleRing) { noRing++; add(where, "no-focus-indicator", `tab stop ${stops}: ${f.sel} "${f.name}"`); }
  }
  if (!wrapped && stops >= MAX_STOPS) add(where, "possible-keyboard-trap", `still tabbing after ${MAX_STOPS} stops`);
  notes.push(`${where}: ${stops} tab stops, ${nameless} without a name, ${noRing} without a focus indicator${wrapped ? "" : " (cap hit)"}`);
  return stops;
}

async function signInByKeyboard(page, p, where) {
  const spec = LOGIN[p.role];
  await page.goto(new URL(spec.page, baseUrl()).toString(), { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => document.activeElement?.blur?.());
  // Tab until the email field has focus (header links come first).
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => /^(email|username)$/i.test(document.activeElement?.getAttribute("type") ?? "") || /email/i.test(document.activeElement?.getAttribute("name") ?? document.activeElement?.id ?? ""));
  }
  if (!reached) { add(where, "unreachable-field", "the email field is not reachable with Tab"); return false; }
  await page.keyboard.type(p.email);
  await page.keyboard.press("Tab");
  // The password field may sit behind a show/hide control; Tab until a password input is focused.
  let pw = false;
  for (let i = 0; i < 4 && !pw; i++) {
    pw = await page.evaluate(() => document.activeElement?.getAttribute("type") === "password");
    if (!pw) await page.keyboard.press("Tab");
  }
  if (!pw) { add(where, "unreachable-field", "the password field is not reachable with Tab after the email"); return false; }
  await page.keyboard.type(p.password);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 15_000 }).catch(() => {});
  const ok = !new URL(page.url()).pathname.includes("login");
  if (!ok) add(where, "enter-did-not-submit", `Enter in the password field did not sign in (still on ${new URL(page.url()).pathname})`);
  return ok;
}

async function enterOnFirstNavLink(page, where) {
  const before = new URL(page.url()).pathname;
  const target = await page.evaluate(() => {
    const links = [...document.querySelectorAll("nav a[href]")].filter((a) => a.getBoundingClientRect().width > 0 && a.getAttribute("href")?.startsWith("/") && a.pathname !== location.pathname);
    const a = links[0];
    if (!a) return null;
    a.focus();
    return a.getAttribute("href");
  });
  if (!target) { add(where, "no-nav-link", "no visible <nav> link to press Enter on"); return; }
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => u.pathname !== before, { timeout: 10_000 }).catch(() => {});
  const after = new URL(page.url()).pathname;
  if (after === before) add(where, "enter-did-not-navigate", `Enter on nav link ${target} stayed on ${before}`);
  else notes.push(`${where}: Enter on ${target} → ${after}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const d of DASHBOARDS) {
    const p = persona(d.key);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": nextIp() } });
    const page = await ctx.newPage();
    const where = `${p.role}`;
    log(`${where}: sign-in by keyboard`);
    if (await signInByKeyboard(page, p, `${where} sign-in`)) {
      await page.goto(new URL(d.path, baseUrl()).toString(), { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      log(`${where}: tab walk ${d.path}`);
      await tabWalk(page, `${where} ${d.path}`);
      await page.keyboard.press("Shift+Tab");
      await enterOnFirstNavLink(page, `${where} ${d.path}`);
    }
    await ctx.close();
  }
  // Public home page.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(new URL("/", baseUrl()).toString(), { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    await tabWalk(page, "public /");
    await enterOnFirstNavLink(page, "public /");
    await ctx.close();
  }
  await browser.close();

  writeFileSync(join(OUT, "results.json"), JSON.stringify({ findings, notes }, null, 2));
  const groups = new Map();
  for (const f of findings) groups.set(`${f.where}|${f.kind}`, [...(groups.get(`${f.where}|${f.kind}`) ?? []), f.detail]);
  const md = ["# Keyboard-only pass", "", ...notes.map((n) => `- ${n}`), "", findings.length ? "## Findings" : "No findings.", ...[...groups].map(([k, v]) => `- **${k.replace("|", " / ")}** ×${v.length}: ${v.slice(0, 4).join("; ")}${v.length > 4 ? "; …" : ""}`)];
  writeFileSync(join(OUT, "report.md"), md.join("\n") + "\n");
  log(`${findings.length} findings; report ${join(OUT, "report.md")}`);
  for (const n of notes) log(n);
  process.exit(findings.length ? 1 : 0);
}
main().catch((e) => { console.error("[keyboard] FAILED:", e); process.exit(2); });
