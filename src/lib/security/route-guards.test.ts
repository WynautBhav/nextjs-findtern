import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { sameOriginOrCsrf } from "./session.ts";

const API = join(import.meta.dirname, "../../app/api");

// Public by design: they create the session, or the caller proves itself another way (signature, OTP, token).
const PUBLIC = new Set([
  "auth/admin/login",
  "auth/college/login",
  "auth/employer/login",
  "auth/employer/signup",
  "auth/forgot-password",
  "auth/login",
  "auth/logout",
  "auth/reauth", // own CSRF check; getSession would refuse the session it renews
  "chat", // anonymous by design, rate limited
  "csp-report", // browsers post violation reports without cookies or a CSRF token; log-only, size-capped, rate limited
  "auth/reset-password",
  "auth/signup",
  "auth/signup/send-otp",
  "auth/signup/verify-otp",
  "auth/verify-email",
  "webhooks/incruiter",
  "webhooks/razorpay",
  "website/contact",
]);

const MUTATING = /export\s+(async\s+)?(function|const)\s+(POST|PUT|PATCH|DELETE)\b|as\s+(POST|PUT|PATCH|DELETE)\b/g;
const ALIAS = /export\s+const\s+(POST|PUT|PATCH|DELETE)\s*=\s*(POST|PUT|PATCH|DELETE|GET)\s*;/g;
const GUARD = /\b(requireMutation|requireCollegeMutation)\(/g;
// A guard whose verdict is never read guards nothing: every call needs its `if (!x.ok) return x.response`.
const VERDICT = /!\s*\w+\.ok\b/g;

function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? routes(join(dir, e.name)) : e.name === "route.ts" ? [join(dir, e.name)] : [],
  );
}

test("every mutating route handler runs a mutation guard", () => {
  const missing: string[] = [];
  for (const file of routes(API)) {
    const src = readFileSync(file, "utf8");
    const handlers = (src.match(MUTATING)?.length ?? 0) - (src.match(ALIAS)?.length ?? 0);
    if (!handlers) continue;
    const key = relative(API, file).replace(/\/route\.ts$/, "");
    if (PUBLIC.has(key)) continue;
    // One guard call per handler, so a second handler added to a guarded file can't skip it.
    const guards = src.match(GUARD)?.length ?? 0;
    const verdicts = src.match(VERDICT)?.length ?? 0;
    if (guards < handlers || verdicts < handlers) missing.push(`${key} (${handlers} handlers, ${guards} guard calls, ${verdicts} verdict checks)`);
  }
  assert.deepEqual(missing, [], "Add requireMutation (or requireCollegeMutation), or list the route in PUBLIC with a reason");
});

// The proxy gates every /api/admin call, but it is one switch. Each admin handler also checks the session itself,
// so a wrong matcher or a renamed prefix can't open an export or a file download on its own.
const ADMIN_OWN_GUARD = /\b(requireMutation|requireRole|requirePermission|legalDocRoute)\(/;
// Reading the session guards nothing until the role is compared, so it only counts together with that comparison.
const READS_SESSION = /\b(getSession|readSession)\(/;
const CHECKS_ADMIN_ROLE = /\.role\s*!==?\s*"admin"/;
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
const ADMIN_NO_SESSION = new Map([
  ["admin/google/callback", "Google redirects the browser here; it only stores a token when the httpOnly nonce cookie set by the admin-only connect route matches `state`"],
]);

test("every admin route checks the session itself, not only the proxy", () => {
  const missing: string[] = [];
  for (const file of routes(API)) {
    const key = relative(API, file).replace(/\/route\.ts$/, "");
    if (!key.startsWith("admin/") || ADMIN_NO_SESSION.has(key)) continue;
    const code = stripComments(readFileSync(file, "utf8"));
    if (!ADMIN_OWN_GUARD.test(code) && !(READS_SESSION.test(code) && CHECKS_ADMIN_ROLE.test(code))) missing.push(key);
  }
  assert.deepEqual(missing, [], "Call requireRole(cookie, [\"admin\"]) (reads) or requireMutation (writes), or list the route with a reason");
});

test("the admin exemption list has no stale entries", () => {
  const keys = new Set(routes(API).map((f) => relative(API, f).replace(/\/route\.ts$/, "")));
  assert.deepEqual([...ADMIN_NO_SESSION.keys()].filter((k) => !keys.has(k)), []);
});

test("logout refuses cross-site POSTs", () => {
  const src = readFileSync(join(API, "auth/logout/route.ts"), "utf8");
  // Source check, not a call: the route imports next/server, which node --test can't load.
  assert.match(src, /if \(!sameOriginOrCsrf\(req\.headers, req\.url\)\)/, "logout must gate on sameOriginOrCsrf");
  const h = (x: Record<string, string>) => new Headers({ host: "findtern.test", ...x });
  const url = "https://findtern.test/api/auth/logout";
  const no = (x: Record<string, string>, why: string) => assert.equal(sameOriginOrCsrf(h(x), url), false, why);
  const ok = (x: Record<string, string>, why: string) => assert.equal(sameOriginOrCsrf(h(x), url), true, why);
  no({ "sec-fetch-site": "cross-site" }, "cross-site");
  no({ "sec-fetch-site": "same-site", origin: "https://evil.findtern.test" }, "sibling subdomain");
  no({ origin: "https://evil.example" }, "foreign origin");
  no({ origin: "https://findtern.test:8443" }, "wrong port");
  no({ origin: "http://findtern.test" }, "wrong scheme");
  no({ origin: "null" }, "opaque origin");
  no({ origin: "not a url" }, "malformed origin");
  no({}, "no header, no token");
  no({ "x-csrf-token": "wrong", cookie: "ft_csrf=t" }, "wrong token");
  ok({ "sec-fetch-site": "same-origin" }, "same-origin");
  ok({ "sec-fetch-site": "none" }, "user-initiated navigation");
  ok({ origin: "https://findtern.test" }, "Origin fallback for older browsers");
  ok({ origin: "http://findtern.test", "x-forwarded-proto": "http" }, "plain http behind a dev proxy");
  ok({ "sec-fetch-site": "same-site", "x-csrf-token": "t", cookie: "ft_csrf=t" }, "token still works");
});

test("the public list has no stale entries", () => {
  const keys = new Set(routes(API).map((f) => relative(API, f).replace(/\/route\.ts$/, "")));
  assert.deepEqual([...PUBLIC].filter((k) => !keys.has(k)), []);
});
