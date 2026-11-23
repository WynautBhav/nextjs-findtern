// WP5 audit helper: cookie-jar API client + direct DB access. Loopback only (scratch DB on 5549x, app on 333x).
import pg from "pg";

import { assertLocalDb } from "./lib/local-only.mjs";
export const BASE = process.env.BASE ?? "http://localhost:3335";
const DB = process.env.DATABASE_URL ?? "";
if (!/^http:\/\/(localhost|127\.0\.0\.1):333\d$/.test(BASE)) throw new Error("BASE must be http://localhost:333x");
assertLocalDb(DB);
if (!/@127\.0\.0\.1:5549\d\/findtern_ca_/.test(DB)) throw new Error("DATABASE_URL must be a findtern_ca_* DB on 5549x");
export const PASSWORD = "Findtern@2026";

const db = new pg.Client({ connectionString: DB, options: "-c TimeZone=UTC" });
await db.connect();
export const q = async (s, p = []) => (await db.query(s, p)).rows;
export const closeDb = () => db.end();

const LOGIN = { tpo: "/api/auth/college/login", student: "/api/auth/login", employer: "/api/auth/employer/login", admin: "/api/auth/admin/login" };
let ipn = 0;
const rip = () => `10.55.${Math.floor(Math.random() * 250)}.${(++ipn % 250) + 1}`;

export async function login(role, email, password = PASSWORD) {
  const jar = new Map();
  const ip = rip();
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
    if (jar.has("ft_csrf")) headers["x-csrf-token"] = jar.get("ft_csrf");
    let payload = body;
    if (body !== undefined && !(body instanceof FormData) && typeof body !== "string") {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    absorb(res);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  };
  const r = await call("POST", LOGIN[role], { email, password });
  if (r.status !== 200) throw new Error(`login ${role} ${email}: ${r.status} ${r.text.slice(0, 200)}`);
  // some mutations need the csrf cookie, which is set after the first GET
  if (!jar.has("ft_csrf")) await call("GET", "/api/auth/me");
  return { email, get: (p) => call("GET", p), post: (p, b, h) => call("POST", p, b, h), del: (p, b) => call("DELETE", p, b), patch: (p, b) => call("PATCH", p, b), jar };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
export function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  :: " + detail : ""}`);
  if (!ok) fails++;
}
export const failures = () => fails;

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";
export const SFX = Math.random().toString(36).slice(2, 7);
let hash = null;
let phoneN = 0;
export const fakePhone = () => `98${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}${(++phoneN) % 10}`.slice(0, 10).replace(/^98/, "97");
export async function mkUser({ first, last, email, phone, verified = true, active = true, frozen = false, role = "intern" }) {
  hash ??= (await q("select password from users where email = 'aarav.sharma1@jklu.edu.in'"))[0].password;
  const [u] = await q(
    `insert into users (first_name,last_name,email,email_verified,is_active,phone_number,password,agreed_to_terms,role,frozen_at,terms_accepted_version,terms_accepted_at)
     values ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,'2026-11-06',now()) returning id`,
    [first, last, email.toLowerCase(), verified, active, phone ?? fakePhone(), hash, role, frozen ? new Date() : null],
  );
  return { id: u.id, email: email.toLowerCase(), first, last };
}
export const JKLU = "80635f60-19ee-49a2-b663-c3fbdced9ca3";
export const JKLU_CODE = "FTNE2TPSCA";
export const POORNIMA = "692f279c-e4d2-4ffd-a3a1-3f21624dcf87";
export const POORNIMA_CODE = "FTKFWXARUC";

export function driveCode(codeId) {
  const secret = process.env.SIGNING_SECRET;
  const mac = createHmac("sha256", secret).update(`drive-code:${codeId}`, "utf8").digest();
  const A = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < 12; i += 1) out += A[mac[i] % A.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}
export const mailLog = (cwd = process.cwd()) => {
  const f = `${cwd}/logs/mail/${new Date().toISOString().slice(0, 10)}.log`;
  return existsSync(f) ? readFileSync(f, "utf8") : "";
};
export const csvForm = (text, name = "r.csv", type = "text/csv") => {
  const f = new FormData();
  f.set("file", new File([text], name, { type }));
  return f;
};

// ── drive order helpers (admin) ───────────────────────────────────────────────────────────────────────────
export const idem = (k) => ({ "idempotency-key": `wp5-${SFX}-${k}` });
export async function paidOrder(admin, slots = 10, label = "o") {
  const c = await admin.post(`/api/admin/colleges/${JKLU}/drive-orders`, { slots, feePerStudentMinor: 80000, codeValidUntil: new Date(Date.now() + 30 * 864e5).toISOString() }, idem(`${label}-c`));
  if (c.status !== 201) throw new Error(`order ${c.status} ${c.text}`);
  const orderId = c.json.order.id;
  const p = await admin.post(`/api/admin/drive-orders/${orderId}/payment`, { method: "upi", reference: `WP5-${SFX}-${label}` }, idem(`${label}-p`));
  if (p.status !== 200) throw new Error(`pay ${p.status} ${p.text}`);
  return orderId;
}
export async function uploadConfirm(admin, orderId, csvText, label = "u") {
  const up = await admin.post(`/api/admin/drive-orders/${orderId}/imports`, csvForm(csvText));
  if (up.status !== 200) throw new Error(`upload ${up.status} ${up.text}`);
  const importId = up.json.importId;
  const conf = await admin.post(`/api/admin/imports/${importId}/confirm`, undefined, idem(`${label}-conf`));
  if (conf.status !== 200) throw new Error(`confirm ${conf.status} ${conf.text}`);
  return { importId, preview: up.json, conf: conf.json };
}
export async function codeOfRow(importId, rowNo) {
  const [r] = await q("select c.id from drive_codes c join drive_roster_entries e on e.id=c.entry_id where e.import_id=$1 and e.row_no=$2", [importId, rowNo]);
  return r ? driveCode(r.id) : null;
}
