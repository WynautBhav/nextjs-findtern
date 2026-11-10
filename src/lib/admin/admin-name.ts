import { cache } from "react";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

/**
 * `admins.name` for an admin id, or null (unset or the read failed). cache()d per request: the admin layout
 * (account menu) and the dashboard (greeting) both need it and used to run the same query twice.
 */
export const adminFullName = cache(async (uid: string): Promise<string | null> => {
  try {
    const [row] = await getDb().select({ name: schema.admins.name }).from(schema.admins).where(eq(schema.admins.id, uid)).limit(1);
    return row?.name?.trim() || null;
  } catch {
    return null;
  }
});
