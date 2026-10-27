import type { ConsentPurpose } from "./consent.ts";

/**
 * Which students a drive shows. Pure and free of Node imports so the drive
 * builder can preview the exact count in the browser with the same rule the
 * server enforces (src/lib/college/access.ts re-exports it).
 */

type DriveRules = {
  collegeId: string;
  eligibility: Record<string, unknown>;
  includeUserIds: string[];
  excludeUserIds: string[];
};

export type DriveEligibility = {
  minCgpa?: number;
  minScore?: number;
  years?: number[];
  branches?: string[];
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
  return e;
}

export function normBranch(b: string): string {
  return b.trim().toLowerCase();
}

export type StudentFacts = {
  userId: string;
  collegeId: string;
  status: "claimed" | "verified";
  leftAt: Date | null;
  purposes: readonly string[];
  year: number | null;
  branch: string | null;
  cgpa: number | null;
  score: number | null;
};

const DRIVE_PURPOSE: ConsentPurpose = "drive_visibility";
export const DASHBOARD_PURPOSE: ConsentPurpose = "college_dashboard";

export function isStudentEligible(s: StudentFacts, drive: DriveRules): boolean {
  // Hard boundaries: no override.
  if (!s.collegeId || s.collegeId !== drive.collegeId) return false;
  if (s.leftAt) return false;
  if (!s.purposes.includes(DRIVE_PURPOSE)) return false;
  if (drive.excludeUserIds.includes(s.userId)) return false;
  // The college vouches for hand-included students, cutoffs or not.
  if (drive.includeUserIds.includes(s.userId)) return true;
  if (s.status !== "verified") return false;

  const e = readEligibility(drive.eligibility);
  if (e.minCgpa !== undefined && (s.cgpa === null || s.cgpa < e.minCgpa)) return false;
  if (e.minScore !== undefined && (s.score === null || s.score < e.minScore)) return false;
  if (e.years && (s.year === null || !e.years.includes(s.year))) return false;
  if (e.branches && (!s.branch || !e.branches.includes(normBranch(s.branch)))) return false;
  return true;
}
