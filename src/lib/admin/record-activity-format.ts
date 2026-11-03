import type { ActivityEntry } from "./record-activity.types.ts";

/**
 * Small pure helpers for the record pages' left card (candidate and company).
 * Kept apart from the components so they run under `node --test`.
 */

/**
 * A `tel:` link for a stored country code and national number, digits only.
 * Returns null when there is no number to dial. A number already written with
 * a leading "+" is kept as it is; a missing country code is not guessed.
 */
export function telHref(countryCode: string | null | undefined, phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.startsWith("+")) return `tel:+${digits}`;
  const cc = (countryCode ?? "").replace(/\D/g, "");
  return `tel:${cc ? `+${cc}` : ""}${digits.replace(/^0+(?=\d)/, "")}`;
}

/** The ISO time of the newest entry, or null for an empty or unreadable list. */
export function latestActivityAt(entries: readonly ActivityEntry[] | null | undefined): string | null {
  let best: { at: string; t: number } | null = null;
  for (const entry of entries ?? []) {
    const t = Date.parse(entry.at);
    if (Number.isNaN(t)) continue;
    if (!best || t > best.t) best = { at: entry.at, t };
  }
  return best?.at ?? null;
}
