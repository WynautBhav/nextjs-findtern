/** The soonest future date of `dates`, or null. Reads the clock here, not in a page render. */
export function soonest(dates: (Date | null | undefined)[]): Date | null {
  const now = Date.now();
  return dates.filter((d): d is Date => Boolean(d && d.getTime() > now)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

/** "in 40 min", "in 5 h", "in 3 days". */
export function untilLabel(when: Date): string {
  const mins = Math.max(1, Math.round((when.getTime() - Date.now()) / 60000));
  return mins < 60 ? `in ${mins} min` : mins < 2880 ? `in ${Math.round(mins / 60)} h` : `in ${Math.round(mins / 1440)} days`;
}
