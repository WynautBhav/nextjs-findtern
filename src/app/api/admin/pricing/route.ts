import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { diffFields, recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { PRICING_PLANS } from "@/lib/content/home";
import { getSetting, setSetting } from "@/lib/platform-settings";
import { PER_HIRE_FEE_KEY, parsePerHireFeeSetting } from "@/lib/per-hire-fee";
import { perHireFeeAuditMeta } from "@/lib/admin/per-hire-fee-setting";
import { PRICING_REVALIDATE, activationFeeAuditMeta, parsePricingPut, stipendSaveAuditMeta } from "@/lib/admin/pricing-put";
import { INTERN_STIPEND_KEY, parseStipendBands } from "@/lib/pricing-config";
import { writePlan, type PlanStore } from "@/lib/admin/pricing-plan-write";

/**
 * Admin rate card. Only INR rows are edited - USD is derived at ₹100 = $1
 * (lib/currency) wherever a price is shown or charged. All amounts arrive in
 * minor units (paise); the editor converts from rupees.
 */

const minor = z.number().int().min(0).max(100_000_000);

const planSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(1).max(40).optional(),
  priceHourlyMinor: minor.optional(),
  perHireChargeMinor: minor.optional(),
  compareAtHourlyMinor: minor.nullable().optional(),
  compareAtPerHireMinor: minor.nullable().optional(),
  internshipDuration: z.string().trim().max(60).optional(),
  features: z.array(z.string().trim().max(120)).max(3).optional(),
  featureList: z
    .array(z.object({ label: z.string().trim().min(1).max(120), included: z.boolean() }))
    .max(12)
    .optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/** Every pricing write ends here: the public pages and /llms.txt print prices, so purge them all. */
function revalidatePricing() {
  for (const { path, type } of PRICING_REVALIDATE) {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
  }
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** The drizzle half of `PlanStore`, bound to one transaction. */
function drizzlePlanStore(tx: Tx): PlanStore {
  const t = schema.pricingPlans;
  return {
    async lock() {
      // Serialises pricing writers for the length of the transaction; released on commit/rollback.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('pricing_plans'))`);
    },
    async getPlan(id) {
      const [row] = await tx.select().from(t).where(eq(t.id, id)).limit(1);
      return row;
    },
    async updatePlan(id, set) {
      await tx.update(t).set(set).where(eq(t.id, id));
    },
    async updateUsdBySlug(slug, set) {
      await tx.update(t).set(set).where(and(eq(t.slug, slug), eq(t.currency, "USD")));
    },
    async listInr() {
      return tx.select().from(t).where(sql`upper(${t.currency}) = 'INR'`).orderBy(asc(t.sortOrder));
    },
    async unfeatureInr(ids, at) {
      if (ids.length) await tx.update(t).set({ isFeatured: false, updatedAt: at }).where(inArray(t.id, ids));
    },
    async syncUsdFeatured(slug, at) {
      const usdRows = sql`upper(${t.currency}) = 'USD'`;
      await tx.update(t).set({ isFeatured: false, updatedAt: at }).where(and(usdRows, eq(t.isFeatured, true), slug === null ? undefined : ne(t.slug, slug)));
      if (slug !== null) await tx.update(t).set({ isFeatured: true, updatedAt: at }).where(and(usdRows, eq(t.slug, slug), eq(t.isFeatured, false)));
    },
  };
}

export async function PATCH(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = planSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id, ...fields } = parsed.data;

  // One transaction: the write, the one-"Most popular" rule and the audit row land together
  // or not at all (lib/admin/pricing-plan-write.ts has the rules).
  const now = new Date();
  const result = await getDb().transaction(async (tx) => {
    const written = await writePlan(drizzlePlanStore(tx), id, fields, now);
    if (!written.ok) return written;
    await recordAdminAudit(tx, {
      adminId: guard.session.uid,
      action: "pricing.update",
      targetType: "pricing_plan",
      targetId: id,
      meta: {
        plan: written.before.displayName,
        changes: diffFields(written.before, fields),
        ...(written.unfeatured.length ? { unfeatured: written.unfeatured.map((p) => p.displayName) } : {}),
      },
    }, { strict: true });
    return written;
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  revalidatePricing();
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  // One schema per setting, picked by the body's shape (lib/admin/pricing-put.ts).
  const put = parsePricingPut(await req.json().catch(() => null));
  if (put.kind === "invalid") return NextResponse.json({ error: put.error }, { status: 400 });

  // Which bands pay the one-time hiring fee (lib/per-hire-fee.ts): read by billing and every public price line.
  if (put.kind === "perHireFee") {
    const from = parsePerHireFeeSetting(await getSetting(PER_HIRE_FEE_KEY));
    const to = put.bands;
    await setSetting(PER_HIRE_FEE_KEY, to, guard.session.uid);
    await recordAdminAudit(getDb(), {
      adminId: guard.session.uid,
      action: "settings.update",
      targetType: "platform_setting",
      targetId: PER_HIRE_FEE_KEY,
      meta: perHireFeeAuditMeta(from, to),
    }, { strict: true });
    // The public pages and the employer cart/checkout read this setting.
    revalidatePricing();
    revalidatePath("/employer", "layout");
    return NextResponse.json({ ok: true, perHireFeeBands: to });
  }

  // Fixed monthly intern stipend per band (lib/pricing-config.ts): Espresso null, Cappuccino and Latte paise.
  if (put.kind === "stipend") {
    const from = parseStipendBands(await getSetting(INTERN_STIPEND_KEY));
    const to = put.bands;
    await setSetting(INTERN_STIPEND_KEY, to, guard.session.uid);
    await recordAdminAudit(getDb(), {
      adminId: guard.session.uid,
      action: "settings.update",
      targetType: "platform_setting",
      targetId: INTERN_STIPEND_KEY,
      meta: stipendSaveAuditMeta(from, to),
    }, { strict: true });
    revalidatePricing();
    return NextResponse.json({ ok: true, internStipendBands: to });
  }

  const before = await getSetting("intern_activation_fee_minor");
  await setSetting("intern_activation_fee_minor", put.feeMinor, guard.session.uid);
  await recordAdminAudit(getDb(), {
    adminId: guard.session.uid,
    action: "settings.update",
    targetType: "platform_setting",
    targetId: "intern_activation_fee_minor",
    meta: activationFeeAuditMeta(before, put.feeMinor),
  }, { strict: true });
  revalidatePricing();
  return NextResponse.json({ ok: true });
}

/** Creates the INR plan rows from the built-in rate card, once. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const existing = await db
    .select({ id: schema.pricingPlans.id })
    .from(schema.pricingPlans)
    .where(eq(schema.pricingPlans.currency, "INR"))
    .limit(1);
  if (existing.length) return NextResponse.json({ error: "Plans already exist" }, { status: 409 });

  await db.insert(schema.pricingPlans).values(
    PRICING_PLANS.map((p) => ({
      slug: p.slug,
      displayName: p.displayName,
      region: "IN",
      currency: "INR",
      priceHourlyMinor: p.priceHourlyMinor,
      perHireChargeMinor: p.perHireChargeMinor,
      internshipDuration: p.internshipDuration,
      features: p.features,
      featureList: p.featureList,
      compareAtHourlyMinor: p.compareAtHourlyMinor,
      compareAtPerHireMinor: p.compareAtPerHireMinor,
      isFeatured: p.isFeatured,
      gstApplicable: true,
      sortOrder: p.sortOrder,
      isActive: true,
    })),
  );
  revalidatePricing();
  return NextResponse.json({ ok: true }, { status: 201 });
}
