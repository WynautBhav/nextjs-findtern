import { inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { projectZone } from "@/lib/timezones";

/**
 * Server-side lookup for feedback sheet 2, row 7: the timezone each project
 * sets. Interview and meeting screens read it so every project's times show
 * on that project's clock. One query for any number of projects.
 */
export async function loadProjectZones(
  db: ReturnType<typeof getDb>,
  projectIds: ReadonlyArray<string | null | undefined>,
): Promise<Record<string, string | null>> {
  const ids = Array.from(new Set(projectIds.filter((x): x is string => Boolean(x))));
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: schema.projects.id, timezone: schema.projects.timezone })
    .from(schema.projects)
    .where(inArray(schema.projects.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.timezone]));
}

/** The zone an interview is shown in: its project's, else the zone it was booked in, else the company's, else India. */
export function interviewZone(
  iv: { projectId?: string | null; timezone?: string | null },
  zones: Record<string, string | null>,
  companyTz?: string | null,
): string {
  return projectZone(iv.projectId ? zones[iv.projectId] : null, iv.timezone, companyTz);
}
