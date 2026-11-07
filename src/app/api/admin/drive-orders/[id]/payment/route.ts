import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { errorResponse, markOrderPaid } from "@/lib/drives/admin-db";
import { parseIdempotencyKey } from "@/lib/drives/admin-rules";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ method: z.enum(["bank", "upi", "cheque"]), reference: z.string().trim().min(1).max(64) });

/**
 * Record a manual payment (bank, UPI or cheque) for a drive order. A Razorpay path is out of scope here.
 * Safe to retry: a second call returns the same order and creates no second seat batch. Never raises a seat cap.
 */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  if (!parseIdempotencyKey(req.headers.get("idempotency-key")).ok) return NextResponse.json({ error: "Idempotency-Key must be 8 to 128 letters, digits or - _ . :" }, { status: 400 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose bank, UPI or cheque and enter a reference (1 to 64 characters)." }, { status: 400 });
  try {
    const out = await markOrderPaid({ orderId: (await ctx.params).id, method: parsed.data.method, reference: parsed.data.reference, adminId: g.session.uid });
    return NextResponse.json({ ok: true, order: out.order, replayed: out.replayed, activated: out.activated });
  } catch (e) {
    return errorResponse(e);
  }
}
