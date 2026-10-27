import type { internOnboarding } from "@/lib/db/schema";
import { phoneError } from "./phone.ts";

/**
 * Intern onboarding shape across the 8-step wizard.
 *
 * Steps:
 * 1. About Me (photo, bio, identity documents, address, phone, emergency contact, bank)
 * 2. Academics (level, degree, status, institution, years, score, marksheets, courses)
 * 3. Experience (Internship, Job, Project, Freelancing)
 * 4. Skills (4 to 7, each rated Beginner / Intermediate / Advanced)
 * 5. Languages (legacy list; Native / Professional / Basic; read, write, speak)
 * 6. Extracurriculars (up to 10)
 * 7. Work mode, preferred cities, laptop
 * 8. Preview and the Non-Bypass Agreement
 */

export type ExperienceEntry = {
  id: string;
  /** Legacy values: Internship, Job, Project, Freelancing ("" until picked). */
  type: string;
  company: string;
  role: string;
  /** YYYY-MM-DD. */
  from: string;
  /** YYYY-MM-DD, or "" while `current` (stored as legacy "Present"). */
  to: string;
  current: boolean;
  description: string;
};

export type SkillWithRating = {
  name: string;
  rating: "Beginner" | "Intermediate" | "Advanced";
};

/** Legacy language levels (stored lowercase). */
export type LanguageLevel = "Native" | "Professional" | "Basic";

export type LanguageEntry = {
  id: string;
  /** Display spelling ("English"); stored lowercase like the legacy picker. */
  language: string;
  level: LanguageLevel | "";
  read?: boolean;
  write?: boolean;
  speak?: boolean;
};

export type ExtracurricularEntry = {
  id: string;
  activity: string;
  level: "Beginner" | "Intermediate" | "Advanced" | "";
  category?: string;
  description?: string;
};

/**
 * One professional course (CA, CS, CMA, CFA or another) or certification row.
 *
 * `name`, `issuer` and `completionDate` are shared by both lists (other pages
 * read them). Professional rows add the legacy preset, level, status and
 * score; certifications add a start date (legacy asks for both dates).
 */
export type QualificationEntry = {
  id: string;
  /** Professional: the preset, or the typed name when "Other". Certification: its name. */
  name: string;
  /** Legacy `institution`. */
  issuer: string;
  /** YYYY-MM-DD. Professional rows store it as legacy `completionDate`,
   *  certifications as legacy `endDate`. */
  completionDate: string;
  /** Kept from rows saved by an earlier build; no longer asked for. */
  credentialUrl: string;
  /** Certificate files (legacy `certificateUploads`): stored keys, newest last.
   *  Absent from an older client's save, which keeps what is stored. */
  uploads?: CertificateUpload[];
  /** Professional only: CA | CS | CMA | CFA | Other ("" until picked). */
  preset?: string;
  /** Professional only: e.g. Foundation, Intermediate, Final. */
  level?: string;
  /** Professional only: Completed | Pursuing. */
  status?: string;
  scoreType?: ScoreType | "";
  score?: string;
  /** Certification only: legacy `startDate`, YYYY-MM-DD. */
  startDate?: string;
};

/** One uploaded file, in the legacy `certificateUploads` / `marksheetUploads` shape. */
export type CertificateUpload = { name: string; originalName?: string; type: string; size: number };

/** At most this many files per qualification row. */
export const MAX_CERTIFICATE_UPLOADS = 3;
/** At most this many marksheet files. */
export const MAX_MARKSHEETS = 8;

export type ScoreType = "cgpa" | "percentage";

export type OnboardingDraft = {
  // Step 1: About Me
  firstName?: string;
  lastName?: string;
  /** Optional, as in legacy (which had no bio). */
  bio: string;
  phone?: string;
  /** Emergency contact, stored flat in extra_data like the legacy form. */
  emergencyName?: string;
  emergencyRelation?: string;
  /** Always +91 (legacy rule, INT-40). */
  emergencyCountryCode?: string;
  emergencyPhone: string;
  /** Second point of contact (legacy keys secondPoc*): no longer asked for, kept as stored. */
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
    /** "" until picked (legacy starts blank). */
    qualificationLevel?: string;
    institution: string;
    degree: string;
    branch: string;
    startYear: string;
    /** End (or expected end) year; stored as `endYear`. */
    yearOfGraduation: string;
    /** Completed | Pursuing, "" until picked. */
    status?: string;
    scoreType: ScoreType | "";
    /** The score, CGPA or percentage per `scoreType`; stored as `score`. */
    cgpa: string;
    /** Legacy `marksheetUploads`. Absent from an older client's save. */
    marksheetUploads?: CertificateUpload[];
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

  // Step 8: Preview
  previewSummary?: string;
  /** Asked on the About step (bug sheet 7, NC r25): optional, but all or nothing. */
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
  // Nothing preselected (INT-30): level, status and score type are chosen.
  academics: {
    qualificationLevel: "",
    institution: "",
    degree: "",
    branch: "",
    startYear: "",
    yearOfGraduation: "",
    status: "",
    scoreType: "",
    cgpa: "",
    professional: [],
    certifications: [],
  },
  experiences: [],
  skills: [],
  skillsWithRatings: [],
  // The legacy form's two starting rows.
  languages: [
    { id: "lang-1", language: "Hindi", level: "Native", read: true, write: true, speak: true },
    { id: "lang-2", language: "English", level: "Professional", read: true, write: true, speak: true },
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

/* ── Legacy storage shape ───────────────────────────────────────────────
 * The legacy app owns `intern_onboarding` and both apps share the database:
 *   skills            [{ id, name, rating: 1 | 2 | 3 }]
 *   experience_json   [{ id, type: Internship|Job|Project|Freelancing, company,
 *                        role, from: YYYY-MM-DD, to: YYYY-MM-DD | "Present", description }]
 *   extra.academics   { level: "bachelors"…, degree, specialization, status,
 *                       institution, startYear, endYear, scoreType, score,
 *                       marksheetUploads, professionalCourses, certifications }
 *   extra.languages   [{ id, language: "english"…, level: "native"|"professional"|"basic",
 *                        read/write/speak: "yes" | "no" }]
 *   extra.extracurricular [{ id, activity, level }]  (at most 10)
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

/**
 * The skills a save would store: trimmed, blanks dropped, one per name
 * (case-insensitive, first wins). Ratings come from `skillsWithRatings`;
 * a bare `skills` list rates each one Beginner (legacy default).
 */
export function skillsToStore(input: { skills?: string[]; skillsWithRatings?: SkillWithRating[] }): SkillWithRating[] {
  const rated = input.skillsWithRatings?.length
    ? input.skillsWithRatings
    : (input.skills ?? []).map((name) => ({ name, rating: "Beginner" as const }));
  // A rating list from an older client can carry names the skill list dropped.
  const keep = input.skills && input.skillsWithRatings?.length ? new Set(input.skills.map((s) => s.trim().toLowerCase())) : null;
  const seen = new Set<string>();
  const out: SkillWithRating[] = [];
  for (const s of rated) {
    const name = s.name.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key) || (keep && !keep.has(key))) continue;
    seen.add(key);
    out.push({ name, rating: s.rating });
  }
  return out;
}

/** Any onboarding row (or a projection of one); JSON columns are read defensively. */
export type OnboardingLike = Partial<Omit<OnboardingRow, "skills" | "experienceJson" | "extraData">> & {
  skills?: unknown;
  experienceJson?: unknown;
  extraData?: unknown;
};

/** Legacy experience types; early builds of this app stored others. */
export const EXPERIENCE_TYPES = [
  { value: "Internship", label: "Internship" },
  { value: "Job", label: "Job (full-time or part-time)" },
  { value: "Project", label: "Project" },
  { value: "Freelancing", label: "Freelancing" },
] as const;

export function experienceType(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!key) return "";
  if (key === "internship" || key === "intern") return "Internship";
  if (key === "job" || key === "fulltime" || key === "parttime") return "Job";
  if (key === "project" || key === "projects") return "Project";
  if (key === "freelancing" || key === "freelance" || key === "freelancer") return "Freelancing";
  return raw.trim();
}

/** The legacy language list (stored lowercase). */
export const LANGUAGES = [
  "Hindi",
  "English",
  "Spanish",
  "French",
  "German",
  "Chinese",
  "Japanese",
  "Korean",
  "Arabic",
  "Portuguese",
  "Italian",
  "Russian",
  "Tamil",
  "Telugu",
  "Marathi",
  "Bengali",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Punjabi",
  "Other",
] as const;

export const LANGUAGE_LEVELS: { value: LanguageLevel; label: string }[] = [
  { value: "Native", label: "Native" },
  { value: "Professional", label: "Professional" },
  { value: "Basic", label: "Basic" },
];

/** "english" → "English"; a name outside the list keeps its own spelling. */
function languageLabel(raw: string): string {
  const v = raw.trim();
  return LANGUAGES.find((l) => l.toLowerCase() === v.toLowerCase()) ?? v;
}

/** Legacy has three levels; "conversational" (an early build of this app) reads as Basic. */
function languageLevel(raw: string): LanguageLevel | "" {
  const v = raw.trim().toLowerCase();
  if (v === "native") return "Native";
  if (v === "professional") return "Professional";
  if (v === "basic" || v === "conversational") return "Basic";
  return "";
}

const PRESENT = /^present$/i;

export function draftFromRecord(row: OnboardingLike): Partial<OnboardingDraft> {
  const extra = obj(row.extraData);
  const academics = obj(extra.academics);
  const bank = obj(extra.bankDetails ?? extra.bank);
  const list = (value: unknown): string[] => arr(value).filter((v): v is string => typeof v === "string");

  const experiences: ExperienceEntry[] = arr(Array.isArray(row.experienceJson) ? row.experienceJson : extra.experiences).map(
    (item, i) => {
      const exp = obj(item);
      const to = text(exp.to).trim();
      // Legacy marks a current role with to: "Present" (INT-02); early builds
      // of this app wrote to: "" + current: true.
      const current = PRESENT.test(to) || Boolean(exp.current) || (!to && Boolean(text(exp.from)));
      return {
        id: text(exp.id) || `exp-${i}`,
        type: experienceType(text(exp.type)),
        company: text(exp.company),
        role: text(exp.role),
        from: toDay(text(exp.from)),
        to: current ? "" : toDay(to),
        current,
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
          language: languageLabel(text(l.language)),
          level: languageLevel(text(l.level)),
          read: yes(l.read),
          write: yes(l.write),
          speak: yes(l.speak),
        };
      })
    : structuredClone(BLANK.languages);

  const extracurriculars: ExtracurricularEntry[] = arr(extra.extracurricular ?? extra.extracurriculars).map((item, i) => {
    const e = typeof item === "string" ? { activity: item } : obj(item);
    const level = cap(text(e.level));
    return {
      id: text(e.id) || `extra-${i}`,
      activity: text(e.activity) || text(e.title) || text(e.name),
      level: (RATING_LABEL as readonly string[]).includes(level) ? (level as ExtracurricularEntry["level"]) : "",
      category: text(e.category),
      description: text(e.description),
    };
  });

  const skillsWithRatings = readSkillRatings(row.skills, extra);
  const levelRaw = text(academics.level || academics.qualificationLevel);
  const qualificationLevel = LEVELS.find(([k, v]) => k === levelRaw.toLowerCase() || v === levelRaw)?.[1] ?? levelRaw;
  // The flat `college` / `degree` / `graduationYear` keys are what the seed
  // scripts write; real (legacy and new) rows nest under academics.
  const degree = canonicalDegree(text(academics.degree || extra.degree), qualificationLevel);

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
      qualificationLevel,
      institution: text(academics.institution || extra.college),
      degree,
      branch: text(academics.specialization || academics.branch),
      startYear: text(academics.startYear),
      yearOfGraduation: text(academics.endYear || academics.yearOfGraduation || extra.graduationYear),
      status: text(academics.status),
      scoreType: readScoreType(academics),
      cgpa: text(academics.score || academics.cgpa),
      marksheetUploads: readUploads(academics.marksheetUploads),
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

/** What a save may carry: any subset of the draft, and any subset of academics
 *  (an older cached client does not send the newer academic fields). */
export type DraftInput = Omit<Partial<OnboardingDraft>, "academics"> & {
  academics?: Partial<OnboardingDraft["academics"]>;
};

/** At most this many extracurricular rows are kept (legacy cap). */
export const MAX_EXTRACURRICULARS = 10;

/** Draft fields → legacy columns. Unknown legacy keys already stored are kept. */
export function storedFromDraft(
  draft: DraftInput,
  existing: { skills?: unknown; extraData?: unknown } | null,
): { skills?: unknown[]; experienceJson?: unknown[]; extraPatch: Record<string, unknown> } {
  const prevExtra = obj(existing?.extraData);
  const out: { skills?: unknown[]; experienceJson?: unknown[]; extraPatch: Record<string, unknown> } = { extraPatch: {} };

  if (draft.skillsWithRatings || draft.skills) {
    const prevIds = new Map(arr(existing?.skills).map(obj).map((s) => [text(s.name).toLowerCase(), text(s.id)]));
    out.skills = skillsToStore(draft).map((s, i) => ({
      id: prevIds.get(s.name.toLowerCase()) || `skill-${Date.now()}-${i}`,
      name: s.name,
      rating: RATING_LABEL.indexOf(s.rating) + 1 || 1,
    }));
  }
  if (draft.experiences) {
    // Legacy shape (INT-02): a current role is to: "Present". `current` is
    // kept as well; legacy spreads unknown keys through untouched.
    out.experienceJson = draft.experiences.map(({ id, type, company, role, from, to, description, current }) => ({
      id,
      type: experienceType(type),
      company,
      role,
      from,
      to: current ? "Present" : to,
      description,
      current,
    }));
  }
  if (draft.academics) {
    const a = draft.academics;
    const prev = obj(prevExtra.academics);
    const level = a.qualificationLevel ?? LEVELS.find(([k]) => k === text(prev.level))?.[1] ?? text(prev.level);
    const isPhd = level === "Ph.D";
    const score = isPhd ? "" : (a.cgpa?.trim() ?? text(prev.score));
    out.extraPatch.academics = {
      ...prev,
      level: LEVELS.find(([, v]) => v === level)?.[0] ?? level ?? "",
      degree: a.degree !== undefined ? canonicalDegree(a.degree, level).trim() : text(prev.degree),
      specialization: a.branch ?? text(prev.specialization),
      status: a.status ?? text(prev.status),
      institution: a.institution ?? text(prev.institution),
      startYear: a.startYear ?? text(prev.startYear),
      endYear: a.yearOfGraduation ?? text(prev.endYear),
      score,
      scoreType: a.scoreType || text(prev.scoreType) || (score ? (Number(score) > 10 ? "percentage" : "cgpa") : ""),
      // Legacy keeps `originalName`; the documents page reads `label`.
      ...(a.marksheetUploads
        ? { marksheetUploads: a.marksheetUploads.map((u) => ({ ...u, ...(u.originalName ? { label: u.originalName } : {}) })) }
        : {}),
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
    out.extraPatch.languages = draft.languages
      .filter((l) => l.language.trim())
      .map((l) => ({
        id: l.id,
        language: l.language.trim().toLowerCase(),
        level: l.level.toLowerCase(),
        read: l.read === false ? "no" : "yes",
        write: l.write === false ? "no" : "yes",
        speak: l.speak === false ? "no" : "yes",
      }));
  }
  if (draft.extracurriculars) {
    // Blank rows are never saved; legacy keeps at most ten.
    out.extraPatch.extracurricular = draft.extracurriculars
      .filter((e) => e.activity.trim())
      .slice(0, MAX_EXTRACURRICULARS)
      .map((e) => ({ ...e, activity: e.activity.trim() }));
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
 * Every legacy key on a row is kept; `credentialUrl` (an earlier build of this
 * form asked for it) is carried through. Rows saved while this form asked for
 * a bare `year` read as 1 January of that year. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(raw: unknown, year?: unknown): string {
  const v = text(raw);
  if (ISO_DATE.test(v.slice(0, 10))) return v.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  const y = text(year) || (/^\d{4}$/.test(v) ? v : "");
  return /^\d{4}$/.test(y) ? `${y}-01-01` : "";
}

export const PROFESSIONAL_PRESETS = ["CA", "CS", "CMA", "CFA"] as const;

function readProfessional(c: Record<string, unknown>, i: number): QualificationEntry {
  const raw = text(c.courseNamePreset);
  const preset = (PROFESSIONAL_PRESETS as readonly string[]).includes(raw) ? raw : raw === "Other" || text(c.courseNameOther) ? "Other" : "";
  const name = preset && preset !== "Other" ? preset : text(c.courseNameOther);
  const scoreType = text(c.scoreType).toLowerCase();
  return {
    id: text(c.id) || `prof-${i}`,
    preset,
    name,
    level: text(c.level),
    status: text(c.status),
    issuer: text(c.institution),
    completionDate: readDate(c.completionDate, c.year),
    scoreType: scoreType === "cgpa" || scoreType === "percentage" ? scoreType : "",
    score: text(c.score),
    credentialUrl: text(c.credentialUrl),
    uploads: readUploads(c.certificateUploads),
  };
}

function writeProfessional(q: QualificationEntry, prev: Record<string, unknown>): Record<string, unknown> {
  const name = q.name.trim();
  const preset = q.preset && q.preset !== "Other" ? q.preset : PROFESSIONAL_PRESETS.find((p) => p.toLowerCase() === name.toLowerCase());
  const status = q.status ?? text(prev.status);
  return {
    ...prev,
    id: q.id,
    courseNamePreset: preset ?? (name ? "Other" : ""),
    courseNameOther: preset ? "" : name,
    level: (q.level ?? text(prev.level)).trim(),
    institution: q.issuer.trim(),
    status,
    // Legacy clears the date while the course is still being pursued.
    completionDate: status === "Pursuing" ? "" : q.completionDate.trim(),
    scoreType: q.scoreType || text(prev.scoreType) || "percentage",
    score: (q.score ?? text(prev.score)).trim(),
    certificateUploads: q.uploads ?? arr(prev.certificateUploads),
    credentialUrl: q.credentialUrl.trim(),
  };
}

function readCertification(c: Record<string, unknown>, i: number): QualificationEntry {
  return {
    id: text(c.id) || `cert-${i}`,
    name: text(c.certificateName),
    issuer: text(c.institution),
    startDate: readDate(c.startDate),
    completionDate: readDate(c.endDate, c.year),
    credentialUrl: text(c.credentialUrl),
    uploads: readUploads(c.certificateUploads),
  };
}

function writeCertification(q: QualificationEntry, prev: Record<string, unknown>): Record<string, unknown> {
  return {
    ...prev,
    id: q.id,
    certificateName: q.name.trim(),
    institution: q.issuer.trim(),
    startDate: (q.startDate ?? text(prev.startDate)).trim(),
    endDate: q.completionDate.trim(),
    certificateUploads: q.uploads ?? arr(prev.certificateUploads),
    credentialUrl: q.credentialUrl.trim(),
  };
}

const ROW_KEYS = ["name", "issuer", "completionDate", "credentialUrl", "preset", "level", "status", "scoreType", "score", "startDate"] as const;

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
    const same =
      ROW_KEYS.every((k) => q[k] === undefined || (before[k] ?? "") === q[k]) &&
      (q.uploads === undefined || JSON.stringify(before.uploads) === JSON.stringify(q.uploads));
    return same ? prevRows[i] : write(q, prevRows[i]);
  });
}

function readUploads(raw: unknown): CertificateUpload[] {
  return arr(raw).flatMap((u) => {
    if (!u || typeof u !== "object") return [];
    const r = u as Record<string, unknown>;
    const name = text(r.name);
    if (!name) return [];
    const originalName = text(r.originalName) || text(r.label);
    return [{ name, ...(originalName ? { originalName } : {}), type: text(r.type), size: Number(r.size) || 0 }];
  });
}

/** Every certificate file on a stored academics object, labelled by its row. */
export function certificateFiles(academics: unknown): (CertificateUpload & { label: string })[] {
  const a = obj(academics);
  const out: (CertificateUpload & { label: string })[] = [];
  arr(a.professionalCourses).map(obj).forEach((c, i) => {
    const row = readProfessional(c, i);
    for (const u of row.uploads ?? []) out.push({ ...u, label: `${row.name || "Professional course"} certificate` });
  });
  arr(a.certifications).map(obj).forEach((c, i) => {
    const row = readCertification(c, i);
    for (const u of row.uploads ?? []) out.push({ ...u, label: `${row.name || "Certification"} certificate` });
  });
  return out;
}

/** Stored file keys on an academics object: marksheets and certificates. */
export function storedFileNames(academics: unknown): Set<string> {
  const a = obj(academics);
  const names = new Set<string>();
  for (const u of readUploads(a.marksheetUploads)) names.add(u.name);
  for (const u of certificateFiles(a)) names.add(u.name);
  return names;
}

function readScoreType(academics: Record<string, unknown>): ScoreType | "" {
  const t = text(academics.scoreType).toLowerCase();
  if (t === "percentage" || t === "cgpa") return t;
  const score = text(academics.score || academics.cgpa);
  if (!score) return "";
  return Number(score) > 10 ? "percentage" : "cgpa";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Month form of a date, `YYYY-MM`. Early builds of this app took free text
 * like "Jan 2025"; that is read into the same shape, and anything unreadable
 * is kept as typed.
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
  const slash = /^(\d{1,2})\/(\d{4})$/.exec(v);
  if (slash) return `${slash[2]}-${slash[1].padStart(2, "0")}`;
  return v;
}

/**
 * Experience dates are full days, YYYY-MM-DD (the legacy calendar; shown
 * DD/MM/YYYY). Rows saved as a month ("2025-01", "Jan 2025", "01/2025") read
 * as the 1st of that month, so nobody has to enter them again.
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

/** A real calendar day in YYYY-MM-DD (rejects 31/02). */
export function isRealDay(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/* ── Option lists ──────────────────────────────────────────────────────── */

/** Qualification levels offered for new entries (legacy list). "High School"
 *  is still read (legacy `12th`) and shown only to someone who has it saved. */
export const QUALIFICATION_LEVELS = [
  { value: "Diploma", label: "Diploma" },
  { value: "Bachelor's", label: "Bachelor's" },
  { value: "Master's", label: "Master's" },
  { value: "Ph.D", label: "Ph.D" },
] as const;

/**
 * Degree names per level, exactly as the legacy form lists (and stores) them
 * (INT-18). Diploma and Ph.D are typed in.
 */
export const DEGREES_BY_LEVEL: Record<string, string[]> = {
  "Bachelor's": ["BA", "B.Com", "BBA", "BMS", "BSc", "B.Tech", "BCA", "MBBS", "BDS", "B.Pharm", "BAMS/BHMS", "LLB", "B.Des", "BFA", "B.Ed"],
  "Master's": ["MBA", "PGDM", "M.Com", "MSc", "MS", "MA", "M.Des", "MFA", "LLM", "MCA", "MPH", "M.Ed", "MSW"],
};

/** Spellings earlier builds and free text used, keyed like `degreeKey`. */
const DEGREE_ALIASES: Record<string, string> = {
  be: "B.Tech",
  btechbe: "B.Tech",
  bachelorofengineering: "B.Tech",
  bacheloroftechnology: "B.Tech",
  bachelorofscience: "BSc",
  bachelorofarts: "BA",
  bachelorofcommerce: "B.Com",
  masterofbusinessadministration: "MBA",
  masterofscience: "MSc",
  masterofarts: "MA",
  bams: "BAMS/BHMS",
  bhms: "BAMS/BHMS",
};

const degreeKey = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");

/** Whether a level picks its degree from a list (Bachelor's, Master's). */
export function levelHasDegreeList(level: string | undefined): boolean {
  return Boolean(level && DEGREES_BY_LEVEL[level]);
}

/**
 * The dropdown option a stored degree belongs to, for a level with a list: a
 * list value, "Other", or "" when blank. Levels without a list return the
 * text as typed.
 */
export function degreeOption(degree: string, level = "Bachelor's"): string {
  const key = degreeKey(degree);
  if (!key) return "";
  const options = DEGREES_BY_LEVEL[level];
  if (!options) return degree;
  const alias = DEGREE_ALIASES[key];
  return options.find((d) => degreeKey(d) === key || d === alias) ?? "Other";
}

/** A degree in the legacy spelling when it matches the level's list, else as typed. */
export function canonicalDegree(degree: string, level: string | undefined): string {
  if (!level || !DEGREES_BY_LEVEL[level]) return degree;
  const option = degreeOption(degree, level);
  return option && option !== "Other" ? option : degree;
}

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

/** A preferred city typed in by hand must say its state (legacy rule, INT-30). */
export const CUSTOM_CITY = /^[^,]{2,},\s*[^,]{2,}$/;

/* ── Validation ─────────────────────────────────────────────────────────
 * One rule set for the browser (per step, on Continue and live once a field
 * is touched) and the server (all steps, on final submit and on every save
 * once a profile is submitted; see `isOnboarded`). Keys are the form's field
 * ids, so the client can put each message under the field it is about.
 * First-time drafts are never blocked on completeness - only a value that is
 * present and impossible (a CGPA of 12) is refused; see `formatProblems`. */

export type ValidationContext = {
  /** A PAN card image is on file (uploaded now or earlier). */
  hasPanImage: boolean;
  /** An Aadhaar card image is on file (uploaded now or earlier). */
  hasAadhaarImage: boolean;
  /**
   * The account's own number. The emergency contact cannot repeat it, and
   * on submit it has to be a valid number (INT-39): `null` means the account
   * has none. Leave it out to skip both checks.
   */
  ownPhone?: { countryCode: string; phoneNumber: string } | null;
  /** A profile photo is on file (uploaded now or earlier). */
  hasPhoto?: boolean;
  /** The Aadhaar number already stored. Legacy rows can hold one starting 0
   *  or 1; it is not re-judged on every save, only a newly typed one is. */
  storedAadhaar?: string;
  now?: Date;
};

/** Maximum key skills (legacy client cap, enforced by the API too). */
export const MAX_SKILLS = 7;
/** Minimum key skills: the step, the dashboard meter and the payment gate agree. */
export const MIN_SKILLS = 4;

export type ValidationErrors = Record<string, string>;

const AADHAAR = /^[2-9]\d{11}$/;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const YEAR = /^\d{4}$/;
/** Legacy pattern, plus the country subdomains LinkedIn hands out (in.linkedin.com). */
const LINKEDIN = /^(https?:\/\/)?([a-z]{2,3}\.)?(www\.)?linkedin\.com\/\S+$/i;

export function scoreProblem(type: ScoreType | "", raw: string): string | null {
  const v = raw.trim().replace(/%$/, "");
  if (!v) return null;
  const n = Number(v);
  if (!/^\d+(\.\d+)?$/.test(v) || !Number.isFinite(n)) return "Enter a number, like 8.4 or 84.";
  if (type === "cgpa" && n > 10) return "CGPA is out of 10 - enter a value from 0 to 10.";
  if (type !== "cgpa" && n > 100) return "Percentage cannot be more than 100.";
  return null;
}

/** A date field: required, a real day, not after today, not before 1950. */
function dayProblem(value: string, today: string, what: string): string | null {
  const v = value.trim();
  if (!v) return `Enter the ${what} as DD/MM/YYYY.`;
  if (!isRealDay(v)) return "Enter a real date as DD/MM/YYYY.";
  if (v > today) return `The ${what} cannot be in the future.`;
  if (v < "1950-01-01") return `Check the ${what}.`;
  return null;
}

function professionalErrors(rows: QualificationEntry[], today: string, out: ValidationErrors) {
  for (const q of rows) {
    const k = `professional.${q.id}`;
    if (!q.preset) out[`${k}.preset`] = "Choose the course.";
    else if (q.preset === "Other" && !q.name.trim()) out[`${k}.name`] = "Enter the name of the course.";
    if (!(q.level ?? "").trim()) out[`${k}.level`] = "Enter the level, like Foundation or Final.";
    if (!q.status) out[`${k}.status`] = "Choose completed or pursuing.";
    if (!q.issuer.trim()) out[`${k}.issuer`] = "Enter the institute.";
    if (q.status === "Completed") {
      const date = dayProblem(q.completionDate, today, "completion date");
      if (date) out[`${k}.completionDate`] = date;
      const score = (q.score ?? "").trim();
      if (!score) out[`${k}.score`] = "Enter your score.";
      else {
        const bad = scoreProblem(q.scoreType || "percentage", score);
        if (bad) out[`${k}.score`] = bad;
      }
    }
  }
}

function certificationErrors(rows: QualificationEntry[], today: string, out: ValidationErrors) {
  for (const q of rows) {
    const k = `certifications.${q.id}`;
    if (!q.name.trim()) out[`${k}.name`] = "Enter the name of the certificate.";
    if (!q.issuer.trim()) out[`${k}.issuer`] = "Enter who issued it.";
    const start = dayProblem(q.startDate ?? "", today, "start date");
    if (start) out[`${k}.startDate`] = start;
    const end = dayProblem(q.completionDate, today, "end date");
    if (end) out[`${k}.completionDate`] = end;
    else if (!start && (q.startDate ?? "") > q.completionDate) out[`${k}.completionDate`] = "The end date cannot be before the start date.";
  }
}

export function validateStep(values: OnboardingDraft, step: number, ctx: ValidationContext): ValidationErrors {
  const errors: ValidationErrors = {};
  const now = ctx.now ?? new Date();
  const thisYear = now.getFullYear();
  const today = `${thisYear}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (step === 0) {
    // Required again, as in legacy (onboarding.tsx:793): employers shortlist
    // on the card, and the card leads with the face.
    if (!ctx.hasPhoto && !(values.photoUrl ?? "").startsWith("/api/intern/avatar")) {
      errors.photo = "Upload a clear, front-facing profile photo.";
    }
    // Bio is optional (legacy had none; INT-20). Nothing to check.
    const linkedin = (values.linkedinUrl ?? "").trim();
    // Optional (bug sheet 21 Oct); a link that is given must be a LinkedIn one.
    if (linkedin && !LINKEDIN.test(linkedin)) errors.linkedinUrl = "Enter your LinkedIn profile link, like linkedin.com/in/your-name.";
    if (!(values.state ?? "").trim()) errors.state = "Choose the state you live in.";
    if (!(values.city ?? "").trim()) errors.city = "Choose the city you live in.";
    if (!values.pinCode) errors.pinCode = "Enter your 6-digit PIN code.";
    else if (!/^\d{6}$/.test(values.pinCode)) errors.pinCode = "PIN code must be 6 digits.";

    const aadhaar = (values.aadhaarNumber ?? "").replace(/\s/g, "");
    if (!aadhaar) errors.aadhaarNumber = "Aadhaar number is required.";
    else if (!/^\d{12}$/.test(aadhaar)) errors.aadhaarNumber = `Aadhaar number must be 12 digits - you entered ${aadhaar.length}.`;
    else if (!AADHAAR.test(aadhaar) && aadhaar !== (ctx.storedAadhaar ?? "").replace(/\s/g, "")) {
      errors.aadhaarNumber = "Aadhaar numbers never start with 0 or 1. Check the number.";
    }
    // Mandatory again (bug sheet 7, NC r18).
    if (!ctx.hasAadhaarImage) errors.aadhaarImage = "Upload a photo or scan of your Aadhaar card.";

    const pan = (values.panNumber ?? "").trim();
    if (!pan) errors.panNumber = "PAN is required for stipend payouts.";
    else if (!PAN.test(pan)) errors.panNumber = "PAN must look like ABCDE1234F - 5 letters, 4 digits, 1 letter.";
    if (!ctx.hasPanImage) errors.panImage = "Upload a photo or scan of your PAN card.";

    // The account's own number (INT-39): legacy would not finish onboarding
    // without a valid one. It is changed from Settings, not here.
    if (ctx.ownPhone === null) errors.ownPhone = "Your account has no mobile number. Add one in Settings.";
    else if (ctx.ownPhone) {
      const p = phoneError(ctx.ownPhone.countryCode || "+91", ctx.ownPhone.phoneNumber);
      if (p) errors.ownPhone = `Your account number is not valid (${p.toLowerCase()}). Update it in Settings.`;
    }

    // Only the number is asked for (bug sheet 23 Oct): no name, no relation,
    // no second contact. Indian numbers only, as in legacy (INT-40).
    const ePhone = (values.emergencyPhone ?? "").trim();
    if (!ePhone) errors.emergencyPhone = "Enter an emergency contact number.";
    else if ((values.emergencyCountryCode || "+91") !== "+91") errors.emergencyPhone = "The emergency contact must be an Indian (+91) number.";
    else {
      const p = phoneError("+91", ePhone);
      if (p) errors.emergencyPhone = `${p}.`;
      else if (
        ctx.ownPhone &&
        (ctx.ownPhone.countryCode || "+91") === "+91" &&
        ePhone.replace(/\D/g, "") === ctx.ownPhone.phoneNumber.replace(/\D/g, "")
      ) {
        // Legacy rule (onboarding.tsx:706): it has to reach someone else.
        errors.emergencyPhone = "Use someone else's number - this is your own.";
      }
    }

    // Bank details: optional here (they can wait for Settings), but once any
    // field is filled in, all of it has to be right (NC r25).
    if (bankStarted(values.bank)) Object.assign(errors, bankErrors(values.bank));
  }

  if (step === 1) {
    const a = values.academics;
    const level = a.qualificationLevel ?? "";
    if (!level) errors.qualificationLevel = "Choose your highest qualification.";
    if (!a.status) errors.academicStatus = "Choose completed or pursuing.";
    if (!a.institution.trim()) errors.institution = "Enter your college or university.";
    if (levelHasDegreeList(level)) {
      const option = degreeOption(a.degree, level);
      if (!option) errors.degree = "Choose your degree.";
      else if (a.degree.trim().toLowerCase() === "other") errors.degree = "Type the name of your degree.";
    } else if (level && !a.degree.trim()) {
      // With no level yet, the level's own message is the one to act on.
      errors.degree = level === "Ph.D" ? "Enter your Ph.D subject." : "Enter the name of your diploma.";
    }
    // Specialization is optional (bug sheet 23 Oct).

    // Legacy year rules (INT-17): start not after this year; a completed
    // degree needs an end year no later than this year; while pursuing the
    // end year is optional, this year to six years on; start before end.
    const start = a.startYear.trim();
    const end = a.yearOfGraduation.trim();
    const completed = a.status === "Completed";
    if (!YEAR.test(start)) errors.startYear = "Enter the year you started, like 2022.";
    else if (Number(start) > thisYear) errors.startYear = `The start year cannot be after ${thisYear}.`;
    else if (Number(start) < 1970) errors.startYear = "Check the start year.";

    if (!end) {
      if (completed) errors.yearOfGraduation = "Enter the year you finished.";
    } else if (!YEAR.test(end)) errors.yearOfGraduation = "Enter a year, like 2026.";
    else if (completed && Number(end) > thisYear) errors.yearOfGraduation = `You marked this as completed, so the end year cannot be after ${thisYear}.`;
    else if (!completed && Number(end) < thisYear) errors.yearOfGraduation = `Still pursuing, so the end year cannot be before ${thisYear}.`;
    else if (!completed && Number(end) > thisYear + 6) errors.yearOfGraduation = `The end year can be at most ${thisYear + 6}.`;
    else if (YEAR.test(start) && Number(end) <= Number(start)) errors.yearOfGraduation = "The end year must be after the start year.";

    // Score: required once completed, never for a Ph.D (legacy).
    if (level !== "Ph.D") {
      const score = a.cgpa.trim();
      if (score && !a.scoreType) errors.scoreType = "Choose CGPA or percentage.";
      else if (score) {
        const bad = scoreProblem(a.scoreType, score);
        if (bad) errors.cgpa = bad;
      } else if (completed) {
        if (!a.scoreType) errors.scoreType = "Choose CGPA or percentage.";
        errors.cgpa = "Enter your final score.";
      }
    }

    professionalErrors(a.professional ?? [], today, errors);
    certificationErrors(a.certifications ?? [], today, errors);
  }

  if (step === 2) {
    for (const exp of values.experiences ?? []) {
      const k = `exp.${exp.id}`;
      if (!exp.type) errors[`${k}.type`] = "Choose the type of experience.";
      if (!exp.company.trim()) errors[`${k}.company`] = exp.type === "Project" ? "Enter the organisation, college or client." : "Enter the company name.";
      if (!exp.role.trim()) errors[`${k}.role`] = "Enter your role or title.";
      const from = dayProblem(exp.from, today, "start date");
      if (from) errors[`${k}.from`] = from;
      if (!exp.current) {
        const to = dayProblem(exp.to, today, "end date");
        if (to) errors[`${k}.to`] = exp.to.trim() ? to : "Enter the end date, or tick \"I currently work here\".";
        else if (!from && exp.to < exp.from) errors[`${k}.to`] = "The end date cannot be before the start date.";
      }
      // Legacy: required, any length.
      if (!exp.description.trim()) errors[`${k}.description`] = "Describe what you did in a sentence or two.";
    }
  }

  if (step === 3) {
    const count = skillsToStore(values).length;
    if (count < MIN_SKILLS) errors.skills = `Add at least ${MIN_SKILLS} key skills (up to ${MAX_SKILLS}).`;
    else if (count > MAX_SKILLS) errors.skills = `Pick at most ${MAX_SKILLS} key skills.`;
  }

  if (step === 4) {
    const langs = values.languages ?? [];
    if (langs.length === 0) errors.languages = "Add at least one language.";
    const seen = new Set<string>();
    for (const l of langs) {
      const k = `lang.${l.id}`;
      const name = l.language.trim().toLowerCase();
      if (!name) errors[`${k}.language`] = "Choose a language.";
      else if (name !== "other" && seen.has(name)) errors[`${k}.language`] = "This language is already listed.";
      seen.add(name);
      if (!l.level) errors[`${k}.level`] = "Choose a level.";
    }
  }

  if (step === 5) {
    const rows = values.extracurriculars ?? [];
    if (rows.length > MAX_EXTRACURRICULARS) errors.extracurriculars = `Add at most ${MAX_EXTRACURRICULARS} activities.`;
    for (const e of rows) {
      const k = `act.${e.id}`;
      if (!e.activity.trim()) errors[`${k}.activity`] = "Name the activity, or remove this row.";
      if (!e.level) errors[`${k}.level`] = "Choose a level.";
    }
  }

  if (step === 6) {
    const modes = workModes(values.locationTypes ?? []);
    const cities = (values.preferredLocations ?? []).filter((c) => c.trim());
    if (modes.length === 0) errors.locationTypes = "Pick a work mode.";
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
export const VALIDATED_STEPS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** Every step's rules; the first failing step is where the form sends the candidate. */
export function validateProfile(values: OnboardingDraft, ctx: ValidationContext): { step: number; errors: ValidationErrors } | null {
  for (const step of VALIDATED_STEPS) {
    const errors = validateStep(values, step, ctx);
    if (Object.keys(errors).length > 0) return { step, errors };
  }
  return null;
}

/** The first step (from 0) whose rules fail, or `steps` when all pass. */
export function firstOpenStep(values: OnboardingDraft, ctx: ValidationContext, steps: number): number {
  for (let s = 0; s < steps; s++) {
    if (Object.keys(validateStep(values, s, ctx)).length > 0) return s;
  }
  return steps;
}

/** Values that are present and impossible. Checked on every save, drafts included. */
export function formatProblems(values: DraftInput): string | null {
  const a = values.academics;
  if (a) {
    const score = scoreProblem(a.scoreType ?? "", a.cgpa ?? "");
    if (score) return score;
  }
  return null;
}

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Any bank field filled in. */
export function bankStarted(bank: Partial<OnboardingDraft["bank"]> | undefined): boolean {
  return Boolean(bank && Object.values(bank).some((v) => typeof v === "string" && v.trim()));
}

/** Bank details, field by field; keys are the About Me step's field ids. */
export function bankErrors(bank: Partial<OnboardingDraft["bank"]>): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!(bank.accountHolderName ?? "").trim()) errors.bankAccountHolderName = "Enter the account holder's name.";
  if (!(bank.bankName ?? "").trim() || bank.bankName?.trim().toLowerCase() === "other") errors.bankName = "Choose your bank, or type its name.";
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

/* ── Profile completion (dashboard checklist and the payment gate) ──────── */

export type CompletionItem = { id: string; label: string; done: boolean; href: string };

/**
 * What "profile complete" means for the dashboard and for the activation
 * payment (`profile-complete.ts`): the same required fields the form
 * enforces, read from the stored row. Kept loose on format (that is the
 * form's job) - this only answers "is it filled in".
 */
export type CompletionDocs = {
  hasPanImage: boolean;
  /** An Aadhaar card image is on file (mandatory again, NC r18). */
  hasAadhaarImage?: boolean;
  /** A profile photo is on file. */
  hasPhoto?: boolean;
};

/** The academics fields the form requires, filled in (legacy rules, INT-17). */
function academicsFilled(a: OnboardingDraft["academics"] | undefined): boolean {
  if (!a) return false;
  const completed = a.status === "Completed";
  const needsScore = completed && a.qualificationLevel !== "Ph.D";
  return Boolean(
    a.qualificationLevel &&
      a.status &&
      a.institution &&
      a.degree &&
      a.startYear &&
      (!completed || a.yearOfGraduation) &&
      (!needsScore || a.cgpa),
  );
}

export function profileCompletion(row: OnboardingLike | null, docs: boolean | CompletionDocs): { items: CompletionItem[]; done: number; total: number; complete: boolean } {
  const { hasPanImage, hasAadhaarImage = false, hasPhoto = false } = typeof docs === "boolean" ? { hasPanImage: docs } : docs;
  const d = row ? draftFromRecord(row) : null;
  const extra = obj(row?.extraData);
  const modes = d?.locationTypes ?? [];
  const needsCities = modes.includes("onsite") || modes.includes("hybrid");
  const form = "/intern/onboarding";
  const items: CompletionItem[] = [
    { id: "photo", label: "Profile photo", done: hasPhoto, href: form },
    // Bio is optional (INT-20): legacy had none, and the dashboard meter says so.
    { id: "about", label: "Your address", done: Boolean(d && d.city && d.state && d.pinCode), href: form },
    // Both numbers and both card images (bug sheet 7, NC r18). A marksheet is optional.
    {
      id: "identity",
      label: "Aadhaar and PAN, with card images",
      done: Boolean(d?.aadhaarNumber && d?.panNumber && hasPanImage && hasAadhaarImage),
      href: form,
    },
    { id: "emergency", label: "Emergency contact", done: Boolean(d?.emergencyPhone), href: form },
    { id: "academics", label: "Academics", done: academicsFilled(d?.academics), href: form },
    { id: "skills", label: `At least ${MIN_SKILLS} skills`, done: (d?.skills?.length ?? 0) >= MIN_SKILLS, href: form },
    // Languages and laptop: legacy checklist items (dashboard.tsx:500-553).
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

/**
 * Whether a stored profile counts as submitted, so a save must not leave it
 * incomplete (INT-04).
 *
 * Legacy only wrote the row on Finish, after every step validated; this app
 * also lets a first-time intern save a draft to the row. That draft is not
 * visible to anyone: employers only see interns with an AI interview score,
 * staff approval and open-to-work on (`employer-pool.ts`), and the interview
 * needs the activation payment, which needs a complete profile. Once the
 * profile has been submitted here, is complete, or is scored (legacy rows),
 * every profile save has to pass the full rules instead.
 */
export function isOnboarded(row: OnboardingLike | null, docs: CompletionDocs): boolean {
  if (!row) return false;
  const extra = obj(row.extraData);
  if (typeof extra.profileSubmittedAt === "string" && extra.profileSubmittedAt) return true;
  const score = Number(extra.findternScore);
  const interview = Number(obj(extra.ratings).interview);
  if ((Number.isFinite(score) && score > 0) || (Number.isFinite(interview) && interview > 0)) return true;
  return profileCompletion(row, docs).complete;
}
