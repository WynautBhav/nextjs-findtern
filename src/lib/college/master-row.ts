/**
 * The placement office's master data: one row per student with every field on the TPO's list, built from rows the
 * college may already see (scope.ts) plus the student's onboarding record. Pure, so the redaction and the CSV can be
 * tested without a database.
 *
 * Privacy: a claimed (unverified) student keeps only name, email, year, course and branch, the same rule as
 * redactUnverified. Aadhaar, PAN, bank, address and PIN are never read. AI report and recording are links to the
 * audited /api/college/students/[id]/[artifact] route, never the raw URL.
 */

export type MasterRow = {
  userId: string;
  verified: boolean;
  name: string;
  email: string;
  rollNo: string | null;
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
  workModes: string[];
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
  hired: boolean;
  ppo: boolean;
  /** College earnings from this student's hires, in paise. */
  earningsMinor: number;
};

/** What scope.ts already gives (already redacted for claimed students). */
export type ScopedStudent = {
  userId: string;
  status: "claimed" | "verified";
  firstName: string;
  lastName: string;
  email: string;
  rollNo: string | null;
  phone: string | null;
  linkedin: string | null;
  year: number | null;
  branch: string | null;
  cgpa: number | null;
  score: number | null;
  lastSeenAt: Date | null;
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
  hired: number;
  ppo: number;
  earningsMinor: number;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strs = (v: unknown, max: number): string[] => arr(v).map(str).filter((s): s is string => s !== null).slice(0, max);
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

const MODES = new Set(["remote", "hybrid", "onsite"]);

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
    rollNo: s.rollNo,
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
    workModes: [],
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
    hired: false,
    ppo: false,
    earningsMinor: 0,
  };
  if (!verified || !x) return base;

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
    workModes: strs(x.locationTypes, 3).map((m) => m.toLowerCase()).filter((m) => MODES.has(m)),
    preferredLocations: strs(x.preferredLocations, 5),
    laptop: x.hasLaptop,
    lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
    skills: strs(x.skills, 7),
    hasReport: typeof extra.aiFeedbackLink === "string" || typeof extra.incruiterReportUrl === "string",
    hasRecording: typeof extra.aiRecordingLink === "string" || typeof extra.incruiterRecordingUrl === "string",
    english: score10(ratings.communication),
    coding: score10(ratings.coding),
    aptitude: score10(ratings.aptitude),
    aiInterview: score10(ratings.interview ?? ratings.overall),
    score: s.score,
    offers: x.offers,
    hired: x.hired > 0,
    ppo: x.ppo > 0,
    earningsMinor: x.earningsMinor,
  };
}

// ── Columns ──────────────────────────────────────────────────────────────

export type ColumnKind = "text" | "number" | "score" | "bool" | "list" | "date" | "money" | "link";
export type ColumnGroup = "Student" | "Course" | "Preferences" | "Scores" | "Placement";

export type MasterColumn = {
  key: keyof MasterRow | "report" | "recording";
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
  { key: "rollNo", label: "Roll no.", group: "Student", kind: "text" },
  { key: "degree", label: "Degree", group: "Course", kind: "text" },
  { key: "branch", label: "Branch", group: "Course", kind: "text" },
  { key: "startYear", label: "Start year", group: "Course", kind: "number" },
  { key: "endYear", label: "End year", group: "Course", kind: "number" },
  { key: "year", label: "Current year", group: "Course", kind: "number" },
  { key: "semester", label: "Current sem", group: "Course", kind: "number" },
  { key: "linkedin", label: "LinkedIn", group: "Student", kind: "link" },
  { key: "city", label: "City", group: "Student", kind: "text" },
  { key: "cgpa", label: "CGPA", group: "Course", kind: "score" },
  { key: "professionalCourse", label: "Professional course", group: "Course", kind: "text" },
  { key: "professionalStatus", label: "Course status", group: "Course", kind: "text" },
  { key: "professionalLevel", label: "Course level", group: "Course", kind: "text" },
  { key: "certifications", label: "Certifications", group: "Course", kind: "number" },
  { key: "experience", label: "Experience", group: "Course", kind: "number" },
  { key: "workModes", label: "Work preference", group: "Preferences", kind: "list" },
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
];

export const COLUMN_KEYS = new Set(MASTER_COLUMNS.map((c) => c.key));

const SCORE_KEYS = new Set<string>(["cgpa", "english", "coding", "aptitude", "aiInterview", "score"]);
const MODE_LABEL: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "Onsite" };

/** A cell as plain text, the same in the table's title and in the CSV. Missing is "". */
export function cellText(row: MasterRow, key: MasterColumn["key"], origin = ""): string {
  switch (key) {
    case "report":
      return row.hasReport ? `${origin}/api/college/students/${row.userId}/report` : "";
    case "recording":
      return row.hasRecording ? `${origin}/api/college/students/${row.userId}/recording` : "";
    case "workModes":
      return row.workModes.map((m) => MODE_LABEL[m] ?? m).join(", ");
    case "earningsMinor":
      return row.verified ? (row.earningsMinor / 100).toFixed(2) : "";
    case "hired":
    case "ppo":
      return row.verified ? (row[key] ? "Yes" : "No") : "";
    case "offers":
      return row.verified ? String(row.offers) : "";
    default: {
      const v = row[key];
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return v.join(", ");
      if (typeof v === "boolean") return v ? "Yes" : "No";
      // Scores always carry one decimal (6.0, not 6); counts and years never do.
      if (typeof v === "number") return SCORE_KEYS.has(key) ? v.toFixed(1) : String(Math.round(v));
      return String(v);
    }
  }
}

/**
 * One CSV cell. Quotes always, doubles inner quotes, and prefixes a ' to anything a spreadsheet would run as a
 * formula (=, +, -, @, tab, CR), so a student who types "=HYPERLINK(...)" as a skill cannot attack the officer.
 */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(rows: MasterRow[], keys: MasterColumn["key"][], origin = ""): string {
  const cols = keys.map((k) => MASTER_COLUMNS.find((c) => c.key === k)).filter((c): c is MasterColumn => !!c);
  const head = cols.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(cellText(r, c.key, origin))).join(","));
  // BOM so Excel opens the file as UTF-8 (names with accents, the rupee sign).
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}
