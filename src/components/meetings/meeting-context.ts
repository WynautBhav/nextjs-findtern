"use server";

import { and, eq } from "drizzle-orm";

import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { projectZone, timezoneForLocation } from "@/lib/timezones";

export type MeetingContext = { employerId: string; zone: string; locked: boolean };

/**
 * What "Book meeting" needs from the signed-in employer when the screen it sits on does not already carry it: the id
 * and the zone the times are typed in (the project's own when it has one, which then cannot be changed; else the
 * company's, from its location). Only the employer's own project is read; anyone else gets null.
 */
export async function meetingContextFor(projectId: string | null): Promise<MeetingContext | null> {
  const session = await getSession();
  if (!session || session.role !== "employer") return null;
  const db = getDb();
  let projectTz: string | null = null;
  if (projectId) {
    const [p] = await db
      .select({ timezone: schema.projects.timezone })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.employerId, session.uid)))
      .limit(1);
    projectTz = p?.timezone?.trim() || null;
  }
  if (projectTz) return { employerId: session.uid, zone: projectZone(projectTz), locked: true };
  const [employer] = await db
    .select({ country: schema.employers.country, state: schema.employers.state })
    .from(schema.employers)
    .where(eq(schema.employers.id, session.uid))
    .limit(1);
  return { employerId: session.uid, zone: timezoneForLocation(employer ?? {}), locked: false };
}
