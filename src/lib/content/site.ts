/**
 * Site-wide configuration: navigation, footer, contact details.
 *
 * Single source for anything that appears in more than one place. The legacy
 * footer hardcoded the year as 2026 and linked to /privacy, which 404s; both
 * are fixed here.
 */

export const SITE = {
  name: "Findtern",
  tagline: "Internship Simplified",
  description:
    "Hire a verified intern for the price of a coffee, or get placed in a paid internship in 18 months — or your deposit back.",
  url: "https://findtern.in",
  email: "admin@findtern.in",
  phone: "",
  city: "Jaipur, Rajasthan, India",
  address: "Jaipur, Rajasthan, India",
  foundedYear: 2024,
  social: {
    facebook: "https://www.facebook.com/people/Findtern/61579381094708/",
    instagram: "https://instagram.com/findtern.in/",
    x: "https://x.com/Findtern",
    linkedin: "https://www.linkedin.com/company/findtern-in/",
  },
} as const;

/* ==========================================================================
   HOME COPY
   --------------------------------------------------------------------------
   The About copy below is Findtern's own, transcribed from the live site on
   2026-10-02. It was previously paraphrased into something generic; the
   original says things worth saying.

   The headline is two-tone on purpose. Across 28 measured premium sites the
   accent phrase is consistently the *last clause* of the sentence, not a
   random word — Wellfound does `Where great companies <em>meet great
   people.</em>` and reuses that exact pattern at four other heading levels.
   Splitting mid-sentence is what makes a two-tone headline read as arbitrary.
   ========================================================================== */

export const HOME_COPY = {
  /** Lead clause. */
  headlineLead: "Hire an intern for",
  /** Accent clause — the last words, set in the accent colour. */
  headlineAccent: "the price of a coffee.",
  subhead:
    "Verified candidates, a published rate, and a payment that actually arrives. If we do not place you in 18 months, your deposit comes back.",
} as const;

export const ABOUT_COPY = {
  titleLead: "About",
  titleAccent: "Us",
  lead:
    "Hiring an intern should be effortless, not exhausting. Findtern is a platform that connects companies with pre-vetted, skilled interns in a few clicks.",
  mission: {
    title: "Our mission",
    body: "To bridge the gap between talented interns and forward-thinking companies, making the hiring process faster, smarter, and more efficient.",
  },
  points: [
    {
      title: "Quality Interns",
      body: "Handpicked, pre-screened candidates.",
    },
    {
      title: "AI-Powered Matching",
      body: "The right fit, every time.",
    },
    {
      title: "Seamless Hiring",
      body: "From search to selection, all in one place.",
    },
  ],
} as const;

export type NavLink = {
  label: string;
  href: string;
  description?: string;
};

/**
 * Primary navigation, in the same order as the legacy header.
 * The two "For Employers" / "For Interns" CTAs are rendered separately from
 * these, matching the original layout.
 */
export const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
  { label: "Contact Us", href: "/contact" },
  { label: "FAQ", href: "/faq" },
];

export const FOOTER_SECTIONS: { heading: string; links: NavLink[] }[] = [
  {
    heading: "Quick Links",
    links: [
      { label: "Home", href: "/" },
      { label: "About", href: "/about" },
      { label: "Contact Us", href: "/contact" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Pricing", href: "/pricing" },
      { label: "Open Roles", href: "/opportunities" },
      { label: "For Employers", href: "/employers" },
      { label: "For Interns", href: "/interns" },
    ],
  },
  {
    heading: "Legal",
    // The legacy footer linked only /terms-and-conditions. The intern and
    // employer terms pages existed but were orphaned, and /privacy was linked
    // from the auth pages with no route behind it.
    links: [
      { label: "Terms and Conditions", href: "/terms-and-conditions" },
      { label: "Intern Terms", href: "/intern-terms-and-conditions" },
      { label: "Employer Terms", href: "/employer-terms-and-conditions" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
];

/** Marketing routes that carry a real index in search engines. */
export const INDEXABLE_ROUTES = [
  "/",
  "/about",
  "/pricing",
  "/employers",
  "/interns",
  "/guaranteed-internship-program",
  "/opportunities",
  "/blog",
  "/contact",
  "/faq",
  "/terms-and-conditions",
  "/intern-terms-and-conditions",
  "/employer-terms-and-conditions",
  "/privacy",
] as const;
