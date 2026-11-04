import { and, eq, isNull, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { forgetAccountStatus } from "@/lib/account-status";
import { requireMutation } from "@/lib/guards-mutation";
import { acceptanceTableFor, acceptanceValues, CURRENT_TERMS_VERSION, type TermsRole } from "@/lib/terms";

export const dynamic = "force-dynamic";

/**
 * Records that the signed-in account accepted the current terms. The version
 * is always the server's constant, never a client-supplied value, and the row
 * is the session's own (uid), so there is nothing to forge or to point at
 * someone else. Idempotent: a repeat call is a no-op and keeps the first
 * accepted-at time.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern", "employer", "college"], allowPendingTerms: true });
  if (!guard.ok) return guard.response;
  const { uid, role } = guard.session as { uid: string; role: TermsRole };

  const table = schema[acceptanceTableFor(role)];
  await getDb()
    .update(table)
    .set(acceptanceValues())
    .where(
      and(
        eq(table.id, uid),
        or(isNull(table.termsAcceptedVersion), ne(table.termsAcceptedVersion, CURRENT_TERMS_VERSION)),
      ),
    );
  forgetAccountStatus(role, uid);
  return NextResponse.json({ ok: true, version: CURRENT_TERMS_VERSION });
}
