import type { internOnboarding, users } from "@/lib/db/schema";

/**
 * Reading an intern profile out of `users` + `intern_onboarding`.
 *
 * The profile is split across two tables, and most of the interesting parts
 * live in the free-form `extra_data` bag because `intern_onboarding` has no
 * columns for them - that is where the legacy server read them too
 * (`extra.findternScore`, `extra.ratings`, `extra.academics`). Every employer
 * screen needs the same handful of things - name, score, skills, academics,
 * ratings, courses - so the assembly happens here once instead of being
 * re-derived, slightly differently, on each page.
 *
 * Nothing here is defensive for its own sake: `extra_data` is `jsonb` written
 * by a form, so every field can legitimately be missing, null, or the wrong
 * type. Every read below tolerates that and yields "" / 0 / [] rather than
 * throwing mid-render.
 */

type UserRow = typeof users.$inferSelect;
type OnboardingRow = typeof internOnboarding.$inferSelect;

export type Ratings = {
  communication: number;
  coding: number;
  aptitude: number;
  interview: number;
};

export const RATING_META: readonly { key: keyof Ratings; label: string }[] = [
  { key: "communication", label: "Communication" },
  { key: "coding", label: "Coding" },
  { key: "aptitude", label: "Aptitude" },
  { key: "interview", label: "AI interview" },
];

export type Course = {
  name: string;
  institution: string;
  level: string;
  completed: string;
  score: string;
};

export type Academics = {
  institution: string;
  degree: string;
  specialization: string;
  level: string;
  startYear: string;
  endYear: string;
  status: string;
  score: string;
  scoreType: string;
  courses: Course[];
};

export type CandidateProfile = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  initials: string;
  email: string;
  city: string;
  state: string;
  /** "Bengaluru, Karnataka" - or just whichever half is filled in. */
  location: string;
  bio: string;
  linkedinUrl: string;
  skills: string[];
  /** Findtern Score, out of 10. Zero when the intern has not been scored. */
  score: number;
  /** False when `extra_data.findternScore` was absent - zero is a real score. */
  scored: boolean;
  ratings: Ratings;
  academics: Academics | null;
  workModes: string[];
  preferredLocations: string[];
  hasLaptop: boolean | null;
  updatedAt: Date | null;
  aiFeedbackLink?: string | null;
  aiRecordingLink?: string | null;
  /**
   * The avatar route for this candidate, or null when there is no photo.
   * `attachPhotos` (lib/employer-pool) sets it for an uploaded one, which
   * needs the documents table.
   */
  photoUrl?: string | null;
};

export const MODE_LABEL: Record<string, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

/**
 * The slice of a candidate that is safe to show any signed-in employer.
 *
 * `name` is the redacted display name (initials until hire - see
 * `displayNameOf`). Deliberately excludes Aadhaar,
 * PAN, bank details and the uploaded documents - see `guards.ts` for why those
 * needed a cross-tenant check in the first place.
 */
export type CandidateSummary = {
  id: string;
  name: string;
  initials: string;
  location: string;
  score: number;
  scored: boolean;
  skills: string[];
  ratings: Ratings;
};

export function initialsOf(first: string, last: string): string {
  // Port of the legacy `getInitialsFromName`: first letter of first and last
  // name, falling back to the first two letters of a single name ("Aarav" →
  // "AA") so the avatar code is always two characters like production (HP, AK).
  const f = first.trim();
  const l = last.trim();
  const a = f.charAt(0);
  const b = l ? l.charAt(0) : f.length > 1 ? f.charAt(1) : "";
  return `${a}${b}`.toUpperCase() || "?";
}

/**
 * What one employer is allowed to call a candidate.
 *
 * Initials everywhere, full name only after that employer hired them
 * (proposal status `hired`) - the port of the legacy
 * `getCandidateDisplayName` rule. Accepted / sent / in-cart candidates stay
 * redacted until the hire (and the payment behind it) is done.
 */
export function displayNameOf(
  profile: Pick<CandidateProfile, "fullName" | "initials">,
  nameUnlocked: boolean,
): string {
  if (nameUnlocked) return profile.fullName || "Intern";
  const initials = profile.initials && profile.initials !== "?" ? profile.initials : "";
  return initials || "Candidate";
}

/**
 * What may cross to the browser for an employer who has not hired this
 * candidate: no name, no email, no LinkedIn, no interview recording. Pages
 * that hand profiles to client components pass them through this, so the
 * non-bypass rule does not depend on every component remembering it.
 */
export function redactForEmployer<T extends CandidateProfile>(profile: T, unlocked: boolean): T {
  if (unlocked) return profile;
  return { ...profile, firstName: "", lastName: "", fullName: "", email: "", linkedinUrl: "", aiRecordingLink: null };
}

/**
 * Intern ids this employer has hired (any project). Lives in
 * `lib/employer-visibility` (not here) so this module stays import-free and
 * unit-testable under plain node. Feed the result into `displayNameOf` so
 * every employer screen unmasks the same people.
 */

/** Build a display profile. `onboarding` may be undefined - the row is optional. */
export function toCandidateProfile(
  user: UserRow,
  onboarding?: OnboardingRow | null,
): CandidateProfile {
  const firstName = text(user.firstName);
  const lastName = text(user.lastName);
  const city = text(onboarding?.city);
  const state = text(onboarding?.state);
  const extra = (onboarding?.extraData ?? {}) as Record<string, unknown>;

  return {
    id: user.id,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim() || "Intern",
    initials: initialsOf(firstName, lastName),
    email: text(user.email),
    city,
    state,
    location: [city, state].filter(Boolean).join(", "),
    bio: text(onboarding?.bio),
    linkedinUrl: text(onboarding?.linkedinUrl),
    skills: readSkills(onboarding?.skills),
    score: readScore(extra),
    scored: rawScore(extra) !== null,
    ratings: readRatings(extra),
    academics: readAcademics(extra),
    workModes: stringArray(onboarding?.locationTypes).map((mode) =>
      MODE_LABEL[mode.toLowerCase()] ?? mode,
    ),
    preferredLocations: stringArray(onboarding?.preferredLocations),
    hasLaptop: typeof onboarding?.hasLaptop === "boolean" ? onboarding.hasLaptop : null,
    updatedAt: onboarding?.updatedAt ?? null,
    aiFeedbackLink: (typeof extra?.aiFeedbackLink === "string" && extra.aiFeedbackLink.trim()) || null,
    aiRecordingLink: (typeof extra?.aiRecordingLink === "string" && extra.aiRecordingLink.trim()) || null,
    // Uploaded photos only - `attachPhotos` (lib/employer-pool) sets this.
    // Saved external URLs are never served (the avatar route was an open
    // redirect while it followed them).
    photoUrl: null,
  };
}

/**
 * Just the score, for callers that hold an `intern_onboarding` row but not the
 * matching `users` row (the checkout totals, which only need the band).
 */
export function scoreOf(onboarding?: OnboardingRow | null): number {
  return readScore((onboarding?.extraData ?? {}) as Record<string, unknown>);
}

/**
 * Skill tags.
 *
 * `intern_onboarding.skills` is `jsonb` and the legacy build wrote both bare
 * strings (`["React"]`) and objects carrying a level (`[{name, level}]`).
 * Both are still in the wild, so both are accepted and the level is kept.
 */
export function readSkills(raw: unknown): string[] {
  return coerceArray(raw)
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const name = text(record.name ?? record.skill ?? record.title);
        const level = text(record.level);
        return level ? `${name} · ${level}` : name;
      }
      return "";
    })
    .filter(Boolean);
}

/** Case-insensitive overlap between a candidate's tags and a wanted list. */
export function skillOverlap(candidateSkills: string[], wanted: string[]): string[] {
  if (wanted.length === 0) return [];
  const haystack = candidateSkills.map((s) => s.toLowerCase());
  return wanted.filter((want) => {
    const needle = want.trim().toLowerCase();
    if (!needle) return false;
    return haystack.some((skill) => skill === needle || skill.includes(needle));
  });
}

/* ── Internals ───────────────────────────────────────────────────────────── */

/**
 * `findternScore` as a number, or null when there is none. Legacy wrote it as
 * a number or a numeric string and read it with Number() (EMB-02), so both
 * count; anything else is "not scored".
 */
export function rawScore(extra: Record<string, unknown>): number | null {
  const raw = extra.findternScore;
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\s*\d+(\.\d+)?\s*$/.test(raw)
        ? Number(raw)
        : NaN;
  return Number.isFinite(value) ? value : null;
}

function readScore(extra: Record<string, unknown>): number {
  const raw = rawScore(extra);
  return raw === null ? 0 : Math.max(0, Math.min(10, raw));
}

function readRatings(extra: Record<string, unknown>): Ratings {
  const raw = (extra.ratings ?? {}) as Record<string, unknown>;
  const num = (key: string) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) ? value : 0;
  };
  return {
    communication: num("communication"),
    coding: num("coding"),
    aptitude: num("aptitude"),
    interview: num("interview"),
  };
}

function readAcademics(extra: Record<string, unknown>): Academics | null {
  const raw = extra.academics;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  const academics: Academics = {
    institution: text(record.institution),
    degree: text(record.degree),
    specialization: text(record.specialization),
    level: text(record.level),
    startYear: text(record.startYear),
    endYear: text(record.endYear),
    status: text(record.status),
    score: text(record.score),
    scoreType: text(record.scoreType),
    courses: readCourses(record.professionalCourses),
  };

  const hasContent =
    academics.institution ||
    academics.degree ||
    academics.specialization ||
    academics.level ||
    academics.startYear ||
    academics.endYear ||
    academics.score ||
    academics.courses.length > 0;

  return hasContent ? academics : null;
}

/**
 * Professional courses.
 *
 * `courseNamePreset` is a controlled dropdown in the legacy form and holds
 * "other" for a free-text entry, which then lives in `courseNameOther` (or the
 * older `courseNameCustom`). Reading the preset blindly would render the word
 * "Other" as a course title.
 */
function readCourses(raw: unknown): Course[] {
  return coerceArray(raw)
    .map((entry): Course | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;

      const preset = text(record.courseNamePreset);
      const presetIsOther = /^(other|others)$/i.test(preset);
      const custom = text(record.courseNameOther ?? record.courseNameCustom);
      const title = text(record.title ?? record.name);
      const name = !presetIsOther && preset ? preset : custom || title || preset;

      const course: Course = {
        name,
        institution: text(record.institution ?? record.provider),
        level: text(record.level),
        completed: text(record.completionDate ?? record.endDate),
        score: text(record.score),
      };
      return course.name || course.institution ? course : null;
    })
    .filter((course): course is Course => course !== null);
}

function stringArray(raw: unknown): string[] {
  return coerceArray(raw)
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function coerceArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function text(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
}
