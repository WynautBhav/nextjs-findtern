import { createHash } from "node:crypto";

/**
 * DPDP notice and purposes for sharing a student's data with their college.
 *
 * Consent is per purpose (DPDP Act 2023 s.6: specific, informed, and limited
 * to the stated purpose), so the dashboard and drive visibility are separate
 * ticks. The notice text is versioned and hashed into every consent row, so
 * we can always show exactly what a student agreed to.
 *
 * Changing the text means bumping NOTICE_VERSION; existing consents stay
 * pinned to the old hash.
 */
export const CONSENT_PURPOSES = ["college_dashboard", "drive_visibility"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const NOTICE_VERSION = "2026-10-27";

export const PURPOSE_COPY: Record<ConsentPurpose, { label: string; detail: string }> = {
  college_dashboard: {
    label: "Share my progress with my college's placement team",
    detail:
      "Your placement officer can see whether you have joined, your AI interview score, report and recording, your profile activity, and the proposals, meetings and offers you receive. They cannot edit anything.",
  },
  drive_visibility: {
    label: "Show my profile to employers in my college's placement drives",
    detail:
      "Employers your college invites to a drive can see your profile, skills and scores while the drive is open, shortlist you and ask you to a short video call. Your phone number and email are never shown.",
  },
};

export const NOTICE_TEXT = [
  `Findtern college data notice, version ${NOTICE_VERSION}.`,
  "Data fiduciary: Findtern. Purpose: placement support by your college and campus placement drives.",
  ...CONSENT_PURPOSES.map((p) => `${PURPOSE_COPY[p].label}: ${PURPOSE_COPY[p].detail}`),
  "You can withdraw at any time from Settings > College. Withdrawing removes you from your college's dashboard and from drives at once; it does not delete your Findtern account.",
  "Questions or complaints: grievance@findtern.in. You may also complain to the Data Protection Board of India.",
].join("\n");

export const NOTICE_HASH = createHash("sha256").update(NOTICE_TEXT, "utf8").digest("hex");

export function parsePurposes(raw: unknown): ConsentPurpose[] {
  if (!Array.isArray(raw)) return [];
  return CONSENT_PURPOSES.filter((p) => raw.includes(p));
}
