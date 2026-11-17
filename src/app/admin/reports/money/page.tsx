import { redirect } from "next/navigation";

import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { reportHref } from "@/lib/admin/reports/href";

/** Old address of Money in and out: it lives on the Finance tab now, with the same period and filters in the link. */
export default async function MoneyRedirect({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  redirect(reportHref({ ...flattenParams(await searchParams), tab: "finance" }, {}));
}
