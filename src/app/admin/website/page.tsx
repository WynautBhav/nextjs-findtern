import { redirect } from "next/navigation";

import { flattenParams } from "@/lib/admin/params";

/**
 * Old admin links (`/admin/website?tab=blogs|skills|faces|partners|pricing|
 * faq|terms`) land on the matching new page instead of Testimonials (ADP-24).
 * Legacy defaulted to the blog tab, so an unknown or missing tab does too.
 */
const TARGETS: Record<string, string> = {
  blogs: "/admin/cms?tab=blog",
  skills: "/admin/cms?tab=skill",
  faces: "/admin/cms?tab=testimonial",
  partners: "/admin/cms?tab=partner",
  faq: "/admin/cms?tab=faq",
  pricing: "/admin/settings",
  terms: "/admin/cms/terms",
};

export default async function LegacyWebsiteRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tab = flattenParams(await searchParams).tab ?? "";
  redirect(TARGETS[tab] ?? TARGETS.blogs);
}
