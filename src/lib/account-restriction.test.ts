import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanPath, isHeldAllowlisted, isWorkSurface, landingAfterLogin, restrictionVerdict, type RestrictionInput } from "./account-restriction.ts";

const PAGES = ["/intern/dashboard", "/intern/proposals/p1", "/intern/profile", "/intern/documents", "/employer/dashboard", "/employer/candidates", "/employer/timesheets", "/college/dashboard", "/dashboard", "/"];
const APIS = ["/api/intern/onboarding", "/api/intern/avatar", "/api/intern/u1/payment/razorpay/order", "/api/proposals/p1/status", "/api/uploads/abc", "/api/employer/e1/proposals", "/api/account/acknowledge-warning", "/api/auth/me", "/api/employer/cart"];
const WORK = ["/intern/timesheets", "/intern/timesheets?sheet=s1", "/intern/earnings", "/intern/notifications", "/api/intern/timesheets", "/api/intern/timesheets/t1", "/api/intern/timesheets/t1/submit", "/api/intern/u1/payouts", "/api/notifications/n1/read", "/api/notifications/read-all"];
const ALLOWLIST = ["/account-on-hold", "/account-on-hold?as=employer", "/api/auth/logout", "/_next/static/chunks/a.js", "/favicon.ico", "/robots.txt", "/logo.svg"];

const v = (o: Partial<RestrictionInput> & { path: string }) => restrictionVerdict({ role: "intern", frozen: false, workExempt: false, ...o });

test("clean and warned accounts are never restricted, on any route kind", () => {
  for (const path of [...PAGES, ...APIS, ...WORK, ...ALLOWLIST]) assert.equal(v({ path, frozen: false }), "allow", path);
});

test("frozen: every page and API outside the allowlist is held", () => {
  for (const role of ["intern", "employer"]) for (const path of [...PAGES, ...APIS, ...WORK]) assert.equal(v({ role, path, frozen: true }), "hold", `${role} ${path}`);
});

test("frozen: the allowlist (on-hold page, sign-out, static assets) is open to both roles", () => {
  for (const role of ["intern", "employer"]) for (const path of ALLOWLIST) assert.equal(v({ role, path, frozen: true }), "allow", `${role} ${path}`);
});

test("frozen + work exemption (intern): the running-hire work surface opens, nothing else does", () => {
  for (const path of WORK) assert.equal(v({ path, frozen: true, workExempt: true }), "allow", path);
  for (const path of [...PAGES, ...APIS]) assert.equal(v({ path, frozen: true, workExempt: true }), "hold", path);
  for (const path of ["/intern/proposals", "/intern/proposals/p1", "/api/intern/avatar", "/api/uploads/x", "/api/intern/onboarding", "/intern/profile", "/intern/settings", "/intern/documents", "/intern/interviews", "/api/intern/meeting-requests"]) {
    assert.equal(v({ path, frozen: true, workExempt: true }), "hold", path);
  }
});

test("the exemption is ignored for an employer and when it is not set", () => {
  for (const path of WORK) assert.equal(v({ role: "employer", path, frozen: true, workExempt: true }), "hold", path);
  for (const path of WORK) assert.equal(v({ path, frozen: true, workExempt: false }), "hold", path);
});

test("fail closed: unknown, malformed or sneaky paths are held", () => {
  for (const path of [null, undefined, "", "intern/timesheets", "//evil.com/account-on-hold", "/account-on-hold/../intern/dashboard", "/api/auth/logout/../../intern/x", "/intern/timesheets/..%2f", "/intern/timesheets/%2e%2e/profile"]) {
    assert.equal(restrictionVerdict({ role: "intern", frozen: true, workExempt: true, path: path as string }), "hold", String(path));
  }
  // a file extension never turns an app page or API into a static asset
  assert.equal(v({ path: "/intern/proposals/x.png", frozen: true }), "hold");
  assert.equal(v({ path: "/api/admin/export.css", frozen: true }), "hold");
  // prefix lookalikes
  assert.equal(v({ path: "/account-on-hold-evil", frozen: true }), "hold");
  assert.equal(v({ path: "/intern/timesheets-evil", frozen: true, workExempt: true }), "hold");
  assert.equal(v({ path: "/api/intern/u1/payouts/extra", frozen: true, workExempt: true }), "hold");
});

test("cleanPath strips query and hash and a trailing slash", () => {
  assert.equal(cleanPath("/intern/timesheets/?a=1#x"), "/intern/timesheets");
  assert.equal(cleanPath("/"), "/");
  assert.equal(isHeldAllowlisted("/account-on-hold/"), true);
  assert.equal(isWorkSurface("/intern/earnings"), true);
});

test("where a frozen account lands after signing in", () => {
  assert.equal(landingAfterLogin({ role: "intern", frozen: false, workExempt: false }, "/intern/dashboard"), "/intern/dashboard");
  assert.equal(landingAfterLogin({ role: "intern", frozen: true, workExempt: false }, "/intern/dashboard"), "/account-on-hold?as=intern");
  assert.equal(landingAfterLogin({ role: "employer", frozen: true, workExempt: false }, "/x"), "/account-on-hold?as=employer");
  assert.equal(landingAfterLogin({ role: "intern", frozen: true, workExempt: true }, "/x"), "/intern/timesheets");
});
