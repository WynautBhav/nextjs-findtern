/* Pure readers over the onboarding extraData bag (moved out of the dashboard page; unchanged). */

export function extraBag(onboarding: { extraData?: Record<string, unknown> | null } | null) {
  const extra = onboarding?.extraData;
  return extra && typeof extra === "object" ? (extra as Record<string, unknown>) : {};
}

/** Assigned assessment score, if any - null when unscored (never a fake number). */
export function scoreOf(onboarding: { extraData?: Record<string, unknown> | null } | null): number | null {
  const raw = extraBag(onboarding).findternScore;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** Legacy rating order and labels (dashboard.tsx ratingItems); "academic" was shown too. */
export const RATING_LABELS: [key: string, label: string][] = [
  ["coding", "Coding"],
  ["aptitude", "Aptitude"],
  ["interview", "AI interview"],
  ["communication", "Communication"],
  ["academic", "Academics"],
];

/** Per-axis scores backing the breakdown. Null when never assessed. */
export function ratingsOf(onboarding: { extraData?: Record<string, unknown> | null } | null): [string, number][] | null {
  const raw = extraBag(onboarding).ratings;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const rows = RATING_LABELS.flatMap(([key, label]) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? [[label, Math.max(0, Math.min(10, value))] as [string, number]] : [];
  });
  return rows.length > 0 ? rows : null;
}
