import type { internOnboarding } from "@/lib/db/schema";
import { phoneError } from "./phone.ts";

/**
 * Intern onboarding shape across the 8-step wizard.
 *
 * Steps:
 * 1. About Me (Passport Photo, Name, Bio, Location, Aadhaar, Contacts)
 * 2. Academics (Qualification, Degree, Specialization, Status, Institution, CGPA)
 * 3. Experience (Internships, Projects, Freelance, Roles, Timelines)
 * 4. Skills (Selected skills with ratings: Beginner, Intermediate, Advanced)
 * 5. Languages (Languages & Fluency levels: Native, Professional, Conversational, Basic)
 * 6. Extracurriculars (Activities, Hackathons, Leadership, Clubs)
 * 7. Location Preferences & Laptop Availability (Remote/Hybrid/Onsite, Preferred Cities, Hardware)
 * 8. Live Profile Preview (WYSIWYG Summary & Submission)
 */

export type ExperienceEntry = {
  id: string;
  type: string; // Internship, Full-time, Part-time, Project, Freelance
  company: string;
  role: string;
  from: string;
  to: string;
  current: boolean;
  description: string;
};

export type SkillWithRating = {
  name: string;
  rating: "Beginner" | "Intermediate" | "Advanced";
};

export type LanguageEntry = {
  id: string;
  language: string;
  level: "Native" | "Professional" | "Conversational" | "Basic";
  read?: boolean;
  write?: boolean;
  speak?: boolean;
};

export type ExtracurricularEntry = {
  id: string;
  activity: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  category?: string;
  description?: string;
};

/** One professional qualification (CA, CS, CFA…) or certification row. */
export type QualificationEntry = {
  id: string;
  name: string;
  issuer: string;
  /** YYYY-MM-DD. Professional rows store it as legacy `completionDate`,
   *  certifications as legacy `endDate`. */
  completionDate: string;
  credentialUrl: string;
};

export type ScoreType = "cgpa" | "percentage";

export type OnboardingDraft = {
  // Step 1: About Me
  firstName?: string;
  lastName?: string;
  bio: string;
  phone?: string;
  /** Emergency contact, stored flat in extra_data like the legacy form. */
  emergencyName?: string;
  emergencyRelation?: string;
  emergencyCountryCode?: string;
  emergencyPhone: string;
  /** Optional second point of contact (legacy keys secondPoc*). */
  secondPocName?: string;
  secondPocRelation?: string;
  secondPocCountryCode?: string;
  secondPocPhone?: string;
  linkedinUrl: string;
  city: string;
  state: string;
  pinCode: string;
  aadhaarNumber?: string;
  panNumber?: string;
  photoUrl?: string;
  /** Accepted the Internship Acceptance & Non-Bypass Agreement (/intern-nda). */
  ndaAccepted?: boolean;

  // Step 2: Academics
  academics: {
    qualificationLevel?: string;
    institution: string;
    degree: string;
    branch: string;
    startYear: string;
    /** End (or expected end) year; stored as `endYear`. */
    yearOfGraduation: string;
    status?: string;
    scoreType: ScoreType;
    /** The score, CGPA or percentage per `scoreType`; stored as `score`. */
    cgpa: string;
    professional: QualificationEntry[];
    certifications: QualificationEntry[];
  };

  // Step 3: Experience
  experiences: ExperienceEntry[];

  // Step 4: Skills
  skills: string[];
  skillsWithRatings: SkillWithRating[];

  // Step 5: Languages
  languages: LanguageEntry[];

  // Step 6: Extracurricular
  extracurriculars: ExtracurricularEntry[];

  // Step 7: Location Preferences & Hardware
  locationTypes: string[];
  preferredLocations: string[];
  hasLaptop: boolean | null;

  // Step 8: Preview & Additional Details
  previewSummary?: string;
  bank: {
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    upiId: string;
  };
};

/** One line of the read-only list on the documents step. */
export type StoredDocument = {
  label: string;
  fileName: string;
};

const BLANK: OnboardingDraft = {
  firstName: "",
  lastName: "",
  bio: "",
  phone: "",
  emergencyName: "",
  emergencyRelation: "",
  emergencyCountryCode: "+91",
  emergencyPhone: "",
  secondPocName: "",
  secondPocRelation: "",
  secondPocCountryCode: "+91",
  secondPocPhone: "",
  linkedinUrl: "",
  city: "",
  state: "",
  pinCode: "",
  aadhaarNumber: "",
  panNumber: "",
  photoUrl: "",
  ndaAccepted: false,
  academics: {
    qualificationLevel: "Bachelor's",
    institution: "",
    degree: "",
    branch: "",
    startYear: "",
    yearOfGraduation: "",
    status: "Pursuing",
    scoreType: "cgpa",
    cgpa: "",
    professional: [],
    certifications: [],
  },
  experiences: [],
  skills: [],
  skillsWithRatings: [],
  languages: [
    { id: "lang-1", language: "English", level: "Professional", read: true, write: true, speak: true },
    { id: "lang-2", language: "Hindi", level: "Native", read: true, write: true, speak: true },
  ],
  extracurriculars: [],
  // Nothing preselected: the candidate has to choose a mode and answer the
  // laptop question themselves (legacy required both).
  locationTypes: [],
  preferredLocations: [],
  hasLaptop: null,
  previewSummary: "",
  bank: {
    accountHolderName: "",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    upiId: "",
  },
};

/**
 * A blank draft. Returns a fresh object every call.
 */
export function emptyDraft(): OnboardingDraft {
  return structuredClone(BLANK);
}

type OnboardingRow = typeof internOnboarding.$inferSelect;

/**
 * `intern_onboarding` → form state.
 */
/* ── Legacy storage shape ───────────────────────────────────────────────
 * The legacy app owns `intern_onboarding` and both apps share the database:
 *   skills            [{ id, name, rating: 1 | 2 | 3 }]
 *   extra.academics   { level: "bachelors"…, degree, specialization, status,
 *                       institution, startYear, endYear, scoreType, score, … }
 *   extra.languages   [{ id, language, level: "native"…, read/write/speak: "yes" | "no" }]
 *   extra.extracurricular [{ id, activity, level }]
 *   extra.bankDetails { accountHolderName, bankName, accountNumber, ifscCode, upiId }
 * `draftFromRecord` reads it (and the shapes early builds of this app wrote);
 * `storedFromDraft` always writes it. */

const LEVELS: [string, string][] = [
  ["bachelors", "Bachelor's"],
  ["masters", "Master's"],
  ["diploma", "Diploma"],
  ["phd", "Ph.D"],
  ["12th", "High School"],
];
const RATING_LABEL = ["Beginner", "Intermediate", "Advanced"] as const;

const text = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const cap = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v);
const yes = (v: unknown) => v === true || v === "yes" || v === undefined;

function ratingLabel(v: unknown): SkillWithRating["rating"] {
  if (typeof v === "string" && (RATING_LABEL as readonly string[]).includes(v)) return v as SkillWithRating["rating"];
  const n = Math.round(Number(v));
  return RATING_LABEL[Math.min(3, Math.max(1, Number.isFinite(n) ? n : 1)) - 1];
}

export function readSkillRatings(raw: unknown, extra: Record<string, unknown> = {}): SkillWithRating[] {
  const legacy = arr(extra.skillsWithRatings).map(obj);
  return arr(raw)
    .map((item) => {
      if (typeof item === "string") {
        const r = legacy.find((x) => text(x.name).toLowerCase() === item.toLowerCase());
        return { name: item, rating: ratingLabel(r?.rating ?? 2) };
      }
      const o = obj(item);
      return { name: text(o.name).trim(), rating: ratingLabel(o.rating) };
    })
    .filter((s) => s.name);
}

/** Any onboarding row (or a projection of one); JSON columns are read defensively. */
export type OnboardingLike = Partial<Omit<OnboardingRow, "skills" | "experienceJson" | "extraData">> & {
  skills?: unknown;
  experienceJson?: unknown;
  extraData?: unknown;
};

export function draftFromRecord(row: OnboardingLike): Partial<OnboardingDraft> {
  const extra = obj(row.extraData);
  const academics = obj(extra.academics);
  const bank = obj(extra.bankDetails ?? extra.bank);
  const list = (value: unknown): string[] => arr(value).filter((v): v is string => typeof v === "string");

  const experiences: ExperienceEntry[] = arr(Array.isArray(row.experienceJson) ? row.experienceJson : extra.experiences).map(
    (item, i) => {
      const exp = obj(item);
      return {
        id: text(exp.id) || `exp-${i}`,
        type: text(exp.type) || "Internship",
        company: text(exp.company),
        role: text(exp.role),
        from: toDay(text(exp.from)),
        to: toDay(text(exp.to)),
        current: Boolean(exp.current) || (!text(exp.to) && Boolean(text(exp.from))),
        description: text(exp.description),
      };
    },
  );

  const rawLang = arr(extra.languages);
  const languages: LanguageEntry[] = rawLang.length
    ? rawLang.map((item, i) => {
        const l = obj(item);
        return {
          id: text(l.id) || `lang-${i}`,
          language: text(l.language),
          level: (cap(text(l.level)) || "Professional") as LanguageEntry["level"],
          read: yes(l.read),
          write: yes(l.write),
          speak: yes(l.speak),
        };
      })
    : BLANK.languages;

  const extracurriculars: ExtracurricularEntry[] = arr(extra.extracurricular ?? extra.extracurriculars).map((item, i) => {
    const e = obj(item);
    return {
      id: text(e.id) || `extra-${i}`,
      activity: text(e.activity) || text(e.title) || text(e.name),
      level: (cap(text(e.level)) || "Intermediate") as ExtracurricularEntry["level"],
      category: text(e.category),
      description: text(e.description),
    };
  });

  const skillsWithRatings = readSkillRatings(row.skills, extra);
  const level = text(academics.level || academics.qualificationLevel);

  return {
    bio: text(row.bio),
    linkedinUrl: text(row.linkedinUrl),
    city: text(row.city),
    state: text(row.state),
    pinCode: text(row.pinCode),
    aadhaarNumber: text(row.aadhaarNumber || extra.aadhaarNumber),
    panNumber: text(row.panNumber || extra.panNumber),
    // Older rows may hold an outside URL; only our own upload path survives,
    // which also keeps the draft valid for the onboarding API's schema.
    photoUrl: text(extra.photoUrl).startsWith("/api/intern/avatar") ? text(extra.photoUrl) : "",
    emergencyPhone: text(extra.emergencyPhone),
    emergencyName: text(extra.emergencyName || extra.emergencyContactName),
    emergencyRelation: text(extra.emergencyRelation),
    emergencyCountryCode: text(extra.emergencyCountryCode) || "+91",
    secondPocName: text(extra.secondPocName),
    secondPocRelation: text(extra.secondPocRelation),
    secondPocCountryCode: text(extra.secondPocCountryCode) || "+91",
    secondPocPhone: text(extra.secondPocPhone),
    ndaAccepted: Boolean(extra.ndaAcceptedAt),
    previewSummary: text(row.previewSummary),
    academics: {
      qualificationLevel: LEVELS.find(([k, v]) => k === level.toLowerCase() || v === level)?.[1] ?? (level || "Bachelor's"),
      // The flat `college` / `degree` / `graduationYear` keys are what the
      // seed scripts write; real (legacy and new) rows nest under academics.
      institution: text(academics.institution || extra.college),
      degree: text(academics.degree || extra.degree),
      branch: text(academics.specialization || academics.branch),
      startYear: text(academics.startYear),
      yearOfGraduation: text(academics.endYear || academics.yearOfGraduation || extra.graduationYear),
      status: text(academics.status) || "Pursuing",
      scoreType: readScoreType(academics),
      cgpa: text(academics.score || academics.cgpa),
      professional: arr(academics.professionalCourses).map((c, i) => readProfessional(obj(c), i)),
      certifications: arr(academics.certifications).map((c, i) => readCertification(obj(c), i)),
    },
    experiences,
    skills: skillsWithRatings.map((s) => s.name),
    skillsWithRatings,
    languages,
    extracurriculars,
    locationTypes: workModes(list(row.locationTypes)),
    preferredLocations: list(row.preferredLocations),
    hasLaptop: typeof row.hasLaptop === "boolean" ? row.hasLaptop : null,
    bank: {
      accountHolderName: text(bank.accountHolderName),
      bankName: text(bank.bankName),
      accountNumber: text(bank.accountNumber),
      ifscCode: text(bank.ifscCode),
      upiId: text(bank.upiId),
    },
  };
}

/** Draft fields → legacy columns. Unknown legacy keys already stored are kept. */
/** What a save may carry: any subset of the draft, and any subset of academics
 *  (an older cached client does not send the newer academic fields). */
export type DraftInput = Omit<Partial<OnboardingDraft>, "academics"> & {
  academics?: Partial<OnboardingDraft["academics"]>;
};

export function storedFromDraft(
  draft: DraftInput,
  existing: { skills?: unknown; extraData?: unknown } | null,
): { skills?: unknown[]; experienceJson?: unknown[]; extraPatch: Record<string, unknown> } {
  const prevExtra = obj(existing?.extraData);
  const out: { skills?: unknown[]; experienceJson?: unknown[]; extraPatch: Record<string, unknown> } = { extraPatch: {} };

  if (draft.skillsWithRatings || draft.skills) {
    const prevIds = new Map(arr(existing?.skills).map(obj).map((s) => [text(s.name).toLowerCase(), text(s.id)]));
    const rated = draft.skillsWithRatings?.length
      ? draft.skillsWithRatings
      : (draft.skills ?? []).map((name) => ({ name, rating: "Beginner" as const }));
    out.skills = rated
      .filter((s) => s.name.trim())
      .map((s, i) => ({
        id: prevIds.get(s.name.trim().toLowerCase()) || `skill-${Date.now()}-${i}`,
        name: s.name.trim(),
        rating: RATING_LABEL.indexOf(s.rating) + 1 || 1,
      }));
  }
  if (draft.experiences) {
    out.experienceJson = draft.experiences.map(({ id, type, company, role, from, to, description, current }) => ({
      id, type, company, role, from, to: current ? "" : to, description, current,
    }));
  }
  if (draft.academics) {
    const a = draft.academics;
    const prev = obj(prevExtra.academics);
    const score = a.cgpa?.trim() ?? "";
    out.extraPatch.academics = {
      ...prev,
      level: LEVELS.find(([, v]) => v === a.qualificationLevel)?.[0] ?? a.qualificationLevel ?? "",
      degree: a.degree ?? text(prev.degree),
      specialization: a.branch ?? text(prev.specialization),
      status: a.status ?? "Pursuing",
      institution: a.institution ?? text(prev.institution),
      startYear: a.startYear ?? text(prev.startYear),
      endYear: a.yearOfGraduation ?? text(prev.endYear),
      score,
      scoreType: a.scoreType || text(prev.scoreType) || (Number(score) > 10 ? "percentage" : "cgpa"),
      // Rows the form did not touch are written back exactly as stored.
      ...(a.professional
        ? { professionalCourses: writeRows(a.professional, arr(prev.professionalCourses).map(obj), readProfessional, writeProfessional) }
        : {}),
      ...(a.certifications
        ? { certifications: writeRows(a.certifications, arr(prev.certifications).map(obj), readCertification, writeCertification) }
        : {}),
    };
  }
  if (draft.languages) {
    out.extraPatch.languages = draft.languages.map((l) => ({
      id: l.id,
      language: l.language,
      level: l.level.toLowerCase(),
      read: l.read === false ? "no" : "yes",
      write: l.write === false ? "no" : "yes",
      speak: l.speak === false ? "no" : "yes",
    }));
  }
  if (draft.extracurriculars) {
    out.extraPatch.extracurricular = draft.extracurriculars.map((e) => ({ ...e, level: e.level }));
  }
  if (draft.bank) out.extraPatch.bankDetails = draft.bank;
  return out;
}

/* ── Qualification rows ─────────────────────────────────────────────────
 * Legacy keeps these inside extra.academics:
 *   professionalCourses [{ id, courseNamePreset: "CA"|"CS"|"CMA"|"CFA"|"Other",
 *                          courseNameOther, institution, status, completionDate,
 *                          level, scoreType, score, certificateUploads }]
 *   certifications      [{ id, certificateName, institution, startDate, endDate,
 *                          certificateUploads }]
 * This form edits name, issuer, completion date and a credential URL. The date
 * is the legacy `completionDate` / `endDate`; `credentialUrl` is a new key,
 * and every legacy key on a row is kept. Rows saved while this form asked
 * for a bare `year` read as 1 January of that year. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(raw: unknown, year: unknown): string {
  const v = text(raw);
  if (ISO_DATE.test(v.slice(0, 10))) return v.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  const y = text(year) || (/^\d{4}$/.test(v) ? v : "");
  return /^\d{4}$/.test(y) ? `${y}-01-01` : "";
}

const PROFESSIONAL_PRESETS = ["CA", "CS", "CMA", "CFA"];

function readProfessional(c: Record<string, unknown>, i: number): QualificationEntry {
  const preset = text(c.courseNamePreset);
  return {
    id: text(c.id) || `prof-${i}`,
    name: preset && preset !== "Other" ? preset : text(c.courseNameOther) || text(c.level),
    issuer: text(c.institution),
    completionDate: readDate(c.completionDate, c.year),
    credentialUrl: text(c.credentialUrl),
  };
}

function writeProfessional(q: QualificationEntry, prev: Record<string, unknown>): Record<string, unknown> {
  const name = q.name.trim();
  const preset = PROFESSIONAL_PRESETS.find((p) => p.toLowerCase() === name.toLowerCase());
  return {
    ...prev,
    id: q.id,
    courseNamePreset: preset ?? "Other",
    courseNameOther: preset ? "" : name,
    institution: q.issuer.trim(),
    status: text(prev.status) || "Completed",
    completionDate: q.completionDate.trim(),
    scoreType: text(prev.scoreType) || "percentage",
    score: text(prev.score),
    certificateUploads: arr(prev.certificateUploads),
    credentialUrl: q.credentialUrl.trim(),
  };
}

function readCertification(c: Record<string, unknown>, i: number): QualificationEntry {
  return {
    id: text(c.id) || `cert-${i}`,
    name: text(c.certificateName),
    issuer: text(c.institution),
    completionDate: readDate(c.endDate || c.startDate, c.year),
    credentialUrl: text(c.credentialUrl),
  };
}

function writeCertification(q: QualificationEntry, prev: Record<string, unknown>): Record<string, unknown> {
  return {
    ...prev,
    id: q.id,
    certificateName: q.name.trim(),
    institution: q.issuer.trim(),
    startDate: text(prev.startDate),
    endDate: q.completionDate.trim(),
    certificateUploads: arr(prev.certificateUploads),
    credentialUrl: q.credentialUrl.trim(),
  };
}

function writeRows(
  rows: QualificationEntry[],
  prevRows: Record<string, unknown>[],
  read: (c: Record<string, unknown>, i: number) => QualificationEntry,
  write: (q: QualificationEntry, prev: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown>[] {
  return rows.map((q) => {
    const i = prevRows.findIndex((p) => text(p.id) === q.id);
    if (i === -1) return write(q, {});
    const before = read(prevRows[i], i);
    const same = (["name", "issuer", "completionDate", "credentialUrl"] as const).every((k) => before[k] === q[k]);
    return same ? prevRows[i] : write(q, prevRows[i]);
  });
}

function readScoreType(academics: Record<string, unknown>): ScoreType {
  const t = text(academics.scoreType).toLowerCase();
  if (t === "percentage" || t === "cgpa") return t;
  return Number(text(academics.score || academics.cgpa)) > 10 ? "percentage" : "cgpa";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Experience dates are `YYYY-MM` (what `<input type="month">` and the legacy
 * form use). Early builds of this app took free text like "Jan 2025"; that is
 * read into the same shape, and anything unreadable is kept as typed.
 */
export function toMonth(raw: string): string {
  const v = raw.trim();
  const iso = /^(\d{4})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const named = /^([a-z]{3})[a-z]*\.?\s+(\d{4})$/i.exec(v);
  if (named) {
    const m = MONTHS.indexOf(named[1].toLowerCase());
    if (m !== -1) return `${named[2]}-${String(m + 1).padStart(2, "0")}`;
  }
  return v;
}

/**
 * Experience dates are full days, YYYY-MM-DD (bug sheet: a calendar, shown
 * DD/MM/YYYY). Rows saved as a month ("2025-01", "Jan 2025") read as the
 * 1st of that month, so nobody has to enter them again.
 */
export function toDay(raw: string): string {
  const v = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const month = toMonth(v);
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : v;
}

/** "2025-01-15" → "15/01/2025", "2025-01" → "Jan 2025"; anything else as stored. */
export function dateLabel(value: string): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return d ? `${d[3]}/${d[2]}/${d[1]}` : monthLabel(value);
}

/** "2025-01" → "Jan 2025"; anything else is shown as stored. */
export function monthLabel(value: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value;
  const name = MONTHS[Number(m[2]) - 1];
  return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)} ${m[1]}` : value;
}

/* ── Option lists ──────────────────────────────────────────────────────── */

/** Qualification levels offered for new entries. "High School" is still read
 *  (legacy `12th`) and shown only to someone who already has it saved. */
export const QUALIFICATION_LEVELS = [
  { value: "Bachelor's", label: "Bachelor's degree" },
  { value: "Master's", label: "Master's degree" },
  { value: "Diploma", label: "Diploma / Polytechnic" },
  { value: "Ph.D", label: "PhD / Doctorate" },
] as const;

/** Degree names. `aliases` match how the legacy form and free text spelled them. */
export const DEGREES: { value: string; aliases: string[] }[] = [
  { value: "B.Tech / B.E.", aliases: ["btech", "be", "btechbe", "bachelorofengineering", "bacheloroftechnology"] },
  { value: "B.Sc", aliases: ["bsc"] },
  { value: "B.Com", aliases: ["bcom"] },
  { value: "BBA", aliases: ["bba"] },
  { value: "BCA", aliases: ["bca"] },
  { value: "B.A.", aliases: ["ba"] },
  { value: "B.Des", aliases: ["bdes"] },
  { value: "M.Tech / M.E.", aliases: ["mtech", "me", "mtechme"] },
  { value: "M.Sc", aliases: ["msc"] },
  { value: "M.Com", aliases: ["mcom"] },
  { value: "MBA", aliases: ["mba"] },
  { value: "MCA", aliases: ["mca"] },
  { value: "M.A.", aliases: ["ma"] },
  { value: "PhD", aliases: ["phd"] },
  { value: "Diploma", aliases: ["diploma"] },
];

const degreeKey = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");

/** The dropdown option a stored degree belongs to: a list value, "Other", or "" when blank. */
export function degreeOption(degree: string): string {
  const key = degreeKey(degree);
  if (!key) return "";
  return DEGREES.find((d) => degreeKey(d.value) === key || d.aliases.includes(key))?.value ?? "Other";
}

export const EXPERIENCE_TYPES = [
  { value: "Internship", label: "Internship" },
  { value: "Project", label: "Personal / academic project" },
  { value: "Freelance", label: "Freelance contract" },
  { value: "Part-time", label: "Part-time job" },
  { value: "Full-time", label: "Full-time job" },
] as const;

/** Work modes from least to most on-site. Choosing one includes every mode
 *  before it: onsite ⇒ hybrid + remote, hybrid ⇒ remote. */
export const WORK_MODE_ORDER = ["remote", "hybrid", "onsite"] as const;

/**
 * Stored modes, normalised: legacy rows hold "Remote", "On-site", "WFH" and
 * the like. Anything unrecognised is dropped so it can neither show as an
 * unselected button nor count as "a mode was picked".
 */
export function workModes(raw: string[]): string[] {
  const seen = new Set<string>();
  for (const value of raw) {
    const v = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
    const mode = v === "remote" || v === "wfh" || v === "workfromhome" ? "remote" : v === "hybrid" ? "hybrid" : v === "onsite" || v === "office" || v === "inoffice" || v === "wfo" ? "onsite" : null;
    if (mode) seen.add(mode);
  }
  return WORK_MODE_ORDER.filter((m) => seen.has(m));
}

/** The single mode a candidate picked: the most on-site one stored. Legacy
 *  rows can hold any mix ("remote" + "onsite"); the widest one wins. */
export function widestWorkMode(raw: string[]): (typeof WORK_MODE_ORDER)[number] | null {
  const modes = workModes(raw);
  return (modes[modes.length - 1] as (typeof WORK_MODE_ORDER)[number] | undefined) ?? null;
}

/** The modes after tapping `mode`: tapping the furthest selected mode steps
 *  back one level; tapping any other selects it and everything before it. */
export function cascadeWorkModes(current: string[], mode: string): string[] {
  const rank = WORK_MODE_ORDER.indexOf(mode as (typeof WORK_MODE_ORDER)[number]);
  if (rank === -1) return current;
  const top = Math.max(-1, ...current.map((m) => WORK_MODE_ORDER.indexOf(m as (typeof WORK_MODE_ORDER)[number])));
  const level = rank === top ? rank - 1 : rank;
  return WORK_MODE_ORDER.slice(0, level + 1);
}

export const EMERGENCY_RELATIONS = ["Parent", "Guardian", "Sibling", "Spouse", "Relative", "Friend", "Other"] as const;

/* ── Validation ─────────────────────────────────────────────────────────
 * One rule set for the browser (per step, on Continue) and the server (all
 * steps, on final submit). Keys are the form's field ids, so the client can
 * put each message under the field it is about. Drafts are never blocked on
 * completeness - only a value that is present and impossible (a CGPA of 12)
 * is refused on a draft save; see `formatProblems`. */

export type ValidationContext = {
  /** A PAN card image is on file (uploaded now or earlier). */
  hasPanImage: boolean;
  /** An Aadhaar card image is on file (uploaded now or earlier). */
  hasAadhaarImage: boolean;
  /** The account's own number, so the emergency contact cannot repeat it. */
  ownPhone?: { countryCode: string; phoneNumber: string } | null;
  /** A profile photo is on file (uploaded now or earlier). */
  hasPhoto?: boolean;
  now?: Date;
};

/** Maximum key skills (legacy client cap, now also enforced by the API). */
export const MAX_SKILLS = 7;

export type ValidationErrors = Record<string, string>;

const AADHAAR = /^[2-9]\d{11}$/;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const URL_RE = /^https?:\/\/\S+\.\S+/;
const YEAR = /^\d{4}$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function scoreProblem(type: ScoreType, raw: string): string | null {
  const v = raw.trim().replace(/%$/, "");
  if (!v) return null;
  const n = Number(v);
  if (!/^\d+(\.\d+)?$/.test(v) || !Number.isFinite(n)) return "Enter a number, like 8.4 or 84.";
  if (type === "cgpa" && n > 10) return "CGPA is out of 10 - enter a value from 0 to 10.";
  if (type === "percentage" && n > 100) return "Percentage cannot be more than 100.";
  return null;
}

function qualificationErrors(rows: QualificationEntry[], prefix: string, today: string, out: ValidationErrors) {
  for (const q of rows) {
    const k = `${prefix}.${q.id}`;
    if (!q.name.trim()) out[`${k}.name`] = "Enter the name of the qualification.";
    if (!q.issuer.trim()) out[`${k}.issuer`] = "Enter who issued it.";
    const date = q.completionDate.trim();
    if (!ISO_DATE.test(date)) out[`${k}.completionDate`] = "Pick the date you completed it.";
    else if (date > today) out[`${k}.completionDate`] = "The completion date cannot be in the future.";
    else if (date < "1950-01-01") out[`${k}.completionDate`] = "Check the completion date.";
    if (q.credentialUrl.trim() && !URL_RE.test(q.credentialUrl.trim())) {
      out[`${k}.credentialUrl`] = "Enter a full link starting with https://";
    }
  }
}

export function validateStep(values: OnboardingDraft, step: number, ctx: ValidationContext): ValidationErrors {
  const errors: ValidationErrors = {};
  const now = ctx.now ?? new Date();
  const thisYear = now.getFullYear();
  const thisMonth = `${thisYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = `${thisMonth}-${String(now.getDate()).padStart(2, "0")}`;

  if (step === 0) {
    // Required again, as in legacy (onboarding.tsx:793): employers shortlist
    // on the card, and the card leads with the face.
    if (!ctx.hasPhoto && !(values.photoUrl ?? "").startsWith("/api/intern/avatar")) {
      errors.photo = "Upload a clear, front-facing profile photo.";
    }
    if ((values.bio ?? "").trim().length < 20) errors.bio = "Write at least a sentence or two - 20 characters minimum.";
    const linkedin = (values.linkedinUrl ?? "").trim();
    // Optional (bug sheet 21 Oct); a link that is given must be a real one.
    if (!linkedin) {
      // nothing to check
    } else if (!URL_RE.test(linkedin)) errors.linkedinUrl = "Enter the full link, starting with https://";
    else if (!/linkedin\.com\//i.test(linkedin)) errors.linkedinUrl = "This should be a linkedin.com profile link.";
    if (!(values.city ?? "").trim()) errors.city = "Enter the city you live in.";
    if (!(values.state ?? "").trim()) errors.state = "Enter the state you live in.";
    if (!values.pinCode) errors.pinCode = "Enter your 6-digit PIN code.";
    else if (!/^\d{6}$/.test(values.pinCode)) errors.pinCode = "PIN code must be 6 digits.";

    const aadhaar = (values.aadhaarNumber ?? "").replace(/\s/g, "");
    if (!aadhaar) errors.aadhaarNumber = "Aadhaar number is required.";
    else if (!/^\d{12}$/.test(aadhaar)) errors.aadhaarNumber = `Aadhaar number must be 12 digits - you entered ${aadhaar.length}.`;
    else if (!AADHAAR.test(aadhaar)) errors.aadhaarNumber = "Aadhaar numbers never start with 0 or 1. Check the number.";

    const pan = (values.panNumber ?? "").trim();
    if (!pan) errors.panNumber = "PAN is required for stipend payouts.";
    else if (!PAN.test(pan)) errors.panNumber = "PAN must look like ABCDE1234F - 5 letters, 4 digits, 1 letter.";
    if (!ctx.hasPanImage) errors.panImage = "Upload a photo or scan of your PAN card.";

    if (!(values.emergencyName ?? "").trim()) errors.emergencyName = "Enter the name of someone we can call in an emergency.";
    const ePhone = (values.emergencyPhone ?? "").trim();
    if (!ePhone) errors.emergencyPhone = "Enter an emergency contact number.";
    else {
      const p = phoneError(values.emergencyCountryCode || "+91", ePhone);
      if (p) errors.emergencyPhone = `${p}.`;
      else if (
        ctx.ownPhone &&
        (values.emergencyCountryCode || "+91") === (ctx.ownPhone.countryCode || "+91") &&
        ePhone.replace(/\D/g, "") === ctx.ownPhone.phoneNumber.replace(/\D/g, "")
      ) {
        // Legacy rule (onboarding.tsx:706): it has to reach someone else.
        errors.emergencyPhone = "Use someone else's number - this is your own.";
      }
    }

    // Second point of contact: optional, but a number that is given must be
    // valid and reach a third person (legacy onboarding.tsx:726-742).
    const sPhone = (values.secondPocPhone ?? "").trim();
    const sCode = values.secondPocCountryCode || "+91";
    const digits = (v: string) => v.replace(/\D/g, "");
    if (sPhone) {
      const p = phoneError(sCode, sPhone);
      if (p) errors.secondPocPhone = `${p}.`;
      else if (ctx.ownPhone && sCode === (ctx.ownPhone.countryCode || "+91") && digits(sPhone) === digits(ctx.ownPhone.phoneNumber)) {
        errors.secondPocPhone = "This is your own number - add someone else's.";
      } else if (ePhone && sCode === (values.emergencyCountryCode || "+91") && digits(sPhone) === digits(ePhone)) {
        errors.secondPocPhone = "This is the same as your emergency contact - add a different person.";
      } else if (!(values.secondPocName ?? "").trim()) {
        errors.secondPocName = "Add the name of your second contact.";
      }
    }

    // Bank details are not asked for here any more (bug sheet 21 Oct): they
    // are entered from Settings once there is a stipend to pay.
  }

  if (step === 1) {
    const a = values.academics;
    if (!a.institution.trim()) errors.institution = "Enter your college or university.";
    const option = degreeOption(a.degree);
    if (!option) errors.degree = "Choose your degree.";
    else if (a.degree.trim().toLowerCase() === "other") errors.degree = "Type the name of your degree.";
    if (!a.branch.trim()) errors.branch = "Enter your specialization or branch, like Computer Science.";

    const start = a.startYear.trim();
    const end = a.yearOfGraduation.trim();
    if (!YEAR.test(start)) errors.startYear = "Enter the year you started, like 2022.";
    else if (Number(start) > thisYear) errors.startYear = `The start year cannot be after ${thisYear}.`;
    else if (Number(start) < 1970) errors.startYear = "Check the start year.";

    const completed = (a.status ?? "Pursuing") === "Completed";
    if (!YEAR.test(end)) errors.yearOfGraduation = completed ? "Enter the year you graduated." : "Enter the year you expect to finish.";
    else if (YEAR.test(start) && Number(end) < Number(start)) errors.yearOfGraduation = "The end year cannot be before the start year.";
    else if (completed && Number(end) > thisYear) {
      errors.yearOfGraduation = `You marked this as completed, so the end year cannot be after ${thisYear}.`;
    } else if (Number(end) > thisYear + 8) errors.yearOfGraduation = "Check the end year.";

    const score = scoreProblem(a.scoreType, a.cgpa);
    if (score) errors.cgpa = score;
    else if (!a.cgpa.trim()) {
      const which = a.scoreType === "cgpa" ? "CGPA" : "percentage";
      errors.cgpa = completed ? `Enter your final ${which}.` : `Enter your ${which} so far (latest semester).`;
    }

    qualificationErrors(a.professional ?? [], "professional", today, errors);
    qualificationErrors(a.certifications ?? [], "certifications", today, errors);
  }

  if (step === 2) {
    for (const exp of values.experiences ?? []) {
      const k = `exp.${exp.id}`;
      if (!exp.type) errors[`${k}.type`] = "Choose the type of experience.";
      if (!exp.company.trim()) errors[`${k}.company`] = exp.type === "Project" ? "Enter the organisation, college or client." : "Enter the company name.";
      if (!exp.role.trim()) errors[`${k}.role`] = "Enter your role or title.";
      if (!DAY.test(exp.from)) errors[`${k}.from`] = "Pick the date you started.";
      else if (exp.from > today) errors[`${k}.from`] = "The start date cannot be in the future.";
      if (!exp.current) {
        if (!DAY.test(exp.to)) errors[`${k}.to`] = "Pick the date you finished, or tick \"I currently work here\".";
        else if (DAY.test(exp.from) && exp.to < exp.from) errors[`${k}.to`] = "The end date cannot be before the start date.";
        else if (exp.to > today) errors[`${k}.to`] = "The end date cannot be in the future. Tick \"I currently work here\" instead.";
      }
      if (exp.description.trim().length < 20) {
        errors[`${k}.description`] = "Describe what you did in a sentence or two - 20 characters minimum.";
      }
    }
  }

  if (step === 3 && (values.skills ?? []).length < 4) errors.skills = `Add at least 4 key skills (up to ${MAX_SKILLS}).`;
  if (step === 3 && (values.skills ?? []).length > MAX_SKILLS) errors.skills = `Pick at most ${MAX_SKILLS} key skills.`;
  if (step === 6) {
    const modes = workModes(values.locationTypes ?? []);
    const cities = (values.preferredLocations ?? []).filter((c) => c.trim());
    if (modes.length === 0) errors.locationTypes = "Pick at least one work mode.";
    else if ((modes.includes("onsite") || modes.includes("hybrid")) && cities.length === 0) {
      errors.preferredLocations = "Add at least one city you can work from (up to 5) for onsite or hybrid work.";
    }
    if (cities.length > 5) errors.preferredLocations = "Pick at most 5 cities.";
    // Legacy required the laptop answer on every save; it is the one
    // hardware fact employers filter on.
    if (values.hasLaptop !== true && values.hasLaptop !== false) {
      errors.hasLaptop = "Tell us whether you have a laptop to work on.";
    }
  }
  if (step === 7 && !values.ndaAccepted) errors.ndaAccepted = "Accept the Non-Bypass Agreement to submit your profile.";

  return errors;
}

/** Steps that have rules, in order. */
export const VALIDATED_STEPS = [0, 1, 2, 3, 6, 7] as const;

/** Every step's rules; the first failing step is where the form sends the candidate. */
export function validateProfile(values: OnboardingDraft, ctx: ValidationContext): { step: number; errors: ValidationErrors } | null {
  for (const step of VALIDATED_STEPS) {
    const errors = validateStep(values, step, ctx);
    if (Object.keys(errors).length > 0) return { step, errors };
  }
  return null;
}

/** Values that are present and impossible. Checked on every save, drafts included. */
export function formatProblems(values: DraftInput): string | null {
  const a = values.academics;
  if (a) {
    const score = scoreProblem(a.scoreType ?? "cgpa", a.cgpa ?? "");
    if (score) return score;
  }
  return null;
}

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Bank details, field by field; keys are the About Me step's field ids. */
export function bankErrors(bank: Partial<OnboardingDraft["bank"]>): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!(bank.accountHolderName ?? "").trim()) errors.bankAccountHolderName = "Enter the account holder's name.";
  if (!(bank.bankName ?? "").trim() || bank.bankName?.trim().toLowerCase() === "other") errors.bankName = "Enter your bank's name.";
  const account = (bank.accountNumber ?? "").replace(/\s/g, "");
  if (!account) errors.bankAccountNumber = "Enter your bank account number.";
  else if (!/^\d{9,18}$/.test(account)) errors.bankAccountNumber = "Account number must be 9 to 18 digits.";
  const ifsc = (bank.ifscCode ?? "").trim().toUpperCase();
  if (!ifsc) errors.bankIfscCode = "Enter your IFSC code.";
  else if (!IFSC.test(ifsc)) errors.bankIfscCode = "IFSC must be 11 characters, like SBIN0001234.";
  const upi = (bank.upiId ?? "").trim();
  if (upi && !UPI.test(upi)) errors.bankUpiId = "UPI ID should look like name@bank.";
  return errors;
}

/** Bank details are required in full (UPI stays optional). Null when valid. */
export function bankProblem(bank: Partial<OnboardingDraft["bank"]>): string | null {
  return Object.values(bankErrors(bank))[0] ?? null;
}

/** NPCI VPA shape: handle@psp, e.g. sunita.sharma@okaxis. */
const UPI = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

/* ── Profile completion (dashboard checklist) ─────────────────────────── */

export type CompletionItem = { id: string; label: string; done: boolean; href: string };

/**
 * What "profile complete" means for the dashboard: the same required fields
 * the form enforces, read from the stored row. Kept loose on format (that is
 * the form's job) - this only answers "is it filled in".
 */
export type CompletionDocs = {
  hasPanImage: boolean;
  /** An Aadhaar card image is on file. Optional, so it no longer counts. */
  hasAadhaarImage?: boolean;
  /** A profile photo is on file. */
  hasPhoto?: boolean;
};

export function profileCompletion(row: OnboardingLike | null, docs: boolean | CompletionDocs): { items: CompletionItem[]; done: number; total: number; complete: boolean } {
  const { hasPanImage, hasPhoto = false } = typeof docs === "boolean" ? { hasPanImage: docs } : docs;
  const d = row ? draftFromRecord(row) : null;
  const extra = obj(row?.extraData);
  const modes = d?.locationTypes ?? [];
  const needsCities = modes.includes("onsite") || modes.includes("hybrid");
  const form = "/intern/onboarding";
  const items: CompletionItem[] = [
    { id: "photo", label: "Profile photo", done: hasPhoto, href: form },
    {
      id: "about",
      label: "About you and address",
      done: Boolean(d && (d.bio ?? "").trim().length >= 20 && d.city && d.state && d.pinCode),
      href: form,
    },
    // Identity: both numbers, and the PAN card is the only document asked for
    // (bug sheet 21 Oct). The Aadhaar image and a marksheet are optional.
    {
      id: "identity",
      label: "Aadhaar and PAN numbers, PAN card image",
      done: Boolean(d?.aadhaarNumber && d?.panNumber && hasPanImage),
      href: form,
    },
    { id: "emergency", label: "Emergency contact", done: Boolean(d?.emergencyPhone), href: form },
    {
      id: "academics",
      label: "Academics",
      done: Boolean(d?.academics?.institution && d.academics.degree && d.academics.branch && d.academics.yearOfGraduation && d.academics.cgpa),
      href: form,
    },
    // Languages and laptop: legacy checklist items (dashboard.tsx:500-553).
    // The marksheet item is gone: uploading one is optional.
    { id: "skills", label: "At least 4 skills", done: (d?.skills?.length ?? 0) >= 4, href: form },
    { id: "languages", label: "Languages you work in", done: arr(extra.languages).length > 0, href: form },
    {
      id: "location",
      label: "Work modes and cities",
      done: modes.length > 0 && (!needsCities || (d?.preferredLocations?.length ?? 0) > 0),
      href: form,
    },
    { id: "laptop", label: "Laptop availability", done: d?.hasLaptop === true || d?.hasLaptop === false, href: form },
    { id: "agreement", label: "Non-Bypass Agreement accepted", done: Boolean(extra.ndaAcceptedAt), href: form },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, complete: done === items.length };
}
