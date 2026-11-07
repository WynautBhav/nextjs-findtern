import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, uniqueIndex, index, check } from "drizzle-orm/pg-core";

/** One uploaded roster file for a drive order. Same bytes cannot be previewed twice unless the earlier import is void. */
export const driveImports = pgTable("drive_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  fileSha256: text("file_sha256").notNull(),
  fileName: text("file_name").notNull(),
  mapping: jsonb("mapping").notNull().default(sql`'{}'::jsonb`),
  status: text("status").notNull().default("preview"),
  counts: jsonb("counts").notNull().default(sql`'{}'::jsonb`),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, (t) => ({
  driveImportsOrderFileUq: uniqueIndex("drive_imports_order_file_uq").on(t.orderId, t.fileSha256).where(sql`${t.status} <> 'void'`),
  driveImportsStatusCheck: check("drive_imports_status_check", sql`${t.status} IN ('preview','confirmed','void')`),
}));

export const driveRosterEntries = pgTable("drive_roster_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  importId: varchar("import_id").notNull(),
  rowNo: integer("row_no").notNull(),
  name: text("name").notNull(),
  collegeEmailNorm: text("college_email_norm").notNull(),
  phoneE164: text("phone_e164"),
  state: text("state").notNull(),
  reasons: jsonb("reasons").notNull().default(sql`'[]'::jsonb`),
  match: jsonb("match").notNull().default(sql`'{}'::jsonb`),
  internId: varchar("intern_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  driveRosterEntriesOrderEmailUq: uniqueIndex("drive_roster_entries_order_email_uq").on(t.orderId, t.collegeEmailNorm),
  driveRosterEntriesImportIdx: index("drive_roster_entries_import_idx").on(t.importId),
  driveRosterEntriesStateCheck: check("drive_roster_entries_state_check", sql`${t.state} IN ('valid','invalid','duplicate','ambiguous','over_allocation')`),
}));

/** Admin-review suggestions (phone+name). Never links by itself. */
export const identityReviews = pgTable("identity_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  entryId: varchar("entry_id").notNull(),
  candidateInternId: varchar("candidate_intern_id").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  decidedBy: varchar("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  identityReviewsEntryCandidateUq: uniqueIndex("identity_reviews_entry_candidate_uq").on(t.entryId, t.candidateInternId),
  identityReviewsOrderStatusIdx: index("identity_reviews_order_status_idx").on(t.orderId, t.status),
  identityReviewsStatusCheck: check("identity_reviews_status_check", sql`${t.status} IN ('pending','linked','rejected')`),
}));
