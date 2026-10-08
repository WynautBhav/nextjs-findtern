import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { verifySignature } from "@/lib/razorpay";

const bodySchema = z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (!verifySignature(parsed.data.orderId, parsed.data.paymentId, parsed.data.signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getDb();
  const updated = await db
    .update(schema.employerPayments)
    .set({ paymentId: parsed.data.paymentId, signature: parsed.data.signature, status: "paid", paidAt: new Date() })
    .where(and(eq(schema.employerPayments.orderId, parsed.data.orderId), eq(schema.employerPayments.employerId, id)))
    .returning({ id: schema.employerPayments.id });
  if (updated.length === 0) return NextResponse.json({ error: "Unknown order" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
