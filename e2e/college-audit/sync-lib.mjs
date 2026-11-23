// Data-sync oracle: shared helpers (loopback-only DB + API sessions, check recorder, matrix cells, text-sanity).
// Every check is recorded with rec(area, id, name, ok, detail); every compared value with cell(entity, field, screen, expected, actual).
// summary() prints a PASS/FAIL line count and writes a machine-readable JSON (SYNC_OUT or ./sync-oracle.json).
import { createRequire } from "node:module";
import { writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { deflateSync, crc32 } from "node:zlib";
import { assertLocalOnly } from "./lib/local-only.mjs";

const require = createRequire(process.cwd() + "/");
const pg = require("pg");
export const BASE = process.env.BASE ?? "http://localhost:3337";
assertLocalOnly(BASE, process.env.DATABASE_URL);

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, options: "-c TimeZone=UTC" });
export const q = async (s, p = []) => (await pool.query(s, p)).rows;
export const one = async (s, p = []) => (await q(s, p))[0];
export const closeDb = () => pool.end();
export const PASSWORD = process.env.SYNC_PW ?? "Findtern@2026";

const LOGIN = { college: "/api/auth/college/login", intern: "/api/auth/login", employer: "/api/auth/employer/login", admin: "/api/auth/admin/login" };

/** API session for one role: cookie jar + CSRF + fresh x-forwarded-for (sign-in limiter). */
export async function session(role, email, password = PASSWORD) {
  const jar = new Map();
  const ip = `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;
  const absorb = (res) => { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const call = async (method, path, body, extra = {}) => {
    const headers = { origin: BASE, "x-forwarded-for": ip, cookie: cookie(), ...extra };
    if (body !== undefined) headers["content-type"] = "application/json";
    const csrf = jar.get("ft_csrf");
    if (csrf && method !== "GET") headers["x-csrf-token"] = decodeURIComponent(csrf);
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    absorb(res);
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  };
  const r = await call("POST", LOGIN[role], { email, password });
  if (r.status !== 200) throw new Error(`login ${role} ${email}: ${r.status} ${r.text.slice(0, 120)}`);
  return { call, get: (p) => call("GET", p), post: (p, b) => call("POST", p, b ?? {}), patch: (p, b) => call("PATCH", p, b ?? {}), del: (p) => call("DELETE", p), cookie };
}

// ---- credentials kept OUT of the repo and the report: a 0600 JSON file {email: password} (SYNC_SECRETS, default ~/.cache/findtern-college-audit/sync-secrets.json)
export const SECRETS_FILE = process.env.SYNC_SECRETS ?? `${homedir()}/.cache/findtern-college-audit/sync-secrets.json`;
export const secrets = () => (existsSync(SECRETS_FILE) ? JSON.parse(readFileSync(SECRETS_FILE, "utf8")) : {});
export function saveSecret(email, password) { const s = secrets(); s[email.toLowerCase()] = password; writeFileSync(SECRETS_FILE, JSON.stringify(s, null, 1), { mode: 0o600 }); chmodSync(SECRETS_FILE, 0o600); }
/** Passwords to try for a harness-made or seeded account: stored secret, then the harness intern/employer password, then the seed password. */
export const passwordsFor = (email) => [secrets()[String(email).toLowerCase()], process.env.SYNC_ENTRY_PW ?? "Sync@2026x", PASSWORD].filter(Boolean);
/** session() that tries every known password for the account (never prints them). */
export async function sessionAny(role, email) {
  let last;
  for (const pw of passwordsFor(email)) { try { return await session(role, email, pw); } catch (e) { last = e; if (!/: 401/.test(e.message)) throw e; } }
  throw last;
}

// ---- recording --------------------------------------------------------------------------------------------------
export const results = []; // {area,id,name,ok,detail}
export const cells = [];   // {entity,field,screen,expected,actual,ok}
export const wordings = []; // {entity, role, screen, raw, canonical}: how each screen words a status, mapped to the canonical status (for the cross-role wording table)
/** Record the status wording a screen uses for an entity; canonical = the DB-derived status the wording must stand for. */
export function wording(entity, role, screen, raw, canonical) { wordings.push({ entity, role, screen, raw: raw == null ? null : String(raw), canonical }); }
let quiet = process.env.SYNC_QUIET === "1";
export function rec(area, id, name, ok, detail = "") {
  results.push({ area, id, name, ok: !!ok, detail: ok ? "" : String(detail).slice(0, 600) });
  if (!quiet || !ok) console.log(`${ok ? "PASS" : "FAIL"}  [${area}] ${id}  ${name}${!ok && detail ? `\n        ${String(detail).slice(0, 600)}` : ""}`);
  return !!ok;
}
/** Compare one value on one screen with the expected one; norm() lets callers normalise both sides. */
export function cell(entity, field, screen, expected, actual, { norm = (x) => x, area = "B" } = {}) {
  const e = norm(expected), a = norm(actual);
  const ok = e === a || (e != null && a != null && String(e) === String(a));
  cells.push({ entity, field, screen, expected: e == null ? null : String(e), actual: a == null ? null : String(a), ok });
  rec(area, `${entity}.${field}@${screen}`, `${field} on ${screen}`, ok, `expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`);
  return ok;
}
export function summary(extra = {}) {
  const fails = results.filter((r) => !r.ok);
  const out = { when: new Date().toISOString(), base: BASE, checks: results.length, pass: results.length - fails.length, fail: fails.length, cells: cells.length, cellMismatches: cells.filter((c) => !c.ok).length, wordings: wordings.length, failures: fails, ...extra };
  console.log(`\nSYNC SUMMARY: ${out.checks} checks, ${out.pass} pass, ${out.fail} FAIL; matrix cells ${out.cells}, mismatches ${out.cellMismatches}`);
  const file = process.env.SYNC_OUT ?? "sync-oracle.json";
  writeFileSync(file, JSON.stringify({ ...out, results, cells, wordings }, null, 1));
  return out;
}

// ---- text helpers -----------------------------------------------------------------------------------------------
/** Visible text of an HTML page (scripts/styles removed, entities decoded, tags -> spaces). */
export function htmlText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
export const flight = (html) => html.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

/** Rendered-text sanity: no undefined/null/NaN/[object Object]/raw enums, no negative counts, rupee format. Returns list of problems. */
export function textProblems(text) {
  const p = [];
  for (const [re, why] of [[/\bundefined\b/, "undefined"], [/\bNaN\b/, "NaN"], [/\[object Object\]/, "[object Object]"], [/(?<![\w-])null(?![\w-])/i, "null"], [/\bInvalid Date\b/, "Invalid Date"],
    [/\b(?:proposal_sent|interview_scheduled|not_started|profile_incomplete|checks_pending|hired_active|interview_pending|interview_done|otw_off|ft_hired|ft_offer_sent)\b/, "raw enum"],
    [/(?:^|[\s(])-\d+\s+(?:students?|offers?|drives?|seats?|interns?)\b/i, "negative count"],
    [/₹\s?-?\d{4,}(?![\d,])/, "rupee without Indian grouping"], [/Rs\.?\s?\d{4,}(?![\d,])/, "Rs without grouping"]]) { const m = text.match(re); if (m) p.push(`${why}: …${text.slice(Math.max(0, m.index - 30), m.index + 50)}…`); }
  return p;
}
/** IST wall-clock strings for a Date: {d:'23 Nov 2026', t:'3:35 pm', iso:'2026-11-23'} */
export function ist(d) {
  const x = new Date(new Date(d).getTime() + 330 * 60000);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][x.getUTCMonth()];
  const h = x.getUTCHours(), m = String(x.getUTCMinutes()).padStart(2, "0");
  return { d: `${x.getUTCDate()} ${mon} ${x.getUTCFullYear()}`, dm: `${x.getUTCDate()} ${mon}`, t: `${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}`, iso: x.toISOString().slice(0, 10) };
}
/** Indian grouping: 1234567 -> 12,34,567 */
export const inr = (n) => { const [i, f] = String(Math.abs(n)).split("."); const last3 = i.slice(-3), rest = i.slice(0, -3); return (n < 0 ? "-" : "") + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : "") + last3 + (f ? "." + f : ""); };

// ---- a small valid PNG (proof photos / uploads)
export const png = (size, rgb) => { const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]); const raw = Buffer.concat(Array.from({ length: size }, () => row)); const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const body = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([len, body, c]); }; return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); };
