import { eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { isInternPaid } from "@/lib/payments";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern", "admin"], ownerId: id });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [payment] = await db
    .select()
    .from(schema.internPayments)
    .where(eq(schema.internPayments.internId, id))
    .orderBy(desc(schema.internPayments.createdAt))
    .limit(1);
  return NextResponse.json({ paid: await isInternPaid(id), payment });
}
