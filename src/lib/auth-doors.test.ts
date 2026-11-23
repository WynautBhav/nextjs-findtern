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

test("a placement officer can reset their own password: link on the college sign in, college in the forgot and reset routes (owner, 23 Nov)", async () => {
  const { readFileSync } = await import("node:fs");
  const login = readFileSync("src/app/(auth)/login/page.tsx", "utf8");
  assert.match(login, /forgotHref=\{authPath\("\/forgot-password", door\)\}/);
  const forgot = readFileSync("src/app/api/auth/forgot-password/route.ts", "utf8");
  assert.match(forgot, /"college"/);
  assert.match(forgot, /college: \{ table: schema\.collegeAdmins/);
  assert.match(forgot, /\/reset-password\?as=college&/);
  const reset = readFileSync("src/app/api/auth/reset-password/route.ts", "utf8");
  assert.match(reset, /subjectType === "college"[\s\S]*?update\(schema\.collegeAdmins\)/);
  for (const page of ["src/app/(auth)/forgot-password/page.tsx", "src/app/(auth)/reset-password/page.tsx"]) {
    assert.match(readFileSync(page, "utf8"), /doorOf\(as, \["intern", "employer", "college"\]\)/, page);
  }
});
