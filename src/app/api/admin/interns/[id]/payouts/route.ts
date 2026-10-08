import { eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  amountMinor: z.number().int().positive(),
  currency: z.string().default("INR"),
  status: z.enum(["pending", "paid", "failed"]).default("pending"),
  method: z.string().default("bank"),
  referenceId: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  const rows = await db.select().from(schema.internPayouts).where(eq(schema.internPayouts.internId, id)).orderBy(desc(schema.internPayouts.createdAt));
  return NextResponse.json({ payouts: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [payout] = await db.insert(schema.internPayouts).values({ internId: id, ...parsed.data }).returning();
  return NextResponse.json({ payout }, { status: 201 });
}
