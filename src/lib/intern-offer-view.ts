import { isHiredProposal } from "./hire-status.ts";
import { isClockTime, offerPastStart, parseOffer, type Offer } from "./offer.ts";
import { wallTimeToUtc } from "./timezones.ts";

/**
 * How an intern reads an offer: the state key the intern screens (offers
 * list, offer page) label from `proposalStatus` in components/app/status.
 *
 * Stored statuses are the legacy ones; a few are read differently here:
 * - unanswered on or after the joining date: "lapsed" (closed as rejected);
 * - "processing" (a legacy checkout that was started): already accepted
 *   (INW-21), so the intern is never asked to answer it again;
 * - a full-time offer that was accepted: the hire itself (INW-13), so it is
 *   never "awaiting payment";
 * - any row with `hiredAt`: hired, whatever the status says.
 */
export type InternOfferKey =
  | "sent"
  | "interview_scheduled"
  | "accepted"
  | "hired"
  | "fulltime_hired"
  | "rejected"
  | "withdrawn"
  | "expired"
  | "lapsed"
  | "draft";

type Row = {
  status: string | null;
  hiredAt?: Date | string | null;
  offerDetails: unknown;
  currency?: string | null;
};

export function internOfferKey(p: Row, now: Date = new Date()): InternOfferKey {
  const offer = parseOffer(p.offerDetails, p.currency);
  const status = (p.status ?? "sent").toLowerCase();
  const fullTime = Boolean(offer.fullTime);
  if (isHiredProposal({ status, hiredAt: p.hiredAt ?? null })) return fullTime ? "fulltime_hired" : "hired";
  if ((status === "sent" || status === "interview_scheduled") && offerPastStart(offer.startDate, now)) return "lapsed";
  if (status === "accepted" || status === "processing") return fullTime ? "fulltime_hired" : "accepted";
  if (["sent", "interview_scheduled", "rejected", "withdrawn", "expired", "draft"].includes(status)) {
    return status as InternOfferKey;
  }
  return "sent";
}

/** Only an offer still waiting on the intern can be accepted or turned down. */
export function canDecide(key: InternOfferKey): boolean {
  return key === "sent";
}

/** Grouping on the offers list. */
export function offerGroup(key: InternOfferKey): "open" | "active" | "closed" {
  if (key === "sent" || key === "interview_scheduled") return "open";
  if (key === "accepted" || key === "hired" || key === "fulltime_hired") return "active";
  return "closed";
}

/**
 * "Updated" badge (INW-15): an open offer the employer changed after sending
 * it. Legacy compared `updatedAt` with `createdAt` (proposals.tsx:551); the
 * new edit route also stamps `reopenedAfterEditAt` when an accepted offer is
 * sent back. A minute of slack absorbs the insert writing both stamps.
 */
export function offerWasEdited(p: {
  status: string | null;
  createdAt: Date | string | null;
  updatedAt?: Date | string | null;
  offerDetails: unknown;
}): boolean {
  if ((p.status ?? "").toLowerCase() !== "sent") return false;
  const raw = (p.offerDetails && typeof p.offerDetails === "object" ? p.offerDetails : {}) as Record<string, unknown>;
  if (typeof raw.reopenedAfterEditAt === "string" && raw.reopenedAfterEditAt) return true;
  const created = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
  const updated = p.updatedAt ? new Date(p.updatedAt).getTime() : NaN;
  return Number.isFinite(created) && Number.isFinite(updated) && updated - created > 60_000;
}

/**
 * Hybrid split (INW-14). The new composer writes `wfoDays`/`wfhDays`; legacy
 * rows carry `workFromOfficeDays`/`workFromHomeDays`. Null when neither is set.
 */
export function hybridSplit(raw: unknown): { office: number; home: number } | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (...keys: string[]) => {
    for (const k of keys) {
      const v = Number(o[k]);
      if (o[k] != null && o[k] !== "" && Number.isFinite(v) && v >= 0) return v;
    }
    return 0;
  };
  const office = n("wfoDays", "workFromOfficeDays");
  const home = n("wfhDays", "workFromHomeDays");
  return office > 0 || home > 0 ? { office, home } : null;
}

const IST_TZ = "Asia/Kolkata";
const pad5 = (t: string) => t.trim().padStart(5, "0");
const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ }).format(d);

function offerDay(startDate: string | null): string {
  return /^\d{4}-\d{2}-\d{2}/.test(startDate ?? "") ? startDate!.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

/**
 * The UTC instants of a shift on the offer's joining date (end rolls to the next day when it is not after the start).
 * A wall time that does not exist on a DST change day (2:30 AM on the spring-forward day) is read the way
 * wallTimeToUtc reads it; an ambiguous one (fall back) takes the first occurrence. Pinned in the tests.
 */
function shiftInstants(from: string, to: string, tz: string | null | undefined, startDate: string | null): { start: Date; end: Date } | null {
  const f = pad5(from);
  const t = pad5(to);
  if (!isClockTime(f) || !isClockTime(t)) return null;
  const day = offerDay(startDate);
  try {
    const zone = tz || IST_TZ;
    const start = wallTimeToUtc(`${day}T${f}`, zone);
    let end = wallTimeToUtc(`${day}T${t}`, zone);
    if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 3_600_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { start, end };
  } catch {
    return null;
  }
}

/**
 * The instant the first shift starts. The joining date an intern sees is its
 * IST calendar day: 9 Nov 2:00 PM in New York is 10 Nov 12:30 AM IST, so the
 * joining date is 10 Nov. Null when there is no real start date or the shift
 * is missing or invalid (the caller then shows the raw start date).
 */
export function joiningInstant(from: string, to: string, tz: string | null | undefined, startDate: string | null): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(startDate ?? "")) return null;
  return shiftInstants(from, to, tz, startDate)?.start ?? null;
}

/** The IST day (YYYY-MM-DD) the offer's first shift starts, or null when it cannot be worked out. */
export function joiningDayIst(from: string, to: string, tz: string | null | undefined, startDate: string | null): string | null {
  const at = joiningInstant(from, to, tz, startDate);
  return at ? istDay(at) : null;
}

/** joiningDayIst for a parsed offer (internship or full-time shift), falling back to its raw start date. */
export function offerJoiningDay(offer: Offer): string | null {
  const ft = offer.fullTime;
  const tz = ((ft?.timezone || offer.timezone || IST_TZ) as string).trim();
  const day = ft
    ? joiningDayIst(ft.shiftFrom, ft.shiftTo, tz, offer.startDate)
    : joiningDayIst(offer.shiftFrom, offer.shiftTo, tz, offer.startDate);
  return day ?? offer.startDate;
}

/**
 * A shift agreed in the offer's zone, shown in IST like the employer side
 * (timezones.ts shiftInIst): converted on the joining date, so the employer's
 * DST on that day applies, and an end at or before the start runs into the
 * next day. The start is never marked; the end is marked "(next day)" only
 * when its IST day differs from the start's IST day.
 * "9:00 AM – 6:00 PM IST", or null when not set.
 */
export function shiftInIst(from: string, to: string, tz: string | null | undefined, startDate: string | null): string | null {
  const s = shiftInstants(from, to, tz, startDate);
  if (!s) return null;
  const clock = (d: Date) =>
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST_TZ }).format(d);
  const next = istDay(s.end) !== istDay(s.start) ? " (next day)" : "";
  return `${clock(s.start)} – ${clock(s.end)}${next} IST`;
}
