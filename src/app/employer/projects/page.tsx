import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ProjectsManager } from "@/components/employer/projects-manager";

export const metadata: Metadata = {
  title: "Projects",
  robots: { index: false, follow: false },
};

export default async function EmployerProjectsPage() {
  const session = await getSession();
  const employerId = session!.uid;

  let rows: (typeof schema.projects.$inferSelect)[] = [];
  try {
    const db = getDb();
    rows = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.employerId, employerId))
      .orderBy(desc(schema.projects.createdAt));
  } catch (err) {
    console.error("Failed to load employer projects:", err);
  }

  return (
    <ProjectsManager
      employerId={employerId}
      initialProjects={rows}
    />
  );
}
