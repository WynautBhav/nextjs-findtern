import {
  LEVELS,
  canonicalDegree,
  draftFromRecord,
  emptyDraft,
  semesterPatch,
  validateStep,
  type ScoreType,
  type ValidationErrors,
} from "../onboarding.ts";

/**
 * An admin's edit of an intern's education (Candidate 360 -> Profile -> Education).
 *
 * The rules are the intern onboarding rules, not a copy: `academicsProblems` runs `validateStep` on the Academics
 * step (CGPA 0-10, percentage 0-100, years, completed/pursuing, degree list), so an admin can never store what the
 * intern's own form would refuse. Two differences, both on purpose: a Completed degree may be saved without a
 * score (the admin may be fixing something else, and a legacy record has none), and a Ph.D carries no score, as on
 * the intern's form.
 *
 * Pure: the route reads and writes the rows.
 */

export const EDIT_FIELDS = ["qualificationLevel", "degree", "branch", "institution", "status", "startYear", "yearOfGraduation", "scoreType", "score"] as const;
export type EditField = (typeof EDIT_FIELDS)[number];

/** The fields an admin can change; every one is a string, as the intern's draft holds them. */
export type AcademicsValues = { [K in EditField]: K extends "scoreType" ? ScoreType | "" : string };

/** Any subset: a field left out is not touched. */
export type AcademicsEdit = Partial<AcademicsValues>;

export const LEVEL_LABELS: string[] = LEVELS.map(([, label]) => label);

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The editable fields as stored today, read exactly as the intern's own profile reads them. */
export function readAcademicsValues(extraData: unknown): AcademicsValues {
  const a = draftFromRecord({ extraData: obj(extraData) }).academics;
  return {
    qualificationLevel: a?.qualificationLevel ?? "",
    degree: a?.degree ?? "",
    branch: a?.branch ?? "",
    institution: a?.institution ?? "",
    status: a?.status ?? "",
    startYear: a?.startYear ?? "",
    yearOfGraduation: a?.yearOfGraduation ?? "",
    scoreType: a?.scoreType ?? "",
    score: a?.cgpa ?? "",
  };
}

/** Which input each onboarding error key belongs to. */
const ERROR_FIELD: Record<string, EditField> = {
  qualificationLevel: "qualificationLevel",
  degree: "degree",
  institution: "institution",
  academicStatus: "status",
  startYear: "startYear",
  yearOfGraduation: "yearOfGraduation",
  scoreType: "scoreType",
  cgpa: "score",
};

/**
 * What is wrong with `edit` applied on top of `current`, by field. Only fields the edit touches are judged (plus
 * the ones it makes wrong: a new level can make the stored score invalid), so a legacy record with an unrelated
 * quirk can still have its score corrected.
 */
export function academicsProblems(current: AcademicsValues, edit: AcademicsEdit, now: Date = new Date()): Partial<Record<EditField, string>> {
  const next = { ...current, ...edit };
  const draft = emptyDraft();
  draft.academics = {
    ...draft.academics,
    qualificationLevel: next.qualificationLevel,
    degree: next.degree,
    branch: next.branch,
    institution: next.institution,
    status: next.status,
    startYear: next.startYear,
    yearOfGraduation: next.yearOfGraduation,
    scoreType: next.scoreType,
    cgpa: next.score,
  };
  const errors: ValidationErrors = validateStep(draft, 1, { hasPanImage: true, hasAadhaarImage: true, now });
  const out: Partial<Record<EditField, string>> = {};
  for (const [key, message] of Object.entries(errors)) {
    const field = ERROR_FIELD[key];
    if (field) out[field] = message;
  }
  const score = next.score.trim();
  // Admin leniency: no score is fine (the intern's form insists on one once Completed).
  if (!score) {
    delete out.score;
    delete out.scoreType;
  }
  if (next.qualificationLevel === "Ph.D" && score) {
    out.score = "Ph.D profiles carry no score. Choose another qualification level to add one.";
  }
  // Judge only what the admin touched, plus the score when the level, type or status moved under it.
  const touched = new Set<EditField>(Object.keys(edit) as EditField[]);
  if (touched.has("qualificationLevel") || touched.has("scoreType")) touched.add("score");
  if (touched.has("score")) touched.add("scoreType");
  if (touched.has("status")) touched.add("yearOfGraduation");
  if (touched.has("startYear")) touched.add("yearOfGraduation");
  for (const field of Object.keys(out) as EditField[]) if (!touched.has(field)) delete out[field];
  return out;
}

/** The first problem, in form order, as one sentence for an error banner. */
export function firstProblem(problems: Partial<Record<EditField, string>>): string | null {
  for (const f of EDIT_FIELDS) if (problems[f]) return problems[f] ?? null;
  return null;
}

export type AcademicsMerge = {
  /** The new `extra_data.academics`: everything stored before, with the edited fields replaced. */
  academics: Record<string, unknown>;
  before: AcademicsValues;
  after: AcademicsValues;
  /** { field: { from, to } } for the fields that really changed; empty when the save changes nothing. */
  changes: Record<string, { from: unknown; to: unknown }>;
};

/**
 * `extra_data.academics` after the edit. Keys this editor does not own (certifications, professionalCourses,
 * marksheet uploads, the CGPA proofs) are carried over untouched; a score is dropped for a Ph.D; a course that is
 * Completed, or not a degree, keeps no current semester, exactly as the intern's own save does.
 */
export function mergeAcademics(extraData: unknown, edit: AcademicsEdit): AcademicsMerge {
  const extra = obj(extraData);
  const prev = obj(extra.academics);
  const before = readAcademicsValues(extra);
  const next: AcademicsValues = { ...before };
  for (const f of EDIT_FIELDS) {
    const v = edit[f];
    if (v !== undefined) (next as Record<string, string>)[f] = v.trim();
  }
  const phd = next.qualificationLevel === "Ph.D";
  if (phd) {
    next.score = "";
    next.scoreType = "";
  }
  next.degree = canonicalDegree(next.degree, next.qualificationLevel).trim();

  const academics: Record<string, unknown> = {
    ...prev,
    level: LEVELS.find(([, label]) => label === next.qualificationLevel)?.[0] ?? next.qualificationLevel,
    degree: next.degree,
    specialization: next.branch,
    status: next.status,
    institution: next.institution,
    startYear: next.startYear,
    endYear: next.yearOfGraduation,
    score: next.score,
    scoreType: next.scoreType,
  };
  if ("branch" in prev) academics.branch = next.branch;
  if ("yearOfGraduation" in prev) academics.yearOfGraduation = next.yearOfGraduation;
  if ("cgpa" in prev) academics.cgpa = next.score;

  if (edit.status !== undefined || edit.qualificationLevel !== undefined) {
    for (const [k, v] of Object.entries(semesterPatch({ status: next.status }, prev, next.qualificationLevel))) {
      if (v === undefined) delete academics[k];
      else academics[k] = v;
    }
  }

  // Not audit.ts's diffFields: that module reaches the database client, and this one is bundled into the browser.
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of EDIT_FIELDS) if (before[f] !== next[f]) changes[f] = { from: before[f], to: next[f] };
  return { academics, before, after: next, changes };
}
