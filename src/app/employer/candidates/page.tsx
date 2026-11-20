import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { rememberedSelection } from "@/lib/employer-selection";
import { CandidatesView } from "./_view";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { hireFlowCountsFor } from "@/lib/employer-flow";
import {
  FILTER_KEYS,
  loadCandidates,
  one,
  readFilters,
  type SearchParams,
} from "./_query";
import { normaliseQuery } from "@/lib/instant-query/cache";
import { perfScope } from "@/lib/perf/timing";
import { withRelaxCounts } from "./_relax";

export const metadata: Metadata = {
  title: "Candidates",
  robots: { index: false, follow: false },
};

async function CandidatesPageImpl({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole("employer");
  const uid = session.uid;
  // The setup check (company, then a project) runs beside the page's own reads instead of ahead of them: its redirect still
  // wins, it just no longer costs a round trip first. A page that was going to redirect throws the work away; nothing else changes.
  const setup = requireEmployerSetup(uid);
  setup.catch(() => undefined);
  const params = await searchParams;

  // Legacy `?ftInternId=` opened the full-time offer for a hire: the offer
  // lives on the candidate's profile now.
  const ftIntern = one(params.ftInternId);
  if (ftIntern) {
    await setup;
    redirect(`/employer/intern/${encodeURIComponent(ftIntern)}`);
  }

  // The key the first results are cached under: the address bar's query, without the compare picks (those are the browser's).
  const addressQs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "ids" || key === "ftInternId" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) addressQs.append(key, v);
  }
  const initialQs = normaliseQuery(addressQs);
  const filters = readFilters(params);
  // The project and compare picks carry over from the last visit (cookie)
  // unless the URL names them. Picks belong to a project: this project's own.
  const remembered = await rememberedSelection(uid, filters.project);
  if (!filters.idsSet) filters.ids = remembered.compare;
  if (!filters.project && remembered.project) filters.project = remembered.project;

  const [, data, flow] = await Promise.all([
    setup,
    loadCandidates(uid, filters, {
      // A link that names the view is not a bare visit: restoring the remembered filters would drop it.
      hasFilterParams: params.view !== undefined || FILTER_KEYS.some((key) => params[key as keyof SearchParams] !== undefined),
      fresh: one(params.fresh) === "1",
    }),
    hireFlowCountsFor(uid),
  ]);
  if (data.restoreTo) redirect(data.restoreTo);

  await withRelaxCounts(uid, data, filters);

  return <CandidatesView uid={uid} data={data} filters={filters} flow={flow} initialQs={initialQs} />;
}

export default function CandidatesPage(props: Parameters<typeof CandidatesPageImpl>[0]) {
  return perfScope("employer/candidates", () => CandidatesPageImpl(props));
}
