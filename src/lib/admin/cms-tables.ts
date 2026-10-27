import { getTableColumns, sql, type SQL } from "drizzle-orm";

import { schema } from "@/lib/db";
import { CMS_COLLECTIONS, INLINE_IMAGE_PREFIX, cmsFields, type CmsType } from "@/lib/admin/cms-collections";

/** Server side of the website-content collections: which table each one is. */
export const CMS_TABLES = {
  testimonial: schema.websiteHappyFaces,
  partner: schema.websitePartners,
  faq: schema.websiteFaqs,
  blog: schema.websiteBlogPosts,
  skill: schema.websiteFeaturedSkills,
} as const;

/**
 * Columns for the admin list. Inline `data:` images (every legacy upload,
 * up to ~640 KB each) are replaced by a short "inline-image:<length>" token so
 * a page of partners doesn't ship megabytes of base64 to the browser; the
 * image itself is served by /api/admin/cms/image.
 */
export function cmsListColumns(type: CmsType): Record<string, SQL | ReturnType<typeof getTableColumns>[string]> {
  const columns: Record<string, SQL | ReturnType<typeof getTableColumns>[string]> = { ...getTableColumns(CMS_TABLES[type]) };
  for (const f of cmsFields(type)) {
    if (f.kind !== "image") continue;
    const col = columns[f.name];
    if (!col) continue;
    columns[f.name] = sql<string | null>`CASE WHEN ${col} LIKE 'data:%' THEN ${INLINE_IMAGE_PREFIX} || length(${col})::text ELSE ${col} END`;
  }
  return columns;
}

/** The collection's image column by field name, or null if it isn't one. */
export function cmsImageColumn(type: CmsType, field: string) {
  const def = cmsFields(type).find((f) => f.name === field && f.kind === "image");
  if (!def) return null;
  const col = (getTableColumns(CMS_TABLES[type]) as Record<string, unknown>)[field];
  return col ? (col as ReturnType<typeof getTableColumns>[string]) : null;
}

export { CMS_COLLECTIONS };
