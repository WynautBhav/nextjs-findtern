import { createHash } from "node:crypto";

/** Pure rules for a student verified by their college's TPO code (WP9$). No DB. */

export const PROMO_CONSENT_NOTICE =
  "I confirm I am 18 or older. I agree to share my Findtern profile and scores with my college's placement office, and that my college pays my AI interview fee.";
export const PROMO_CONSENT_VERSION = "promo-v1";
export const promoConsentHash = () => createHash("sha256").update(PROMO_CONSENT_NOTICE).digest("hex");

/** The 18+ tick is required before a college code can be used. */
export function consentProblem(declaredAdult: unknown): string | null {
  return declaredAdult === true ? null : "Confirm you are 18 or older to use your college's code.";
}

type Existing = { collegeId: string; status: string; verifiedBy: string | null; year: number | null; branch: string | null; leftAt: Date | null } | null;

/**
 * The membership row after a college code settles. The code is the proof, so it
 * wins over any other claim: another college's row moves over (year and branch
 * belonged to the old one, so they clear). The same college keeps year/branch,
 * and keeps an existing verified label rather than downgrading it.
 */
export function membershipFromPromo(existing: Existing, collegeId: string) {
  const same = existing !== null && existing.collegeId === collegeId && existing.leftAt === null;
  return {
    collegeId,
    status: "verified" as const,
    verifiedBy: same && existing.status === "verified" && existing.verifiedBy ? existing.verifiedBy : "promo",
    year: same ? existing.year : null,
    branch: same ? existing.branch : null,
    leftAt: null,
  };
}
