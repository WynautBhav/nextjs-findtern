/**
 * Data-leak regression: a seeded intern's full Aadhaar, PAN and bank account number must not appear anywhere in the
 * HTML or RSC payload of the pages the intern and an admin load. Masked forms are fine; the full values stay on the
 * server (and in the permission-gated audit-logged reveal route / payout export, neither of which these pages call).
 *
 *   E2E_BASE=http://127.0.0.1:3210 E2E_DATABASE_URL=postgresql://findtern@127.0.0.1:54410/findtern \
 *   node --test e2e/id-leak.e2e.mjs
 *
 * Needs scripts/seed.ts (candidate@findtern.dev, admin@findtern.dev, password Findtern@2026). The test writes known
 * identity numbers onto the seeded candidate's onboarding row and restores the row afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { testDatabaseUrl } from "./lib/env.mjs";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3210";
const DB = testDatabaseUrl(process.env.E2E_DATABASE_URL);
const PASSWORD = "Findtern@2026";

const AADHAAR = "498765432101";
const AADHAAR_SPACED = "4987 6543 2101";
const PAN = "QWERT9876Z";
const ACCOUNT = "50100123456789";
const LEGACY_ACCOUNT = "91827364550011";
const SECRETS = [AADHAAR, AADHAAR_SPACED, PAN, ACCOUNT, LEGACY_ACCOUNT];

let pool;
let internId;
let saved;
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;

async function login(path, email) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip() }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert.equal(res.status, 200, `login ${email}`);
  const jar = new Map(res.headers.getSetCookie().map((c) => c.split(";")[0].split(/=(.*)/s).slice(0, 2)));
  return { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), csrf: jar.has("ft_csrf") ? decodeURIComponent(jar.get("ft_csrf")) : "", ip: ip() };
}
const get = async (s, path, rsc = false) => {
  // An RSC request is redirected once to add Next's cache-busting _rsc hash; follow it with the same headers.
  let url = `${BASE}${path}`;
  for (let hop = 0; hop < 3; hop++) {
    const res = await fetch(url, { redirect: "manual", headers: { cookie: s.cookie, "x-forwarded-for": s.ip, ...(rsc ? { rsc: "1" } : {}) } });
    const loc = res.headers.get("location");
    if (rsc && res.status === 307 && loc && loc.includes("_rsc")) { url = new URL(loc, BASE).toString(); continue; }
    if (rsc && res.status === 200) assert.match(res.headers.get("content-type") ?? "", /text\/x-component/, `${path}: not an RSC payload`);
    return { status: res.status, text: await res.text() };
  }
  throw new Error(`${path}: redirect loop`);
};
const post = async (s, path, body) => {
  const res = await fetch(`${BASE}${path}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", origin: BASE, cookie: s.cookie, "x-forwarded-for": s.ip, "x-csrf-token": s.csrf }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

/** Digits of every stored phone number (country code + number): a 12-digit run that is a phone is not an Aadhaar. */
let phones = new Set();

/** No secret anywhere, in any encoding a payload could carry it in; no 12-digit or PAN-shaped string at all. */
function assertNoLeak(where, text) {
  for (const s of SECRETS) {
    assert.ok(!text.includes(s), `${where}: contains ${s.slice(0, 3)}…${s.slice(-2)}`);
    assert.ok(!text.includes(JSON.stringify(s).slice(1, -1).replace(/ /g, "\\u0020")), `${where}: escaped ${s}`);
  }
  const twelve = (text.match(/(?<![\d./])\d{4}\s?\d{4}\s?\d{4}(?![\d.])/g) ?? []).filter((m) => !phones.has(m.replace(/\s/g, "")));
  assert.deepEqual(twelve, [], `${where}: 12-digit Aadhaar-shaped string`);
  const pan = text.match(/(?<![A-Za-z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Za-z0-9])/g) ?? [];
  assert.deepEqual(pan, [], `${where}: PAN-shaped string`);
  const account = text.match(/(?<![\d./])\d{14}(?![\d.])/g) ?? [];
  assert.deepEqual(account, [], `${where}: 14-digit bank-account-shaped string`);
}

before(async () => {
  pool = new pg.Pool({ connectionString: DB });
  const [u] = await q("select id from users where email = 'candidate@findtern.dev'");
  internId = u.id;
  const ph = await q("select regexp_replace(coalesce(country_code, '') || coalesce(phone_number, ''), '\\D', '', 'g') as d from users union select regexp_replace(coalesce(country_code, '') || coalesce(phone_number, ''), '\\D', '', 'g') from employers");
  phones = new Set(ph.map((r) => r.d));
  [saved] = await q("select id, aadhaar_number, pan_number, extra_data from intern_onboarding where user_id = $1", [internId]);
  const extra = { ...(saved.extra_data ?? {}), aadhaarNumber: AADHAAR, panNumber: PAN,
    bankDetails: { accountHolderName: "Sana Kapoor", bankName: "HDFC Bank", accountNumber: ACCOUNT, ifscCode: "HDFC0001234", upiId: "" },
    bank: { accountHolderName: "Sana Kapoor", bankName: "HDFC Bank", accountNumber: LEGACY_ACCOUNT, ifscCode: "HDFC0001234", upiId: "" } };
  await q("update intern_onboarding set aadhaar_number = $2, pan_number = $3, extra_data = $4 where id = $1", [saved.id, AADHAAR_SPACED, PAN, JSON.stringify(extra)]);
});

after(async () => {
  if (saved) await q("update intern_onboarding set aadhaar_number = $2, pan_number = $3, extra_data = $4 where id = $1", [saved.id, saved.aadhaar_number, saved.pan_number, JSON.stringify(saved.extra_data)]);
  await pool.end();
});

const INTERN_PAGES = ["/intern/onboarding", "/intern/profile", "/intern/settings", "/intern/earnings", "/intern/dashboard", "/intern/documents"];

test("intern: no full Aadhaar, PAN or bank account in any intern page (HTML and RSC)", async () => {
  const s = await login("/api/auth/login", "candidate@findtern.dev");
  for (const path of INTERN_PAGES) {
    for (const rsc of [false, true]) {
      const r = await get(s, path, rsc);
      assert.equal(r.status, 200, `${path} ${rsc ? "rsc" : "html"} status`);
      assertNoLeak(`${path} ${rsc ? "rsc" : "html"}`, r.text);
    }
  }
});

test("intern onboarding: the masked forms are what the page carries", async () => {
  const s = await login("/api/auth/login", "candidate@findtern.dev");
  const { text } = await get(s, "/intern/onboarding");
  assert.ok(text.includes("XXXX XXXX 2101"), "masked Aadhaar present");
  assert.ok(text.includes("QWXXXXX76Z"), "masked PAN present");
});

test("intern onboarding save: a masked value is refused and the stored numbers stay as they were", async () => {
  const s = await login("/api/auth/login", "candidate@findtern.dev");
  const read = async () => (await q("select aadhaar_number, pan_number from intern_onboarding where id = $1", [saved.id]))[0];
  const before = await read();
  for (const body of [{ aadhaarNumber: "XXXX XXXX 2101" }, { panNumber: "QWXXXXX76Z" }]) {
    const r = await post(s, "/api/intern/onboarding", body);
    assert.equal(r.status, 400, `${JSON.stringify(body)} refused`);
  }
  assert.deepEqual(await read(), before, "numbers unchanged after a masked submit");
});

test("admin: no full Aadhaar, PAN or bank account on the intern 360 page or the lists (HTML and RSC)", async () => {
  const s = await login("/api/auth/admin/login", "admin@findtern.dev");
  for (const path of [`/admin/interns/${internId}`, "/admin/interns", "/admin/interns?cols=all", "/admin/payouts", "/admin/dashboard", "/admin/audit-log"]) {
    for (const rsc of [false, true]) {
      const r = await get(s, path, rsc);
      assert.equal(r.status, 200, `${path} ${rsc ? "rsc" : "html"} status`);
      assertNoLeak(`${path} ${rsc ? "rsc" : "html"}`, r.text);
    }
  }
});
