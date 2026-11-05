/**
 * Site-wide configuration: navigation, footer, contact details.
 *
 * Single source for anything that appears in more than one place. The legacy
 * footer hardcoded the year as 2026 and linked to /privacy, which 404s; both
 * are fixed here.
 */

/**
 * The origin this deployment is served from. PUBLIC_ORIGIN is the one setting
 * every host already has (links in emails, the staging check, OAuth), so the
 * sitemap, canonicals, structured data and OG tags follow it instead of a
 * second copy of the domain; the real domain is only the fallback.
 */
function siteOrigin(): string {
  const origin = (process.env.PUBLIC_ORIGIN ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/\s]+$/i.test(origin) ? origin : "https://findtern.in";
}

export const SITE = {
  name: "Findtern",
  tagline: "Internship Simplified",
  description:
    "Hire a verified intern for the price of a coffee, or get an internship within 12 months - or your fee back.",
  url: siteOrigin(),
  /** Interns and general queries. */
  email: "communicate@findtern.in",
  /** Employers: hiring, billing and company-account queries. */
  adminEmail: "admin@findtern.in",
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

/** Employer-facing marketing pages, where the header and footer show the
 *  admin address instead of the intern one. Exact paths, so /employers is
 *  matched but /employer (the signed-in app) is not. */
const EMPLOYER_PATHS = new Set(["/", "/employers"]);

/** The contact address for the page at `pathname`. */
export function contactEmailFor(pathname: string | null | undefined): string {
  return pathname && EMPLOYER_PATHS.has(pathname) ? SITE.adminEmail : SITE.email;
}

/**
 * Direct web compose URL for Gmail with pre-filled recipient, subject, and body.
 * Bypasses system mailto handlers (which often open unwanted web clients like HEY)
 * and opens Gmail compose directly in a fresh tab.
 */
export function getGmailComposeUrl(opts?: {
  to?: string;
  subject?: string;
  body?: string;
}) {
  const to = opts?.to ?? SITE.email;
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to,
  });
  if (opts?.subject) params.set("su", opts.subject);
  if (opts?.body) params.set("body", opts.body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/* ==========================================================================
   HOME COPY
   --------------------------------------------------------------------------
   The About copy below is Findtern's own, transcribed from the live site on
   2026-10-02. It was previously paraphrased into something generic; the
   original says things worth saying.

   The headline is two-tone on purpose. Across 28 measured premium sites the
   accent phrase is consistently the *last clause* of the sentence, not a
   random word - Wellfound does `Where great companies <em>meet great
   people.</em>` and reuses that exact pattern at four other heading levels.
   Splitting mid-sentence is what makes a two-tone headline read as arbitrary.
   ========================================================================== */

export const HOME_COPY = {
  /** Lead clause. */
  headlineLead: "Hire an intern for",
  /** Accent clause - the last words, set in the accent colour. */
  headlineAccent: "the price of a coffee.",
  /** Employer-facing on purpose: the hero, the audience cards and the
   *  pricing table all speak to the company hiring, so the candidate pitch
   *  lives on /interns rather than being mixed into this line. */
  subhead:
    "Interviewed, tested and scored before you see a profile. One published rate card, one flat per-hire fee, then billed monthly on the timesheets you approve.",
} as const;

/** The same hero, for a student who flips the home audience switch. The
 *  employer copy above stays the default; this only swaps the headline,
 *  subhead and CTAs, and the rest of the student pitch lives on /interns. */
export const HOME_STUDENT_COPY = {
  headlineLead: "Get an internship within 12 months,",
  headlineAccent: "or get your fee back.",
  subhead:
    "One AI interview and an aptitude test give you a Findtern Score that verified employers hire on. Not placed within 12 months of your AI interview? The fee comes back.",
} as const;

/** What a student earns by Findtern Score band, shown on the student side of
 *  the home hero. Whole rupees, always INR (these are not converted to the
 *  visitor's currency). Keys match the band ids in lib/score. A null stipend
 *  means the band has a completion bonus only. */
export const HOME_STUDENT_BANDS = [
  { id: "standard", range: "Below 6", stipend: null, bonus: 2000 },
  { id: "skilled", range: "6 to 8", stipend: 8000, bonus: 2500 },
  { id: "assured", range: "8 to 10", stipend: 15000, bonus: 3000 },
] as const;

/** The home and about pages quote the same three product terms. */
export const PROOF_STATS = [
  { value: 100, prefix: "", suffix: "%", label: "Screened before you see them" },
  { value: 3, prefix: "", suffix: "", label: "Plans, no lock-in" },
  // Shown in the visitor's currency (PerHireFigure); these are the INR defaults.
  { value: 5000, prefix: "₹", suffix: "", label: "Fixed per-hire fee", perHire: true },
] as const;

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
      { label: "Non-Bypass Agreement", href: "/intern-nda" },
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
  "/intern-nda",
  "/privacy",
] as const;
