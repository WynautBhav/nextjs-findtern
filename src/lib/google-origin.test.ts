import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { publicOrigin } from "./google.ts";

const env = process.env as Record<string, string | undefined>;
const saved = { NODE_ENV: env.NODE_ENV, PUBLIC_ORIGIN: env.PUBLIC_ORIGIN };
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});

/** A forgot-password request whose Host headers point at an attacker's site. */
const forged = () =>
  new Request("https://real.example/api/auth/forgot-password", {
    method: "POST",
    headers: { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https", host: "evil.example" },
  });

test("production: a reset link is never built from a request header", () => {
  env.NODE_ENV = "production";
  env.PUBLIC_ORIGIN = "https://findtern.in";
  assert.equal(publicOrigin(forged()), "https://findtern.in", "PUBLIC_ORIGIN wins over the forged host");
  delete env.PUBLIC_ORIGIN;
  assert.throws(() => publicOrigin(forged()), /PUBLIC_ORIGIN is not set/, "no PUBLIC_ORIGIN: refuse, do not trust the host header");
});

test("development: the request's own origin is still a usable fallback", () => {
  env.NODE_ENV = "development";
  delete env.PUBLIC_ORIGIN;
  assert.equal(publicOrigin(forged()), "https://evil.example", "fine on a developer's machine");
  env.PUBLIC_ORIGIN = "http://localhost:3100/";
  assert.equal(publicOrigin(forged()), "http://localhost:3100");
});
