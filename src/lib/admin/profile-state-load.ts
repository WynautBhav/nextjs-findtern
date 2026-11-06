import { desc } from "drizzle-orm";

import { isProfileSubmittedComplete, type ProfileDocs } from "@/lib/admin/profile-state";
import { getDb, schema } from "@/lib/db";

/** Ids of every intern whose profile is submitted and complete. One pass over the onboarding rows; the rules are too deep for SQL. */
export async function loadCompleteProfileIds(): Promise<Set<string>> {
  const db = getDb();
  const [rows, docs] = await Promise.all([
    db.select().from(schema.internOnboarding).orderBy(desc(schema.internOnboarding.createdAt)),
    db
      .select({
        userId: schema.internDocuments.userId,
        photo: schema.internDocuments.profilePhotoName,
        pan: schema.internDocuments.panImageName,
        aadhaar: schema.internDocuments.aadhaarImageName,
      })
      .from(schema.internDocuments)
      .orderBy(desc(schema.internDocuments.createdAt)),
  ]);
  const docsByUser = new Map<string, ProfileDocs>();
  for (const d of docs) {
    if (!docsByUser.has(d.userId)) docsByUser.set(d.userId, { hasPhoto: Boolean(d.photo), hasPanImage: Boolean(d.pan), hasAadhaarImage: Boolean(d.aadhaar) }); // latest row wins
  }
  const none: ProfileDocs = { hasPhoto: false, hasPanImage: false, hasAadhaarImage: false };
  const seen = new Set<string>();
  const complete = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.userId)) continue; // latest onboarding row per user
    seen.add(row.userId);
    if (isProfileSubmittedComplete(row, docsByUser.get(row.userId) ?? none)) complete.add(row.userId);
  }
  return complete;
}
