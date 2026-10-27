/**
 * Content types.
 *
 * These mirror the shapes the legacy Express API returned from
 * /api/website/* (see server/routes.ts ~17692-17900), minus the fields the old
 * client never read. Keeping the wire format means the Phase 3 data swap is a
 * change of function, not a change of types - every page keeps rendering
 * whatever `getHomeContent()` hands it, whether that is a Postgres row, a
 * Supabase select, or this file.
 */

export type CmsSliderItem = {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaText: string | null;
  ctaHref: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type CmsPartner = {
  id: string;
  name: string;
  logoUrl: string;
  href: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type CmsFeaturedSkill = {
  id: string;
  title: string;
  /** Legacy stored a Font Awesome class. We keep the key so CMS rows survive
   *  the migration, but resolve it through a local icon map rather than
   *  loading a 40 KB icon font to draw one glyph. */
  iconClass: string;
  metaText: string | null;
  resourceCount: number;
  href: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type CmsHappyFace = {
  id: string;
  quote: string;
  title: string;
  name: string;
  company: string | null;
  avatarUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type CmsFaqItem = {
  id: string;
  category: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
};

export type CmsBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  bannerImageUrl: string | null;
  body: string;
  publishedAt: string;
  status: "draft" | "published" | "archived";
};

/**
 * Pricing plan. Money is in minor units (paise / cents) exactly as the legacy
 * `pricing_plans` table stored it - the old client divided by 100 inline in
 * four separate places, which is how the Pricing page and the Home pricing
 * section drifted to different fallback prices ($1/$2 vs $5/$10). Minor units
 * move the arithmetic into one formatter.
 */
export type CmsPlan = {
  id: string;
  slug: string;
  displayName: string;
  currency: "INR" | "USD";
  priceHourlyMinor: number;
  perHireChargeMinor: number;
  internshipDuration: string;
  features: string[];
  /** ✓ / ✗ rows on the plan card. */
  featureList: CmsPlanFeature[];
  /** Struck-through "was" prices; null hides the strikethrough. */
  compareAtHourlyMinor: number | null;
  compareAtPerHireMinor: number | null;
  isFeatured: boolean;
  gstApplicable: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type CmsPlanFeature = { label: string; included: boolean };

export type CmsHome = {
  slider: CmsSliderItem[];
  blogs: CmsBlogPost[];
  skills: CmsFeaturedSkill[];
  faces: CmsHappyFace[];
  partners: CmsPartner[];
  plans: CmsPlan[];
  faq: CmsFaqItem[];
};

/** A legal document as stored in the CMS. */
export type CmsLegalDoc = {
  id: string;
  title: string;
  /** Raw CMS HTML. Must go through sanitizeRichText before rendering. */
  html: string;
  updated?: string;
  href: string;
};

export type CmsCollegePartner = { id: string; name: string; city: string | null; logoUrl: string | null };

export type CmsCollegePitch = {
  eyebrow: string;
  lead: string;
  accent: string;
  sub: string;
  points: { title: string; body: string }[];
  cta: { label: string; href: string };
  loginHref: string;
};
