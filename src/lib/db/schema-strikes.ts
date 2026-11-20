import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Account standing history (src/lib/moderation/strikes.ts holds the rules). One row per admin action on an intern or an
 * employer: `warning`, `freeze`, `unfreeze` (and `revoked`, reserved). Only an admin ever writes here. `evidenceNote` is
 * admin-only. `acknowledgedAt` on a warning is when the person clicked Acknowledge. Strikes never expire.
 */
export const accountStrikes = pgTable("account_strikes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userType: text("user_type").notNull(), // intern | employer
  userId: varchar("user_id").notNull(),
  kind: text("kind").notNull(), // warning | freeze | unfreeze | revoked
  flagId: varchar("flag_id"),
  reason: text("reason").notNull(),
  evidenceNote: text("evidence_note"),
  adminId: varchar("admin_id"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  accountStrikesUserIdx: index("account_strikes_user_idx").on(t.userType, t.userId, t.createdAt),
  accountStrikesPendingAckIdx: index("account_strikes_pending_ack_idx").on(t.userType, t.userId).where(sql`${t.kind} = 'warning' and ${t.acknowledgedAt} is null`),
}));

export type AccountStrike = typeof accountStrikes.$inferSelect;
