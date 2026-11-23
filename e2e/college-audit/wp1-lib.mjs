// Shared helpers for the WP1 (authorisation) scripts. Loopback only, scratch DB only.
// Run from the worktree with BASE=http://localhost:3331 and DATABASE_URL=postgresql://findtern@127.0.0.1:55490/findtern_ca_wp1.
import pg from "pg";

export const BASE = process.env.BASE ?? "http://localhost:3331";
export const DB_URL = process.env.DATABASE_URL ?? "";
export const PASSWORD = "Findtern@2026";

if (!/^http:\/\/(localhost|127\.0\.0\.1):333\d$/.test(BASE)) throw new Error(`refused: BASE must be http://localhost:333x (got ${BASE})`);
if (!/^postgresql:\/\/findtern@127\.0\.0\.1:5549\d\/findtern_ca_[A-Za-z0-9_]+$/.test(DB_URL)) throw new Error("refused: DATABASE_URL must be a findtern_ca_* scratch DB on 127.0.0.1:5549x");

let ipCounter = 0;
const fakeIp = () => `10.${(process.pid % 250) + 1}.${(Date.now() >> 8) % 250}.${(++ipCounter % 250) + 1}`;

export async function sql(text, params = []) {
  const c = new pg.Client(DB_URL);
  await c.connect();
  try {
    return (await c.query(text, params)).rows;
  } finally {
    await c.end();
  }
}

/** A cookie-jar client for one session. */
export class Client {
  constructor(label) {
    this.label = label;
    this.jar = new Map();
  }
  cookieHeader(extra = {}) {
    const jar = new Map(this.jar);
    for (const [k, v] of Object.entries(extra)) v === null ? jar.delete(k) : jar.set(k, v);
    return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res) {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (!value || /Max-Age=0/i.test(line) || /Expires=Thu, 01 Jan 1970/i.test(line)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
  /**
   * opts: json, csrf ("ok" | "none" | "wrong" | "nocookie"), origin (default BASE; null = omit), headers, cookies (override), raw, signal.
   */
  async req(method, path, opts = {}) {
    const headers = { "x-forwarded-for": opts.ip ?? fakeIp(), ...(opts.headers ?? {}) };
    const origin = opts.origin === undefined ? BASE : opts.origin;
    if (origin) headers.origin = origin;
    const csrfMode = opts.csrf ?? "ok";
    const cookies = { ...(opts.cookies ?? {}) };
    if (csrfMode === "ok") {
      if (this.jar.get("ft_csrf")) headers["x-csrf-token"] = this.jar.get("ft_csrf");
    } else if (csrfMode === "wrong") headers["x-csrf-token"] = "wrong-token-value-xxxxxxxxxxxxxxxx";
    else if (csrfMode === "nocookie") {
      if (this.jar.get("ft_csrf")) headers["x-csrf-token"] = this.jar.get("ft_csrf");
      cookies.ft_csrf = null;
    }
    let body;
    if (opts.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.json);
    }
    const cookie = this.cookieHeader(cookies);
    if (cookie) headers.cookie = cookie;
    const res = await fetch(BASE + path, { method, headers, body, redirect: "manual", signal: opts.signal });
    if (opts.store !== false) this.store(res);
    let text = "";
    try {
      text = await res.text();
    } catch {}
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, text, json, headers: res.headers };
  }
  async login(path, email, password = PASSWORD) {
    const r = await this.req("POST", path, { json: { email, password }, csrf: "none" });
    if (r.status !== 200) throw new Error(`login ${this.label} (${email}) -> ${r.status} ${r.text.slice(0, 120)}`);
    return r;
  }
}

export const LOGIN = {
  college: "/api/auth/college/login",
  intern: "/api/auth/login",
  employer: "/api/auth/employer/login",
  admin: "/api/auth/admin/login",
};

export async function loggedIn(kind, email, label = email) {
  const c = new Client(label);
  await c.login(LOGIN[kind], email);
  return c;
}

/** Tiny test harness: rows of [id, ok, detail]. */
export function harness(name) {
  const rows = [];
  return {
    rows,
    check(id, ok, detail = "") {
      rows.push({ id, ok: Boolean(ok), detail });
      console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? "  " + detail : ""}`);
    },
    done() {
      const bad = rows.filter((r) => !r.ok);
      console.log(`\n${name}: ${rows.length - bad.length}/${rows.length} passed`);
      if (bad.length) {
        console.log("FAILED:\n" + bad.map((r) => `  ${r.id} ${r.detail}`).join("\n"));
        process.exitCode = 1;
      }
    },
  };
}
