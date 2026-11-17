import { CGPA_DISCLAIMER, CGPA_SLA_HOURS, cgpaBlocksPayment, proposalCgpaGate, type CgpaGate } from "./cgpa-verification.ts";
import { isHiredProposal } from "./hire-status.ts";
import { isClockTime, isRealDay, offerPastStart, parseOffer, type Offer } from "./offer.ts";
import { expiryOf } from "./proposal-expiry.ts";
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
export function offerGroup(key: InternOfferKey): "open" | "accepted" | "active" | "closed" {
  if (key === "sent" || key === "interview_scheduled") return "open";
  if (key === "accepted") return "accepted";
  if (key === "hired" || key === "fulltime_hired") return "active";
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
    ? joiningDayIst(ft.shiftFrom, ft.shiftTo, tz, ft.startDate || offer.startDate) // a full-time offer's own joining date, else the base internship's
    : joiningDayIst(offer.shiftFrom, offer.shiftTo, tz, offer.startDate);
  return day ?? offer.startDate;
}

/** offerJoiningDay, but only a real calendar day: null for "To be agreed" or any other placeholder. */
export function realJoiningDay(offer: Offer): string | null {
  const day = offerJoiningDay(offer);
  return day && isRealDay(day) ? day : null;
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

/**
 * "19 Nov, 3:40 PM IST": a moment in India time, in plain words. Built from parts so the output does not depend on the
 * runtime's locale data. Empty for anything that is not a date.
 */
export function formatIstPlain(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: IST_TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const hour = Number(p.hour) % 24;
  return `${p.day} ${p.month}, ${hour % 12 || 12}:${p.minute} ${hour < 12 ? "AM" : "PM"} IST`;
}

/**
 * What the intern reads of an offer beyond `internOfferKey`: the CGPA check after they accepted, and an offer that
 * expired because the company never paid. Separate from the key on purpose (the key is a closed set other screens
 * label); a screen calls this and, when `kind` is not null, uses its label, detail and group instead.
 *
 *   verifying          accepted, Findtern is checking the CGPA (within its 48 h)
 *   verifying_overdue  still unchecked past 48 h: said honestly, no blame
 *   correction         Findtern corrected the score; the company has to confirm before paying
 *   expired_unpaid     accepted, but the company did not pay before the start date
 *   closed_by_admin    Findtern closed the offer
 *
 * Only an accepted internship offer can be verifying; a hired, processing, sent or full-time row never is.
 */
export type InternOverlayKind = "verifying" | "verifying_overdue" | "correction" | "expired_unpaid" | "closed_by_admin";

export type InternOfferOverlay = {
  kind: InternOverlayKind | null;
  label: string;
  tone: "waiting" | "closed" | "new" | "neutral";
  detail: string;
  /** The SLA line, for the verifying kinds only. */
  sla: string | null;
  /** The disclaimer text, for the verifying kinds only. */
  disclaimer: string | null;
  /** When Findtern aims to have confirmed it ("19 Nov, 3:40 PM IST"); the verifying kinds only. */
  dueBy: string | null;
  /** The offers list group to file it under; null leaves `offerGroup(key)` as it is. */
  group: "accepted" | "closed" | null;
};

const NO_OVERLAY: InternOfferOverlay = { kind: null, label: "", tone: "neutral", detail: "", sla: null, disclaimer: null, dueBy: null, group: null };

export function internOfferOverlay(
  p: { status: string | null; hiredAt?: Date | string | null; offerDetails: unknown; currency?: string | null; updatedAt?: Date | string | null },
  extraData: unknown,
  now: Date = new Date(),
): InternOfferOverlay {
  const status = (p.status ?? "").toLowerCase();
  const offer = parseOffer(p.offerDetails, p.currency);
  if (offer.fullTime) return NO_OVERLAY;

  const expiry = expiryOf({ status, hiredAt: p.hiredAt ?? null, offerDetails: p.offerDetails, currency: p.currency }, now);
  if (expiry.reason === "unpaid_past_start") {
    return {
      ...NO_OVERLAY,
      kind: "expired_unpaid",
      label: "Expired",
      tone: "closed",
      detail: "The company did not complete the payment before the start date, so this offer expired.",
      group: "closed",
    };
  }
  if (status === "expired" && expiry.reason === "admin_closed") {
    return { ...NO_OVERLAY, kind: "closed_by_admin", label: "Closed by Findtern", tone: "closed", detail: "Findtern closed this offer. Nothing more is needed from you.", group: "closed" };
  }
  if (status !== "accepted" || p.hiredAt) return NO_OVERLAY;

  const gate: CgpaGate = proposalCgpaGate({ status, extraData, offerDetails: p.offerDetails, updatedAt: p.updatedAt ?? null }, now);
  if (!cgpaBlocksPayment(gate)) return NO_OVERLAY;

  const sla = `Usually ${CGPA_SLA_HOURS.min}-${CGPA_SLA_HOURS.max} hours.`;
  if (gate.state === "incorrect_unacked") {
    return {
      ...NO_OVERLAY,
      kind: "correction",
      label: "Verifying your CGPA",
      tone: "waiting",
      detail:
        gate.correctedFrom && gate.correctedTo
          ? `Findtern updated your CGPA from ${gate.correctedFrom} to ${gate.correctedTo}. The company needs to confirm before they can pay.`
          : "Findtern updated your CGPA. The company needs to confirm before they can pay.",
      sla: null,
      disclaimer: null,
      group: "accepted",
    };
  }
  const overdue = gate.state === "overdue";
  const due = formatIstPlain(gate.dueBy);
  return {
    kind: overdue ? "verifying_overdue" : "verifying",
    label: "Verifying your CGPA",
    tone: "waiting",
    detail: overdue
      ? "This is taking longer than usual. We're on it."
      : `You accepted this offer. Findtern is verifying your CGPA before the company can pay. ${sla}${due ? ` We aim to confirm by ${due}.` : ""}`,
    sla: overdue ? null : sla,
    disclaimer: CGPA_DISCLAIMER,
    dueBy: overdue ? null : due || null,
    group: "accepted",
  };
}
