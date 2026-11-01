import test from "node:test";
import assert from "node:assert/strict";

import { isRealDomain, isStagingOrigin, requirePublicOrigin } from "./origin.ts";
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

test("test pay: a non-live key is enough", () => {
  assert.equal(testPayEnabled({ PAYMENTS_TEST_BUTTON: "1", RAZORPAY_KEY_ID: "rzp_test_x" }), true);
  assert.equal(testPayEnabled({ PAYMENTS_TEST_BUTTON: "1" }), true);
});

test("test pay: a live key works on staging only", () => {
  const live = { PAYMENTS_TEST_BUTTON: "1", RAZORPAY_KEY_ID: "rzp_live_abc" };
  assert.equal(testPayEnabled({ ...live, PUBLIC_ORIGIN: STAGING }), true);
  assert.equal(testPayEnabled({ ...live, PUBLIC_ORIGIN: "https://findtern.in" }), false, "leaked flag on the real domain");
  assert.equal(testPayEnabled({ ...live, PUBLIC_ORIGIN: "https://www.findtern.in" }), false);
  assert.equal(testPayEnabled({ ...live }), false, "unset origin fails closed");
  assert.equal(testPayEnabled({ ...live, PUBLIC_ORIGIN: "https://findtern.in.evil.com" }), true, "a different host is not the real site");
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
