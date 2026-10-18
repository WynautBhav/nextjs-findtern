import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { DUPLICATE_CODE, isUniqueViolation } from "@/lib/promo";

// Omitted = leave as is; null = clear.
const bodySchema = z.object({
  code: z.string().trim().min(2).optional(),
  description: z.string().nullish(),
  discountType: z.enum(["percentage", "fixed"]).optional(),
  discountValue: z.number().int().positive().optional(),
  maxUsages: z.number().int().nullish(),
  minOrderAmountMinor: z.number().int().nullish(),
  validFrom: z.string().datetime().nullish(),
  validUntil: z.string().datetime().nullish(),
  isActive: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const code = parsed.data.code?.toUpperCase();
  if (code) {
    const [clash] = await db
      .select({ id: schema.promoCodes.id })
      .from(schema.promoCodes)
      .where(and(eq(schema.promoCodes.code, code), ne(schema.promoCodes.id, id)))
      .limit(1);
    if (clash) return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
  }

  const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));
  try {
    await db.update(schema.promoCodes).set({
      ...parsed.data,
      code,
      validFrom: toDate(parsed.data.validFrom),
      validUntil: toDate(parsed.data.validUntil),
      updatedAt: new Date(),
    }).where(eq(schema.promoCodes.id, id));
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: DUPLICATE_CODE }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  await db.delete(schema.promoCodes).where(eq(schema.promoCodes.id, id));
  return NextResponse.json({ ok: true });
}
