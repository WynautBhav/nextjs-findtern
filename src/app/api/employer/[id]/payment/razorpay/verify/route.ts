import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";

import { requireMutation } from "@/lib/guards-mutation";
import { settleEmployerOrder } from "@/lib/payments";
import { verifySignature } from "@/lib/razorpay";

const bodySchema = z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!verifySignature(parsed.data.orderId, parsed.data.paymentId, parsed.data.signature)) {
    // EMH-38: record it as failed, so the open order doesn't block a retry
    // for 30 minutes. A real capture still settles later through the webhook
    // (settlement accepts any unpaid row).
    await getDb()
      .update(schema.employerPayments)
      .set({ status: "failed" })
      .where(
        and(
          eq(schema.employerPayments.orderId, parsed.data.orderId),
          eq(schema.employerPayments.employerId, id),
          eq(schema.employerPayments.status, "created"),
        ),
      );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const result = await settleEmployerOrder({ ...parsed.data, employerId: id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, hired: result.hired });
}
