import type { internOnboarding } from "@/lib/db/schema";

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

export type OnboardingDraft = {
  // Step 1: About Me
  firstName?: string;
  lastName?: string;
  bio: string;
  phone?: string;
  emergencyPhone: string;
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
    yearOfGraduation: string;
    status?: string;
    cgpa: string;
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
  emergencyPhone: "",
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
    yearOfGraduation: "",
    status: "Pursuing",
    cgpa: "",
  },
  experiences: [],
  skills: [],
  skillsWithRatings: [],
  languages: [
    { id: "lang-1", language: "English", level: "Professional", read: true, write: true, speak: true },
    { id: "lang-2", language: "Hindi", level: "Native", read: true, write: true, speak: true },
  ],
  extracurriculars: [],
  locationTypes: ["remote"],
  preferredLocations: [],
  hasLaptop: true,
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
        from: text(exp.from),
        to: text(exp.to),
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
    photoUrl: text(extra.photoUrl),
    emergencyPhone: text(extra.emergencyPhone),
    ndaAccepted: Boolean(extra.ndaAcceptedAt),
    previewSummary: text(row.previewSummary),
    academics: {
      qualificationLevel: LEVELS.find(([k, v]) => k === level.toLowerCase() || v === level)?.[1] ?? (level || "Bachelor's"),
      institution: text(academics.institution),
      degree: text(academics.degree),
      branch: text(academics.specialization || academics.branch),
      yearOfGraduation: text(academics.endYear || academics.yearOfGraduation),
      status: text(academics.status) || "Pursuing",
      cgpa: text(academics.score || academics.cgpa),
    },
    experiences,
    skills: skillsWithRatings.map((s) => s.name),
    skillsWithRatings,
    languages,
    extracurriculars,
    locationTypes: list(row.locationTypes),
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
export function storedFromDraft(
  draft: Partial<OnboardingDraft>,
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
      degree: a.degree,
      specialization: a.branch,
      status: a.status ?? "Pursuing",
      institution: a.institution,
      endYear: a.yearOfGraduation,
      score,
      scoreType: text(prev.scoreType) || (Number(score) > 10 ? "percentage" : "cgpa"),
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
