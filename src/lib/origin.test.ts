import test from "node:test";
import assert from "node:assert/strict";

import { isRealDomain, isStagingOrigin } from "./origin.ts";
import { testPayEnabled } from "./razorpay.ts";

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
