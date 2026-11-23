import { desc } from "drizzle-orm";

import { isProfileSubmittedComplete, profileDocsOf, type ProfileDocs } from "@/lib/admin/profile-state";
import { getDb, schema } from "@/lib/db";

/** Ids of every intern whose profile is submitted and complete. One pass over the onboarding rows; the rules are too deep for SQL. */
export async function loadCompleteProfileIds(): Promise<Set<string>> {
  const db = getDb();
  const [rows, docs, memberships] = await Promise.all([
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
    db
      .select({ userId: schema.collegeMemberships.userId, status: schema.collegeMemberships.status, verifiedBy: schema.collegeMemberships.verifiedBy, leftAt: schema.collegeMemberships.leftAt })
      .from(schema.collegeMemberships),
  ]);
  const membershipOf = new Map(memberships.map((m) => [m.userId, m]));
  const docsByUser = new Map<string, ProfileDocs>();
  for (const d of docs) {
    if (!docsByUser.has(d.userId)) docsByUser.set(d.userId, profileDocsOf(d, membershipOf.get(d.userId))); // latest row wins
  }
  const seen = new Set<string>();
  const complete = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.userId)) continue; // latest onboarding row per user
    seen.add(row.userId);
    if (isProfileSubmittedComplete(row, docsByUser.get(row.userId) ?? profileDocsOf(null, membershipOf.get(row.userId)))) complete.add(row.userId);
  }
  return complete;
}
