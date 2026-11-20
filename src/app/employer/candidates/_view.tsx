import { PageHead } from "@/components/app/primitives";
import type { hireFlowCountsFor } from "@/lib/employer-flow";
import { CandidatesApp } from "./_app";
import { toChromeWire, toResultsWire } from "@/lib/candidates-wire";
import type { CandidatesData, Filters } from "@/lib/candidates-params";

/**
 * The page body, split from `page.tsx` (auth and loading) so it renders from plain data. The head is static; everything
 * under it is the client region (`_app.tsx`), which starts from this very data and then follows the query string in place.
 */
export function CandidatesView({
  uid,
  data,
  filters,
  flow,
  initialQs,
}: {
  uid: string;
  data: CandidatesData;
  filters: Filters;
  flow: Awaited<ReturnType<typeof hireFlowCountsFor>>;
  /** The address bar's query (compare picks left out): the key the first results are cached under. */
  initialQs: string;
}) {
  return (
    <div>
      <PageHead
        title="Candidates"
        lede={
          <>
            <span className="max-sm:hidden">Names and contact details unlock once your hire is paid. Scores and skills are visible now.</span>
            <span className="sm:hidden">Names unlock once your hire is paid.</span>
          </>
        }
        className="mb-3 sm:mb-4 lg:mb-5 [&_h1]:text-[32px] [&_h1]:leading-10"
      />
      <CandidatesApp uid={uid} chrome={toChromeWire(uid, data)} initial={{ qs: initialQs, wire: toResultsWire(data, filters) }} flow={flow} />
    </div>
  );
}
