import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSessionState, unauthenticatedResponse } from "@/lib/auth";
import { rememberedSelection } from "@/lib/employer-selection";
import { readSession } from "@/lib/security/session";
import { loadCandidates } from "@/app/employer/candidates/_query";
import { withRelaxCounts } from "@/app/employer/candidates/_relax";
import { readFilters, type SearchParams } from "@/lib/candidates-params";
import { toResultsWire } from "@/lib/candidates-wire";

export const dynamic = "force-dynamic";

/**
 * The Candidates results for a query string (the page's own: `?skills=React&sort=...`), as JSON for the in-page region.
 * Exactly what the filters decide and nothing else: the page chrome (projects, plans, the Pro offer, the hiring-steps counts)
 * is sent once with the page. Rows come out of the same loader and the same row mapper (`toResultsWire`) as the first paint,
 * so ranking, the pool rule (hold, frozen, hired), Pro locks and the redaction cannot differ between the two.
 *
 * The signed cookie names the employer before the database confirms the session, so the reads start at once beside that
 * check instead of after it. Nothing is returned unless the check passes (a signed-out, switched-off or frozen account gets
 * the same 401 / 403 as every route), and the reads are by the employer in that signed cookie, never by a request value.
 */
export async function GET(req: Request) {
  const claimed = readSession((await cookies()).get("ft_sid")?.value);
  if (!claimed || claimed.role !== "employer") return unauthenticatedResponse();

  const params: Record<string, string | string[]> = {};
  for (const [key, value] of new URL(req.url).searchParams) {
    const had = params[key];
    params[key] = had === undefined ? value : Array.isArray(had) ? [...had, value] : [had, value];
  }
  const filters = readFilters(params as SearchParams);
  // The page's own cookie rules (no database): the remembered project when the link names none, and that project's compare picks.
  const remembered = await rememberedSelection(claimed.uid, filters.project);
  if (!filters.project && remembered.project) filters.project = remembered.project;
  if (!filters.idsSet) filters.ids = remembered.compare;
  // A link that carries filters is not a bare visit; the endpoint never restores remembered ones (the page did, on first paint).
  const loading = loadCandidates(claimed.uid, filters, { hasFilterParams: true, fresh: true, lean: true, viewingAsAdmin: Boolean(claimed.impersonator) });
  loading.catch(() => undefined);

  const state = await getSessionState();
  if (!state.session || state.session.role !== "employer" || state.session.uid !== claimed.uid) return unauthenticatedResponse();

  const data = await loading;
  await withRelaxCounts(claimed.uid, data, filters);
  return NextResponse.json(toResultsWire(data, filters), { headers: { "Cache-Control": "private, no-store" } });
}
