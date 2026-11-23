/**
 * The placement office's master data: one row per student with every field on the TPO's list, built from rows the
 * college may already see (scope.ts) plus the student's onboarding record. Pure, so the redaction and the CSV can be
 * tested without a database.
 *
 * Privacy: a claimed (unverified) student keeps only name, email, year, course and branch, the same rule as
 * redactUnverified. Aadhaar, PAN, bank, address and PIN are never read. AI report and recording are links to the
 * audited /api/college/students/[id]/[artifact] route, never the raw URL.
 */

import { WORK_MODE_ORDER, widestWorkMode } from "../onboarding.ts";

export type MasterRow = {
  userId: string;
  verified: boolean;
  name: string;
  email: string;
  phone: string | null;
  emergencyContact: string | null;
  degree: string | null;
  branch: string | null;
  startYear: number | null;
  endYear: number | null;
  year: number | null;
  semester: number | null;
  linkedin: string | null;
  city: string | null;
  cgpa: number | null;
  professionalCourse: string | null;
  professionalStatus: string | null;
  professionalLevel: string | null;
  certifications: number | null;
  experience: number | null;
  /** The mode the student picked: their widest stored mode (remote, hybrid or onsite), or null. */
  workMode: WorkMode | null;
  preferredLocations: string[];
  laptop: boolean | null;
  lastSeenAt: string | null;
  skills: string[];
  hasReport: boolean;
  hasRecording: boolean;
  english: number | null;
  coding: number | null;
  aptitude: number | null;
  aiInterview: number | null;
  score: number | null;
  offers: number;
  /** Offers by what the student did: accepted (accepted, processing, hired, completed), rejected (turned down), deadline
   * missed (unanswered when the start date came: the intern's "Rejected · no response"), or not answered yet (start date ahead). */
  offersAccepted: number;
  offersRejected: number;
  offersLapsed: number;
  offersOpen: number;
  /** Academic score out of 10: CGPA, or a percentage divided by 10 (for bands only; the CGPA column stays CGPA). */
  marks10: number | null;
  hired: boolean;
  ppo: boolean;
  /** College earnings from this student's hires, in paise. */
  earningsMinor: number;
  /** Meetings employers asked this student for (meetings/slots.ts statuses). */
  meetings: Meetings;
  /** The student's "open to work" switch; null until the officer accepts them. */
  openToWork: boolean | null;
};

/**
 * A student's employer meetings: done = completed; notAccepted = the invite lapsed with no slot picked, the student
 * cancelled it, or a legacy declined/rejected; upcoming = booked (scheduled); waiting = times offered, no answer yet
 * (pending). The rest of the total was missed, called off by the employer, or booked and never closed after its time.
 */
export type Meetings = {
  total: number; done: number; missed: number; notAccepted: number; upcoming: number; waiting: number;
  /** Live calls inside a campus drive (not part of `total`): accepted (held), not taken (declined or lapsed), waiting. */
  callsAccepted: number; callsNotTaken: number; callsWaiting: number;
};
export const NO_MEETINGS: Meetings = { total: 0, done: 0, missed: 0, notAccepted: 0, upcoming: 0, waiting: 0, callsAccepted: 0, callsNotTaken: 0, callsWaiting: 0 };

/** Drill-down groups from the Placement analysis: the students behind each block. "" = everyone. */
export type Outcome = "" | "no-offer" | "accepted" | "open" | "rejected" | "withdrawn" | "met" | "meet-upcoming" | "meet-waiting" | "not-accepted" | "meet-other" | "call-took" | "call-waiting" | "call-not-taken";
export const OUTCOMES: { key: Exclude<Outcome, "">; label: string }[] = [
  { key: "no-offer", label: "Interviewed, no offer" },
  { key: "accepted", label: "Accepted an offer" },
  { key: "open", label: "Offer not answered" },
  { key: "rejected", label: "Rejected an offer" },
  { key: "withdrawn", label: "Offer withdrawn or closed" },
  { key: "met", label: "Had a meeting" },
  { key: "meet-upcoming", label: "Meeting booked" },
  { key: "meet-waiting", label: "Meeting not answered yet" },
  { key: "not-accepted", label: "Didn't accept a meeting" },
  { key: "meet-other", label: "Meeting missed, called off or not closed" },
  { key: "call-took", label: "Drive meets: accepted" },
  { key: "call-waiting", label: "Drive meets: not answered" },
  { key: "call-not-taken", label: "Drive meets: declined or lapsed" },
];
const withdrawnOf = (r: MasterRow) => r.offers - r.offersAccepted - r.offersRejected - r.offersLapsed - r.offersOpen;
const meetOtherOf = (m: Meetings) => m.total - m.done - m.notAccepted - m.upcoming - m.waiting;

export function matchesOutcome(r: MasterRow, o: Outcome): boolean {
  switch (o) {
    case "": return true;
    case "no-offer": return r.score !== null && r.offers === 0;
    case "accepted": return r.offersAccepted > 0;
    case "open": return r.offersOpen > 0;
    case "rejected": return r.offersRejected + r.offersLapsed > 0;
    case "withdrawn": return withdrawnOf(r) > 0;
    case "met": return r.meetings.done > 0;
    case "meet-upcoming": return r.meetings.upcoming > 0;
    case "meet-waiting": return r.meetings.waiting > 0;
    case "not-accepted": return r.meetings.notAccepted > 0;
    case "meet-other": return meetOtherOf(r.meetings) > 0;
    case "call-took": return r.meetings.callsAccepted > 0;
    case "call-waiting": return r.meetings.callsWaiting > 0;
    case "call-not-taken": return r.meetings.callsNotTaken > 0;
  }
}

/** What scope.ts already gives (already redacted for claimed students). */
export type ScopedStudent = {
  userId: string;
  status: "claimed" | "verified";
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  linkedin: string | null;
  year: number | null;
  branch: string | null;
  cgpa: number | null;
  score: number | null;
  lastSeenAt: Date | null;
  openToWork: boolean;
};

/** The extra facts master data reads for each student (one SQL row, see master-data.ts). */
export type MasterExtras = {
  extra: Record<string, unknown> | null;
  skills: unknown;
  locationTypes: unknown;
  preferredLocations: unknown;
  hasLaptop: boolean | null;
  city: string | null;
  state: string | null;
  experience: unknown;
  offers: number;
  offersAccepted: number;
  offersRejected: number;
  offersLapsed: number;
  offersOpen: number;
  hired: number;
  ppo: number;
  earningsMinor: number;
  meetings: Meetings;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strs = (v: unknown, max: number): string[] => arr(v).map(str).filter((s): s is string => s !== null).slice(0, max);
/** Skills as the onboarding form saves them are {id, name, rating} objects; older/seeded rows are plain strings. */
const skillNames = (v: unknown, max: number): string[] =>
  arr(v).map((s) => (s && typeof s === "object" ? str((s as { name?: unknown }).name) : str(s))).filter((s): s is string => s !== null).slice(0, max);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const score10 = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.min(10, Math.max(0, n));
};
const year4 = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n >= 1990 && n <= 2100 ? Math.trunc(n) : null;
};

type WorkMode = (typeof WORK_MODE_ORDER)[number];

/**
 * Findtern's work-mode rule for the filter (the onboarding cascade): selecting a mode takes in every mode before
 * it. Remote shows students who picked remote; Hybrid, those who picked remote or hybrid; Onsite, all three.
 * Matched on the student's own pick, never on the text. No selection shows everyone.
 */
export function matchesWorkMode(pick: string | null, selected: string): boolean {
  if (!selected) return true;
  const upTo = WORK_MODE_ORDER.indexOf(selected as WorkMode);
  if (upTo < 0) return true;
  return pick !== null && WORK_MODE_ORDER.indexOf(pick as WorkMode) > -1 && WORK_MODE_ORDER.indexOf(pick as WorkMode) <= upTo;
}

export function buildMasterRow(s: ScopedStudent, x: MasterExtras | undefined): MasterRow {
  const verified = s.status === "verified";
  const extra = obj(x?.extra);
  const a = obj(extra.academics);
  const name = `${s.firstName} ${s.lastName}`.trim() || s.email;
  const base: MasterRow = {
    userId: s.userId,
    verified,
    name,
    email: s.email,
    phone: null,
    emergencyContact: null,
    degree: str(a.degree),
    branch: s.branch ?? str(a.specialization),
    startYear: null,
    endYear: null,
    year: s.year,
    semester: null,
    linkedin: null,
    city: null,
    cgpa: null,
    professionalCourse: null,
    professionalStatus: null,
    professionalLevel: null,
    certifications: null,
    experience: null,
    workMode: null,
    preferredLocations: [],
    laptop: null,
    lastSeenAt: null,
    skills: [],
    hasReport: false,
    hasRecording: false,
    english: null,
    coding: null,
    aptitude: null,
    aiInterview: null,
    score: null,
    offers: 0,
    offersAccepted: 0,
    offersRejected: 0,
    offersLapsed: 0,
    offersOpen: 0,
    marks10: null,
    hired: false,
    ppo: false,
    earningsMinor: 0,
    meetings: NO_MEETINGS,
    openToWork: null,
  };
  if (!verified) return base;
  // A verified student who has not saved onboarding yet still has the phone and LinkedIn the Students page shows.
  if (!x) return { ...base, phone: s.phone, linkedin: s.linkedin };

  const ratings = obj(extra.ratings);
  const pro = obj(arr(a.professional)[0]);
  const emName = str(extra.emergencyName);
  const emPhone = str(extra.emergencyPhone);
  const emergency = emName || emPhone
    ? [emName, str(extra.emergencyRelation) ? `(${str(extra.emergencyRelation)})` : null, emPhone ? `${str(extra.emergencyCountryCode) ?? ""} ${emPhone}`.trim() : null].filter(Boolean).join(" ")
    : null;
  const proStatus = str(pro.status)?.toLowerCase() ?? null;
  return {
    ...base,
    phone: s.phone,
    emergencyContact: emergency,
    startYear: year4(a.startYear),
    endYear: year4(a.endYear ?? a.yearOfGraduation),
    semester: num(a.currentSemester),
    linkedin: s.linkedin,
    city: [str(x.city), str(x.state)].filter(Boolean).join(", ") || null,
    cgpa: s.cgpa,
    professionalCourse: str(pro.name),
    professionalStatus: proStatus === "completed" ? "Completed" : proStatus ? "Pursuing" : null,
    professionalLevel: str(pro.level),
    certifications: arr(a.certifications).length,
    experience: arr(x.experience).length,
    workMode: widestWorkMode(strs(x.locationTypes, 3)),
    preferredLocations: strs(x.preferredLocations, 5),
    laptop: x.hasLaptop,
    lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
    skills: skillNames(x.skills, 7),
    hasReport: typeof extra.aiFeedbackLink === "string" || typeof extra.incruiterReportUrl === "string",
    hasRecording: typeof extra.aiRecordingLink === "string" || typeof extra.incruiterRecordingUrl === "string",
    english: score10(ratings.communication),
    coding: score10(ratings.coding),
    aptitude: score10(ratings.aptitude),
    aiInterview: score10(ratings.interview ?? ratings.overall),
    score: s.score,
    offers: x.offers,
    offersAccepted: x.offersAccepted,
    offersRejected: x.offersRejected,
    offersLapsed: x.offersLapsed,
    offersOpen: x.offersOpen,
    marks10: s.cgpa ?? percentOutOf10(a),
    hired: x.hired > 0,
    ppo: x.ppo > 0,
    earningsMinor: x.earningsMinor,
    meetings: x.meetings,
    openToWork: s.openToWork,
  };
}

// ── Columns ──────────────────────────────────────────────────────────────

export type ColumnKind = "text" | "number" | "score" | "bool" | "list" | "date" | "money" | "link";
export type ColumnGroup = "Student" | "Course" | "Preferences" | "Scores" | "Placement";

export type MasterColumn = {
  key: keyof MasterRow | "report" | "recording" | "meetingsDone" | "meetingsNotAccepted" | "meetingsMissed" | "offerReplies" | "driveCalls";
  label: string;
  group: ColumnGroup;
  kind: ColumnKind;
};

/** Every field on the TPO's master data list, in its order. */
export const MASTER_COLUMNS: MasterColumn[] = [
  { key: "name", label: "Name", group: "Student", kind: "text" },
  { key: "email", label: "Email", group: "Student", kind: "text" },
  { key: "phone", label: "Phone", group: "Student", kind: "text" },
  { key: "emergencyContact", label: "Emergency contact", group: "Student", kind: "text" },
  { key: "degree", label: "Degree", group: "Course", kind: "text" },
  { key: "branch", label: "Branch", group: "Course", kind: "text" },
  { key: "startYear", label: "Start year", group: "Course", kind: "number" },
  { key: "endYear", label: "End year", group: "Course", kind: "number" },
  { key: "year", label: "Current year", group: "Course", kind: "number" },
  { key: "semester", label: "Current semester", group: "Course", kind: "number" },
  { key: "linkedin", label: "LinkedIn", group: "Student", kind: "link" },
  { key: "city", label: "City", group: "Student", kind: "text" },
  { key: "cgpa", label: "CGPA", group: "Course", kind: "score" },
  { key: "professionalCourse", label: "Professional course", group: "Course", kind: "text" },
  { key: "professionalStatus", label: "Course status", group: "Course", kind: "text" },
  { key: "professionalLevel", label: "Course level", group: "Course", kind: "text" },
  { key: "certifications", label: "Certifications", group: "Course", kind: "number" },
  { key: "experience", label: "Experience", group: "Course", kind: "number" },
  { key: "workMode", label: "Work preference", group: "Preferences", kind: "text" },
  { key: "preferredLocations", label: "Preferred locations", group: "Preferences", kind: "list" },
  { key: "laptop", label: "Laptop", group: "Preferences", kind: "bool" },
  { key: "lastSeenAt", label: "Last seen", group: "Preferences", kind: "date" },
  { key: "skills", label: "Skills", group: "Preferences", kind: "list" },
  { key: "report", label: "AI interview report", group: "Scores", kind: "link" },
  { key: "recording", label: "AI interview recording", group: "Scores", kind: "link" },
  { key: "english", label: "English", group: "Scores", kind: "score" },
  { key: "coding", label: "Coding", group: "Scores", kind: "score" },
  { key: "aptitude", label: "Aptitude", group: "Scores", kind: "score" },
  { key: "aiInterview", label: "AI interview score", group: "Scores", kind: "score" },
  { key: "score", label: "Findtern score", group: "Scores", kind: "score" },
  { key: "offers", label: "Offers received", group: "Placement", kind: "number" },
  { key: "hired", label: "Hired", group: "Placement", kind: "bool" },
  { key: "ppo", label: "PPO offer", group: "Placement", kind: "bool" },
  { key: "earningsMinor", label: "Earnings", group: "Placement", kind: "money" },
  { key: "meetingsDone", label: "Meetings done", group: "Placement", kind: "number" },
  { key: "meetingsNotAccepted", label: "Meetings not accepted", group: "Placement", kind: "number" },
  { key: "meetingsMissed", label: "Meetings missed", group: "Placement", kind: "number" },
  { key: "offerReplies", label: "Offer replies", group: "Placement", kind: "text" },
  { key: "driveCalls", label: "Drive meets", group: "Placement", kind: "text" },
];

export const COLUMN_KEYS = new Set(MASTER_COLUMNS.map((c) => c.key));

const SCORE_KEYS = new Set<string>(["cgpa", "english", "coding", "aptitude", "aiInterview", "score"]);
/** A percentage student's marks on the same 0-10 scale as CGPA, for the score bands only. */
function percentOutOf10(a: Record<string, unknown>): number | null {
  if (str(a.scoreType) !== "percentage") return null;
  const p = num(a.score ?? a.cgpa);
  return p !== null && p >= 0 && p <= 100 ? Math.round(p) / 10 : null;
}

const MODE_LABEL: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "Onsite" };

/** What the student did with their offers, e.g. "2 accepted · 1 rejected · 1 deadline missed"; "" with no offer. */
export function offerReplies(r: Pick<MasterRow, "offersAccepted" | "offersRejected" | "offersLapsed" | "offersOpen">): string {
  return [
    [r.offersAccepted, "accepted"],
    [r.offersRejected, "rejected"],
    [r.offersLapsed, "deadline missed"],
    [r.offersOpen, "waiting"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, w]) => `${n} ${w}`)
    .join(" · ");
}

/** A student's live drive calls, e.g. "1 accepted · 1 declined or lapsed"; "" with none. */
export function driveCalls(m: Pick<Meetings, "callsAccepted" | "callsNotTaken" | "callsWaiting">): string {
  return [
    [m.callsAccepted, "accepted"],
    [m.callsNotTaken, "declined or lapsed"],
    [m.callsWaiting, "waiting"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, w]) => `${n} ${w}`)
    .join(" · ");
}

/**
 * A CGPA as the student entered it: one decimal when that says it all (8.5), two when it needs them (8.47). A CGPA of 8.47 read as
 * "8.5" disagreed with the "8.5+" filter that leaves it out, and the officer could not check an eligibility cut-off from the file.
 */
export function cgpaText(v: number): string {
  return Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? v.toFixed(1) : v.toFixed(2);
}

/** An instant as India time for the file an officer opens in a spreadsheet: "2026-11-23 08:28 IST" (the ISO text read as UTC). */
export function istStamp(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : `${new Date(t + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ")} IST`;
}

/** A cell as plain text, the same in the table's title and in the CSV. Missing is "". */
export function cellText(row: MasterRow, key: MasterColumn["key"], origin = ""): string {
  switch (key) {
    case "report":
      return row.hasReport ? `${origin}/api/college/students/${row.userId}/report` : "";
    case "recording":
      return row.hasRecording ? `${origin}/api/college/students/${row.userId}/recording` : "";
    case "workMode":
      return row.workMode ? MODE_LABEL[row.workMode] : "";
    case "lastSeenAt":
      return row.lastSeenAt ? istStamp(row.lastSeenAt) : "";
    case "earningsMinor":
      return row.verified ? (row.earningsMinor / 100).toFixed(2) : "";
    case "hired":
    case "ppo":
      return row.verified ? (row[key] ? "Yes" : "No") : "";
    case "offers":
      return row.verified ? String(row.offers) : "";
    case "meetingsDone":
      return row.verified ? String(row.meetings.done) : "";
    case "meetingsNotAccepted":
      return row.verified ? String(row.meetings.notAccepted) : "";
    case "meetingsMissed":
      return row.verified ? String(row.meetings.missed) : "";
    case "offerReplies":
      return row.verified ? offerReplies(row) : "";
    case "driveCalls":
      return row.verified ? driveCalls(row.meetings) : "";
    default: {
      const v = row[key];
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return v.join(", ");
      if (typeof v === "boolean") return v ? "Yes" : "No";
      // Scores always carry one decimal (6.0, not 6); counts and years never do.
      if (typeof v === "number") return key === "cgpa" ? cgpaText(v) : SCORE_KEYS.has(key) ? v.toFixed(1) : String(Math.round(v));
      return String(v);
    }
  }
}

/**
 * One CSV cell. Quotes always, doubles inner quotes, and prefixes a ' to anything a spreadsheet could run as a
 * formula: a cell whose first visible character is =, +, - or @ (also behind leading blanks, no-break spaces or a BOM),
 * or that starts with a tab, CR or LF. A student who types "=HYPERLINK(...)" as a skill cannot attack the officer.
 */
export function csvCell(v: string): string {
  const safe = /^[\t\r\n]/.test(v) || /^[\s\u00a0\ufeff]*[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(rows: MasterRow[], keys: MasterColumn["key"][], origin = ""): string {
  const cols = keys.map((k) => MASTER_COLUMNS.find((c) => c.key === k)).filter((c): c is MasterColumn => !!c);
  const head = cols.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(cellText(r, c.key, origin))).join(","));
  // BOM so Excel opens the file as UTF-8 (names with accents, the rupee sign).
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}
