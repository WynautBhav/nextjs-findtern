import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { promoCodeProblem, promoDiscountProblem } from "@/lib/admin/promo-edit-rules";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { DUPLICATE_CODE, isUniqueViolation } from "@/lib/promo";
import { PROMO_APPLIES_TO, promoWindowProblem } from "@/lib/promo-rules";

const bodySchema = z.object({
  code: z.string().trim().min(2, "Code must be at least 2 characters"),
  description: z.string().nullish(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number("Enter a discount value").int("Discount must be a whole number").positive("Discount must be greater than 0"),
  maxUsages: z.number().int().positive("Max uses must be at least 1").nullish(),
  minOrderAmountMinor: z.number().int().min(0, "Minimum order can't be negative").nullish(),
  validFrom: z.string().datetime().nullish(),
  validUntil: z.string().datetime().nullish(),
  isActive: z.boolean().default(true),
  appliesTo: z.enum(PROMO_APPLIES_TO).default("intern"),
})
  .refine((b) => b.discountType !== "percentage" || b.discountValue === undefined || b.discountValue <= 100, {
    message: "A percentage discount can't be more than 100",
  })
  // Employer codes may not cover the stipend (C1); fixed amounts are checked at quote time, when the stipend is known.
  .refine((b) => b.discountType !== "percentage" || b.discountValue !== 100 || b.appliesTo === "intern", {
    message: "Only an intern code can be 100%. Employer codes can't cover the whole stipend.",
  });

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const bad = promoCodeProblem(parsed.data.code) ?? promoDiscountProblem(parsed.data);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const window = promoWindowProblem(
    parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
    parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
  );
  if (window) return NextResponse.json({ error: window }, { status: 400 });

  const db = getDb();
  const code = parsed.data.code.trim().toUpperCase();
  const [clash] = await db.select({ id: schema.promoCodes.id }).from(schema.promoCodes).where(eq(schema.promoCodes.code, code)).limit(1);
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
