import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { allows } from "@/lib/admin/permissions";
import { loadPromoPrices } from "@/lib/admin/promo-prices";
import { FREE_CODE_NEEDS_FINANCE, promoCodeProblem, promoDiscountProblem, promoMakesFree, promoNumberFields } from "@/lib/admin/promo-edit-rules";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { DUPLICATE_CODE, isUniqueViolation } from "@/lib/promo";
import { PROMO_APPLIES_TO, promoExpiryProblem, promoWindowProblem } from "@/lib/promo-rules";

const bodySchema = z.object({
  code: z.string().trim().min(2, "Code must be at least 2 characters"),
  description: z.string().nullish(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: promoNumberFields.discountValue,
  maxUsages: promoNumberFields.maxUsages.nullish(),
  minOrderAmountMinor: promoNumberFields.minOrderAmountMinor.nullish(),
  validFrom: z.string().datetime().nullish(),
  validUntil: z.string().datetime().nullish(),
  isActive: z.boolean().default(true),
  appliesTo: z.enum(PROMO_APPLIES_TO).default("intern"),
})
  .refine((b) => b.discountType !== "percentage" || b.discountValue === undefined || b.discountValue <= 100, {
    message: "A percentage discount can't be more than 100",
  })
  // Employer codes may not cover the stipend (C1); fixed amounts are checked at quote time, when the stipend is known.
  // A subscription code can't be 100% either; a free subscription is a full-waiver code scoped to it.
  .refine((b) => b.discountType !== "percentage" || b.discountValue !== 100 || b.appliesTo !== "subscription", {
    message: "A subscription code can't be 100%. To give a subscription away, create a full-waiver code for the subscription.",
  })
  .refine((b) => b.discountType !== "percentage" || b.discountValue !== 100 || b.appliesTo === "intern" || b.appliesTo === "subscription", {
    message: "Only an intern code can be 100%. Employer codes can't cover the whole stipend.",
  });

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const bad = promoCodeProblem(parsed.data.code) ?? promoDiscountProblem(parsed.data);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  // A code that makes the price zero (100%, or a fixed amount at or above it) is finance's call, like a full-waiver code.
  if (!allows(guard.session.permissions, ["transactions:write"]) && promoMakesFree(parsed.data, await loadPromoPrices())) {
    return NextResponse.json({ error: FREE_CODE_NEEDS_FINANCE }, { status: 403 });
  }

  const window = promoWindowProblem(
    parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
    parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
  );
  if (window) return NextResponse.json({ error: window }, { status: 400 });
  const expired = promoExpiryProblem(parsed.data.validUntil ? new Date(parsed.data.validUntil) : null);
  if (expired) return NextResponse.json({ error: expired }, { status: 400 });

  const db = getDb();
  const code = parsed.data.code.trim().toUpperCase();
  const [clash] = await db.select({ id: schema.promoCodes.id }).from(schema.promoCodes).where(sql`upper(${schema.promoCodes.code}) = ${code}`).limit(1);
  if (clash) return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });

  try {
    const [promo] = await db.insert(schema.promoCodes).values({
      ...parsed.data,
      code,
      validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
    }).returning();
    await recordAdminAudit(db, { adminId: guard.session.uid, action: "promo.create", targetType: "promo_code", targetId: promo.id, meta: { code, discountType: promo.discountType, discountValue: promo.discountValue, appliesTo: promo.appliesTo, maxUsages: promo.maxUsages } });
    return NextResponse.json({ promo }, { status: 201 });
  } catch (e) {
    // Two creates racing past the check above.
    if (isUniqueViolation(e)) return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
    throw e;
  }
}
