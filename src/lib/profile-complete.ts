import { desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { profileCompletion } from "@/lib/onboarding";

/**
 * The dashboard's "profile complete" checklist, read straight from the
 * database. Server routes use it to hold the same line the dashboard draws:
 * the ₹2,499 activation is only offered once the profile is complete, and
 * the order route must refuse it otherwise rather than trust the UI.
 */
export async function internProfileStatus(internId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, internId))
    .orderBy(desc(schema.internOnboarding.createdAt))
    .limit(1);
  const [doc] = await db
    .select({ pan: schema.internDocuments.panImageName, photo: schema.internDocuments.profilePhotoName })
    .from(schema.internDocuments)
    .where(eq(schema.internDocuments.userId, internId))
    .orderBy(desc(schema.internDocuments.createdAt))
    .limit(1);
  return profileCompletion(row ?? null, { hasPanImage: Boolean(doc?.pan), hasPhoto: Boolean(doc?.photo) });
}
