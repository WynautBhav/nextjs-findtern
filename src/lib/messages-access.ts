import { and, eq } from "drizzle-orm";

import { getDb, schema } from "./db/index.ts";
import { hiredProposalSql } from "./employer-visibility";

/**
 * Contact details in messages stay hidden until this employer has a paid hire
 * of this intern on any project (OA1). Same rule as name unmasking
 * (`hiredProposalSql`), but never unlocked by an admin "View as".
 */
export async function contactUnlocked(employerId: string, internId: string): Promise<boolean> {
  const p = schema.proposals;
  const [row] = await getDb()
    .select({ id: p.id })
    .from(p)
    .where(and(eq(p.employerId, employerId), eq(p.internId, internId), hiredProposalSql()))
    .limit(1);
  return Boolean(row);
}
