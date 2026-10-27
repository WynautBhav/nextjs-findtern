import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { PRICING_PLANS } from "@/lib/content/home";
import { setSetting } from "@/lib/platform-settings";
import { legacyBandChange } from "@/lib/admin/plan-band";
import { inrMinorToUsdMinor } from "@/lib/currency";

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

const settingsSchema = z.object({
  internActivationFeeMinor: minor.refine((v) => v > 0, "Fee must be above zero"),
});

export async function PATCH(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = planSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id, ...fields } = parsed.data;

  const db = getDb();
  const [plan] = await db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.id, id)).limit(1);
  if (!plan || plan.currency.toUpperCase() !== "INR") {
    return NextResponse.json({ error: "Unknown plan" }, { status: 404 });
  }

  // DB-26: legacy prices candidates from features[1]; never let a reword
  // break a band it can read.
  if (fields.features) {
    const change = legacyBandChange((plan.features ?? [])[1], fields.features[1]);
    if (change?.block) return NextResponse.json({ error: change.message }, { status: 400 });
  }

  await db.update(schema.pricingPlans).set({ ...fields, updatedAt: new Date() }).where(eq(schema.pricingPlans.id, id));

  // ADM-17: the new app derives USD from INR, but the legacy site (rollback
  // target) still reads its own USD rows. Keep them in step at ₹100 = $1.
  const usd = (v: number | null | undefined) => (v == null ? v : inrMinorToUsdMinor(v));
  const mirror = Object.fromEntries(
    Object.entries({
      displayName: fields.displayName,
      priceHourlyMinor: usd(fields.priceHourlyMinor),
      perHireChargeMinor: usd(fields.perHireChargeMinor),
      compareAtHourlyMinor: usd(fields.compareAtHourlyMinor),
      compareAtPerHireMinor: usd(fields.compareAtPerHireMinor),
      internshipDuration: fields.internshipDuration,
      features: fields.features,
      isActive: fields.isActive,
    }).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(mirror).length) {
    await db
      .update(schema.pricingPlans)
      .set({ ...mirror, updatedAt: new Date() })
      .where(and(eq(schema.pricingPlans.slug, plan.slug), eq(schema.pricingPlans.currency, "USD")));
  }
  // One "Most popular" at a time.
  if (fields.isFeatured) {
    await db
      .update(schema.pricingPlans)
      .set({ isFeatured: false, updatedAt: new Date() })
      .where(and(ne(schema.pricingPlans.id, id), eq(schema.pricingPlans.currency, plan.currency)));
  }
  await db.insert(schema.adminAuditLog).values({
    adminId: guard.session.uid,
    action: "pricing.update",
    targetType: "pricing_plan",
    targetId: id,
    meta: fields,
  });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  await setSetting("intern_activation_fee_minor", parsed.data.internActivationFeeMinor, guard.session.uid);
  const db = getDb();
  await db.insert(schema.adminAuditLog).values({
    adminId: guard.session.uid,
    action: "settings.update",
    targetType: "platform_setting",
    targetId: "intern_activation_fee_minor",
    meta: { value: parsed.data.internActivationFeeMinor },
  });
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
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true }, { status: 201 });
}
