import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

import type { getDb } from "@/lib/db";
import { employers, proposals, users } from "@/lib/db/schema";
import { ON_HOLD_REFUSAL } from "@/lib/account-hold";

/**
 * D3 reads: an offer or proposal is ON HOLD while either its intern or its employer is frozen (frozen_at set). Derived on
 * every read, never stored, so it ends the moment the account is released. The other side is only ever told "On hold".
 */

/** Of these proposals, the ones whose intern or employer is frozen right now. */
export async function heldProposalIds(db: ReturnType<typeof getDb>, ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const rows = await db
    .select({ id: proposals.id })
    .from(proposals)
    .innerJoin(users, eq(users.id, proposals.internId))
    .innerJoin(employers, eq(employers.id, proposals.employerId))
    .where(and(inArray(proposals.id, unique), or(isNotNull(users.frozenAt), isNotNull(employers.frozenAt))));
  return new Set(rows.map((r) => r.id));
}

export { ON_HOLD_REFUSAL };
