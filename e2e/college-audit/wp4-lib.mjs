// WP4 helpers: a cookie-jar HTTP client for the college audit (loopback only, DB 5549x only).
import pg from "pg";

export const BASE = process.env.BASE ?? "";
if (!/^http:\/\/localhost:333\d$/.test(BASE)) throw new Error(`BASE must be http://localhost:333x (got '${BASE}')`);
if (!/127\.0\.0\.1:5549\d\/findtern_ca_/.test(process.env.DATABASE_URL ?? "")) throw new Error("DATABASE_URL must be a findtern_ca_* DB on 5549x");
export const PASSWORD = "Findtern@2026";
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
export const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

let ipN = 0;
const freshIp = () => `10.44.${Math.floor(Math.random() * 250)}.${1 + (ipN++ % 250)}`;

export class Client {
  constructor() { this.jar = new Map(); this.ip = freshIp(); }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  absorb(res) {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim(); const v = pair.slice(i + 1).trim();
      if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(sc) || v === "") this.jar.delete(k); else this.jar.set(k, v);
    }
  }
  async req(method, path, body, headers = {}) {
    const csrf = this.jar.get("ft_csrf");
    const h = { origin: BASE, "x-forwarded-for": this.ip, cookie: this.cookieHeader(), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(csrf && method !== "GET" ? { "x-csrf-token": decodeURIComponent(csrf) } : {}), ...headers };
    const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    this.absorb(res);
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  }
  async upload(path, fileName, content, extra = {}) {
    const fd = new FormData();
    fd.set("file", new Blob([content], { type: "text/csv" }), fileName);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    const csrf = this.jar.get("ft_csrf");
    const res = await fetch(BASE + path, { method: "POST", body: fd, headers: { origin: BASE, "x-forwarded-for": this.ip, cookie: this.cookieHeader(), ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}) }, redirect: "manual" });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  }
  get(path) { return this.req("GET", path); }
  post(path, body, headers) { return this.req("POST", path, body ?? {}, headers); }
  patch(path, body, headers) { return this.req("PATCH", path, body ?? {}, headers); }
  put(path, body, headers) { return this.req("PUT", path, body ?? {}, headers); }
}

export async function loginAs(kind, email) {
  const path = { admin: "/api/auth/admin/login", college: "/api/auth/college/login", employer: "/api/auth/employer/login", intern: "/api/auth/login" }[kind];
  const c = new Client();
  const r = await c.post(path, { email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login ${kind} ${email}: ${r.status} ${r.text.slice(0, 200)}`);
  return c;
}

let fails = 0, passes = 0;
export function check(name, ok, detail = "") {
  if (ok) { passes++; console.log(`PASS  ${name}`); } else { fails++; console.log(`FAIL  ${name} ${detail}`); }
}
export function summary() { console.log(`\n${passes} passed, ${fails} failed`); return fails; }

/** Decode the RSC flight data of a page and return every embedded invoice document (text between <html and </html>). */
export function invoiceHtmls(pageText) {
  let flight = "";
  for (const m of pageText.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) { try { flight += JSON.parse(m[1]); } catch { /* skip */ } }
  const out = [];
  let i = 0;
  while ((i = flight.search(/<!doctype html|<html/i)) >= 0) {
    const rest = flight.slice(i);
    const end = rest.indexOf("</html>");
    if (end < 0) break;
    out.push(rest.slice(0, end + 7));
    flight = rest.slice(end + 7);
  }
  return out;
}
/** Plain text of an invoice document, whitespace collapsed. */
export const invoiceText = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
