import type { CmsBlogPost, CmsFaqItem, CmsPlan } from "@/lib/content/types";
import { SITE } from "@/lib/content/site";
import { plainTextExcerpt } from "@/lib/richtext";
import { tidyText } from "@/lib/text";

/**
 * Structured data, in one place.
 *
 * Search engines and answer engines (Google AI Overviews, ChatGPT search,
 * Perplexity) read JSON-LD to learn what an entity is, so every builder here
 * names the same `Organization` by `@id`, and every page links back to it.
 * The facts are the published product terms - nothing here is a claim the
 * marketing pages do not already make in plain text.
 *
 * Zero React in this file: it is imported by server components, route
 * handlers (llms.txt, the feed) and could be tested with `node --test`.
 */

export const SITE_URL = SITE.url;
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const LOGO_URL = `${SITE_URL}/media/findtern-logo-green.png`;

/**
 * True when this deployment is not the real domain (a Vercel preview or the
 * staging copy). Read from PUBLIC_ORIGIN, which the hosts already set; an
 * unset value means a local or legacy build and is treated as production.
 */
export function isStagingHost(): boolean {
  const origin = (process.env.PUBLIC_ORIGIN ?? "").trim();
  return origin !== "" && !origin.includes("findtern.in");
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** JSON-LD must not be able to close its own <script>. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/* ── Entities ──────────────────────────────────────────────────────── */

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.name,
    alternateName: "Findtern.in",
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: LOGO_URL, width: 1200, height: 361 },
    description: SITE.description,
    foundingDate: String(SITE.foundedYear),
    email: SITE.email,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Jaipur",
      addressRegion: "Rajasthan",
      addressCountry: "IN",
    },
    areaServed: ["IN", "US", "GB", "AE", "SG", "AU", "CA"],
    knowsAbout: [
      "Internship hiring",
      "Intern screening and assessment",
      "Paid internships in India",
      "Remote interns for overseas companies",
      "AI interviews and aptitude testing",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SITE.email,
        availableLanguage: ["en", "hi"],
        areaServed: "IN",
        url: `${SITE_URL}/contact`,
      },
    ],
    sameAs: Object.values(SITE.social),
  };
}

export function websiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: SITE.name,
    description: SITE.description,
    inLanguage: "en-IN",
    publisher: { "@id": ORG_ID },
  };
}

/** The site-wide graph: rendered once in the root layout. */
export function siteGraph() {
  return { "@context": "https://schema.org", "@graph": [organizationJsonLd(), websiteJsonLd()] };
}

/* ── Page-level builders ───────────────────────────────────────────── */

export type Crumb = { name: string; path: string };

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...crumbs].map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

export function webPageJsonLd(opts: {
  path: string;
  name: string;
  description: string;
  type?: "WebPage" | "AboutPage" | "ContactPage" | "FAQPage" | "CollectionPage";
}) {
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    "@id": `${absoluteUrl(opts.path)}#webpage`,
    url: absoluteUrl(opts.path),
    name: opts.name,
    description: opts.description,
    inLanguage: "en-IN",
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORG_ID },
  };
}

export function faqJsonLd(items: Pick<CmsFaqItem, "question" | "answer">[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: tidyText(i.question),
      acceptedAnswer: { "@type": "Answer", text: tidyText(i.answer) },
    })),
  };
}

export function howToJsonLd(opts: {
  name: string;
  description: string;
  totalTime?: string;
  steps: { name: string; text: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: opts.name,
    description: opts.description,
    ...(opts.totalTime ? { totalTime: opts.totalTime } : {}),
    step: opts.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

/**
 * The rate card as an OfferCatalog on the Service. Prices are INR, the
 * authored currency; USD is derived at ₹100 = $1 on the page, not here.
 */
export function pricingJsonLd(plans: CmsPlan[]) {
  const rupees = (minor: number) => (minor / 100).toFixed(2);
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${SITE_URL}/pricing#service`,
    name: "Findtern intern hiring",
    serviceType: "Intern screening and placement",
    provider: { "@id": ORG_ID },
    areaServed: "IN",
    url: `${SITE_URL}/pricing`,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Findtern plans",
      itemListElement: plans.map((p) => ({
        "@type": "Offer",
        name: `${p.displayName} plan`,
        description: `${p.features[0] ?? ""}. Candidates scoring ${p.features[1] ?? ""}. ${p.internshipDuration}.`.replace(/\.\s*\./g, "."),
        url: `${SITE_URL}/pricing`,
        priceCurrency: "INR",
        priceSpecification: [
          {
            "@type": "UnitPriceSpecification",
            name: "Hourly rate",
            price: rupees(p.priceHourlyMinor),
            priceCurrency: "INR",
            unitCode: "HUR",
            valueAddedTaxIncluded: p.gstApplicable,
          },
          {
            "@type": "PriceSpecification",
            name: "Per-hire charge",
            price: rupees(p.perHireChargeMinor),
            priceCurrency: "INR",
            valueAddedTaxIncluded: p.gstApplicable,
          },
        ],
        availability: "https://schema.org/InStock",
      })),
    },
  };
}

export function blogPostingJsonLd(post: CmsBlogPost) {
  const title = tidyText(post.title);
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: title,
    description: plainTextExcerpt(post.body, 155),
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    inLanguage: "en-IN",
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    // A cover served by /api/blog-image is a stable URL; the per-post card has
    // a build hash in its path, so the site card is the fallback here.
    image: post.coverImageUrl?.startsWith("/") ? [absoluteUrl(post.coverImageUrl)] : [absoluteUrl("/opengraph-image")],
    isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/blog#blog`, name: "Findtern Blog" },
    articleSection: post.slug.toLowerCase().startsWith("employer") ? "For employers" : "For interns",
    wordCount: plainTextExcerpt(post.body, 100000).split(/\s+/).filter(Boolean).length,
  };
}

export function blogListJsonLd(posts: CmsBlogPost[]) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${SITE_URL}/blog#blog`,
    url: `${SITE_URL}/blog`,
    name: "Findtern Blog",
    description: "How intern hiring, scoring, rate cards, timesheets and the guarantee actually work.",
    publisher: { "@id": ORG_ID },
    inLanguage: "en-IN",
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      "@id": `${SITE_URL}/blog/${p.slug}#article`,
      headline: tidyText(p.title),
      url: `${SITE_URL}/blog/${p.slug}`,
      datePublished: p.publishedAt,
    })),
  };
}
