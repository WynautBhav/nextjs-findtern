import { asc, desc } from "drizzle-orm";

import { AdminPageHeader } from "@/components/admin/panel";
import { CmsEditor } from "@/components/admin/cms-editor";
import { CMS_TYPES, type CmsType } from "@/lib/admin/cms-collections";
import { flattenParams } from "@/lib/admin/params";
import { getDb, schema } from "@/lib/db";

export default async function AdminCmsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const active = (CMS_TYPES as string[]).includes(params.tab ?? "") ? (params.tab as CmsType) : "testimonial";

  const db = getDb();
  const [testimonial, partner, faq, blog, skill] = await Promise.all([
    db.select().from(schema.websiteHappyFaces).orderBy(asc(schema.websiteHappyFaces.sortOrder), desc(schema.websiteHappyFaces.createdAt)),
    db.select().from(schema.websitePartners).orderBy(asc(schema.websitePartners.sortOrder), desc(schema.websitePartners.createdAt)),
    db.select().from(schema.websiteFaqs).orderBy(asc(schema.websiteFaqs.category), asc(schema.websiteFaqs.sortOrder)),
    db.select().from(schema.websiteBlogPosts).orderBy(desc(schema.websiteBlogPosts.createdAt)),
    db.select().from(schema.websiteFeaturedSkills).orderBy(asc(schema.websiteFeaturedSkills.sortOrder)),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Website content"
        subtitle="Testimonials, partners, FAQs, blog posts and featured skills on the public site. Prices live under Pricing & Fees."
      />
      <CmsEditor active={active} items={{ testimonial, partner, faq, blog, skill }} />
    </div>
  );
}
