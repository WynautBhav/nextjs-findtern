/**
 * Words the placement console shows. Raw enums never reach the screen
 * (PRODUCT.md), and the cohort meaning comes from the founder's brief:
 * 2nd year wants an internship, 3rd year an internship that can turn into a
 * PPO, 4th year a job.
 */

export const COHORTS = [
  { year: 2, label: "2nd year", goal: "Internship" },
  { year: 3, label: "3rd year", goal: "Internship + PPO" },
  { year: 4, label: "4th year", goal: "Full-time job" },
] as const;

export function cohortGoal(year: number | null): string {
  return COHORTS.find((c) => c.year === year)?.goal ?? "—";
}

export function yearLabel(year: number | null): string {
  if (!year) return "Year not set";
  return ["1st", "2nd", "3rd", "4th", "5th"][year - 1] + " year";
}

const AI_STATUS: Record<string, { label: string; done: boolean }> = {
  not_applied: { label: "Not started", done: false },
  applied: { label: "Requested", done: false },
  scheduled: { label: "Scheduled", done: false },
  sent: { label: "Link sent", done: false },
  expired: { label: "Link expired", done: false },
  completed: { label: "Done", done: true },
};

export function aiStatusLabel(status: string): { label: string; done: boolean } {
  return AI_STATUS[status] ?? { label: "Not started", done: false };
}

export const DRIVE_KIND_LABEL: Record<string, string> = { internship: "Internship", full_time: "Full-time" };

export const WINDOW_LABEL: Record<string, string> = {
  upcoming: "Opens soon",
  live: "Live",
  ended: "Ended",
  revoked: "Link closed",
};

/** "just now", "4 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "Never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
