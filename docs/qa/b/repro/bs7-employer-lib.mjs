// Shared helpers for bs7-employer-*.mjs (local server on 3502 only; synthetic accounts only).
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib.mjs";
export const PORT = 3502;
export const NEHA = { role: "employer", email: "neha@acmerobotics-launchtest.in", password: "Launch#2026pw" };
export const INTERN_EMAIL = "qa.b.intern.941877@gmail.com";
export function lastOtp(to) {
  const dir = join(ROOT, "logs", "mail");
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir).sort().reverse()) {
    const blocks = readFileSync(join(dir, f), "utf8").split(/\n(?=--- \d{4}-)/).filter((b) => b.includes(`To: ${to}`));
    const last = blocks.pop();
    const m = last?.match(/code:\s*(\d{6})/i);
    if (m) return m[1];
  }
  return null;
}
export const STATE = "/tmp/claude-1000/bs7-emp-state.json";
export const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {});
export const saveState = (o) => writeFileSync(STATE, JSON.stringify({ ...loadState(), ...o }));
export const errsOf = (p) => p.$$eval("[role=alert], .text-danger, [aria-invalid=true]", (e) => [...new Set(e.map((x) => (x.textContent || x.getAttribute("name") || "").trim()).filter(Boolean))]);
export const body = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
// tap targets under 44px among visible interactive elements
export const small = (p) => p.evaluate(() => [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=radio],[role=checkbox]")].map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { r, e, vis: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" }; }).filter((x) => x.vis && (x.r.height < 44 || x.r.width < 44) && x.r.top < 20000).map((x) => `${x.e.tagName.toLowerCase()}${x.e.type ? ":" + x.e.type : ""} "${(x.e.getAttribute("aria-label") || x.e.innerText || x.e.name || x.e.id || "").replace(/\s+/g, " ").trim().slice(0, 30)}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}`));
export const hscroll = (p) => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
