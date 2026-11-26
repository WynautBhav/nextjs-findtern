
/**
 * Which students a drive shows. Pure and free of Node imports so the drive
 * builder can preview the exact count in the browser with the same rule the
 * server enforces (src/lib/college/access.ts re-exports it).
 */

type DriveRules = {
  collegeId: string;
  /** "full_time" drives take final-year students only (fullTimeReady). */
  kind?: string;
  eligibility: Record<string, unknown>;
  includeUserIds: string[];
  excludeUserIds: string[];
};

export type DriveEligibility = {
  minCgpa?: number;
  minScore?: number;
  years?: number[];
  /** Old drives only: the Branch filter became Degree on 26 Nov. Still read so their lists don't change. */
  branches?: string[];
  degrees?: string[];
};

/** Tolerant read of the stored jsonb; anything malformed is dropped, not trusted. */
export function readEligibility(raw: Record<string, unknown> | null | undefined): DriveEligibility {
  const e: DriveEligibility = {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const minCgpa = num(raw?.minCgpa);
  const minScore = num(raw?.minScore);
  if (minCgpa !== undefined) e.minCgpa = minCgpa;
  if (minScore !== undefined) e.minScore = minScore;
  if (Array.isArray(raw?.years)) {
    const ys = raw.years.filter((y): y is number => Number.isInteger(y) && y >= 1 && y <= 5);
    if (ys.length) e.years = ys;
  }
  if (Array.isArray(raw?.branches)) {
    const bs = raw.branches.filter((b): b is string => typeof b === "string" && b.trim() !== "").map(normBranch);
    if (bs.length) e.branches = bs;
  }
  if (Array.isArray(raw?.degrees)) {
    const ds = raw.degrees.filter((d): d is string => typeof d === "string" && normDegree(d) !== "").map(normDegree);
    if (ds.length) e.degrees = ds;
  }
  return e;
}

export function normBranch(b: string): string {
  return b.trim().toLowerCase();
}

/** "B.Sc", "BSc" and "b sc" are one degree. */
export function normDegree(d: string): string {
  return d.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type StudentFacts = {
  userId: string;
  collegeId: string;
  status: "claimed" | "verified";
  leftAt: Date | null;
  year: number | null;
  branch: string | null;
  /** The degree from the student's academics (B.Tech, BCA…); absent on callers that don't load it. */
  degree?: string | null;
  cgpa: number | null;
  score: number | null;
  /** Current semester from the student's academics, when they filled it in. */
  semester?: number | null;
};

/**
 * How many years the degree in a branch name runs, when the name says so: 4 for B.Tech / B.E., 3 for BCA, BBA, B.Com,
 * B.Sc, BA and the like. Null when the name doesn't tell (the year and semester rule below then decides).
 */
export function degreeYears(branch: string | null | undefined): number | null {
  const b = ` ${(branch ?? "").toLowerCase().replace(/[.\s]+/g, " ").trim()} `;
  if (/ (b ?tech|b ?e|be|b ?arch|bs ?ms) /.test(b)) return 4;
  if (/ (bca|bba|bbm|bms|b ?com|b ?sc|ba|b ?voc|bjmc) /.test(b)) return 3;
  return null;
}

/**
 * Full-time hiring is for the final year: the last year of the degree (B.Tech 4th, BCA 3rd) when the branch names it,
 * otherwise 4th year, or a 3rd year already in semester 6 or later.
 */
export function fullTimeReady(s: Pick<StudentFacts, "year" | "semester"> & { branch?: string | null }): boolean {
  const years = degreeYears(s.branch);
  if (years !== null) return s.year !== null && s.year >= years;
  return s.year === 4 || (s.year === 3 && (s.semester ?? 0) >= 6);
}

/** The first of these live drives (ordered as given, earliest to end) the student may enter, or null: the drive banner's pick. */
export function firstEligibleDrive<D extends DriveRules>(drives: D[], s: StudentFacts): D | null {
  return drives.find((d) => isStudentEligible(s, d)) ?? null;
}

export function isStudentEligible(s: StudentFacts, drive: DriveRules): boolean {
  // Hard boundaries: no override.
  if (!s.collegeId || s.collegeId !== drive.collegeId) return false;
  if (s.leftAt) return false;
  if (drive.excludeUserIds.includes(s.userId)) return false;
  // The platform's rule, not the officer's: a hand-include does not open a full-time drive to earlier years.
  if (drive.kind === "full_time" && !fullTimeReady(s)) return false;
  // The college vouches for hand-included students, cutoffs or not.
  if (drive.includeUserIds.includes(s.userId)) return true;
  if (s.status !== "verified") return false;

  const e = readEligibility(drive.eligibility);
  if (e.minCgpa !== undefined && (s.cgpa === null || s.cgpa < e.minCgpa)) return false;
  if (e.minScore !== undefined && (s.score === null || s.score < e.minScore)) return false;
  if (e.years && (s.year === null || !e.years.includes(s.year))) return false;
  if (e.branches && (!s.branch || !e.branches.includes(normBranch(s.branch)))) return false;
  if (e.degrees && (!s.degree || !e.degrees.includes(normDegree(s.degree)))) return false;
  return true;
}

/**
 * The officer's filters win over hand-picks (26 Nov): after a filter changes, keep only the hand-added students who
 * pass the drive's rules on their own.
 */
export function handPicksThatFit(students: StudentFacts[], drive: DriveRules): string[] {
  const alone = { ...drive, includeUserIds: [] };
  const fits = new Set(students.filter((s) => isStudentEligible(s, alone)).map((s) => s.userId));
  return drive.includeUserIds.filter((id) => fits.has(id));
}

/** The Degree filter's options: each degree once (first spelling wins), A to Z. */
export function degreeOptions(students: { degree?: string | null }[]): string[] {
  const seen = new Map<string, string>();
  for (const s of students) {
    const d = s.degree?.trim();
    if (d && normDegree(d) && !seen.has(normDegree(d))) seen.set(normDegree(d), d);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
