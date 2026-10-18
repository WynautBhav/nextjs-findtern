import type { Metadata } from "next";

import { AboutSection } from "@/components/home/about-section";
import { ClosingCta } from "@/components/home/closing-cta";
import { HeroSplit } from "@/components/home/hero-split";
import { ContactCta } from "@/components/home/marketing-sections";
import { PopularTimeline } from "@/components/home/popular-timeline";
import { StatsBand } from "@/components/home/stats-band";
import { PricingTable } from "@/components/home/pricing-table";
import {
  HappyFaces,
  PartnersMarquee,
  SkillsMarquee,
} from "@/components/home/sections";
import {
  getHappyFaces,
  getPartners,
  getPlans,
  getPopularSteps,
  getFeaturedSkills,
} from "@/lib/content";

export const metadata: Metadata = {
  title: "Findtern | Internship Simplified",
  description:
    "Hire a verified intern for the price of a coffee, or get placed in a paid internship - or your deposit back. Structured screening, published rates, contracted work.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [partners, skills, faces, steps, plansInr, plansUsd] = await Promise.all([
    getPartners(),
    getFeaturedSkills(),
    getHappyFaces(),
    getPopularSteps(),
    // Region-aware currency. Server components cannot know the visitor's
    // region, so both rate cards render here and the client picks: INR by
    // default (the right failure mode for a majority-Indian product), USD
    // for visitors abroad. Exactly three plans per set - never six.
    getPlans(true),
    getPlans(false),
  ]);

  return (
    <>
      {/* 1 - Hero: copy, cinematic video band, two audience paths */}
      <HeroSplit />

      {/* 2 - Partner marquee */}
      <PartnersMarquee partners={partners} />

      {/* 3 - About us */}
      <AboutSection />

      {/* 3b - Proof metrics band */}
      <StatsBand />

      {/* 4 - Featured skills marquee */}
      <SkillsMarquee skills={skills} />

      {/* 5 - Happy Faces testimonials */}
      <HappyFaces faces={faces} />

      {/* 6 - Why we are most popular, seven-step timeline */}
      <PopularTimeline steps={steps} />

      {/* 7 - Pricing, the coffee comparison table */}
      <PricingTable plansInr={plansInr} plansUsd={plansUsd} />

      {/* 8 - Contact CTA */}
      <ContactCta />

      {/* 9 - Dark closing CTA */}
      <ClosingCta />
    </>
  );
}
