import test from "node:test";
import assert from "node:assert/strict";

import { isRealDomain, isStagingOrigin, isTestHost, requirePublicOrigin, tryPublicOrigin } from "./origin.ts";
import { paymentsAreFree, testPayEnabled } from "./razorpay.ts";

const STAGING = "https://nextjs-findtern.vercel.app";

test("the real domain is matched by exact host only", () => {
  for (const o of ["https://findtern.in", "https://www.findtern.in/", "findtern.in", "HTTPS://FINDTERN.IN"]) {
    assert.equal(isRealDomain(o), true, o);
    assert.equal(isStagingOrigin(o), false, o);
  }
  for (const o of ["https://findtern.in.evil.com", "https://staging.findtern.in", "https://notfindtern.in", STAGING]) {
    assert.equal(isRealDomain(o), false, o);
    assert.equal(isStagingOrigin(o), true, o);
  }
});

test("unset or unreadable origin is neither staging nor the real domain", () => {
  for (const o of [undefined, "", "   ", "http://"]) {
    assert.equal(isRealDomain(o), false, String(o));
    assert.equal(isStagingOrigin(o), false, String(o));
  }
});

test("test pay: flag off means off, whatever else is set", () => {
  assert.equal(testPayEnabled({ PUBLIC_ORIGIN: STAGING, RAZORPAY_KEY_ID: "rzp_test_x" }), false);
  assert.equal(testPayEnabled({ PAYMENTS_TEST_BUTTON: "0", PUBLIC_ORIGIN: STAGING }), false);
});

test("test pay: needs the flag AND a test host, whatever the key", () => {
  const LOCAL = "http://localhost:3000";
  for (const key of [undefined, "", "rzp_test_x", "rzp_live_abc"]) {
    const k = { RAZORPAY_KEY_ID: key };
    assert.equal(testPayEnabled({ ...k, PAYMENTS_TEST_BUTTON: "1", PUBLIC_ORIGIN: LOCAL }), true, `local host + flag, key ${key}`);
    assert.equal(testPayEnabled({ ...k, PAYMENTS_TEST_BUTTON: "1", PUBLIC_ORIGIN: STAGING }), true, `staging + flag, key ${key}`);
    assert.equal(testPayEnabled({ ...k, PAYMENTS_TEST_BUTTON: "1", PUBLIC_ORIGIN: "https://findtern.in" }), false, `live origin + flag, key ${key}`);
    assert.equal(testPayEnabled({ ...k, PAYMENTS_TEST_BUTTON: "1", PUBLIC_ORIGIN: "https://www.findtern.in" }), false, `www + flag, key ${key}`);
    assert.equal(testPayEnabled({ ...k, PAYMENTS_TEST_BUTTON: "1" }), false, `unset origin fails closed, key ${key}`);
    for (const flag of [undefined, "", "0", "true", "on"]) {
      for (const PUBLIC_ORIGIN of [undefined, LOCAL, STAGING, "https://findtern.in"]) {
        assert.equal(testPayEnabled({ ...k, PAYMENTS_TEST_BUTTON: flag, PUBLIC_ORIGIN }), false, `flag ${flag} on ${PUBLIC_ORIGIN}, key ${key}`);
      }
    }
  }
});

test("test pay: a test key does not open it on the real domain", () => {
  const f = { PAYMENTS_TEST_BUTTON: "1", RAZORPAY_KEY_ID: "rzp_test_x" };
  assert.equal(testPayEnabled({ ...f, PUBLIC_ORIGIN: "https://findtern.in" }), false);
  assert.equal(testPayEnabled({ ...f, PUBLIC_ORIGIN: "https://findtern.in", STAGING_HOSTS: "findtern.in" }), false, "the real domain cannot be listed in");
  assert.equal(testPayEnabled({ ...f, PUBLIC_ORIGIN: "https://findtern.in." }), false, "trailing dot");
});

test("test pay: only a known test host counts", () => {
  const live = { PAYMENTS_TEST_BUTTON: "1", RAZORPAY_KEY_ID: "rzp_live_abc" };
  assert.equal(testPayEnabled({ ...live, PUBLIC_ORIGIN: "https://findtern.in.evil.com" }), false, "an unknown host is not a test host");
  assert.equal(testPayEnabled({ ...live, PUBLIC_ORIGIN: "https://app.findtern.in" }), false, "nor is a production subdomain");
  assert.equal(testPayEnabled({ ...live, PUBLIC_ORIGIN: "https://staging.findtern.in", STAGING_HOSTS: "staging.findtern.in" }), true, "unless it is named as staging");
});

test("links are built from PUBLIC_ORIGIN, trimmed, whatever the environment", () => {
  for (const NODE_ENV of ["production", "development", "test"]) {
    assert.equal(requirePublicOrigin({ NODE_ENV, PUBLIC_ORIGIN: " https://findtern.in/ " }), "https://findtern.in");
    assert.equal(requirePublicOrigin({ NODE_ENV, PUBLIC_ORIGIN: "http://localhost:4000" }), "http://localhost:4000");
  }
});

test("without PUBLIC_ORIGIN, localhost is for development only; production refuses", () => {
  for (const PUBLIC_ORIGIN of [undefined, "", "   ", "findtern.in", "ftp://x.in", "https://"]) {
    assert.equal(requirePublicOrigin({ NODE_ENV: "development", PUBLIC_ORIGIN }), "http://localhost:3000", `dev: ${JSON.stringify(PUBLIC_ORIGIN)}`);
    assert.equal(requirePublicOrigin({ PUBLIC_ORIGIN }), "http://localhost:3000", `unset NODE_ENV: ${JSON.stringify(PUBLIC_ORIGIN)}`);
    assert.throws(() => requirePublicOrigin({ NODE_ENV: "production", PUBLIC_ORIGIN }), /PUBLIC_ORIGIN is not set/, `production: ${JSON.stringify(PUBLIC_ORIGIN)}`);
  }
});

test("a trailing dot on the host does not make the real domain look like staging", () => {
  for (const o of ["https://findtern.in.", "https://www.findtern.in..", "HTTPS://FINDTERN.IN./"]) {
    assert.equal(isRealDomain(o), true, o);
    assert.equal(isStagingOrigin(o), false, o);
  }
  const live = { PAYMENTS_TEST_BUTTON: "1", RAZORPAY_KEY_ID: "rzp_live_abc", PUBLIC_ORIGIN: "https://findtern.in." };
  assert.equal(testPayEnabled(live), false);
});

test("free-payments mode is guarded like the test button: not with a live key off staging", () => {
  const free = { PAYMENTS_MODE: "free" };
  assert.equal(paymentsAreFree({}), false);
  assert.equal(paymentsAreFree({ PAYMENTS_MODE: "paid" }), false);
  assert.equal(paymentsAreFree({ ...free }), true, "no live key: a copy with no gateway");
  assert.equal(paymentsAreFree({ ...free, RAZORPAY_KEY_ID: "rzp_test_x", PUBLIC_ORIGIN: "https://findtern.in" }), true);
  assert.equal(paymentsAreFree({ ...free, RAZORPAY_KEY_ID: "rzp_live_x", PUBLIC_ORIGIN: STAGING }), true);
  assert.equal(paymentsAreFree({ ...free, RAZORPAY_KEY_ID: "rzp_live_x", PUBLIC_ORIGIN: "https://findtern.in" }), false, "leaked flag on the real domain");
  assert.equal(paymentsAreFree({ ...free, RAZORPAY_KEY_ID: "rzp_live_x" }), false, "unset origin fails closed");
});

test("test hosts are a list: localhost, Vercel deployments, STAGING_HOSTS; never the real domain or an unknown host", () => {
  for (const o of ["http://localhost:3000", "http://127.0.0.1:3100", STAGING, "https://nextjs-findtern-git-x-team.vercel.app"]) assert.equal(isTestHost({ PUBLIC_ORIGIN: o }), true, o);
  for (const o of [undefined, "", "https://findtern.in", "https://www.findtern.in.", "https://app.findtern.in", "https://example.com", "https://vercel.app.evil.com", "https://evilvercel.app"]) assert.equal(isTestHost({ PUBLIC_ORIGIN: o }), false, String(o));
  assert.equal(isTestHost({ PUBLIC_ORIGIN: "https://qa.example.com", STAGING_HOSTS: "other.example.com, QA.example.com." }), true);
  assert.equal(isTestHost({ PUBLIC_ORIGIN: "https://findtern.in", STAGING_HOSTS: "findtern.in" }), false, "the real domain cannot be listed in");
});

test("tryPublicOrigin: null instead of a throw when production has no PUBLIC_ORIGIN (post-commit emails must not 500 a saved decision)", () => {
  assert.equal(tryPublicOrigin({ NODE_ENV: "production" }), null);
  assert.equal(tryPublicOrigin({ NODE_ENV: "production", PUBLIC_ORIGIN: "not a url" }), null);
  assert.equal(tryPublicOrigin({ NODE_ENV: "production", PUBLIC_ORIGIN: "https://findtern.in/" }), "https://findtern.in");
  assert.equal(tryPublicOrigin({ NODE_ENV: "development" }), "http://localhost:3000");
});
