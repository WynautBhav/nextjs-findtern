import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

type Db = ReturnType<typeof getDb>;

/** Total seats across the college's paid batches (0 when none is paid). */
export async function paidSeatTotal(db: Db, collegeId: string): Promise<{ batches: number; seats: number }> {
  const B = schema.collegeSeatBatches;
  const [row] = await db
    .select({ batches: sql<number>`count(*)::int`, seats: sql<number>`coalesce(sum(${B.seats}), 0)::int` })
    .from(B)
    .where(and(eq(B.collegeId, collegeId), eq(B.status, "paid")));
  return { batches: row?.batches ?? 0, seats: row?.seats ?? 0 };
}
