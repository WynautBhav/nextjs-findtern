/** "Today", "Yesterday", "3 days ago", then a short date: for activity rows. */
export function relativeDay(at: Date, now: Date): string {
  const dayMs = 86_400_000;
  const ist = (d: Date) => Math.floor((d.getTime() + 330 * 60_000) / dayMs);
  const n = ist(now) - ist(at);
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 7) return `${n} days ago`;
  if (n < 14) return "Last week";
  return at.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
