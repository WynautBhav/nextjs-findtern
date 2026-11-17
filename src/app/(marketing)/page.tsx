import type { Metadata } from "next";

import { AboutSection } from "@/components/home/about-section";
import { ClosingCta } from "@/components/home/closing-cta";
import { HeroSplit } from "@/components/home/hero-split";
import { ContactCta } from "@/components/home/marketing-sections";
import { PopularTimeline } from "@/components/home/popular-timeline";
import { StatsBand } from "@/components/home/stats-band";
import { CollegePartners } from "@/components/home/college-partners";
import { PricingTable } from "@/components/home/pricing-table";
import {
  HappyFaces,
  PartnersMarquee,
  SkillsMarquee,
} from "@/components/home/sections";
import {
  getHappyFaces,
  getPartners,
  getCollegePartners,
  getPlans,
  getPopularSteps,
  getFeaturedSkills,
} from "@/lib/content";
import { JsonLd } from "@/components/seo/json-ld";
import { howToJsonLd, pricingJsonLd, webPageJsonLd } from "@/lib/seo";
import { feeSettingOf, type PricingConfig } from "@/lib/pricing-config";
import { getRenderPricingConfig } from "@/lib/pricing-config-server";
import { pricingMetaSentence } from "@/lib/pricing-copy";

/** Meta description: the prices are the live config's, so an admin edit reaches search results too. */
const metaDescription = (config: PricingConfig) =>
  `Hire interns in India who are already interviewed, tested and scored. ${pricingMetaSentence(config)}, then billed monthly on approved timesheets. Students: get assessed and placed in an internship.`;

// Reads the config under the marketing layout's ISR (revalidate = 300): the page stays prerendered.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: "Findtern | Hire Pre-Screened Interns in India for the Price of a Coffee" },
    description: metaDescription(await getRenderPricingConfig()),
    alternates: { canonical: "/" },
  };
}

const HOME_HOWTO = howToJsonLd({
  name: "How to hire a pre-screened intern on Findtern",
  description: "Seven steps from a candidate signing up to an employer hiring them, with the screening done in between.",
  steps: [
    { name: "Candidate onboarding", text: "Interns create a profile and join the platform." },
    { name: "Personal verification", text: "Personal details and identity documents are added and verified for authenticity." },
    { name: "AI interview", text: "Candidates choose the skills they want to be hired for and complete a structured AI interview on exactly those skills." },
    { name: "Aptitude test", text: "Every candidate sits a structured aptitude test." },
    { name: "Coding test", text: "Candidates from a coding background complete a live coding test." },
    { name: "Findtern Score", text: "Each intern receives one Findtern Score out of 10, built from their AI interview, aptitude and coding results." },
    { name: "Hire", text: "Employers filter, sort and select interns by Findtern Score, skills and interests, then send a proposal." },
  ],
});

export default async function HomePage() {
  const [partners, skills, faces, steps, plansInr, plansUsd, colleges, config] = await Promise.all([
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
    getCollegePartners(),
    getRenderPricingConfig(),
  ]);
  const feeSetting = feeSettingOf(config);

  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({
            path: "/",
            name: "Findtern - hire pre-screened interns in India",
            description: metaDescription(config),
          }),
          HOME_HOWTO,
          pricingJsonLd(plansInr, feeSetting),
        ]}
      />

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

      {/* 6b - College partners: the pitch to placement cells */}
      <CollegePartners pitch={colleges.pitch} partners={colleges.partners} />

      {/* 7 - Pricing, the coffee comparison table */}
      <PricingTable plansInr={plansInr} plansUsd={plansUsd} />

      {/* 8 - Contact CTA */}
      <ContactCta />

      {/* 9 - Dark closing CTA */}
      <ClosingCta />
    </>
  );
}
