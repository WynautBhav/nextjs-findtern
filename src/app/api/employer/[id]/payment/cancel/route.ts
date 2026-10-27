import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({ orderId: z.string() });

/**
 * The employer closed the payment window: close their own unpaid order.
 * Written as "failed", the status legacy knows for an unpaid order; it reads
 * "cancelled" as still open and counts it as billed (DB-05).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const updated = await getDb()
    .update(schema.employerPayments)
    .set({ status: "failed" })
    .where(
      and(
        eq(schema.employerPayments.orderId, parsed.data.orderId),
        eq(schema.employerPayments.employerId, id),
        eq(schema.employerPayments.status, "created"),
      ),
    )
    .returning({ id: schema.employerPayments.id });
  if (updated.length === 0) return NextResponse.json({ error: "No open order to cancel" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
