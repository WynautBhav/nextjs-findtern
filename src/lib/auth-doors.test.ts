import { test } from "node:test";
import assert from "node:assert/strict";

import { authPath, doorOf, ownNext } from "./auth-doors.ts";

test("doorOf falls back to the first allowed door", () => {
  assert.equal(doorOf("employer"), "employer");
  assert.equal(doorOf(["college", "intern"]), "college");
  assert.equal(doorOf("admin"), "intern");
  assert.equal(doorOf(undefined), "intern");
  // Signup has no college door.
  assert.equal(doorOf("college", ["intern", "employer"]), "intern");
});

test("authPath always names the type (a bare /login follows the last-used cookie) and drops empty params", () => {
  assert.equal(authPath("/login", "intern"), "/login?as=intern");
  assert.equal(authPath("/login", "intern", { next: "" }), "/login?as=intern");
  assert.equal(authPath("/login", "employer", { next: "/employer/cart?x=1" }), "/login?as=employer&next=%2Femployer%2Fcart%3Fx%3D1");
  assert.equal(authPath("/reset-password", "employer", { token: "abc" }), "/reset-password?as=employer&token=abc");
});

test("ownNext drops another account type's page, which would only bounce to its sign in", () => {
  assert.equal(ownNext("/employer/cart?x=1", "employer"), "/employer/cart?x=1");
  assert.equal(ownNext("/drive/abc", "employer"), "/drive/abc");
  assert.equal(ownNext("/intern/dashboard", "employer"), "");
  assert.equal(ownNext("/admin", "employer"), "");
  assert.equal(ownNext("/employer", "intern"), "");
  // Only whole segments: /internships is a public page, not the intern area.
  assert.equal(ownNext("/internships", "employer"), "/internships");
  assert.equal(ownNext("", "employer"), "");
});
