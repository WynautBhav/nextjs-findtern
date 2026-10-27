import { formatIstClock } from "./format.ts";
import { isHiredProposal } from "./hire-status.ts";
import { offerPastStart, parseOffer } from "./offer.ts";
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

/**
 * A shift agreed in the offer's zone, shown in IST like the legacy page
 * (proposal-detail.tsx shiftLabelIst): converted on the joining date, so the
 * employer's DST on that day applies, and an end at or before the start runs
 * into the next day. "9:00 AM - 6:00 PM IST", or null when not set.
 */
export function shiftInIst(from: string, to: string, tz: string | null | undefined, startDate: string | null): string | null {
  const hhmm = /^(\d{1,2}):(\d{2})$/;
  if (!hhmm.test(from) || !hhmm.test(to)) return null;
  const day = /^\d{4}-\d{2}-\d{2}/.test(startDate ?? "") ? startDate!.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const pad = (t: string) => t.padStart(5, "0");
  try {
    const zone = tz || "Asia/Kolkata";
    const start = wallTimeToUtc(`${day}T${pad(from)}`, zone);
    let end = wallTimeToUtc(`${day}T${pad(to)}`, zone);
    if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 3_600_000);
    return `${formatIstClock(start).replace(/ IST$/, "")} - ${formatIstClock(end)}`;
  } catch {
    return null;
  }
}
