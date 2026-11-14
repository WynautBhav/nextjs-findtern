/**
 * Individual or college account, as stored in intern_onboarding.extra_data.accountType.
 *
 * "college" is only ever written by the server after a valid college code (POST /api/intern/college)
 * or kept by it while a code-verified membership exists; a client-sent value is a request, never proof.
 * No imports: safe in client components, readable by the college dashboard.
 */

export type AccountType = "individual" | "college";

export const ACCOUNT_TYPES: readonly AccountType[] = ["individual", "college"];

/** The stored type, or null when the candidate never chose (every account made before this choice existed). */
export function getAccountType(extraData: unknown): AccountType | null {
  if (!extraData || typeof extraData !== "object" || Array.isArray(extraData)) return null;
  const v = (extraData as Record<string, unknown>).accountType;
  return v === "individual" || v === "college" ? v : null;
}

/**
 * Memberships that something other than the student's own say-so verified: the college's code
 * (college_code), the TPO's code (promo), a personal drive code (drive_code) or the college's own roster.
 * A college email address (email_domain) is a claim the student can make alone, so it cannot back a college account.
 */
export const CODE_VERIFIED_BY: readonly string[] = ["college_code", "promo", "drive_code", "roster"];

export function isCodeVerifiedMembership(m: { status: string; verifiedBy: string | null; leftAt?: Date | null } | null | undefined): boolean {
  return Boolean(m && !m.leftAt && m.status === "verified" && m.verifiedBy && CODE_VERIFIED_BY.includes(m.verifiedBy));
}

export type AccountTypeDecision = { ok: true; type: AccountType } | { ok: false; error: string };

/**
 * What the account type becomes when the candidate asks for `requested`.
 * "individual" is always allowed. "college" needs a code-verified membership, and (to switch back to it)
 * an unpaid account, so a candidate who paid the fee themselves cannot flip to the college view.
 */
export function decideAccountType(input: {
  requested: AccountType;
  current: AccountType | null;
  codeVerified: boolean;
  paid: boolean;
}): AccountTypeDecision {
  if (input.requested === "individual") return { ok: true, type: "individual" };
  if (!input.codeVerified) return { ok: false, error: "Enter your college code to use a college account." };
  if (input.current !== "college" && input.paid) return { ok: false, error: "Your fee is already paid, so this account stays an individual account." };
  return { ok: true, type: "college" };
}
