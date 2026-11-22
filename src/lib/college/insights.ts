import type { MasterRow } from "./master-row.ts";

/**
 * The placement office's analysis, computed from master data rows. Only verified students count: a claimed
 * student's progress is hidden (serialize.ts), so counting them would read as zeros that are not real.
 * Every total here is a sum of the rows it describes, so the screen's numbers always agree with each other.
 */

/** "Strong" on Findtern and "high" CGPA, shown in the screen's words so the officer knows the cut. */
export const STRONG_SCORE = 7;
export const HIGH_CGPA = 7.5;

export type CourseStat = {
  course: string;
  students: number;
  interviewed: number;
  withOffer: number;
  offers: number;
  hired: number;
  ppo: number;
  earningsMinor: number;
  avgScore: number | null;
  avgCgpa: number | null;
  avgEnglish: number | null;
  avgCoding: number | null;
  avgAptitude: number | null;
  avgInterview: number | null;
};

export type Quadrant = "stars" | "scoreBeatsCg" | "cgBeatsScore" | "support";

export type QuadrantStat = { key: Quadrant; students: number; withOffer: number; avgOffers: number | null };

export type Insights = {
  verified: number;
  courses: CourseStat[];
  totals: Omit<CourseStat, "course">;
  quadrants: QuadrantStat[];
  /** Strong Findtern score, no offer yet: the students employers are missing. */
  overlooked: MasterRow[];
  mostOffers: MasterRow[];
  /** Interviewed students by number of offers: 0, 1, 2, 3, 4+. */
  offerSpread: number[];
  workModes: { mode: "remote" | "hybrid" | "onsite"; students: number }[];
  cities: { city: string; students: number }[];
  laptop: { yes: number; no: number; unknown: number };
};

const avg = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

export const COURSE_NOT_SET = "Course not set";

function stat(course: string, rows: MasterRow[]): CourseStat {
  return {
    course,
    students: rows.length,
    interviewed: rows.filter((r) => r.score !== null).length,
    withOffer: rows.filter((r) => r.offers > 0).length,
    offers: rows.reduce((t, r) => t + r.offers, 0),
    hired: rows.filter((r) => r.hired).length,
    ppo: rows.filter((r) => r.ppo).length,
    earningsMinor: rows.reduce((t, r) => t + r.earningsMinor, 0),
    avgScore: avg(rows.map((r) => r.score)),
    avgCgpa: avg(rows.map((r) => r.cgpa)),
    avgEnglish: avg(rows.map((r) => r.english)),
    avgCoding: avg(rows.map((r) => r.coding)),
    avgAptitude: avg(rows.map((r) => r.aptitude)),
    avgInterview: avg(rows.map((r) => r.aiInterview)),
  };
}

export function quadrantOf(r: Pick<MasterRow, "cgpa" | "score">): Quadrant | null {
  if (r.cgpa === null || r.score === null) return null;
  const strong = r.score >= STRONG_SCORE;
  const high = r.cgpa >= HIGH_CGPA;
  return strong && high ? "stars" : strong ? "scoreBeatsCg" : high ? "cgBeatsScore" : "support";
}

export function computeInsights(all: MasterRow[]): Insights {
  const rows = all.filter((r) => r.verified);
  const byCourse = new Map<string, MasterRow[]>();
  for (const r of rows) {
    const k = r.degree ?? COURSE_NOT_SET;
    byCourse.set(k, [...(byCourse.get(k) ?? []), r]);
  }
  const courses = [...byCourse.entries()]
    .map(([c, rs]) => stat(c, rs))
    // Biggest course first; "not set" always last.
    .sort((a, b) => Number(a.course === COURSE_NOT_SET) - Number(b.course === COURSE_NOT_SET) || b.students - a.students || a.course.localeCompare(b.course));
  const totals: Omit<CourseStat, "course"> = stat("", rows);

  const quadrants: QuadrantStat[] = (["stars", "scoreBeatsCg", "cgBeatsScore", "support"] as Quadrant[]).map((key) => {
    const q = rows.filter((r) => quadrantOf(r) === key);
    return { key, students: q.length, withOffer: q.filter((r) => r.offers > 0).length, avgOffers: q.length ? Math.round((q.reduce((t, r) => t + r.offers, 0) / q.length) * 10) / 10 : null };
  });

  const byScore = (a: MasterRow, b: MasterRow) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name);
  const overlooked = rows.filter((r) => r.score !== null && r.score >= STRONG_SCORE && r.offers === 0).sort(byScore);
  const mostOffers = rows.filter((r) => r.offers > 0).sort((a, b) => b.offers - a.offers || byScore(a, b));

  const offerSpread = [0, 0, 0, 0, 0];
  for (const r of rows) if (r.score !== null) offerSpread[Math.min(4, r.offers)]++;

  // By each student's own pick, so the three add up to the students who picked one.
  const workModes = (["remote", "hybrid", "onsite"] as const).map((mode) => ({ mode, students: rows.filter((r) => r.workMode === mode).length }));
  const cityCount = new Map<string, number>();
  for (const r of rows) for (const c of new Set(r.preferredLocations)) cityCount.set(c, (cityCount.get(c) ?? 0) + 1);
  const cities = [...cityCount.entries()].map(([city, students]) => ({ city, students })).sort((a, b) => b.students - a.students || a.city.localeCompare(b.city));
  const laptop = { yes: rows.filter((r) => r.laptop === true).length, no: rows.filter((r) => r.laptop === false).length, unknown: rows.filter((r) => r.laptop === null).length };

  return { verified: rows.length, courses, totals, quadrants, overlooked, mostOffers, offerSpread, workModes, cities, laptop };
}
