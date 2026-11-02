/**
 * The words of the college consent: purposes and the notice. No Node imports,
 * so the client forms can show exactly the text that `consent.ts` hashes.
 *
 * Changing the text means bumping NOTICE_VERSION; existing consents stay
 * pinned to the old hash.
 */
export const CONSENT_PURPOSES = ["college_dashboard", "drive_visibility"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const NOTICE_VERSION = "2026-11-02";

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
  "• Who holds your data: Findtern.",
  "• Why: placement support by your college and campus placement drives.",
  ...CONSENT_PURPOSES.map((p) => `• ${PURPOSE_COPY[p].label}: ${PURPOSE_COPY[p].detail}`),
  "• You can withdraw at any time from Settings > College. Withdrawing removes you from your college's dashboard and from drives at once; it does not delete your Findtern account.",
  "• Questions or complaints: communicate@findtern.in. You may also complain to the Data Protection Board of India.",
].join("\n");
