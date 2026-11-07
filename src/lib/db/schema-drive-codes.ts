import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const driveCodes = pgTable(
  "drive_codes",
  {
    id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: varchar("order_id").notNull(),
    entryId: varchar("entry_id").notNull(),
    codeHash: text("code_hash").notNull(),
    codeLast4: text("code_last4").notNull(),
    status: text("status").notNull().default("issued"),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("drive_codes_entry_uq").on(t.entryId),
    uniqueIndex("drive_codes_hash_uq").on(t.codeHash),
    index("drive_codes_order_idx").on(t.orderId),
    check("drive_codes_status_check", sql`${t.status} IN ('issued','redeemed','revoked','expired')`),
  ],
);

export const driveEntitlements = pgTable(
  "drive_entitlements",
  {
    id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    codeId: varchar("code_id").notNull(),
    internId: varchar("intern_id").notNull(),
    orderId: varchar("order_id").notNull(),
    collegeId: varchar("college_id").notNull(),
    paymentId: varchar("payment_id"),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
    interviewStatus: text("interview_status").notNull().default("pending"),
  },
  (t) => [
    uniqueIndex("drive_entitlements_code_uq").on(t.codeId),
    uniqueIndex("drive_entitlements_order_intern_uq").on(t.orderId, t.internId),
    index("drive_entitlements_intern_idx").on(t.internId),
  ],
);
