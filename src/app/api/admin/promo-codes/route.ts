import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { DUPLICATE_CODE, isUniqueViolation } from "@/lib/promo";
import { PROMO_APPLIES_TO, promoWindowProblem } from "@/lib/promo-rules";

const bodySchema = z.object({
  code: z.string().min(2),
  description: z.string().nullish(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number().int().positive(),
  maxUsages: z.number().int().positive("Max uses must be at least 1").nullish(),
  minOrderAmountMinor: z.number().int().min(0, "Minimum order can't be negative").nullish(),
  validFrom: z.string().datetime().nullish(),
  validUntil: z.string().datetime().nullish(),
  isActive: z.boolean().default(true),
  appliesTo: z.enum(PROMO_APPLIES_TO).default("both"),
})
  .refine((b) => b.discountType !== "percentage" || b.discountValue === undefined || b.discountValue <= 100, {
    message: "A percentage discount can't be more than 100",
  });

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

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
    return NextResponse.json({ promo }, { status: 201 });
  } catch (e) {
    // Two creates racing past the check above.
    if (isUniqueViolation(e)) return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
    throw e;
  }
}
