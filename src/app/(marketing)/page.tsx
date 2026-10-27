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

export const metadata: Metadata = {
  title: { absolute: "Findtern | Hire Pre-Screened Interns in India for the Price of a Coffee" },
  description:
    "Hire interns in India who are already interviewed, tested and scored. Three published plans from free to ₹200/hr, one flat ₹5,000 per-hire fee, billed only on approved hours. Students: get assessed and placed in a paid internship.",
  alternates: { canonical: "/" },
};

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
  const [partners, skills, faces, steps, plansInr, plansUsd, colleges] = await Promise.all([
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
  ]);

  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({
            path: "/",
            name: "Findtern - hire pre-screened interns in India",
            description: String(metadata.description),
          }),
          HOME_HOWTO,
          pricingJsonLd(plansInr),
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
