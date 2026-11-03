import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

/** The terms version this intern last accepted (employers and college admins read theirs in their own layout query). */
export async function internTermsVersion(uid: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ v: schema.users.termsAcceptedVersion })
    .from(schema.users)
    .where(eq(schema.users.id, uid))
    .limit(1);
  return row?.v ?? null;
}
