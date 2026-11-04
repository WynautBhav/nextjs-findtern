/**
 * The 18+ consent a student ticks to use their college's code. One wording,
 * rendered on the activation card and hashed into the stored record, so the
 * record is of the text that was shown. No imports: safe in a client component.
 */

/** Bump when the wording changes; old records keep the version they were given. */
export const PROMO_CONSENT_VERSION = "promo-v2";

export const promoConsentNotice = (collegeName: string) =>
  `I confirm I am 18 or older. I agree to share my Findtern profile and scores with the placement office of ${collegeName}, which pays my AI interview fee.`;
