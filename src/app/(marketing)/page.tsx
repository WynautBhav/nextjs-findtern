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
    "Hire a verified intern for the price of a coffee, or get placed in a paid internship in 18 months — or your deposit back. Structured screening, published rates, contracted work.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [partners, skills, faces, steps, plans] = await Promise.all([
    getPartners(),
    getFeaturedSkills(),
    getHappyFaces(),
    getPopularSteps(),
    // Region-aware currency. This is a server component so it renders INR;
    // the client corrects it on mount for non-India visitors. Defaulting to
    // INR is the right failure mode for a majority-Indian product.
    getPlans(true),
  ]);

  return (
    <>
      {/* 1 — Hero: copy, cinematic video band, two audience paths */}
      <HeroSplit />

      {/* 2 — Partner marquee */}
      <PartnersMarquee partners={partners} />

      {/* 3 — About us */}
      <AboutSection />

      {/* 3b — Proof metrics band */}
      <StatsBand />

      {/* 4 — Featured skills marquee */}
      <SkillsMarquee skills={skills} />

      {/* 5 — Happy Faces testimonials */}
      <HappyFaces faces={faces} />

      {/* 6 — Why we are most popular, seven-step timeline */}
      <PopularTimeline steps={steps} />

      {/* 7 — Pricing, the coffee comparison table */}
      <PricingTable plans={plans} isIndia />

      {/* 8 — Contact CTA */}
      <ContactCta />

      {/* 9 — Dark closing CTA */}
      <ClosingCta />
    </>
  );
}
