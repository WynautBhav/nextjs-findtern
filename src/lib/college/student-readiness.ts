/**
 * Whether employers can see a student, told to the placement officer as one line. The checks read the full onboarding
 * row (identity documents included) on the server; only the verdicts, a step name and two flags leave this file, so the
 * officer learns "About me is not finished", never what is in it.
 */
import { draftFromRecord, emptyDraft, validateProfile, type OnboardingLike } from "../onboarding.ts";
import type { ProfileDocs } from "../admin/profile-state.ts";

/** The onboarding steps in the student's own words (lib/onboarding.ts, steps 1 to 8). */
export const STEP_NAMES = ["About me", "Academics", "Experience", "Skills", "Languages", "Extracurriculars", "Work preferences", "Agreement"] as const;

export type Readiness = {
  /** In the employer pool today (lib/employer-pool.ts), the same query employers browse with. */
  seen: boolean;
  /** Why not, in one line; empty when seen. */
  seenWhy: string;
  /** The hire gate (lib/hire-gate.ts): a complete profile. Employers can see a student they cannot hire yet. */
  hireable: boolean;
  hireWhy: string;
  /** Account frozen or switched off by Findtern. The reason stays with Findtern. */
  paused: boolean;
  /** At least one marksheet uploaded. The files stay on Findtern. */
  marksheet: boolean;
};

export function readinessFrom(o: {
  inPool: boolean;
  profileVisibility: string;
  isActive: boolean;
  frozen: boolean;
  openToWork: boolean;
  hiddenByAdmin: boolean;
  /** An AI interview rating and a Findtern score. */
  interviewed: boolean;
  hireable: boolean;
  /** A row exists and the profile was submitted (or scored). */
  submitted: boolean;
  /** null = every step passes; otherwise the first open step (from 0). */
  openStep: number | null;
  marksheet: boolean;
}): Readiness {
  const paused = o.frozen || !o.isActive;
  // The pool query is the truth; the flags only explain a "no", first reason wins. Approval and the interview fee read
  // as one "Findtern's checks" line: what the student paid is not the officer's to see.
  const seenWhy = o.inPool
    ? ""
    : paused || o.profileVisibility === "hidden" || o.hiddenByAdmin
      ? "Paused by Findtern. Contact Findtern for details."
      : !o.openToWork
        ? "The student turned off Open to work."
        : !o.interviewed
          ? "The AI interview is not done yet."
          : "Waiting on Findtern's checks.";
  const hireWhy = o.hireable
    ? ""
    : !o.submitted
      ? "Profile not submitted yet."
      : `Profile incomplete: ${STEP_NAMES[o.openStep ?? 0] ?? "a step"} is not finished.`;
  return { seen: o.inPool, seenWhy, hireable: o.hireable, hireWhy, paused, marksheet: o.marksheet };
}

/**
 * The first open onboarding step, by the same rules as the admin's "profile complete" (lib/admin/profile-state.ts):
 * the form's own validation, and an empty language list counts as Languages not done.
 */
export function openStepOf(row: OnboardingLike | null | undefined, docs: ProfileDocs): { submitted: boolean; openStep: number | null } {
  if (!row) return { submitted: false, openStep: 0 };
  const extra = row.extraData && typeof row.extraData === "object" && !Array.isArray(row.extraData) ? (row.extraData as Record<string, unknown>) : {};
  const ratings = extra.ratings && typeof extra.ratings === "object" ? (extra.ratings as Record<string, unknown>) : {};
  const submitted = (typeof extra.profileSubmittedAt === "string" && extra.profileSubmittedAt !== "") || Number(extra.findternScore) > 0 || Number(ratings.interview) > 0;
  const failed = validateProfile({ ...emptyDraft(), ...draftFromRecord(row) }, docs);
  const noLanguages = !Array.isArray(extra.languages) || extra.languages.length === 0;
  const openStep = failed ? (noLanguages ? Math.min(failed.step, 4) : failed.step) : noLanguages ? 4 : null;
  return { submitted, openStep };
}

/** Marksheets uploaded during onboarding (academics.marksheetUploads). */
export function hasMarksheet(extra: Record<string, unknown> | null | undefined): boolean {
  const a = extra?.academics && typeof extra.academics === "object" ? (extra.academics as Record<string, unknown>) : {};
  return Array.isArray(a.marksheetUploads) && a.marksheetUploads.some((m) => m && typeof m === "object" && typeof (m as Record<string, unknown>).name === "string");
}
