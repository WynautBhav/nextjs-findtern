import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { requiredPermissions } from "../admin/permissions.ts";

const API = join(import.meta.dirname, "../../app/api");
const routes = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? routes(join(d, e.name)) : e.name === "route.ts" ? [join(d, e.name)] : []));
const key = (f: string) => relative(API, f).replace(/\/route\.ts$/, "");
const methods = (s: string) => [...new Set([...s.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]))];

// Readable without a session by design: auth handshakes, public images, public lookups (rate limited), OAuth.
const PUBLIC_GET = new Set([
  "admin/google/callback", "auth/google/callback", "auth/google/start", "blog-image/[slug]/[kind]", "cms-image/[kind]/[id]",
  "files/public/[key]", "marketing/students", "users/exists/phone/[phone]",
  "cron/proposal-expiry", // bearer secret through runExpiryCron -> cronAuthorized (asserted below)
]);
const AUTH = /\b(getSession|getSessionState|getSessionUnfronted|readSession|requireRole|requireMutation|requireCollege\w*|requireAdmin\w*|cronAuthorized|tickResponse|requirePermission)\b/;

test("every GET handler checks a session, a cron secret, or is on the reviewed public list", () => {
  const open: string[] = [];
  for (const f of routes(API)) {
    const s = readFileSync(f, "utf8");
    if (methods(s).includes("GET") && !AUTH.test(s) && !PUBLIC_GET.has(key(f))) open.push(key(f));
  }
  assert.deepEqual(open, [], "a GET route with no auth check: add one, or list it in PUBLIC_GET with a reason");
});

test("cron routes answer GET only, check the bearer secret in constant time, and never print it", () => {
  const files = routes(join(API, "cron"));
  assert.ok(files.length >= 6);
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    assert.deepEqual(methods(s), ["GET"], `${key(f)}: GET only`);
    assert.match(s, /cronAuthorized|tickResponse|runExpiryCron/, `${key(f)}: no secret check`);
    assert.doesNotMatch(s, /console\.\w+\([^)]*CRON_SECRET/, `${key(f)}: logs the secret`);
  }
  const auth = readFileSync(join(import.meta.dirname, "../cron-auth.ts"), "utf8");
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /if \(!secret\) return false/, "unset secret must fail closed");
});

test("every /api/admin route resolves to a permission rule or is a reviewed exception", () => {
  // No rule = super admin only (safe). Empty rule = any signed-in admin at the proxy: the handler must check itself.
  const SELF_CHECKED = new Set(["admin/account", "admin/account/password", "admin/export", "admin/export/hired", "admin/search"]);
  const bad: string[] = [];
  for (const f of routes(join(API, "admin"))) {
    const k = key(f);
    const p = `/api/${k.replace(/\[[^\]]+\]/g, "abc")}`;
    for (const m of ["GET", "POST"]) {
      const need = requiredPermissions(p, m);
      if (need !== null && need.length === 0 && !SELF_CHECKED.has(k)) bad.push(`${m} ${k}`);
    }
  }
  assert.deepEqual(bad, [], "admin route open to every admin at the proxy: add a rule in permissions.ts");
});

test("no route returns err.message / stack to the browser from a catch", () => {
  const leaks: string[] = [];
  for (const f of routes(API)) {
    const s = readFileSync(f, "utf8");
    if (/NextResponse\.json\(\s*\{[^}]*(?:error|message):\s*(?:e|err|error)\.(?:message|stack)/.test(s) && !/instanceof \w*(Error|Refused)\)/.test(s)) leaks.push(key(f));
  }
  assert.deepEqual(leaks, []);
});
