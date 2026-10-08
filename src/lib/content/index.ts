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
import type { CmsBlogPost, CmsHome, CmsPlan } from "./types";
import { getDb, schema, hasDb } from "@/lib/db";
import { eq, desc, asc } from "drizzle-orm";

/* ==========================================================================
   Content accessors — the seam for the data layer
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
 * fallback for when the database is unreachable — they are no longer what the
 * public sees.
 */
export async function getPlans(isIndia: boolean): Promise<CmsPlan[]> {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true)).orderBy(asc(schema.pricingPlans.sortOrder));
    return rows.length ? (rows as unknown as CmsPlan[]) : (isIndia ? PRICING_PLANS : PRICING_PLANS_USD);
  }, isIndia ? PRICING_PLANS : PRICING_PLANS_USD);
}

export async function getBlogPosts(): Promise<CmsBlogPost[]> {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select().from(schema.websiteBlogPosts).where(eq(schema.websiteBlogPosts.status, "published")).orderBy(desc(schema.websiteBlogPosts.publishedAt));
    return rows.length ? (rows as unknown as CmsBlogPost[]) : BLOG_POSTS;
  }, BLOG_POSTS);
}

export async function getBlogPost(slug: string): Promise<CmsBlogPost | null> {
  return tryDb(async () => {
    const db = getDb();
    const [row] = await db.select().from(schema.websiteBlogPosts).where(eq(schema.websiteBlogPosts.slug, slug)).limit(1);
    return row ? (row as unknown as CmsBlogPost) : (BLOG_POSTS.find((p) => p.slug === slug) ?? null);
  }, BLOG_POSTS.find((p) => p.slug === slug) ?? null);
}

export { BLOG_POSTS, FAQ_ITEMS, POPULAR_STEPS, PRICING_PLANS };
export * from "./types";
export * from "./site";
