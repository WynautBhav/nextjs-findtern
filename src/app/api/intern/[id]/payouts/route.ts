import { eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { deriveMoney } from "@/lib/journey";

/**
 * An intern's payouts, with the legacy summary split (routes.ts:13465):
 * paid, pending and failed kept apart, only pending counted as incoming.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern", "admin"], ownerId: id });
  if (!guard.ok) return guard.response;
  const db = getDb();
  const rows = await db.select().from(schema.internPayouts).where(eq(schema.internPayouts.internId, id)).orderBy(desc(schema.internPayouts.createdAt));
  const money = deriveMoney(rows.map((r) => ({ ...r, createdAt: r.createdAt ?? new Date(0) })));
  return NextResponse.json({
    payouts: rows,
    summary: {
      paidMinor: money.paidMinor,
      pendingMinor: money.incomingMinor,
      failedMinor: money.failedMinor,
      lastPaidAt: money.lastPaidAt,
    },
  });
}
