import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  code: z.string().min(2),
  description: z.string().optional(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number().int().positive(),
  maxUsages: z.number().int().optional(),
  minOrderAmountMinor: z.number().int().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [promo] = await db.insert(schema.promoCodes).values({
    ...parsed.data,
    code: parsed.data.code.toUpperCase(),
    validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
    validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
  }).returning();
  return NextResponse.json({ promo }, { status: 201 });
}
