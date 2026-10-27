/**
 * The pure half of the skills lock (`skills-lock.ts` does the queries), kept
 * free of database imports so it can be unit-tested.
 */

/** AI interview states that no longer hold the skills. */
export const DONE_STATUSES = ["completed", "expired", "cancelled", "missed"];
/** The admin ratings that mean the intern has been assessed (legacy list). */
const RATING_KEYS = ["communication", "coding", "aptitude", "interview", "overall", "academic"];

/** Any of the legacy admin ratings above zero (onboarding.tsx:390-397). */
export function hasAssessmentRating(extraData: unknown): boolean {
  const ratings = ((extraData ?? {}) as Record<string, unknown>).ratings;
  if (!ratings || typeof ratings !== "object") return false;
  return Object.entries(ratings as Record<string, unknown>).some(
    ([k, v]) => RATING_KEYS.includes(k) && typeof v === "number" && Number.isFinite(v) && v > 0,
  );
}

export type AiInvite = {
  status: string | null;
  selectedSlot: number | null;
  slot1: Date | null;
  slot2: Date | null;
  slot3: Date | null;
};

/**
 * Whether an AI interview row still freezes the skills (legacy effective
 * status, onboarding.tsx:530-563): a scheduled interview whose picked slot
 * has passed counts as completed, and an invite whose every offered slot has
 * passed without a pick counts as expired. Both release the lock, so a stale
 * invite no longer keeps the skills frozen for ever (INT-30).
 */
export function aiInviteHoldsSkills(row: AiInvite, now: Date = new Date()): boolean {
  const status = (row.status ?? "").trim().toLowerCase();
  if (DONE_STATUSES.includes(status)) return false;
  const slots = [row.slot1, row.slot2, row.slot3];
  const time = (d: Date | null) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : null);
  if (row.selectedSlot) {
    const picked = time(slots[row.selectedSlot - 1] ?? null);
    if (status === "scheduled" && picked !== null && now.getTime() > picked) return false;
    return true;
  }
  const offered = slots.map(time).filter((t): t is number => t !== null);
  if (offered.length > 0 && now.getTime() > Math.max(...offered)) return false;
  return true;
}

/** Same set of skills, ignoring order and case. */
export function sameSkills(a: string[], b: string[]): boolean {
  const norm = (list: string[]) => [...new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean))].sort().join("|");
  return norm(a) === norm(b);
}

/** Same skills with the same ratings, ignoring order and the case of names. */
export function sameRatedSkills(a: { name: string; rating: string }[], b: { name: string; rating: string }[]): boolean {
  const norm = (list: { name: string; rating: string }[]) =>
    [...new Set(list.filter((s) => s.name.trim()).map((s) => `${s.name.trim().toLowerCase()}=${s.rating}`))].sort().join("|");
  return norm(a) === norm(b);
}
