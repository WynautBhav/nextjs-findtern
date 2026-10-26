import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ProjectsManager } from "@/components/employer/projects-manager";
import { isIndiaCountry } from "@/lib/data/countries";
import { timezoneForLocation } from "@/lib/timezones";

export const metadata: Metadata = {
  title: "Projects",
  robots: { index: false, follow: false },
};

export default async function EmployerProjectsPage() {
  const session = await requireRole("employer");
  const employerId = session.uid;

  let rows: (typeof schema.projects.$inferSelect)[] = [];
  let country: string | null = null;
  let timezone = "Asia/Kolkata";
  try {
    const db = getDb();
    rows = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.employerId, employerId))
      .orderBy(desc(schema.projects.createdAt));
    const [employer] = await db
      .select({ country: schema.employers.country, state: schema.employers.state })
      .from(schema.employers)
      .where(eq(schema.employers.id, employerId))
      .limit(1);
    country = employer?.country ?? null;
    timezone = timezoneForLocation(employer ?? {});
  } catch (err) {
    console.error("Failed to load employer projects:", err);
  }

  return (
    <ProjectsManager
      employerId={employerId}
      initialProjects={rows}
      india={isIndiaCountry(country)}
      defaultTimezone={timezone}
    />
  );
}
