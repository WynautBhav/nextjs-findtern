import { isSafeLink } from "../safe-url.ts";

/**
 * An employer-pasted link: https only (isSafeLink alone also allows http). The codebase has
 * no meeting-host allow-list, so any https host is accepted (Meet, Zoom, Teams...).
 */
export function manualMeetingLink(raw: string | undefined | null): string | null {
  const v = raw?.trim();
  return v && v.length <= 500 && /^https:\/\//i.test(v) && isSafeLink(v) ? v : null;
}

/** Precedence: a pasted link wins; the auto Meet link is used only when none was pasted. */
export function pickMeetingLink<T>(manual: string | null | undefined, auto: () => Promise<T>): Promise<T | { link: string; eventId: null }> {
  return manual ? Promise.resolve({ link: manual, eventId: null }) : auto();
}
