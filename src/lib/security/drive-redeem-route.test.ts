import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// No route harness here, so pin the wiring; e2e/drive-journey.e2e.mjs (test 7) proves the 403/401 over HTTP.
const route = readFileSync(join(import.meta.dirname, "../../app/api/intern/drive-codes/redeem/route.ts"), "utf8");
const claim = readFileSync(join(import.meta.dirname, "../../app/api/intern/drive-codes/claim/route.ts"), "utf8");

test("redeeming a drive code is a student-only mutation, guarded before anything is read or written", () => {
  assert.match(route, /requireMutation\(\{ req, roles: \["intern"\] \}\)/);
  assert.doesNotMatch(route, /roles: \[[^\]]*"(admin|college|employer)"/);
  assert.ok(route.indexOf("requireMutation(") < route.indexOf("req.json()"), "the role/CSRF guard runs before the body is parsed");
  assert.ok(route.indexOf("requireMutation(") < route.indexOf("redeemForStudent("), "the guard runs before the redeem");
});

test("the redeemer is the signed-in student, never an id from the request", () => {
  assert.match(route, /redeemForStudent\(\{ uid, /);
  assert.match(route, /const uid = guard\.session\.uid/);
  assert.doesNotMatch(route, /internId: parsed\.data|body\.internId|searchParams/);
});

test("accepting what the college paid is student-only and uses the signed-in student, never an id from the request", () => {
  assert.match(claim, /requireMutation\(\{ req, roles: \["intern"\] \}\)/);
  assert.doesNotMatch(claim, /roles: \[[^\]]*"(admin|college|employer)"/);
  assert.ok(claim.indexOf("requireMutation(") < claim.indexOf("req.json()"), "the guard runs before the body is parsed");
  assert.match(claim, /pendingClaimFor\(getDb\(\)\.\$client, guard\.session\.uid,/);
  assert.match(claim, /uid: guard\.session\.uid/);
  assert.doesNotMatch(claim, /body\.internId|searchParams|parsed\.data\.(uid|internId|code)/);
});
