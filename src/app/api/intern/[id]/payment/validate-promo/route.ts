import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({ code: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [promo] = await db
    .select()
    .from(schema.promoCodes)
    .where(and(eq(schema.promoCodes.code, parsed.data.code.toUpperCase()), eq(schema.promoCodes.isActive, true)))
    .limit(1);
  if (!promo) return NextResponse.json({ error: "Invalid promo code" }, { status: 404 });
  if (promo.validUntil && promo.validUntil < new Date()) {
    return NextResponse.json({ error: "Promo code expired" }, { status: 400 });
  }
  if (promo.maxUsages && promo.usedCount >= promo.maxUsages) {
    return NextResponse.json({ error: "Promo code exhausted" }, { status: 400 });
  }
  return NextResponse.json({ discountType: promo.discountType, discountValue: promo.discountValue });
}
