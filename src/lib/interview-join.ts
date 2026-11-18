/**
 * When an interview can be joined, for the intern and the employer alike
 * (tracker row "there is no interview join button"). One pure function so
 * both sides agree:
 *
 *   unavailable  not a booked interview: cancelled / completed / missed /
 *                expired / still pending, no selected slot, or the employer
 *                no-show rule has already fired
 *   ended        the window closed (start + 60 min: the 30-minute meeting
 *                plus the same grace the meeting link has always had)
 *   no_link      booked, but no usable https link yet
 *   too_early    link exists, window opens 15 minutes before the start
 *   open         join now
 *
 * Kept free of the `@/` alias so `node --test` can run it.
 */

import { employerNoShow } from "./employer-interview-rules.ts";
import { MEETING_MINUTES } from "./interview-lifecycle.ts";
import { formatIstClock } from "./format.ts";

/** Join opens this long before the start. */
export const JOIN_OPENS_BEFORE_MINUTES = 15;
/** Join closes when the interview reads Expired (interview-lifecycle), so the button never outlives its status. */
export const JOIN_CLOSE_AFTER_START_MINUTES = MEETING_MINUTES;

export type JoinStateName = "too_early" | "open" | "ended" | "no_link" | "unavailable";

export type JoinInput = {
  status: string | null;
  selectedSlot?: number | null;
  slot1: Date | string | null;
  slot2: Date | string | null;
  slot3: Date | string | null;
  meetingLink?: string | null;
  /** Only used by the employer no-show rule. */
  employerJoinedAt?: Date | string | null;
  createdAt?: Date | string | null;
  employerId?: string | null;
};

export type JoinResult = {
  state: JoinStateName;
  /** Epoch ms the button opens, null when there is no booked time. */
  opensAt: number | null;
  /** Epoch ms the window closes, null when there is no booked time. */
  closesAt: number | null;
  /** The https link to open; set only when `state` is "open". */
  href: string | null;
  /** What to show: the button text when open, otherwise the reason. */
  label: string;
};

function toMs(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * The link as an https URL, or null. A link typed without a scheme opens as
 * https (legacy did the same); http, javascript:, data:, credentials in the
 * URL and anything else are refused.
 */
export function safeMeetingHref(raw: string | null | undefined): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : text.startsWith("//") ? "" : `https://${text}`;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** "in 30 min", "in 3 h", "in 2 days". */
function inWords(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 120) return `in ${minutes} min`;
  if (minutes < 2880) return `in ${Math.floor(minutes / 60)} h`;
  return `in ${Math.floor(minutes / 1440)} days`;
}

export function joinState(now: Date | number, interview: JoinInput, opts: { zone?: string | null } = {}): JoinResult {
  const nowMs = toMs(now) ?? Date.now();
  const none = (state: JoinStateName, label: string, start: number | null = null): JoinResult => ({
    state,
    opensAt: start === null ? null : start - JOIN_OPENS_BEFORE_MINUTES * 60_000,
    closesAt: start === null ? null : start + JOIN_CLOSE_AFTER_START_MINUTES * 60_000,
    href: null,
    label,
  });

  const slotIndex = interview.selectedSlot ?? 0;
  const start = slotIndex >= 1 && slotIndex <= 3 ? toMs([interview.slot1, interview.slot2, interview.slot3][slotIndex - 1]) : null;
  if ((interview.status ?? "").toLowerCase() !== "scheduled" || start === null) {
    return none("unavailable", "Joining is not available for this interview");
  }
  if (employerNoShow({ ...interview, status: interview.status }, nowMs)) {
    return none("unavailable", "Joining is not available for this interview", start);
  }

  const opensAt = start - JOIN_OPENS_BEFORE_MINUTES * 60_000;
  const closesAt = start + JOIN_CLOSE_AFTER_START_MINUTES * 60_000;
  if (nowMs > closesAt) return none("ended", "This interview has ended", start);

  const href = safeMeetingHref(interview.meetingLink);
  if (!href) return none("no_link", "Waiting for the company to share a meeting link", start);

  if (nowMs < opensAt) {
    const when = formatIstClock(new Date(opensAt), opts.zone);
    return { ...none("too_early", `Join opens at ${when} (${inWords(opensAt - nowMs)})`, start) };
  }
  return { state: "open", opensAt, closesAt, href, label: "Join meeting" };
}

/** Dates to ISO strings, so a server component can hand the input to a client component. */
export function serializeJoinInput(iv: JoinInput): JoinInput & { slot1: string | null; slot2: string | null; slot3: string | null } {
  const iso = (v: Date | string | null | undefined) => {
    const t = toMs(v);
    return t === null ? null : new Date(t).toISOString();
  };
  return {
    status: iv.status,
    selectedSlot: iv.selectedSlot ?? null,
    slot1: iso(iv.slot1),
    slot2: iso(iv.slot2),
    slot3: iso(iv.slot3),
    meetingLink: iv.meetingLink ?? null,
    employerJoinedAt: iso(iv.employerJoinedAt),
    createdAt: iso(iv.createdAt),
    employerId: iv.employerId ?? null,
  };
}
