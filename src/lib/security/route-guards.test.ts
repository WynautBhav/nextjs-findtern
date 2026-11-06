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

test("requireMutation enforces terms; only accept and presence opt out", () => {
  const guard = readFileSync(join(API, "../../lib/guards-mutation.ts"), "utf8");
  assert.match(guard, /terms_required/, "guard must return terms_required");
  assert.match(guard, /isTermsCurrent/, "guard must check the account's accepted version");
  const optOut = routes(API).filter((f) => /allowPendingTerms:\s*true/.test(readFileSync(f, "utf8"))).map((f) => relative(API, f));
  assert.deepEqual(optOut, ["intern/college/heartbeat/route.ts", "terms/accept/route.ts"]);
});

test("csrfFetch opens the terms pop-up in place, never reloads", () => {
  const src = readFileSync(join(API, "../../lib/client-fetch.ts"), "utf8");
  assert.match(src, /findtern:terms-required/);
  assert.doesNotMatch(src, /location\.reload/);
  const gate = readFileSync(join(API, "../../components/app/terms-gate.tsx"), "utf8");
  assert.match(gate, /addEventListener\("findtern:terms-required"/);
});

// Messaging (OA1): only the two sides of a thread, never a college officer or an admin acting on their behalf.
test("messaging routes: writes are employer/intern only and CSRF-guarded; reads are session-checked and 404 non-participants", () => {
  const src = (k: string) => readFileSync(join(API, k, "route.ts"), "utf8");
  for (const k of ["messages/threads", "messages/threads/[id]/messages", "messages/threads/[id]/read"]) {
    const code = stripComments(src(k));
    assert.match(code, /requireMutation\(\{ req, roles: \["employer", "intern"\] \}\)/, `${k} must allow exactly employer and intern`);
    assert.doesNotMatch(code, /allowImpersonated/, `${k} must stay read-only under View as`);
  }
  for (const k of ["messages/threads/[id]", "live"]) {
    const code = stripComments(src(k));
    assert.match(code, /getSession\(\)/, `${k} must read the session`);
    assert.match(code, /session\.role !== "intern" && session\.role !== "employer"/, `${k} must refuse every other role`);
  }
  assert.match(stripComments(src("messages/threads/[id]")), /threadFor\(viewer, id\)[\s\S]*status: 404/, "a non-participant gets 404");
});

test("presence: the heartbeat writes for every intern but never while viewing as, and is rate limited; the switch is intern only", () => {
  const beat = stripComments(readFileSync(join(API, "intern/college/heartbeat/route.ts"), "utf8"));
  assert.match(beat, /requireMutation\(\{ req, roles: \["intern"\], allowPendingTerms: true \}\)/, "no allowImpersonated: View as never marks the student online");
  assert.doesNotMatch(beat, /allowImpersonated/);
  assert.match(beat, /new RateLimiter\(1, 10_000/, "at most one presence write per 10 s");
  assert.ok(beat.indexOf("userPresence") < beat.indexOf("collegeMemberships"), "presence is written before the membership early return");
  const sw = stripComments(readFileSync(join(API, "intern/presence/route.ts"), "utf8"));
  assert.match(sw, /requireMutation\(\{ req, roles: \["intern"\] \}\)/);
});

test("marking a notification read checks the recipient type as well as the id", () => {
  const code = stripComments(readFileSync(join(API, "notifications/[id]/read/route.ts"), "utf8"));
  assert.match(code, /row\.recipientType === session\.role && row\.recipientId === session\.uid/);
});
