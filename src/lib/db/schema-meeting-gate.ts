import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

/**
 * One row when a participant agrees to a disclaimer version at /meet/<token> (migration 0044; rules in
 * src/lib/meetings/gate.ts). `ipHash` is a salted HMAC, never the address. Repeating the same version is a no-op (unique key).
 */
export const meetingGateAcceptances = pgTable("meeting_gate_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  interviewId: varchar("interview_id").notNull(),
  userType: text("user_type").notNull(), // intern | employer
  userId: varchar("user_id").notNull(),
  disclaimerVersion: text("disclaimer_version").notNull(),
  acceptedAt: timestamp("accepted_at").notNull().defaultNow(),
  ipHash: text("ip_hash"),
}, (t) => ({
  meetingGateAcceptancesUniq: uniqueIndex("meeting_gate_acceptances_uniq").on(t.interviewId, t.userType, t.userId, t.disclaimerVersion),
}));

export type MeetingGateAcceptance = typeof meetingGateAcceptances.$inferSelect;
