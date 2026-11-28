import { redirect } from "next/navigation";

import { flattenParams, toQueryString, type RawSearchParams } from "@/lib/admin/params";

/**
 * The Meeting pipeline is the Meetings view of the one Pipeline page now. Old links, bookmarks and the dashboard's
 * `?nolink=1` keep working: their query string rides along. The /admin/meetings permission rule stays (the redirect,
 * the Meetings toggle and /api/admin/meetings/export all read it).
 */
export default async function AdminMeetingsRedirect({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  redirect(`/admin/proposal-tracker${toQueryString({ ...params, view: "meetings" })}`);
}
