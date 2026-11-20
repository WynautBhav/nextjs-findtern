"use client";

import { createContext, useCallback, useContext } from "react";
import { useProgressRouter } from "@/components/layout/navigation-progress";

export type GoOptions = { replace?: boolean; debounce?: boolean; /** The filter panel asked: it keeps its own controls (no re-sync on the answer). */ source?: "panel" };
type Go = (href: string, options?: GoOptions) => void;

/** Set by the Candidates region: a change of the page's own query updates the list in place (no page navigation). */
export const CandidatesNavContext = createContext<Go | null>(null);

/** The controls on this page go through here; outside the region (the Compare page's sort menu) it is a normal navigation. */
export function useCandidatesGo(): Go {
  const inRegion = useContext(CandidatesNavContext);
  const router = useProgressRouter();
  return useCallback<Go>(
    (href, options) => {
      if (inRegion) inRegion(href, options);
      else if (options?.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [inRegion, router],
  );
}
