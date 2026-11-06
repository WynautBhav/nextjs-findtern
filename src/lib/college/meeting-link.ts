import { isSafeLink } from "../safe-url.ts";

// Video-call hosts only: any other link (wa.me, a profile, a form) is contact before the hire (OA1).
const MEETING_HOST = /^(?:meet\.google\.com|(?:[a-z0-9-]+\.)?zoom\.us|teams\.microsoft\.com|teams\.live\.com|[a-z0-9-]+\.webex\.com)$/i;

/** An employer-pasted link: https only (isSafeLink alone also allows http) and a known meeting host. */
export function manualMeetingLink(raw: string | undefined | null): string | null {
  const v = raw?.trim();
  if (!v || v.length > 500 || !/^https:\/\//i.test(v) || !isSafeLink(v)) return null;
  try {
    return MEETING_HOST.test(new URL(v).hostname) ? v : null;
  } catch {
    return null;
  }
}

/** Precedence: a pasted link wins; the auto Meet link is used only when none was pasted. */
export function pickMeetingLink<T>(manual: string | null | undefined, auto: () => Promise<T>): Promise<T | { link: string; eventId: null }> {
  return manual ? Promise.resolve({ link: manual, eventId: null }) : auto();
}
