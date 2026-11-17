/**
 * The two written fields of a proposal. Pure (no imports), so the composer,
 * the edit form and the API routes share one rule and `node --test` can load it.
 *
 * `jd` is the job description (what the intern will do). `additionalInfo`
 * carries what the intern will learn, and is mandatory (feedback sheet 2, row 3).
 */

import { z } from "zod";

export const JD_LABEL = "Job description";
export const JD_HINT = "What the intern will do, who they will work with, and what success looks like.";
export const LEARN_LABEL = "What the intern will learn";
export const LEARN_HINT = "The skills and experience the intern will gain. Candidates read this to decide.";
export const LEARN_MIN = 10;
export const LEARN_MAX = 2000;

export const LEARN_REQUIRED_MESSAGE = "Say what the intern will learn.";
export const LEARN_TOO_SHORT_MESSAGE = `Say a little more about what the intern will learn (at least ${LEARN_MIN} characters).`;

/** The problem with the "what the intern will learn" text, or null when it is fine. */
export function learnIssue(raw: string | null | undefined): string | null {
  const text = String(raw ?? "").trim();
  if (text.length === 0) return LEARN_REQUIRED_MESSAGE;
  if (text.length < LEARN_MIN) return LEARN_TOO_SHORT_MESSAGE;
  if (text.length > LEARN_MAX) return `Keep this under ${LEARN_MAX} characters.`;
  return null;
}

/**
 * The API field, used verbatim by the send route and (when present) the edit
 * route: a missing or blank value is rejected, so a request that skips the
 * form cannot skip the rule.
 */
export const learnField = z
  .string(LEARN_REQUIRED_MESSAGE)
  .transform((v) => v.trim())
  .superRefine((v, ctx) => {
    const issue = learnIssue(v);
    if (issue) ctx.addIssue({ code: "custom", message: issue });
  });
