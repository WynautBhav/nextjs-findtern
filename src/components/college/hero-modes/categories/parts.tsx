import type { CategoriesData } from "@/lib/college/overview-modes";
import { n, pct, white } from "../kit";

/**
 * Pieces the Categories heat matrix uses: "not interviewed" (a faint step) and "interviewed" (a mid step) fills, and
 * the one finding sentence.
 */

export const NOT_YET = white(0.1);
export const DONE = white(0.34);

export const notInterviewed = (d: CategoriesData) => Math.max(0, d.students - d.interviewed);

/** The band with the most interviewed students, and the degree with the best interview rate (ties: the larger one). */
function leaders(d: CategoriesData) {
  const band = [...d.coffee].sort((a, b) => b.students - a.students)[0];
  const degree = [...d.degrees].filter((x) => x.students > 0).sort((a, b) => b.interviewed / b.students - a.interviewed / a.students || b.students - a.students)[0];
  return { band: band && band.students > 0 ? band : undefined, degree };
}

/** One finding sentence from the data: the leading band, then the degree with the best interview rate. */
export function finding(d: CategoriesData, order: "band" | "degree" = "band") {
  const { band, degree } = leaders(d);
  const a = band ? (
    <>
      {band.name} is the biggest band, with {pct(band.students, d.interviewed)}% of interviewed students
    </>
  ) : null;
  const b = degree ? (
    <>
      {degree.name} has the highest interview rate, {pct(degree.interviewed, degree.students)}% ({n(degree.interviewed)} of {n(degree.students)})
    </>
  ) : null;
  if (!a && !b) return <>No student has done the AI interview yet.</>;
  const [x, y] = order === "band" ? [a, b] : [b, a];
  return (
    <>
      {x}
      {x && y ? "; " : null}
      {y}.
    </>
  );
}
