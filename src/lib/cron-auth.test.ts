import assert from "node:assert/strict";
import test from "node:test";

import { cronAuthorized } from "./cron-auth.ts";

const req = (authorization?: string) => ({ headers: new Headers(authorization === undefined ? {} : { authorization }) });

test("cron auth: only the exact bearer secret passes", () => {
  assert.equal(cronAuthorized(req("Bearer s3cret"), "s3cret"), true);
  assert.equal(cronAuthorized(req("Bearer s3creT"), "s3cret"), false);
  assert.equal(cronAuthorized(req("Bearer  s3cret"), "s3cret"), false);
  assert.equal(cronAuthorized(req("s3cret"), "s3cret"), false);
  assert.equal(cronAuthorized(req(), "s3cret"), false);
});

test("cron auth: an unset or empty secret closes the route, even for 'Bearer undefined' / 'Bearer '", () => {
  assert.equal(cronAuthorized(req("Bearer undefined"), undefined), false);
  assert.equal(cronAuthorized(req("Bearer "), ""), false);
  assert.equal(cronAuthorized(req(), undefined), false);
});
