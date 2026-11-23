import { bandFor, PLAN_NAME } from "../score.ts";
import type { MasterRow } from "./master-row.ts";

/**
 * Data for the Overview hero's second and third modes (Categories analysis, Placement analysis), computed from
 * master data rows. Verified students only, as everywhere else on the dashboard. Every part sums to its whole, so
 * any design that draws these numbers agrees with every other design.
 */

/** Findtern score bands, as employers see them (score.ts): Espresso under 6, Cappuccino 6-8, Latte 8 and up. */
export type CoffeeKey = "espresso" | "cappuccino" | "latte";
export const COFFEE: { key: CoffeeKey; name: string; range: string }[] = [
  { key: "espresso", name: PLAN_NAME.standard, range: "under 6" },
  { key: "cappuccino", name: PLAN_NAME.skilled, range: "6 to 8" },
  { key: "latte", name: PLAN_NAME.assured, range: "8 and up" },
];
export const coffeeOf = (score: number): CoffeeKey => ({ standard: "espresso", skilled: "cappuccino", assured: "latte" } as const)[bandFor(score).id];

/** Academic bands on CGPA (or percentage / 10). Named so they never read as the coffee bands. Rename here only. */
export type MarksKey = "foundation" | "rising" | "strong" | "top";
export const MARKS: { key: MarksKey; name: string; range: string; min: number }[] = [
  { key: "foundation", name: "Foundation", range: "0 to 4", min: 0 },
  { key: "rising", name: "Rising", range: "4 to 6", min: 4 },
  { key: "strong", name: "Strong", range: "6 to 8", min: 6 },
  { key: "top", name: "Top", range: "8 to 10", min: 8 },
];
export const marksOf = (m: number): MarksKey => (m >= 8 ? "top" : m >= 6 ? "strong" : m >= 4 ? "rising" : "foundation");

export type BandCount<K extends string> = { key: K; name: string; range: string; students: number; withOffer: number; hired: number; ppo: number };

export type CategoriesData = {
  students: number;
  interviewed: number;
  degrees: { name: string; students: number; interviewed: number; coffee: Record<CoffeeKey, number> }[];
  years: { year: number; students: number; interviewed: number }[];
  coffee: BandCount<CoffeeKey>[];
  marks: BandCount<MarksKey>[];
  /** Students with no CGPA or percentage on file. */
  marksMissing: number;
};

export type PlacementData = {
  interviewed: number;
  coffee: BandCount<CoffeeKey>[];
  marks: BandCount<MarksKey>[];
  avgMarks: number | null;
  avgScore: number | null;
  offers: { received: number; accepted: number; rejected: number; notAnswered: number; withdrawn: number };
  withOffer: number;
  internships: number;
  ppo: number;
  /** Employer meetings; other = missed or called off by the employer. students = students with at least one. */
  meetings: { total: number; done: number; notAccepted: number; upcoming: number; waiting: number; other: number; students: number };
};

export type OverviewModes = { categories: CategoriesData; placement: PlacementData };

const avg1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

function bandCounts<K extends string>(defs: { key: K; name: string; range: string }[], rows: MasterRow[], keyOf: (r: MasterRow) => K | null): BandCount<K>[] {
  return defs.map((d) => {
    const inBand = rows.filter((r) => keyOf(r) === d.key);
    return { key: d.key, name: d.name, range: d.range, students: inBand.length, withOffer: inBand.filter((r) => r.offers > 0).length, hired: inBand.filter((r) => r.hired).length, ppo: inBand.filter((r) => r.ppo).length };
  });
}

export function overviewModes(all: MasterRow[]): OverviewModes {
  const rows = all.filter((r) => r.verified);
  const interviewed = rows.filter((r) => r.score !== null);
  const coffeeKey = (r: MasterRow) => (r.score === null ? null : coffeeOf(r.score));
  const marksKey = (r: MasterRow) => (r.marks10 === null ? null : marksOf(r.marks10));

  const degreeNames = [...new Set(rows.map((r) => r.degree ?? "Not set"))];
  const degrees = degreeNames
    .map((name) => {
      const d = rows.filter((r) => (r.degree ?? "Not set") === name);
      const coffee = { espresso: 0, cappuccino: 0, latte: 0 } as Record<CoffeeKey, number>;
      for (const r of d) if (r.score !== null) coffee[coffeeOf(r.score)]++;
      return { name, students: d.length, interviewed: d.filter((r) => r.score !== null).length, coffee };
    })
    .sort((a, b) => Number(a.name === "Not set") - Number(b.name === "Not set") || b.students - a.students || a.name.localeCompare(b.name));
  const years = [...new Set(rows.map((r) => r.year).filter((y): y is number => y !== null))]
    .sort((a, b) => a - b)
    .map((year) => {
      const y = rows.filter((r) => r.year === year);
      return { year, students: y.length, interviewed: y.filter((r) => r.score !== null).length };
    });

  const offers = { received: 0, accepted: 0, rejected: 0, notAnswered: 0, withdrawn: 0 };
  for (const r of rows) {
    offers.received += r.offers;
    offers.accepted += r.offersAccepted;
    offers.rejected += r.offersRejected + r.offersLapsed;
    offers.notAnswered += r.offersOpen;
  }
  // Whatever is left was withdrawn by the employer or closed (taken elsewhere, closed by Findtern, unpaid); never below zero if a status is new.
  offers.withdrawn = Math.max(0, offers.received - offers.accepted - offers.rejected - offers.notAnswered);
  const meetings = { total: 0, done: 0, notAccepted: 0, upcoming: 0, waiting: 0, other: 0, students: 0 };
  for (const r of rows) {
    const m = r.meetings;
    meetings.total += m.total;
    meetings.done += m.done;
    meetings.notAccepted += m.notAccepted;
    meetings.upcoming += m.upcoming;
    meetings.waiting += m.waiting;
    if (m.total > 0) meetings.students++;
  }
  meetings.other = Math.max(0, meetings.total - meetings.done - meetings.notAccepted - meetings.upcoming - meetings.waiting);

  return {
    categories: {
      students: rows.length,
      interviewed: interviewed.length,
      degrees,
      years,
      coffee: bandCounts(COFFEE, rows, coffeeKey),
      marks: bandCounts(MARKS, rows, marksKey),
      marksMissing: rows.filter((r) => r.marks10 === null).length,
    },
    placement: {
      interviewed: interviewed.length,
      coffee: bandCounts(COFFEE, interviewed, coffeeKey),
      marks: bandCounts(MARKS, interviewed, marksKey),
      avgMarks: avg1(interviewed.map((r) => r.marks10).filter((v): v is number => v !== null)),
      avgScore: avg1(interviewed.map((r) => r.score!)),
      offers,
      withOffer: rows.filter((r) => r.offers > 0).length,
      internships: rows.filter((r) => r.hired).length,
      ppo: rows.filter((r) => r.ppo).length,
      meetings,
    },
  };
}
