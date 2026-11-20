import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

/**
 * A student's request to leave their college. Only the college's placement officer (or a Findtern admin) can
 * approve it; approval is what ends the membership (src/lib/college/leave-request-db.ts). One pending request per
 * student (partial unique index), any number of closed ones: the history a TPO sees.
 */
export const collegeLeaveRequests = pgTable("college_leave_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  collegeId: varchar("college_id").notNull(),
  membershipId: varchar("membership_id").notNull(),
  status: text("status").notNull().default("requested"), // requested | approved | rejected | cancelled
  reason: text("reason"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
  decidedByType: text("decided_by_type"), // college_admin | admin | system | student
  decidedById: varchar("decided_by_id"),
  decisionNote: text("decision_note"),
}, (t) => ({
  collegeLeaveRequestsOnePendingUniq: uniqueIndex("college_leave_requests_one_pending_uniq").on(t.userId).where(sql`${t.status} = 'requested'`),
  collegeLeaveRequestsCollegeStatusIdx: index("college_leave_requests_college_status_idx").on(t.collegeId, t.status, t.requestedAt),
}));

export type CollegeLeaveRequest = typeof collegeLeaveRequests.$inferSelect;
