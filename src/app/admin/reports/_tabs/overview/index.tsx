import { Suspense } from "react";

import { SectionSkeleton } from "@/components/admin/reports/skeletons";

import type { TabProps } from "../types";
import Conversion from "./conversion";
import Expiries from "./expiries";
import Exports from "./exports";
import Funnel from "./funnel";
import Growth from "./growth";
import HiringAnalytics from "./hiring-analytics";
import Money from "./money";
import Rates from "./rates";

/**
 * Overview tab, in reading order: the lead figure and its trend (growth), where hiring drops off (the funnel, then what each
 * new person did next), the money, and then the detail (rates, expiries, hiring detail, exports). Each section streams on its
 * own, and a number lives in one section only; the captions say which dates and which people it covers.
 */
export default function OverviewTab(props: TabProps) {
  return (
    <>
      <Suspense fallback={<SectionSkeleton label="Loading platform growth" strip />}>
        <Growth {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading the hiring funnel" height="h-64" />}>
        <Funnel {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading what new people did" height="h-72" />}>
        <Conversion {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading the money" height="h-72" />}>
        <Money {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading rates" height="h-72" />}>
        <Rates {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading expiries" height="h-56" />}>
        <Expiries {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading the hiring detail" height="h-96" />}>
        <HiringAnalytics {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading exports" height="h-40" />}>
        <Exports />
      </Suspense>
    </>
  );
}
