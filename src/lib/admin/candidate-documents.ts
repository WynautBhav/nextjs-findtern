import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { listCandidateDocuments, type CandidateDocument } from "./candidate-documents-list";

export type { CandidateDocument };

/** Every file on a candidate's record, for the admin Documents tab (ADP-28). */
export async function candidateDocuments(internId: string): Promise<CandidateDocument[]> {
  const db = getDb();
  const [docs] = await db.select().from(schema.internDocuments).where(eq(schema.internDocuments.userId, internId)).limit(1);
  const [onboarding] = await db
    .select({ extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, internId))
    .limit(1);
  return listCandidateDocuments(docs ?? null, (onboarding?.extra as Record<string, unknown> | null) ?? null);
}
