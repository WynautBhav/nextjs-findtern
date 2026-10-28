import { test } from "node:test";
import assert from "node:assert/strict";

const { safeNext } = await import("../google.ts");

test("safeNext keeps same-site paths, including a drive link", () => {
  assert.equal(safeNext("/drive/abc_DEF-123", "/x"), "/drive/abc_DEF-123");
  assert.equal(safeNext("/employer/drives/1?tab=calls", "/x"), "/employer/drives/1?tab=calls");
});

test("safeNext refuses anything that can leave the site", () => {
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/\t/evil.com", "/\n/evil.com", "/\r//evil.com", "", null, 42]) {
    assert.equal(safeNext(bad, "/fallback"), "/fallback", JSON.stringify(bad));
  }
});

test("Google sign-in is off unless GOOGLE_LOGIN=on and keys are set", async () => {
  const { googleLoginEnabled } = await import("../google.ts");
  const saved = { ...process.env };
  process.env.GOOGLE_CLIENT_ID = "id";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  delete process.env.GOOGLE_LOGIN;
  assert.equal(googleLoginEnabled(), false);
  process.env.GOOGLE_LOGIN = "on";
  assert.equal(googleLoginEnabled(), true);
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.equal(googleLoginEnabled(), false);
  process.env = saved;
});
