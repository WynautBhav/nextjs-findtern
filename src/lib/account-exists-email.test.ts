import test from "node:test";
import assert from "node:assert/strict";

import { accountExistsEmail } from "./account-exists-email.ts";

test("the existing-owner email points to sign in and reset, and carries no code", () => {
  const mail = accountExistsEmail({ PUBLIC_ORIGIN: "https://findtern.example" });
  assert.equal(mail.cta?.url, "https://findtern.example/login");
  assert.ok(mail.lines.some((l) => l.includes("https://findtern.example/forgot-password")));
  assert.equal(mail.code, undefined);
});
