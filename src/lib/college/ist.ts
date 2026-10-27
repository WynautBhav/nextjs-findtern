/**
 * Drive times are entered and shown in IST: partner colleges are Indian, and
 * pinning the zone keeps the server render and the browser identical (a
 * viewer-local conversion shifted a drive by 5h30 when the server ran in UTC).
 * Shared by server pages and the builder, so it lives outside "use client".
 */
const IST_OFFSET_MS = 330 * 60_000;

/** A Date as a datetime-local value in IST. */
export function toLocalInput(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** A datetime-local value typed in IST, as an ISO instant. */
export function fromLocalInput(value: string): string {
  return new Date(`${value}:00+05:30`).toISOString();
}
