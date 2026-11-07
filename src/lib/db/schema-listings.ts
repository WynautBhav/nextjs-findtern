import { index, primaryKey, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

/** Roles a student saved. Raises them in that employer's matches for that project; never touches the score. */
export const internSavedProjects = pgTable("intern_saved_projects", {
  internId: varchar("intern_id").notNull(),
  projectId: varchar("project_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ name: "intern_saved_projects_pkey", columns: [t.internId, t.projectId] }),
  internSavedProjectsProjectIdx: index("intern_saved_projects_project_idx").on(t.projectId),
}));

export type InternSavedProject = typeof internSavedProjects.$inferSelect;
