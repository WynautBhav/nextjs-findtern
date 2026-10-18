import type { Metadata } from "next";

import { PageHero } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { PricingCta, PricingContent } from "@/components/marketing/pricing-content";
import { JsonLd } from "@/components/seo/json-ld";
import { getPlans } from "@/lib/content";
import { pricingFaq } from "@/lib/content/pricing-faq";
import { formatMoney } from "@/lib/format";
import { breadcrumbJsonLd, faqJsonLd, pricingJsonLd, webPageJsonLd } from "@/lib/seo";

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
  const [plansInr, plansUsd] = await Promise.all([getPlans(true), getPlans(false)]);
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

      <PricingContent plansInr={plansInr} plansUsd={plansUsd} />
    </>
  );
}
