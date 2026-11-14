/**
 * The 18+ consent ticked next to the college code. One wording, rendered by the form and hashed into the
 * stored consent record (membership.ts), so the record is of the text that was shown. The college is not
 * named: the form cannot know it until the code has been accepted. No imports: safe in a client component.
 */
export const COLLEGE_CODE_CONSENT_VERSION = "college-code-v1";

export const COLLEGE_CODE_CONSENT_NOTICE =
  "I am 18 or older. I agree to share my Findtern profile and scores with the placement office of the college this code belongs to.";
