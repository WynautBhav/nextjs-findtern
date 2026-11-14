import { eq } from "drizzle-orm";

import { getDb, schema } from "./db/index.ts";

/**
 * Roles a student saved (OA3). Saving raises them in that employer's matches
 * for that project; it never touches the Findtern Score.
 */
export async function savedInternIds(projectId: string): Promise<Set<string>> {
  const s = schema.internSavedProjects;
  const rows = await getDb().select({ id: s.internId }).from(s).where(eq(s.projectId, projectId));
  return new Set(rows.map((r) => r.id));
}
