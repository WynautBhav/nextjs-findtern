import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { settleInternOrder } from "@/lib/payments";
import { fetchGatewayPaid, verifySignature } from "@/lib/razorpay";

const bodySchema = z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!verifySignature(parsed.data.orderId, parsed.data.paymentId, parsed.data.signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // The signature covers the ids, not the amount: ask Razorpay what it took and let settle compare it with the order's own.
  const paid = (await fetchGatewayPaid(parsed.data.orderId, parsed.data.paymentId)) ?? undefined;
  const result = await settleInternOrder({ ...parsed.data, internId: id, paid });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
