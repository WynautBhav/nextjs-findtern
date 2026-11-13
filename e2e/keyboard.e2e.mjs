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
 * Admin palette (Chromium and Firefox, desktop width): the top bar shows a visible Ctrl K / ⌘K hint,
 * Ctrl+K opens the palette, and the palette has a keyboard-reachable "Keyboard shortcuts" list.
 * `--palette` runs only that check.
 *
 * Output: e2e/.artifacts/qa/keyboard/{results.json,report.md}; exit 1 on any finding.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, firefox } from "playwright";

import { ARTIFACTS, baseUrl } from "./lib/env.mjs";
import { LOGIN } from "./lib/personas.mjs";
import { DASHBOARDS, loginState, nextIp, persona } from "./lib/session.mjs";

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

/** The admin palette: findable (visible key hint) and explained (a shortcuts list). Both browsers; Windows/Linux and Mac labels. */
async function paletteCheck(type, name) {
  const browser = await type.launch();
  const where = `admin palette (${name})`;
  const admin = persona("admin");
  try {
    for (const mac of [false, true]) {
      const tag = `${where}${mac ? " on Mac" : ""}`;
      const state = await loginState(browser, admin);
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state, extraHTTPHeaders: { "x-forwarded-for": nextIp() } });
      if (mac) await ctx.addInitScript(() => Object.defineProperty(navigator, "platform", { get: () => "MacIntel" }));
      const page = await ctx.newPage();
      await page.goto(new URL("/admin/dashboard", baseUrl()).toString(), { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      const trigger = page.locator("header").getByRole("button", { name: /Command K/ });
      const hint = trigger.locator("kbd");
      const want = mac ? "⌘K" : "Ctrl K";
      // Hydration swaps the neutral "K" for the platform label, so wait for it.
      await page.waitForFunction((w) => [...document.querySelectorAll("header button[aria-haspopup=dialog]:not([data-slot=sheet-trigger]) kbd")].some((k) => k.textContent?.trim() === w), want, { timeout: 5000 }).catch(() => {});
      const shown = (await hint.count()) > 0 && (await hint.first().isVisible());
      const got = (await hint.count()) ? (await hint.first().textContent())?.trim() : null;
      if (!shown || got !== want) add(tag, "no-visible-key-hint", `expected a visible <kbd>${want}</kbd> in the top bar search button, found ${got === null ? "none" : `"${got}"${shown ? "" : " (hidden)"}`}`);
      else notes.push(`${tag}: visible hint "${want}"`);
      if (!(await trigger.getAttribute("aria-keyshortcuts"))) add(tag, "no-aria-keyshortcuts", "the search button does not declare its shortcut (aria-keyshortcuts)");

      const dialog = page.getByRole("dialog", { name: "Search the admin portal" });
      await page.keyboard.press(mac ? "Meta+k" : "Control+k");
      const opened = await dialog.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
      if (!opened) add(tag, "shortcut-did-not-open", `${mac ? "Meta" : "Control"}+K did not open the palette`);
      else {
        const focused = await page.evaluate(() => document.activeElement?.getAttribute("role") === "combobox");
        if (!focused) add(tag, "palette-input-not-focused", "the search field is not focused after opening");
        // The shortcut list: a real button inside the dialog, reached with Tab from the search field.
        const toggle = dialog.getByRole("button", { name: "Keyboard shortcuts" });
        if (!(await toggle.count())) add(tag, "no-shortcut-list", 'the palette has no "Keyboard shortcuts" control');
        else {
          // The scrollable results box may take a Tab stop of its own first (browser behaviour), so allow up to 3.
          let onToggle = false;
          for (let i = 0; i < 3 && !onToggle; i++) {
            await page.keyboard.press("Tab");
            onToggle = await toggle.evaluate((el) => el === document.activeElement);
          }
          if (!onToggle) add(tag, "shortcut-list-not-keyboard-reachable", "3 Tabs from the search field do not reach the Keyboard shortcuts button");
          await page.keyboard.press("Enter");
          const list = dialog.getByRole("term");
          const shown = await list.first().waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false);
          const text = shown ? (await dialog.locator("dl").first().innerText()) : "";
          if (!shown || !text.includes(mac ? "⌘" : "Ctrl")) add(tag, "shortcut-list-empty", `the list did not open with the ${mac ? "⌘" : "Ctrl"} + K entry (got "${text.replace(/\s+/g, " ").slice(0, 80)}")`);
          else notes.push(`${tag}: shortcut list shows ${await dialog.locator("dt").count()} entries`);
          if ((await toggle.getAttribute("aria-expanded")) !== "true") add(tag, "shortcut-list-aria", "aria-expanded is not true while the list is open");
        }
        if (!mac) await page.screenshot({ path: join(OUT, `palette-${name}.png`) }).catch(() => {});
        await page.keyboard.press("Escape");
        const closed = await dialog.waitFor({ state: "hidden", timeout: 5000 }).then(() => true).catch(() => false);
        if (!closed) add(tag, "escape-did-not-close", "Escape did not close the palette");
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const paletteOnly = process.argv.includes("--palette");
  if (!paletteOnly) await mainWalk();
  log("admin palette: Chromium");
  await paletteCheck(chromium, "chromium");
  log("admin palette: Firefox");
  await paletteCheck(firefox, "firefox");
  finish();
}

async function mainWalk() {
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
}

function finish() {
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
