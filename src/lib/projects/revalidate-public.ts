import { revalidatePath } from "next/cache";

/**
 * Tell the public role pages (/opportunities and every /opportunities/<id>) to rebuild on their next visit.
 * They are prerendered and kept for up to 5 minutes (the marketing layout's `revalidate`), so without this a
 * published, paused, closed, taken-down or restored role would keep its old state in front of candidates.
 * The sitemap lists each live role and /llms.txt links the open roles, and both are kept for an hour, so they are
 * told too. The change is already saved by the time this runs, so a failure here is logged, never turned into an error.
 */
export function revalidatePublicRoles(): void {
  try {
    revalidatePath("/opportunities", "layout");
    revalidateDiscoveryFiles();
  } catch (err) {
    console.error("[projects] could not refresh the public role pages", err);
  }
}

/** The machine-read files built from content and roles: the sitemap and /llms.txt (each kept for an hour). */
export function revalidateDiscoveryFiles(): void {
  revalidatePath("/sitemap.xml");
  revalidatePath("/llms.txt");
}

/** After a website-content write: the discovery files plus the blog RSS feed (also kept for an hour). Never throws. */
export function revalidateContentFeeds(): void {
  try {
    revalidateDiscoveryFiles();
    revalidatePath("/blog/feed.xml");
  } catch (err) {
    console.error("[cms] could not refresh the sitemap, llms.txt and blog feed", err);
  }
}
