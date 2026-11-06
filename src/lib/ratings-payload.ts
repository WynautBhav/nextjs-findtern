/**
 * What the admin ratings editor sends. Kept pure so the decision "what changed"
 * is testable: a plain Save with nothing changed must send nothing (an imported
 * score usually has no axis ratings, and four empty boxes must not wipe it).
 */

export const RATING_AXES = [
  { key: "communication", label: "Communication" },
  { key: "coding", label: "Coding" },
  { key: "aptitude", label: "Aptitude" },
  { key: "interview", label: "AI interview" },
] as const;

export type RatingAxis = (typeof RATING_AXES)[number]["key"];

export type RatingsPayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

/** A typed rating that is not a number from 0 to 10 (an empty box is fine: it clears that rating). */
export function ratingOutOfRange(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  const n = Number(t);
  return !Number.isFinite(n) || n < 0 || n > 10;
}

export function buildRatingsPayload(input: {
  values: Record<RatingAxis, string>;
  ratings: Partial<Record<RatingAxis, number>>;
  feedbackLink: string;
  recordingLink: string;
  initialFeedbackLink?: string | null;
  initialRecordingLink?: string | null;
}): RatingsPayloadResult {
  const payload: Record<string, unknown> = {};
  for (const axis of RATING_AXES) {
    const raw = input.values[axis.key].trim();
    const before = input.ratings[axis.key]?.toString() ?? "";
    if (raw === before) continue;
    // An emptied box clears that rating (legacy behaviour).
    if (!raw) {
      payload[axis.key] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      return { ok: false, error: `${axis.label} must be a number between 0 and 10.` };
    }
    payload[axis.key] = n;
  }
  if (input.feedbackLink.trim() !== (input.initialFeedbackLink ?? "").trim()) payload.aiFeedbackLink = input.feedbackLink.trim() || null;
  if (input.recordingLink.trim() !== (input.initialRecordingLink ?? "").trim()) payload.aiRecordingLink = input.recordingLink.trim() || null;
  if (Object.keys(payload).length === 0) return { ok: false, error: "Nothing changed." };
  return { ok: true, payload };
}

/** All four axes null: what the server treats as clearing the score. Only sent from the explicit "Clear score" button. */
export function clearScorePayload(): Record<RatingAxis, null> {
  return { communication: null, coding: null, aptitude: null, interview: null };
}
