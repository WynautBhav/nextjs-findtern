import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  description: z.string().optional(),
  discountType: z.enum(["percentage", "fixed"]).optional(),
  discountValue: z.number().int().positive().optional(),
  maxUsages: z.number().int().optional(),
  minOrderAmountMinor: z.number().int().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  await db.update(schema.promoCodes).set({
    ...parsed.data,
    validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : undefined,
    validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : undefined,
    updatedAt: new Date(),
  }).where(eq(schema.promoCodes.id, id));
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
