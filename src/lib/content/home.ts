import type { CmsPlan } from "./types";

/* ==========================================================================
   SAMPLE DATA — flagged on purpose
   --------------------------------------------------------------------------
   The legacy Home page fetched partners and testimonials from
   /api/website/partners and /api/website/faces, and shipped an *empty*
   fallback array (`const fallbackTestimonials: Testimonial[] = []`). With the
   database unreachable there is nothing to fetch, so the blocks below are
   representative placeholders, not real quotes or real logos.

   They are marked `isSample: true` so the UI can label them honestly and so
   Phase 3 can drop them the moment real rows exist. Do not let these reach
   production as if they were real customers.
   ========================================================================== */

export type PopularStep = {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  /** Legacy Font Awesome class, mapped to a local icon. */
  icon: string;
};

export const POPULAR_STEPS: PopularStep[] = [
  {
    title: "Candidate Onboarding",
    description: "Interns create their profiles and join the platform.",
    image: "/media/Candidate.jpeg",
    imageAlt: "A student creating their Findtern profile",
    icon: "user-plus",
  },
  {
    title: "Academic Verification",
    description: "They add their academic details, which we verify for authenticity.",
    image: "/media/Acedmics.jpeg",
    imageAlt: "Academic records being verified",
    icon: "file-text",
  },
  {
    title: "Interest-Based AI Interview",
    description:
      "Candidates specify their interest areas, and our AI conducts a tailored interview.",
    image: "/media/AIinterview.jpg",
    imageAlt: "A structured interview in progress",
    icon: "user-check",
  },
  {
    title: "Aptitude Test",
    description: "All candidates undergo a structured aptitude test.",
    image: "/media/AptitudeTest.jpg",
    imageAlt: "A structured aptitude assessment",
    icon: "clipboard-check",
  },
  {
    title: "Coding test",
    description: "Candidates from coding background undergo a live coding test.",
    image: "/media/coding.jpeg",
    imageAlt: "A live coding test",
    icon: "laptop",
  },
  {
    title: "Performance Scoring",
    description:
      "Each intern receives a Findtern Score based on academics, interview, and test results.",
    image: "/media/PerformanceScoring.jpg",
    imageAlt: "Performance scoring across assessment dimensions",
    icon: "trending-up",
  },
  {
    title: "Smart Hiring for Companies",
    description:
      "Employers can filter, sort, and select interns based on their Findtern Score, skills, and interests.",
    image: "/media/SmartHiring.jpg",
    imageAlt: "An employer shortlisting verified interns",
    icon: "briefcase",
  },
];

/* ── Pricing ─────────────────────────────────────────────────────────────
   The coffee metaphor is the brand's hook, so it is preserved exactly:
   Espresso / Cappuccino / Latte, mapped onto the Findtern Score bands.
   Amounts are minor units. The legacy code carried two different fallback
   price sets — the Home section used $5/$10, the Pricing page used $1/$2 —
   and both disagreed with the Employers page. One table now, one source. */

export const PRICING_PLANS: CmsPlan[] = [
  {
    id: "espresso",
    slug: "espresso",
    displayName: "Espresso",
    currency: "INR",
    priceHourlyMinor: 0,
    perHireChargeMinor: 500000,
    internshipDuration: "Up to 60 days",
    features: [
      "Budget-friendly hiring",
      "Under 6/10",
      "Access to basic talent",
    ],
    gstApplicable: true,
    sortOrder: 0,
    isActive: true,
  },
  {
    id: "cappuccino",
    slug: "cappuccino",
    displayName: "Cappuccino",
    currency: "INR",
    priceHourlyMinor: 10000,
    perHireChargeMinor: 0,
    internshipDuration: "1-6 months",
    features: ["Skilled interns", "6-8/10", "Access to medium skilled talent"],
    gstApplicable: true,
    sortOrder: 1,
    isActive: true,
  },
  {
    id: "latte",
    slug: "latte",
    displayName: "Latte",
    currency: "INR",
    priceHourlyMinor: 20000,
    perHireChargeMinor: 0,
    internshipDuration: "1-6 months",
    features: ["Top-rated talent", "8+/10 (Top Rated)", "Top-rated talent"],
    gstApplicable: true,
    sortOrder: 2,
    isActive: true,
  },
];

/** The USD equivalents, selected by region. */
export const PRICING_PLANS_USD: CmsPlan[] = PRICING_PLANS.map((p) => ({
  ...p,
  currency: "USD",
  perHireChargeMinor: p.perHireChargeMinor === 500000 ? 5000 : 0,
  priceHourlyMinor: { espresso: 0, cappuccino: 100, latte: 200 }[p.slug as "espresso" | "cappuccino" | "latte"] ?? 0,
  gstApplicable: false,
}));

/** Row order of the pricing comparison table, preserved from the original. */
export const PRICING_ROW_LABELS = [
  "Who's it for?",
  "Findtern Score",
  "Per Hiring Charge",
  "Price",
  "Internship Duration",
  "What You Get",
] as const;
