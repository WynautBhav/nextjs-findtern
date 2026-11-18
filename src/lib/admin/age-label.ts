/**
 * The age column of an admin queue: how long a thing has waited, in the coarsest unit that still
 * says something ("12 min", "5 h", "3 d", "6 wk"). `days` is whole days, for "oldest" lines and
 * for flagging what has waited too long. A missing or unreadable date gives "-" and 0.
 */
export function ageOf(from: Date | string | null | undefined, now: Date): { label: string; days: number } {
  const t = from == null ? NaN : new Date(from).getTime();
  if (Number.isNaN(t)) return { label: "-", days: 0 };
  const min = Math.max(0, Math.floor((now.getTime() - t) / 60_000));
  const days = Math.floor(min / 1440);
  if (min < 1) return { label: "now", days };
  if (min < 60) return { label: `${min} min`, days };
  if (min < 1440) return { label: `${Math.floor(min / 60)} h`, days };
  if (days < 14) return { label: `${days} d`, days };
  return { label: `${Math.floor(days / 7)} wk`, days };
}

/** "oldest 9 days" for a lead-figure note. */
export function daysPhrase(days: number): string {
  return days < 1 ? "today" : days === 1 ? "1 day" : `${days} days`;
}
