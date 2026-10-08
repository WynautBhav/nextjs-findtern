import { count, desc } from "drizzle-orm";
import { MessageSquare, Handshake, HelpCircle, Layers } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { flattenParams } from "@/lib/admin/params";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { CmsStudio } from "@/components/admin/cms-studio";

export default async function AdminCmsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const activeTab = params.tab || "testimonials";

  const db = getDb();

  const [
    testimonials,
    partners,
    faqs,
    pricing,
    [testimonialsCount],
    [partnersCount],
    [faqsCount],
    [pricingCount],
  ] = await Promise.all([
    db.select().from(schema.websiteHappyFaces).orderBy(desc(schema.websiteHappyFaces.createdAt)),
    db.select().from(schema.websitePartners).orderBy(desc(schema.websitePartners.createdAt)),
    db.select().from(schema.websiteFaqs).orderBy(desc(schema.websiteFaqs.createdAt)),
    db.select().from(schema.pricingPlans).orderBy(desc(schema.pricingPlans.createdAt)),
    db.select({ c: count() }).from(schema.websiteHappyFaces),
    db.select({ c: count() }).from(schema.websitePartners),
    db.select({ c: count() }).from(schema.websiteFaqs),
    db.select({ c: count() }).from(schema.pricingPlans),
  ]);

  const num = (n: number) => n.toLocaleString("en-IN");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Website CMS"
        subtitle="Public marketing editorial content, testimonials, corporate partners and FAQs."
      />

      <StatGrid cols={4}>
        <StatCard
          label="Testimonials"
          value={num(Number(testimonialsCount?.c ?? 0))}
          hint="Candidate testimonials"
          icon={MessageSquare}
          tone="brand"
          href="/admin/cms?tab=testimonials"
        />
        <StatCard
          label="Corporate partners"
          value={num(Number(partnersCount?.c ?? 0))}
          hint="Verified brand logos"
          icon={Handshake}
          tone="info"
          href="/admin/cms?tab=partners"
        />
        <StatCard
          label="FAQ articles"
          value={num(Number(faqsCount?.c ?? 0))}
          hint="Knowledge base entries"
          icon={HelpCircle}
          tone="accent"
          href="/admin/cms?tab=faqs"
        />
        <StatCard
          label="Pricing tiers"
          value={num(Number(pricingCount?.c ?? 0))}
          hint="Configured rate plans"
          icon={Layers}
          tone="success"
          href="/admin/cms?tab=pricing"
        />
      </StatGrid>

      <CmsStudio
        initialTestimonials={testimonials}
        initialPartners={partners}
        initialFaqs={faqs}
        initialPricing={pricing}
        defaultTab={activeTab}
      />
    </div>
  );
}
