/**
 * The promo dialog's date-time fields are IST, the zone the business runs on, whatever zone the admin's browser is
 * in. IST is a fixed +05:30 (no daylight saving), so this is plain arithmetic and never reads the browser's zone.
 */
const IST_OFFSET_MS = 330 * 60_000;

/** `2026-11-30T23:59` (a datetime-local value, read as IST) to a UTC ISO string; null when empty or not a date. */
export function istInputToIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS;
  const out = new Date(ms);
  return Number.isNaN(out.getTime()) ? null : out.toISOString();
}

/** A stored instant to a datetime-local value in IST; "" when missing or invalid. */
export function isoToIstInput(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 16);
}
