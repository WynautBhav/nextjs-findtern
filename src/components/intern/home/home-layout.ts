/**
 * Home's top band: which of "What next", "Next up" and "Hours by month" are on screen decides the grid, so
 * no card is left alone beside a hole. Classes use container queries (`@xl` = 36rem, `@4xl` = 56rem of the page
 * column, not of the window), because the 256px sidebar, and a collapsed one, change the room the cards have.
 *
 * - Below `@xl`: one column, in reading order (What next, Next up, Hours).
 * - `@xl`: What next and Next up side by side; Hours across the row below them.
 * - `@4xl` with Hours: What next beside Hours (both short, so they share a height), and Next up across the row
 *   below as a strip. Nothing is pinned above an empty slab, and What next is wider than a third of the row.
 * - Without Hours: the pair shares the row; a card on its own takes the whole row.
 */
export type TopCards = { waiting: boolean; nextUp: boolean; chart: boolean };

export type TopLayout = {
  root: string;
  waiting: string;
  nextUp: string;
  chart: string;
  /** What next is alone on a full-width row: its buttons need not stretch edge to edge. */
  wide: boolean;
  /** Next up runs the full row at `@4xl` (under What next and the chart), so it lays itself out as a strip. */
  nextUpStrip: boolean;
};

export function homeTopLayout({ waiting, nextUp, chart }: TopCards): TopLayout | null {
  const left = Number(waiting) + Number(nextUp);
  if (left === 0 && !chart) return null;

  if (!chart) {
    return {
      root: left === 2 ? "grid gap-4 @xl:grid-cols-2" : "grid gap-4",
      waiting: "",
      nextUp: "",
      chart: "",
      wide: waiting && !nextUp,
      nextUpStrip: false,
    };
  }
  if (left === 0) return { root: "grid gap-4", waiting: "", nextUp: "", chart: "", wide: false, nextUpStrip: false };

  const root = "grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]";
  const chartCell = "@xl:col-span-2 @4xl:col-span-1 @4xl:col-start-2 @4xl:row-start-1";
  if (left === 1) {
    const one = "@xl:col-span-2 @4xl:col-span-1";
    return { root, waiting: one, nextUp: one, chart: chartCell, wide: false, nextUpStrip: false };
  }
  return {
    root,
    waiting: "@4xl:row-start-1",
    nextUp: "@4xl:col-span-2 @4xl:row-start-2",
    chart: chartCell,
    wide: false,
    nextUpStrip: true,
  };
}
