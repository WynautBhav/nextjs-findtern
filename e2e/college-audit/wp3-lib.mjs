// WP3 audit helpers: API sessions for each role (cookie jar + CSRF) and a loopback-only DB handle.
// Loopback only: refuses a DATABASE_URL / BASE that is not this machine.
import pg from "pg";

export const BASE = process.env.BASE ?? "http://localhost:3333";
const DB = process.env.DATABASE_URL;
if (!DB || !/@(127\.0\.0\.1|localhost):5549\d\//.test(DB)) throw new Error("DATABASE_URL must be a findtern_ca_* test DB on 5549x");
if (!/^http:\/\/(localhost|127\.0\.0\.1):333\d$/.test(BASE)) throw new Error("BASE must be http://localhost:333x");

export const db = new pg.Client({ connectionString: DB, options: "-c TimeZone=UTC" });
await db.connect();
export const q = async (s, p = []) => (await db.query(s, p)).rows;
export const one = async (s, p = []) => (await q(s, p))[0];

const LOGIN = {
  college: "/api/auth/college/login",
  intern: "/api/auth/login",
  employer: "/api/auth/employer/login",
  admin: "/api/auth/admin/login",
};

export async function session(role, email, password = "Findtern@2026") {
  const jar = new Map();
  const ip = `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;
  const absorb = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const call = async (method, path, body, extra = {}) => {
    const headers = { origin: BASE, "x-forwarded-for": ip, cookie: cookie(), ...extra };
    if (body !== undefined) headers["content-type"] = "application/json";
    const csrf = jar.get("ft_csrf");
    if (csrf && method !== "GET") headers["x-csrf-token"] = decodeURIComponent(csrf);
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    absorb(res);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  };
  const r = await call("POST", LOGIN[role], { email, password });
  if (r.status !== 200) throw new Error(`login ${role} ${email}: ${r.status} ${r.text.slice(0, 120)}`);
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b ?? {}), patch: (p, b) => call("PATCH", p, b ?? {}), del: (p) => call("DELETE", p) };
}

let failed = 0;
export const results = [];
export function check(id, name, ok, detail = "") {
  results.push({ id, name, ok });
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${name}${detail && !ok ? `\n        ${detail}` : ""}`);
}
export async function finish() {
  console.log(`\n${results.length - failed}/${results.length} pass, ${failed} fail`);
  await db.end();
  process.exit(failed ? 1 : 0);
}
/** Undo the Next flight-data string escaping so a userId/detail regex can read it. */
export const flight = (html) => html.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
