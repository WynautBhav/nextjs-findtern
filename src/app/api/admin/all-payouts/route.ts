import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

export async function GET(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  const rows = await db.select().from(schema.internPayouts).orderBy(desc(schema.internPayouts.createdAt)).limit(200);
  return NextResponse.json({ payouts: rows });
}
