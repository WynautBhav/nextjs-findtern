import test from "node:test";
import assert from "node:assert/strict";

import { googleConfig } from "./google.ts";

const KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "PUBLIC_ORIGIN"] as const;

function withEnv(env: Partial<Record<(typeof KEYS)[number], string>>, run: () => void) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, { PUBLIC_ORIGIN: "https://findtern.in" }, env);
  try {
    run();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("M3: the GOOGLE_ names win, and the legacy GOOGLE_OAUTH_ names still work", () => {
  withEnv({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "y" }, () => {
    assert.deepEqual([googleConfig()?.clientId, googleConfig()?.clientSecret], ["a", "b"]);
  });
  withEnv({ GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "y" }, () => {
    assert.deepEqual([googleConfig()?.clientId, googleConfig()?.clientSecret], ["x", "y"]);
  });
  withEnv({ GOOGLE_OAUTH_CLIENT_ID: "x" }, () => assert.equal(googleConfig(), null, "a secret is still required"));
  withEnv({}, () => assert.equal(googleConfig(), null));
});
