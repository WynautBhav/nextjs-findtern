import { createHash } from "node:crypto";

import { CONSENT_PURPOSES, NOTICE_TEXT, type ConsentPurpose } from "./consent-copy.ts";

/**
 * DPDP notice and purposes for sharing a student's data with their college.
 *
 * Consent is per purpose (DPDP Act 2023 s.6: specific, informed, and limited
 * to the stated purpose), so the dashboard and drive visibility are separate
 * ticks. The notice text (consent-copy.ts) is versioned and hashed into every
 * consent row, so we can always show exactly what a student agreed to.
 */
export { CONSENT_PURPOSES, NOTICE_TEXT, NOTICE_VERSION, PURPOSE_COPY, type ConsentPurpose } from "./consent-copy.ts";

export const NOTICE_HASH = createHash("sha256").update(NOTICE_TEXT, "utf8").digest("hex");

export function parsePurposes(raw: unknown): ConsentPurpose[] {
  if (!Array.isArray(raw)) return [];
  return CONSENT_PURPOSES.filter((p) => raw.includes(p));
}
