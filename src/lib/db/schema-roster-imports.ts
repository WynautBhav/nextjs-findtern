import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

/**
 * An admin roster upload. Same file twice (college + sha256) returns the same import.
 * `rows` holds the whole file (names, emails, phones), so every import expires: `expiresAt` defaults to 30 days and a
 * purge job removes expired rows.
 */
export const collegeRosterImports = pgTable("college_roster_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collegeId: varchar("college_id").notNull(),
  fileName: text("file_name").notNull(),
  fileSha256: text("file_sha256").notNull(),
  mapping: jsonb("mapping").$type<{ name: number; email: number; phone: number | null }>().notNull(),
  /** Classified preview rows. */
  rows: jsonb("rows").$type<unknown[]>().notNull(),
  counts: jsonb("counts").$type<Record<string, number>>().notNull(),
  status: text("status").notNull().default("previewed"), // previewed | committed | discarded
  overAllocation: boolean("over_allocation").notNull().default(false),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  committedAt: timestamp("committed_at"),
  expiresAt: timestamp("expires_at").notNull().default(sql`now() + interval '30 days'`),
}, (t) => ({
  collegeRosterImportsFileUniq: uniqueIndex("college_roster_imports_file_uniq").on(t.collegeId, t.fileSha256),
  collegeRosterImportsExpiresIdx: index("college_roster_imports_expires_idx").on(t.expiresAt),
}));

export type CollegeRosterImport = typeof collegeRosterImports.$inferSelect;
