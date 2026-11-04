import { test } from "node:test";
import assert from "node:assert/strict";

import { tempPassword } from "./temp-password.ts";
import { isStrongPassword } from "../password-policy.ts";

test("a temporary password always meets the password policy and is not repeated", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const pw = tempPassword();
    assert.ok(isStrongPassword(pw), pw);
    seen.add(pw);
  }
  assert.equal(seen.size, 200);
});
