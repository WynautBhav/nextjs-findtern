
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

/** Spelled-out degrees to their short code, so "Bachelor of Technology" and "B. Tech" read the same. */
const DEGREE_NAMES: [RegExp, string][] = [
  [/bachelors? (?:of|in) technology/g, "btech"],
  [/bachelors? (?:of|in) engineering/g, "be"],
  [/bachelors? (?:of|in) architecture/g, "barch"],
  [/bachelors? (?:of|in) business administration/g, "bba"],
  [/bachelors? (?:of|in) computer applications?/g, "bca"],
  [/bachelors? (?:of|in) commerce/g, "bcom"],
  [/bachelors? (?:of|in) science/g, "bsc"],
  [/bachelors? (?:of|in) arts/g, "ba"],
  [/bachelors? (?:of|in) design/g, "bdes"],
  [/bachelors? (?:of|in) pharmacy/g, "bpharm"],
  [/bachelors? (?:of|in) laws?/g, "llb"],
  [/masters? (?:of|in) business administration/g, "mba"],
  [/masters? (?:of|in) technology/g, "mtech"],
  [/masters? (?:of|in) computer applications?/g, "mca"],
  [/masters? (?:of|in) science/g, "msc"],
  [/masters? (?:of|in) arts/g, "ma"],
  [/masters? (?:of|in) commerce/g, "mcom"],
  [/masters? (?:of|in) engineering/g, "mtech"],
  [/masters? (?:of|in) architecture/g, "march"],
  [/masters? (?:of|in) pharmacy/g, "mpharm"],
  [/masters? (?:of|in) laws?/g, "llm"],
];

/** Duration in years by degree, first match wins: integrated and law-with-a-first-degree courses run 5, so they come first. */
const DEGREE_YEARS: [RegExp, number][] = [
  [/ (?:btech|be|bba|bsc|ba|bcom|bs) (?:(?:and|with|dual|integrated|degree) )*(?:mtech|mba|msc|ma|mcom|ms) /, 5],
  [/ (?:ba|bba|bcom|bsc) llb /, 5],
  [/ (?:integrated|barch) /, 5],
  [/ (?:btech|be|bdes|bpharm) /, 4],
  [/ bsc (?:hons )?(?:nursing|agriculture|agri|forestry) /, 4],
  [/ (?:bca|bba|bbm|bms|bcom|bsc|ba|bvoc|bjmc|llb) /, 3],
  [/ (?:mba|mca|mtech|msc|ma|mcom|pgdm|msw|march|mpharm|mdes|llm) /, 2],
];

/**
 * How many years a degree runs, from its name ("B. Tech", "btech", "Bachelor of Technology" are one): B.Tech, B.E., B.Des
 * and B.Pharm 4; B.Arch, BS-MS, integrated (BBA-MBA, B.Tech-M.Tech) and BA/BBA LLB 5; BCA, BBA, B.Com, B.Sc, BA, LLB 3;
 * MBA, MCA, M.Tech, M.Sc, MA, M.Com 2. Null when the text doesn't say (a branch like CSE or ME is not a degree).
 */
export function degreeYears(text: string | null | undefined): number | null {
  let t = (text ?? "").toLowerCase().replace(/\b([a-z])\./g, "$1").replace(/[^a-z0-9]+/g, " ").replace(/&/g, " ");
  for (const [re, short] of DEGREE_NAMES) t = t.replace(re, short);
  // "b tech" -> "btech", "m sc" -> "msc", "ll b" -> "llb".
  t = ` ${t.replace(/\b([bm]) (?=(?:tech|sc|com|arch|des|pharm|voc|ca|ed|e|a)\b)/g, "$1").replace(/\bll b\b/g, "llb").replace(/\bll m\b/g, "llm").trim()} `;
  return DEGREE_YEARS.find(([re]) => re.test(t))?.[1] ?? null;
}

/**
 * Full-time hiring is for the final year: the last two semesters of the degree (B.Tech sem 7-8, BBA sem 5-6). The degree
 * comes from the student's degree, else their branch. The semester (the student's own) is used when the year is missing;
 * when both are on file and disagree, the stricter one wins, so a self-entered semester never opens full-time to a student
 * the college lists in an earlier year (B.Tech year 4 but semester 5 is not final year either). A degree that names no
 * length keeps the old rule: 4th year, a 3rd year in semester 6 or later, or semester 7+ with no year on file.
 */
export function fullTimeReady(s: Pick<StudentFacts, "year" | "semester"> & { branch?: string | null; degree?: string | null }): boolean {
  const years = degreeYears(s.degree) ?? degreeYears(s.branch);
  const sem = s.semester && s.semester > 0 ? s.semester : null;
  if (years !== null) {
    const yearOk = s.year === null ? null : s.year >= years;
    const semOk = sem === null ? null : sem >= years * 2 - 1;
    return (yearOk ?? true) && (semOk ?? true) && (yearOk !== null || semOk !== null);
  }
  return s.year === 4 || (s.year === 3 && (sem ?? 0) >= 6) || (s.year === null && (sem ?? 0) >= 7);
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
