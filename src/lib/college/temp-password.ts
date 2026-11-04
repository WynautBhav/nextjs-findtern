import { randomBytes } from "node:crypto";

import { isStrongPassword } from "../password-policy.ts";

/** A one-time password for a placement officer (same shape as the issued one), regenerated until it meets the policy. */
export function tempPassword(): string {
  for (;;) {
    const pw = `${randomBytes(9).toString("base64url")}-${randomBytes(3).toString("hex")}`;
    if (isStrongPassword(pw)) return pw;
  }
}
