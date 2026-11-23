/**
 * How long until a drive window edge, as the TPO and the employer both read it ("12 hours", "3 days", "45 min").
 * ONE rule for both screens (FN-05): whole units rounded DOWN, so a screen never promises more time than there is
 * (12h55m left reads "12 hours", not "13"). Null once the moment has passed.
 */
export function timeUntil(ms: number): string | null {
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} days`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min`;
}
