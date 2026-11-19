import type { EmailContent } from "./emails.ts";
import { requirePublicOrigin } from "./origin.ts";

/**
 * Mailed to the owner when someone tries to sign up with an address that already
 * has an account. The signup page itself answers exactly as for a new address
 * (B-55), so only the mailbox owner learns the account exists.
 */
export function accountExistsEmail(env: Record<string, string | undefined> = process.env): EmailContent {
  const site = requirePublicOrigin(env);
  return {
    subject: "You already have a Findtern account",
    preheader: "Someone tried to sign up with this email. Sign in, or reset your password.",
    heading: "You already have a Findtern account",
    greeting: "Hi there,",
    lines: [
      "Someone just tried to create a Findtern account with this email address, but one already exists.",
      "If that was you, sign in instead. If you forgot your password, you can reset it.",
      `Reset your password: ${site}/forgot-password`,
      "If it was not you, you can ignore this email. No account was created or changed.",
    ],
    cta: { label: "Sign in", url: `${site}/login` },
    reason: "You’re receiving this because this email address has a Findtern account.",
  };
}
