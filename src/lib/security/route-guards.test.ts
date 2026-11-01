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
