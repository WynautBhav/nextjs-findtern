import { Suspense } from "react";

import { SectionSkeleton } from "@/components/admin/reports/skeletons";

import type { TabProps } from "../types";
import Cycle from "./cycle";
import Glance from "./glance";
import MoneyInOut from "./money-in-out";
import Trend from "./trend";

/**
 * Finance tab. The glance and the cycle share one cached load (React `cache`, one set of queries per request),
 * the trend and the Money in/out report each load on their own; every section streams behind its own Suspense.
 */
export default function FinanceTab(props: TabProps) {
  return (
    <>
      <Suspense fallback={<SectionSkeleton label="Loading finance figures" strip />}>
        <Glance {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading the finance cycle" height="h-72" />}>
        <Cycle {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading the money trend" />}>
        <Trend {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading money in and out" height="h-96" />}>
        <MoneyInOut {...props} />
      </Suspense>
    </>
  );
}
