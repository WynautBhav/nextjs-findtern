import { revalidatePath } from "next/cache";

/**
 * Tell the public role pages (/opportunities and every /opportunities/<id>) to rebuild on their next visit.
 * They are prerendered and kept for up to 5 minutes (the marketing layout's `revalidate`), so without this a
 * published, paused, closed, taken-down or restored role would keep its old state in front of candidates.
 * The change is already saved by the time this runs, so a failure here is logged, never turned into an error.
 */
export function revalidatePublicRoles(): void {
  try {
    revalidatePath("/opportunities", "layout");
  } catch (err) {
    console.error("[projects] could not refresh the public role pages", err);
  }
}
