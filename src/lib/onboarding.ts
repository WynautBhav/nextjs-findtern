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
  photoUrl?: string;

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
  photoUrl: "",
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
export function draftFromRecord(row: OnboardingRow): Partial<OnboardingDraft> {
  const extra = (row.extraData ?? {}) as Record<string, unknown>;
  const academics = (extra.academics ?? {}) as Record<string, unknown>;
  const bank = (extra.bankDetails ?? {}) as Record<string, unknown>;

  const text = (value: unknown): string => (typeof value === "string" ? value : "");
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

  // Parse experiences
  const rawExp = Array.isArray(row.experienceJson)
    ? row.experienceJson
    : Array.isArray(extra.experiences)
    ? extra.experiences
    : [];
  const experiences: ExperienceEntry[] = rawExp.map((item, i) => {
    const exp = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    return {
      id: text(exp.id) || `exp-${i}`,
      type: text(exp.type) || "Internship",
      company: text(exp.company),
      role: text(exp.role),
      from: text(exp.from),
      to: text(exp.to),
      current: Boolean(exp.current),
      description: text(exp.description),
    };
  });

  // Parse languages
  const rawLang = Array.isArray(extra.languages) ? extra.languages : [];
  const languages: LanguageEntry[] = rawLang.length > 0
    ? rawLang.map((item, i) => {
        const l = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
        return {
          id: text(l.id) || `lang-${i}`,
          language: text(l.language),
          level: (typeof l.level === "string" ? l.level : "Professional") as LanguageEntry["level"],
          read: l.read !== false,
          write: l.write !== false,
          speak: l.speak !== false,
        };
      })
    : BLANK.languages;

  // Parse extracurriculars
  const rawExtra = Array.isArray(extra.extracurriculars) ? extra.extracurriculars : [];
  const extracurriculars: ExtracurricularEntry[] = rawExtra.map((item, i) => {
    const e = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    return {
      id: text(e.id) || `extra-${i}`,
      activity: text(e.activity),
      level: (typeof e.level === "string" ? e.level : "Intermediate") as ExtracurricularEntry["level"],
      category: text(e.category),
      description: text(e.description),
    };
  });

  // Parse skills with ratings
  const baseSkills = list(row.skills);
  const rawSkillRatings = Array.isArray(extra.skillsWithRatings) ? extra.skillsWithRatings : [];
  const ratingMap = new Map<string, "Beginner" | "Intermediate" | "Advanced">();
  for (const item of rawSkillRatings) {
    if (typeof item === "object" && item !== null) {
      const rec = item as Record<string, unknown>;
      if (typeof rec.name === "string" && typeof rec.rating === "string") {
        ratingMap.set(rec.name.toLowerCase(), rec.rating as "Beginner" | "Intermediate" | "Advanced");
      }
    }
  }
  const skillsWithRatings: SkillWithRating[] = baseSkills.map((name) => ({
    name,
    rating: ratingMap.get(name.toLowerCase()) || "Intermediate",
  }));

  return {
    bio: text(row.bio),
    linkedinUrl: text(row.linkedinUrl),
    city: text(row.city),
    state: text(row.state),
    pinCode: text(row.pinCode),
    aadhaarNumber: text(row.aadhaarNumber || extra.aadhaarNumber),
    photoUrl: text(extra.photoUrl),
    emergencyPhone: text(extra.emergencyPhone),
    previewSummary: text(row.previewSummary),
    academics: {
      qualificationLevel: text(academics.qualificationLevel) || "Bachelor's",
      institution: text(academics.institution),
      degree: text(academics.degree),
      branch: text(academics.branch),
      yearOfGraduation: text(academics.yearOfGraduation),
      status: text(academics.status) || "Pursuing",
      cgpa: text(academics.cgpa),
    },
    experiences,
    skills: baseSkills,
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