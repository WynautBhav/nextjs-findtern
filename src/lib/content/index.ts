import { FAQ_ITEMS } from "./faq";
import {
  FEATURED_SKILLS,
  HAPPY_FACES,
  PARTNERS,
} from "./proof";
import {
  POPULAR_STEPS,
  PRICING_PLANS,
  PRICING_PLANS_USD,
} from "./home";
import { BLOG_POSTS } from "./blog";
import type { CmsBlogPost, CmsHome, CmsLegalDoc, CmsPlan } from "./types";
import { EMPLOYER_TERMS, PLATFORM_TERMS } from "./legal";
import { INTERN_NDA, INTERN_TERMS } from "./legal-intern";
import { getDb, schema, hasDb } from "@/lib/db";
import { eq, desc, asc, sql } from "drizzle-orm";
import { inrMinorToUsdMinor } from "@/lib/currency";

/* ==========================================================================
   Content accessors - the seam for the data layer
   --------------------------------------------------------------------------
   Every page reads content through these functions and never imports the data
   files directly. They are async even though they resolve immediately, so
   swapping in a database call does not force every `await` to be unwrapped.

   Each accessor tries the database first and falls back to the mirrored TS
   content when the DB is unavailable or the table is empty. This keeps the
   marketing site rendering during local dev without a seeded DB, while
   production reads the same tables the admin CMS writes.
   ========================================================================== */

async function tryDb<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!hasDb()) return fallback;
  try {
    const result = await fn();
    return result ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getHomeContent(): Promise<CmsHome> {
  const [blogs, skills, faces, partners, plans, faq] = await Promise.all([
    getBlogPosts(),
    getFeaturedSkills(),
    getHappyFaces(),
    getPartners(),
    getPlans(true),
    getFaqItems(),
  ]);
  return {
    slider: [],
    blogs: blogs.slice(0, 3),
    skills,
    faces,
    partners,
    plans,
    faq,
  };
}

export async function getPartners() {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select().from(schema.websitePartners).where(eq(schema.websitePartners.isActive, true)).orderBy(asc(schema.websitePartners.sortOrder));
    return rows.length ? (rows as unknown as typeof PARTNERS) : PARTNERS;
  }, PARTNERS);
}

export async function getFeaturedSkills() {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select().from(schema.websiteFeaturedSkills).where(eq(schema.websiteFeaturedSkills.isActive, true)).orderBy(asc(schema.websiteFeaturedSkills.sortOrder));
    return rows.length ? (rows as unknown as typeof FEATURED_SKILLS) : FEATURED_SKILLS;
  }, FEATURED_SKILLS);
}

export async function getHappyFaces() {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select().from(schema.websiteHappyFaces).where(eq(schema.websiteHappyFaces.isActive, true)).orderBy(asc(schema.websiteHappyFaces.sortOrder));
    return rows.length ? (rows as unknown as typeof HAPPY_FACES) : HAPPY_FACES;
  }, HAPPY_FACES);
}

export async function getFaqItems() {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select().from(schema.websiteFaqs).where(eq(schema.websiteFaqs.isActive, true)).orderBy(asc(schema.websiteFaqs.sortOrder));
    return rows.length ? (rows as unknown as typeof FAQ_ITEMS) : FAQ_ITEMS;
  }, FAQ_ITEMS);
}

export async function getPopularSteps() {
  return POPULAR_STEPS;
}

/**
 * Pricing for a region.
 *
 * Source of truth is the `pricing_plans` table, which `db:seed` populates with
 * exactly the figures the legacy site hardcoded in the client
 * (₹100/hr Cappuccino, ₹200/hr Latte, ₹5,000 per-hire Espresso) and which an
 * admin can edit from /admin/cms. The PRICING_PLANS constants below are the
 * fallback for when the database is unreachable - they are no longer what the
 * public sees.
 *
 * Only the INR rows are read. The USD card is derived from them at the fixed
 * ₹100 = $1 rule (lib/currency), so an admin edits one price and both
 * regions follow; legacy USD rows in the table are ignored.
 */
export async function getPlans(isIndia: boolean): Promise<CmsPlan[]> {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true)).orderBy(asc(schema.pricingPlans.sortOrder));
    const inr = rows.filter((r) => String(r.currency).toUpperCase() === "INR");
    if (!inr.length) return isIndia ? PRICING_PLANS : PRICING_PLANS_USD;
    const plans = withPlanDefaults(inr.map(rowToPlan));
    return isIndia ? plans : plans.map(planToUsd);
  }, isIndia ? PRICING_PLANS : PRICING_PLANS_USD);
}

function rowToPlan(r: typeof schema.pricingPlans.$inferSelect): CmsPlan {
  return {
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    currency: "INR",
    priceHourlyMinor: r.priceHourlyMinor,
    perHireChargeMinor: r.perHireChargeMinor,
    internshipDuration: r.internshipDuration ?? "",
    features: r.features ?? [],
    featureList: r.featureList ?? [],
    compareAtHourlyMinor: r.compareAtHourlyMinor,
    compareAtPerHireMinor: r.compareAtPerHireMinor,
    isFeatured: r.isFeatured,
    gstApplicable: r.gstApplicable,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
  };
}

/** Rows saved before the ✓/✗ list and featured flag existed get the
 *  authored defaults for their slug, so no card renders empty. */
function withPlanDefaults(plans: CmsPlan[]): CmsPlan[] {
  const anyFeatured = plans.some((p) => p.isFeatured);
  return plans.map((p) => {
    const authored = PRICING_PLANS.find((a) => a.slug === p.slug);
    return {
      ...p,
      featureList: p.featureList.length ? p.featureList : (authored?.featureList ?? []),
      isFeatured: anyFeatured ? p.isFeatured : Boolean(authored?.isFeatured),
    };
  });
}

/** USD is never stored separately: ₹100 = $1, applied to the INR row. */
function planToUsd(p: CmsPlan): CmsPlan {
  const usd = (minor: number | null) => (minor == null ? null : inrMinorToUsdMinor(minor));
  return {
    ...p,
    currency: "USD",
    priceHourlyMinor: inrMinorToUsdMinor(p.priceHourlyMinor),
    perHireChargeMinor: inrMinorToUsdMinor(p.perHireChargeMinor),
    compareAtHourlyMinor: usd(p.compareAtHourlyMinor),
    compareAtPerHireMinor: usd(p.compareAtPerHireMinor),
    gstApplicable: false,
  };
}

/* Blog images are stored inline as base64 data URLs (46 of them, up to 500 KB
   each). The list and detail accessors never load them: they return the
   /api/blog-image route instead, which serves one image with caching. */
const t = schema.websiteBlogPosts;
const blogColumns = {
  id: t.id,
  slug: t.slug,
  title: t.title,
  excerpt: t.excerpt,
  body: t.body,
  status: t.status,
  publishedAt: t.publishedAt,
  hasCover: sql<boolean>`${t.coverImageUrl} is not null and ${t.coverImageUrl} <> ''`,
  hasBanner: sql<boolean>`${t.bannerImageUrl} is not null and ${t.bannerImageUrl} <> ''`,
};

function withImageRoutes({ hasCover, hasBanner, ...row }: { hasCover: boolean; hasBanner: boolean; slug: string }): CmsBlogPost {
  const base = `/api/blog-image/${encodeURIComponent(row.slug)}`;
  return {
    ...(row as unknown as CmsBlogPost),
    coverImageUrl: hasCover ? `${base}/cover` : null,
    bannerImageUrl: hasBanner ? `${base}/banner` : null,
  };
}

export async function getBlogPosts(): Promise<CmsBlogPost[]> {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select(blogColumns).from(t).where(eq(t.status, "published")).orderBy(desc(t.publishedAt));
    return rows.length ? rows.map(withImageRoutes) : BLOG_POSTS;
  }, BLOG_POSTS);
}

export async function getBlogPost(slug: string): Promise<CmsBlogPost | null> {
  return tryDb(async () => {
    const db = getDb();
    const [row] = await db.select(blogColumns).from(t).where(eq(t.slug, slug)).limit(1);
    return row ? withImageRoutes(row) : (BLOG_POSTS.find((p) => p.slug === slug) ?? null);
  }, BLOG_POSTS.find((p) => p.slug === slug) ?? null);
}

/** Raw stored value of a post's cover or banner (a data: or http(s) URL). */
export async function getBlogImage(slug: string, kind: "cover" | "banner"): Promise<string | null> {
  return tryDb(async () => {
    const db = getDb();
    const [row] = await db
      .select({ cover: t.coverImageUrl, banner: t.bannerImageUrl })
      .from(t)
      .where(eq(t.slug, slug))
      .limit(1);
    if (!row) return null;
    return (kind === "banner" ? row.banner || row.cover : row.cover) || null;
  }, null);
}

/* --------------------------------------------------------------------------
   Legal documents. One row per table, written by the admin editors
   (/admin/cms/terms, /admin/companies/terms, /admin/interns/terms). An empty
   table or an unreachable DB serves the TS copy, so the pages never go blank.
   -------------------------------------------------------------------------- */

type LegalTable =
  | typeof schema.websiteTerms
  | typeof schema.employerTerms
  | typeof schema.internTerms;

async function getLegalDoc(table: LegalTable, fallback: CmsLegalDoc): Promise<CmsLegalDoc> {
  return tryDb(async () => {
    const db = getDb();
    const [row] = await db.select().from(table).limit(1);
    if (!row?.bodyHtml?.trim()) return fallback;
    return {
      ...fallback,
      title: row.title || fallback.title,
      html: row.bodyHtml,
      updated: (row.updatedAt ?? row.createdAt)?.toISOString().slice(0, 10) ?? fallback.updated,
    };
  }, fallback);
}

export function getPlatformTerms() {
  return getLegalDoc(schema.websiteTerms, PLATFORM_TERMS);
}

export function getEmployerTerms() {
  return getLegalDoc(schema.employerTerms, EMPLOYER_TERMS);
}

export function getInternTerms() {
  return getLegalDoc(schema.internTerms, INTERN_TERMS);
}

/** Active NDA clauses in order, joined into one document. */
export async function getInternNda(): Promise<CmsLegalDoc> {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.internNonDisclosureClauses)
      .where(eq(schema.internNonDisclosureClauses.isActive, true))
      .orderBy(asc(schema.internNonDisclosureClauses.sortOrder));
    if (!rows.length) return INTERN_NDA;
    const latest = rows.reduce<Date | null>((acc, r) => {
      const t = r.updatedAt ?? r.createdAt;
      return t && (!acc || t > acc) ? t : acc;
    }, null);
    return {
      ...INTERN_NDA,
      title: rows.length === 1 ? rows[0].title || INTERN_NDA.title : INTERN_NDA.title,
      html: rows.length === 1 ? rows[0].bodyHtml : rows.map((r) => `<h2>${r.title}</h2>${r.bodyHtml}`).join("\n"),
      updated: latest?.toISOString().slice(0, 10) ?? INTERN_NDA.updated,
    };
  }, INTERN_NDA);
}

export { BLOG_POSTS, FAQ_ITEMS, POPULAR_STEPS, PRICING_PLANS };
export * from "./types";
export * from "./site";
