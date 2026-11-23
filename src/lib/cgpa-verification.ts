import { todayIst } from "./offer.ts";

/**
 * CGPA verification: an intern who picks a semester and enters a score is flagged `pending`; Findtern checks it
 * (24-48 h) before an employer can pay for any of that intern's accepted offers. Pure. The state lives in existing
 * jsonb (no migration): `intern_onboarding.extra_data.cgpaVerification`, plus `proposals.offer_details.acceptedAt`
 * and `.cgpaAckAt`. Only the `pending` flag gates: an intern with no flag (every legacy row) is never gated.
 */

export type CgpaStatus = "not_required" | "pending" | "verified" | "incorrect";

export type CgpaVerification = {
  status: CgpaStatus;
  claimedScore: string;
  scoreType: "cgpa" | "percentage" | "";
  correctedScore?: string;
  semester: number | null;
  requestedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
};

export const CGPA_SLA_HOURS = { min: 24, max: 48 } as const;

export const CGPA_DISCLAIMER = "You'll receive a confirmation call or email from Findtern to verify your CGPA once a proposal you accept is confirmed.";

/** Shown with the CGPA proof uploads in onboarding. */
export const CGPA_UPLOAD_WARNING = "Make sure every detail and document you upload is correct and belongs to you. If any information is found to be incorrect or false, your account may be suspended.";

const HOUR_MS = 3_600_000;
const MAX_SEMESTER = 10;

/** "Semester not applicable": a college without semesters (yearly exams). Stored as 0; its proof is last year's marksheet. */
export const SEMESTER_NA = 0;

/** "Semester 4", or "Semester not applicable" for 0. */
export function semesterLabel(semester: number): string {
  return semester === SEMESTER_NA ? "Semester not applicable" : `Semester ${semester}`;
}
const ALL_SEMESTERS = Array.from({ length: MAX_SEMESTER }, (_, i) => i + 1);

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isYear = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;

/**
 * The year of study (1-5) now. A college member's declared year wins. Otherwise: years since `startYear`, rolling
 * over on 1 July (India time). A finished degree, a missing or unreadable start year, or more than five years is
 * unknown (null), which shows the full 1-10 semester list.
 */
export function yearOfStudy(a: { startYear: string; status: string }, collegeYear: number | null, now: Date = new Date()): number | null {
  if (isYear(collegeYear)) return collegeYear;
  if (String(a.status ?? "").trim().toLowerCase() === "completed") return null;
  const start = /^\d{4}$/.test(String(a.startYear ?? "").trim()) ? Number(String(a.startYear).trim()) : null;
  if (start === null) return null;
  const today = todayIst(now);
  const years = Number(today.slice(0, 4)) - start + (Number(today.slice(5, 7)) >= 7 ? 1 : 0);
  const year = Math.max(1, years);
  return year <= 5 ? year : null;
}

/**
 * The manual semester box: digits only, at most two. Empty and 0 are no semester (0 is "not applicable", set only
 * by its own checkbox). Values above 10 are kept so validation can say "1 to 10" instead of silently changing them.
 */
export function semesterFromInput(raw: string): number | null {
  const n = Number(raw.replace(/\D/g, "").slice(0, 2));
  return n >= 1 ? n : null;
}

/** The two semesters a year covers (3rd year: 5 and 6); an unknown year offers 1-10. */
export function semesterOptions(year: number | null): number[] {
  return isYear(year) ? [2 * year - 1, 2 * year] : [...ALL_SEMESTERS];
}

/**
 * The proofs required for semester N: exactly N slots. Marksheets for semesters 1..N-1 and a current college ID
 * card, so semester 1 is the ID card alone. Not a semester (0, 11, 2.5): no slots.
 */
export function proofSlots(semester: number): { key: string; label: string }[] {
  if (semester === SEMESTER_NA) return [{ key: "last-year-marksheet", label: "Last year's marksheet" }];
  if (!Number.isInteger(semester) || semester < 1 || semester > MAX_SEMESTER) return [];
  const marksheets = Array.from({ length: semester - 1 }, (_, i) => ({ key: `marksheet-${i + 1}`, label: `Semester ${i + 1} marksheet` }));
  return [...marksheets, { key: "college-id", label: "College ID card" }];
}

const STATUSES: ReadonlySet<string> = new Set(["not_required", "pending", "verified", "incorrect"]);

const text = (v: unknown): string | undefined => {
  if (typeof v === "string") return v.trim() === "" ? undefined : v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
};

/** `extra_data.cgpaVerification`, normalised. Nothing stored (or anything unreadable) is `not_required`. */
export function readCgpaVerification(extraData: unknown): CgpaVerification {
  const raw = isRecord(extraData) && isRecord(extraData.cgpaVerification) ? extraData.cgpaVerification : null;
  if (!raw) return { status: "not_required", claimedScore: "", scoreType: "", semester: null };
  const sem = typeof raw.semester === "string" && /^\d+$/.test(raw.semester) ? Number(raw.semester) : raw.semester;
  const out: CgpaVerification = {
    status: typeof raw.status === "string" && STATUSES.has(raw.status) ? (raw.status as CgpaStatus) : "not_required",
    claimedScore: text(raw.claimedScore) ?? "",
    scoreType: raw.scoreType === "cgpa" || raw.scoreType === "percentage" ? raw.scoreType : "",
    semester: typeof sem === "number" && Number.isInteger(sem) && sem >= SEMESTER_NA && sem <= MAX_SEMESTER ? sem : null,
  };
  const corrected = text(raw.correctedScore);
  if (corrected !== undefined) out.correctedScore = corrected;
  for (const k of ["requestedAt", "decidedAt", "decidedBy", "note"] as const) {
    const v = typeof raw[k] === "string" && (raw[k] as string).trim() !== "" ? (raw[k] as string) : undefined;
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export type CgpaGate = {
  state: "none" | "pending" | "overdue" | "incorrect_unacked" | "clear";
  acceptedAt: string | null;
  dueBy: string | null;
  correctedFrom?: string;
  correctedTo?: string;
};

/** The gate as an employer without Findtern Pro may see it: the state, never the claimed or corrected score. */
export function withoutCgpaScores(gate: CgpaGate, pro: boolean): CgpaGate {
  if (pro) return gate;
  const rest = { ...gate };
  delete rest.correctedFrom;
  delete rest.correctedTo;
  return rest;
}

const asIso = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/**
 * Where an accepted offer stands on its intern's CGPA check.
 *
 *  none               not accepted, or the intern was never flagged (every legacy row)
 *  pending            flagged, checked within CGPA_SLA_HOURS.max of acceptance
 *  overdue            still unchecked at that deadline (48 h exactly counts as overdue)
 *  incorrect_unacked  Findtern corrected the score and the employer has not pressed Confirm and continue yet
 *  clear              verified, or corrected and confirmed
 *
 * The clock starts at `offerDetails.acceptedAt`; rows accepted before it existed fall back to `updatedAt`.
 */
export function proposalCgpaGate(
  i: { status: string; extraData: unknown; offerDetails: unknown; updatedAt?: Date | string | null },
  now: Date = new Date(),
): CgpaGate {
  const v = readCgpaVerification(i.extraData);
  if (i.status !== "accepted" || v.status === "not_required") return { state: "none", acceptedAt: null, dueBy: null };

  const details = isRecord(i.offerDetails) ? i.offerDetails : {};
  const acceptedAt = asIso(details.acceptedAt) ?? asIso(i.updatedAt);

  if (v.status === "verified") return { state: "clear", acceptedAt, dueBy: null };

  if (v.status === "incorrect") {
    const ack = asIso(details.cgpaAckAt);
    const decided = asIso(v.decidedAt);
    const acked = ack !== null && (decided === null || Date.parse(ack) >= Date.parse(decided));
    const gate: CgpaGate = { state: acked ? "clear" : "incorrect_unacked", acceptedAt, dueBy: null, correctedFrom: v.claimedScore };
    if (v.correctedScore !== undefined) gate.correctedTo = v.correctedScore;
    return gate;
  }

  // pending
  const dueMs = acceptedAt === null ? null : Date.parse(acceptedAt) + CGPA_SLA_HOURS.max * HOUR_MS;
  const dueBy = dueMs === null ? null : new Date(dueMs).toISOString();
  return { state: dueMs !== null && now.getTime() >= dueMs ? "overdue" : "pending", acceptedAt, dueBy };
}

/** The employer cannot pay while the check is pending, overdue, or a correction is unconfirmed. */
export function cgpaBlocksPayment(g: CgpaGate): boolean {
  return g.state === "pending" || g.state === "overdue" || g.state === "incorrect_unacked";
}
