/** Pure: flattens the Projects board into CSV rows. Types only from the loader, so a node test can load this file. */
import type { BoardCompany, BoardProject } from "./projects-board.ts";

/** One CSV row per project, in the order the screen lists them (companies in sort order, newest project first). */
export function exportRows(companies: readonly BoardCompany[]): (BoardProject & { companyName: string })[] {
  return companies.flatMap((c) => c.projects.map((p) => ({ ...p, companyName: c.companyName })));
}
