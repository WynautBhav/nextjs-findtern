import { FAQ_ITEMS, faqItems } from "./faq";
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
import { COLLEGE_PITCH } from "./colleges";
import type { CmsBlogPost, CmsCollegePartner, CmsCollegePitch, CmsHome, CmsLegalDoc, CmsPlan } from "./types";
import { EMPLOYER_TERMS, platformTerms } from "./legal";
import { INTERN_NDA, internTerms } from "./legal-intern";
import { getDb, schema, hasDb } from "@/lib/db";
import { eq, desc, asc, sql, and, inArray } from "drizzle-orm";
import { inrMinorToUsdMinor } from "@/lib/currency";
import { getPricingConfig } from "@/lib/platform-settings";
import { PRICING_DEFAULTS, type PricingConfig } from "@/lib/pricing-config";
import { blogImageRoutes, cmsImageSrc, imageVersion } from "./image-response";
import { unstable_cache } from "next/cache";
import { loadPublicStudents, studentsForSkill } from "@/lib/skill-benches";

/* ==========================================================================
   Content accessors - the seam for the data layer
   --------------------------------------------------------------------------
   Every page reads content through these functions and never imports the data
   files directly. They are async even though they resolve immediately, so
   swapping in a database call does not force every `await` to be unwrapped.

   Each accessor tries the database first and falls back to the mirrored TS
   content when the DB cannot be reached, or the CMS collection has never been
   used (see `builtInApplies`). This keeps the marketing site rendering during
   local dev without a seeded DB, while production reads the same tables the
   admin CMS writes.
   ========================================================================== */

/** The database's answer, or `fallback` when there is no database or the query throws. A null answer is an answer. */
async function tryDb<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!hasDb()) return fallback;
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Whether the built-in copy may stand in for a CMS collection the database answered about.
 *
 * Rule: only when the collection has never been used - its table has no row at all (any status, active or not) AND
 * the audit log holds no cms.create / cms.update / cms.delete for it. That is the first-run case (a fresh database
 * before db:seed or any admin edit). Once the CMS has held the collection, the database is the truth: a deleted post
 * stays deleted, and unpublishing or switching off the last item shows an empty section instead of the seed copy
 * coming back. (A database that cannot be reached never gets here: tryDb serves the built-in copy.)
 * The audit log is append-only, which is what lets "deleted the last row" be told apart from "never had one" without
 * a tombstone table. Costs one extra query, and only when the collection came back empty.
 */
async function builtInApplies(table: CmsContentTable, type: ContentCollection): Promise<boolean> {
  const db = getDb();
  const [anyRow] = await db.select({ id: table.id }).from(table).limit(1);
  if (anyRow) return false;
  const a = schema.adminAuditLog;
  const [edited] = await db
    .select({ id: a.id })
    .from(a)
    .where(and(inArray(a.action, ["cms.create", "cms.update", "cms.delete"]), sql`${a.meta}->>'type' = ${type}`))
    .limit(1);
  return !edited;
}

type ContentCollection = "blog" | "partner" | "faq" | "testimonial" | "skill";
type CmsContentTable =
  | typeof schema.websiteBlogPosts
  | typeof schema.websitePartners
  | typeof schema.websiteFaqs
  | typeof schema.websiteHappyFaces
  | typeof schema.websiteFeaturedSkills;

/** A list the CMS answered with nothing in: the built-in list on first run, otherwise empty. */
async function emptyOrBuiltIn<T extends unknown[]>(table: CmsContentTable, type: ContentCollection, builtIn: T | (() => Promise<T>)): Promise<T> {
  if (!(await builtInApplies(table, type))) return [] as unknown as T;
  return typeof builtIn === "function" ? builtIn() : builtIn;
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
    if (!rows.length) return emptyOrBuiltIn(schema.websitePartners, "partner", PARTNERS);
    return rows.map((r) => ({ ...r, logoUrl: cmsImageSrc(r.logoUrl, `/api/cms-image/partner/${r.id}`, imageVersion(r.updatedAt)) ?? "" })) as unknown as typeof PARTNERS;
  }, PARTNERS);
}

/** Partner colleges Findtern staff chose to show, plus the pitch copy. */
export async function getCollegePartners(): Promise<{ pitch: CmsCollegePitch; partners: CmsCollegePartner[] }> {
  const partners = await tryDb(async () => {
    const c = schema.colleges;
    return getDb()
      .select({ id: c.id, name: c.name, city: c.city, logoUrl: c.logoUrl })
      .from(c)
      .where(sql`${c.isActive} AND ${c.isPartner} AND ${c.showOnWebsite}`)
      .orderBy(asc(c.sortOrder), asc(c.name));
  }, [] as CmsCollegePartner[]);
  return { pitch: COLLEGE_PITCH, partners };
}

export async function getFeaturedSkills() {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select().from(schema.websiteFeaturedSkills).where(eq(schema.websiteFeaturedSkills.isActive, true)).orderBy(asc(schema.websiteFeaturedSkills.sortOrder));
    if (!rows.length) return emptyOrBuiltIn(schema.websiteFeaturedSkills, "skill", FEATURED_SKILLS);
    // The stored resource_count is a hand-typed number; the card must show the
    // live bench size. If the candidate query fails, keep the stored number.
    const pool = await liveBenchPool().catch(() => null);
    return rows.map((r) => (pool ? { ...r, resourceCount: studentsForSkill(pool, r.title).length } : r)) as unknown as typeof FEATURED_SKILLS;
  }, FEATURED_SKILLS);
}

// Cached 5 min so the home page does not scan the candidate pool on every view.
const liveBenchPool = unstable_cache(loadPublicStudents, ["live-bench-pool"], { revalidate: 300 });

export async function getHappyFaces() {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select().from(schema.websiteHappyFaces).where(eq(schema.websiteHappyFaces.isActive, true)).orderBy(asc(schema.websiteHappyFaces.sortOrder));
    if (!rows.length) return emptyOrBuiltIn(schema.websiteHappyFaces, "testimonial", HAPPY_FACES);
    return rows.map((r) => ({ ...r, avatarUrl: cmsImageSrc(r.avatarUrl, `/api/cms-image/face/${r.id}`, imageVersion(r.updatedAt)) })) as unknown as typeof HAPPY_FACES;
  }, HAPPY_FACES);
}

export async function getFaqItems() {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select().from(schema.websiteFaqs).where(eq(schema.websiteFaqs.isActive, true)).orderBy(asc(schema.websiteFaqs.sortOrder));
    // The built-in answers quote the AI interview and hiring fees: render them from the live pricing config.
    return rows.length ? (rows as unknown as typeof FAQ_ITEMS) : emptyOrBuiltIn(schema.websiteFaqs, "faq", async () => faqItems(await getPricingConfig()));
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
  updatedAt: t.updatedAt,
  hasCover: sql<boolean>`${t.coverImageUrl} is not null and ${t.coverImageUrl} <> ''`,
  hasBanner: sql<boolean>`${t.bannerImageUrl} is not null and ${t.bannerImageUrl} <> ''`,
};

function withImageRoutes({ hasCover, hasBanner, updatedAt, ...row }: { hasCover: boolean; hasBanner: boolean; updatedAt: Date | null; slug: string }): CmsBlogPost {
  const { cover, banner } = blogImageRoutes(row.slug, hasCover, hasBanner, imageVersion(updatedAt));
  return { ...(row as unknown as CmsBlogPost), coverImageUrl: cover, bannerImageUrl: banner };
}

export async function getBlogPosts(): Promise<CmsBlogPost[]> {
  return tryDb(async () => {
    const db = getDb();
    const rows = await db.select(blogColumns).from(t).where(eq(t.status, "published")).orderBy(desc(t.publishedAt));
    return rows.length ? rows.map(withImageRoutes) : emptyOrBuiltIn(t, "blog", FALLBACK_POSTS);
  }, FALLBACK_POSTS);
}

/**
 * One post by slug, published only (SYS-01; legacy 404'd anything else). A
 * draft in the CMS hides the post even when the TS fallback has a copy of
 * it, so unpublishing in the admin takes it off the site, and a post deleted
 * in the admin stays gone (the built-in copy only applies per `builtInApplies`).
 */
export async function getBlogPost(slug: string): Promise<CmsBlogPost | null> {
  return tryDb(async () => {
    const db = getDb();
    const [row] = await db.select(blogColumns).from(t).where(eq(t.slug, slug)).limit(1);
    if (row) return isPublished(row.status) ? withImageRoutes(row) : null;
    return (await builtInApplies(t, "blog")) ? (FALLBACK_POSTS.find((p) => p.slug === slug) ?? null) : null;
  }, FALLBACK_POSTS.find((p) => p.slug === slug) ?? null);
}

function isPublished(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === "published";
}

/** Raw stored value of a partner logo or happy-face avatar. */
export async function getCmsImage(kind: "partner" | "face", id: string): Promise<string | null> {
  return tryDb(async () => {
    const db = getDb();
    if (kind === "partner") {
      const p = schema.websitePartners;
      const [row] = await db.select({ v: p.logoUrl }).from(p).where(eq(p.id, id)).limit(1);
      return row?.v ?? null;
    }
    const f = schema.websiteHappyFaces;
    const [row] = await db.select({ v: f.avatarUrl }).from(f).where(eq(f.id, id)).limit(1);
    return row?.v ?? null;
  }, null);
}

/** Raw stored value of a post's cover or banner (a data: or http(s) URL). */
export async function getBlogImage(slug: string, kind: "cover" | "banner"): Promise<string | null> {
  const fallback = BLOG_POSTS.find((p) => p.slug === slug);
  const fromFallback = fallback ? (kind === "banner" ? fallback.bannerImageUrl || fallback.coverImageUrl : fallback.coverImageUrl) || null : null;
  return tryDb(async () => {
    const db = getDb();
    const [row] = await db
      .select({ cover: t.coverImageUrl, banner: t.bannerImageUrl, status: t.status })
      .from(t)
      .where(eq(t.slug, slug))
      .limit(1);
    if (!row) return (await builtInApplies(t, "blog")) ? fromFallback : null;
    // A draft's images are as private as its text (SYS-01).
    if (!isPublished(row.status)) return null;
    return (kind === "banner" ? row.banner || row.cover : row.cover) || null;
  }, fromFallback);
}

/**
 * The TS fallback posts carry their images inline as base64 (that is how the
 * CMS stores them), which once made /blog a 6 MB page whenever the database
 * was empty or unreachable. Route them through /api/blog-image like DB rows.
 */
const FALLBACK_POSTS: CmsBlogPost[] = BLOG_POSTS.map((p) => ({
  ...p,
  coverImageUrl: p.coverImageUrl ? `/api/blog-image/${p.slug}/cover` : null,
  bannerImageUrl: p.bannerImageUrl ? `/api/blog-image/${p.slug}/banner` : null,
}));

/* --------------------------------------------------------------------------
   Legal documents. One row per table, written by the admin editors
   (/admin/cms/terms, /admin/companies/terms, /admin/interns/terms). An empty
   table or an unreachable DB serves the TS copy, so the pages never go blank.
   -------------------------------------------------------------------------- */

type LegalTable =
  | typeof schema.websiteTerms
  | typeof schema.employerTerms
  | typeof schema.internTerms;

/**
 * The newest saved document, else the built-in copy. The built-in copy quotes prices, so it is rendered for the live
 * pricing config (`build`); an unreachable database means unreachable pricing too, which is the published defaults.
 */
async function getLegalDoc(table: LegalTable, build: (config: PricingConfig) => CmsLegalDoc): Promise<CmsLegalDoc> {
  const fallback = build(PRICING_DEFAULTS);
  return tryDb(async () => {
    const db = getDb();
    // The newest row is the live one, matching the admin editor and legacy.
    const [row] = await db.select().from(table).orderBy(desc(table.updatedAt), desc(table.createdAt)).limit(1);
    if (!row?.bodyHtml?.trim()) return build(await getPricingConfig());
    return {
      ...fallback,
      title: row.title || fallback.title,
      html: row.bodyHtml,
      updated: (row.updatedAt ?? row.createdAt)?.toISOString().slice(0, 10) ?? fallback.updated,
    };
  }, fallback);
}

export function getPlatformTerms() {
  return getLegalDoc(schema.websiteTerms, platformTerms);
}

export function getEmployerTerms() {
  return getLegalDoc(schema.employerTerms, () => EMPLOYER_TERMS);
}

export function getInternTerms() {
  return getLegalDoc(schema.internTerms, internTerms);
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
    // Legacy shows the first active clause only (ADP-14); older inactive
    // or later rows are drafts the admin kept, not parts of one document.
    const [first] = rows;
    if (!first) return INTERN_NDA;
    const updated = first.updatedAt ?? first.createdAt;
    return {
      ...INTERN_NDA,
      title: first.title || INTERN_NDA.title,
      html: first.bodyHtml,
      updated: updated?.toISOString().slice(0, 10) ?? INTERN_NDA.updated,
    };
  }, INTERN_NDA);
}

export { BLOG_POSTS, FAQ_ITEMS, POPULAR_STEPS, PRICING_PLANS };
export * from "./types";
export * from "./site";
