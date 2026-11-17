import { redirect } from "next/navigation";

import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { reportHref } from "@/lib/admin/reports/href";

/** Old address of the hiring analytics: it lives on the Overview tab now, with the same period / from / to / filters in the link. */
export default async function AnalyticsRedirect({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  redirect(reportHref({ ...flattenParams(await searchParams), tab: "overview" }, {}));
}
