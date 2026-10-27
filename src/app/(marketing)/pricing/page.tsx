import type { Metadata } from "next";

import { PageHero } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { PricingCta, PricingContent } from "@/components/marketing/pricing-content";
import { JsonLd } from "@/components/seo/json-ld";
import { getHappyFaces, getPlans } from "@/lib/content";
import { PageSection } from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/ui/section-heading";
import { TestimonialCarousel } from "@/components/marketing/testimonial-carousel";
import { pricingFaq } from "@/lib/content/pricing-faq";
import { formatMoney } from "@/lib/format";
import { breadcrumbJsonLd, faqJsonLd, pricingJsonLd, webPageJsonLd } from "@/lib/seo";
import { CurrencyPicker } from "@/components/marketing/region-rates";

export const metadata: Metadata = {
  title: "Intern Hiring Pricing: Free to ₹200/hr + ₹5,000 Per Hire",
  description:
    "Findtern's published rate card for hiring interns in India. Three plans named after coffee (Espresso, Cappuccino, Latte) priced by Findtern Score band, a flat ₹5,000 per-hire fee, GST included, and a monthly cost calculator.",
  alternates: { canonical: "/pricing" },
};

/* Amounts come from the `pricing_plans` table (seeded from the same figures
   the legacy client hardcoded, now admin-editable). Both rate cards are
   fetched - INR renders on the server, USD swaps in on the client for
   visitors abroad. Exactly three plans per region, never six. */

export default async function PricingPage() {
  const [plansInr, plansUsd, faces] = await Promise.all([getPlans(true), getPlans(false), getHappyFaces()]);
  const perHire = formatMoney(plansInr[0]?.perHireChargeMinor ?? 500000, "INR");

  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({ path: "/pricing", name: "Findtern pricing", description: String(metadata.description) }),
          breadcrumbJsonLd([{ name: "Pricing", path: "/pricing" }]),
          pricingJsonLd(plansInr),
          faqJsonLd(pricingFaq(perHire)),
        ]}
      />
      <PageHero
        eyebrow="Rate card"
        title={
          <>
            Three plans. No{" "}
            <span className="text-primary">negotiation</span>.
          </>
        }
        lead="You are not bidding for talent. You are choosing which band of the score pool to hire from, and the rate follows from arithmetic we publish."
      >
        <PricingCta />
        <ButtonLink href="/interns" variant="outline" size="lg">
          I&rsquo;m looking for an internship
        </ButtonLink>
      </PageHero>

      <div className="flex justify-center bg-ink-50/70 pt-10">
        <CurrencyPicker />
      </div>
      <PricingContent
        plansInr={plansInr}
        plansUsd={plansUsd}
        beforeFaq={
          faces.length ? (
            <PageSection tone="muted">
              <SectionHeading lead="Teams that" accent="hired" sub="What employers say after the first placement." />
              <div className="mt-12">
                <TestimonialCarousel
                  testimonials={faces.map((f) => ({
                    id: f.id,
                    name: f.name,
                    role: f.company ? `${f.title} · ${f.company}` : f.title,
                    quote: f.quote,
                    avatarUrl: f.avatarUrl,
                  }))}
                />
              </div>
            </PageSection>
          ) : null
        }
      />
    </>
  );
}
