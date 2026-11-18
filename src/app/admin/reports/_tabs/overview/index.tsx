import { Suspense } from "react";

import { SectionSkeleton } from "@/components/admin/reports/skeletons";

import type { TabProps } from "../types";
import Conversion from "./conversion";
import Expiries from "./expiries";
import Growth from "./growth";
import HiringAnalytics from "./hiring-analytics";
import PlatformSummary from "./platform-summary";

/**
 * Overview tab: platform growth first (new interns and employers, signups against payers, trend, conversion,
 * where people came from), then the two reports that used to be their own pages: the platform summary
 * (the old Reports page) and the hiring analytics (/admin/reports/analytics). Each streams on its own.
 */
export default function OverviewTab(props: TabProps) {
  return (
    <>
      <Suspense fallback={<SectionSkeleton label="Loading platform growth" strip />}>
        <Growth {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading conversion" height="h-72" />}>
        <Conversion {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading expiries" height="h-56" />}>
        <Expiries {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading the platform summary" strip />}>
        <PlatformSummary {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading hiring analytics" strip />}>
        <HiringAnalytics {...props} />
      </Suspense>
    </>
  );
}
