import type { Metadata } from "next";

import { PageHero } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { PricingCta, PricingContent } from "@/components/marketing/pricing-content";
import { getPlans } from "@/lib/content";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Three plans named after coffee: Espresso, Cappuccino and Latte. You pick the band of the score pool you want to hire from, and the rate follows.",
  alternates: { canonical: "/pricing" },
};

/* Amounts come from the `pricing_plans` table (seeded from the same figures
   the legacy client hardcoded, now admin-editable). Both rate cards are
   fetched - INR renders on the server, USD swaps in on the client for
   visitors abroad. Exactly three plans per region, never six. */

export default async function PricingPage() {
  const [plansInr, plansUsd] = await Promise.all([getPlans(true), getPlans(false)]);

  return (
    <>
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
