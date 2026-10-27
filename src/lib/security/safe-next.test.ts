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
