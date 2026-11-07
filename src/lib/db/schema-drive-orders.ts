import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";

/** A paid unit for a college drive: slots x per-student fee. Mirrors drizzle/0018_drive_orders.sql. */
export const collegeDriveOrders = pgTable("college_drive_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collegeId: varchar("college_id").notNull(),
  driveId: varchar("drive_id"),
  slots: integer("slots").notNull(),
  feePerStudentMinor: integer("fee_per_student_minor").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  /** Carried-over seat credit, a signed line on this order. Payable = amount - credit. */
  creditMinor: integer("credit_minor").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | paid | failed | refunded | partially_refunded
  seatBatchId: varchar("seat_batch_id"),
  issuedCount: integer("issued_count").notNull().default(0),
  redeemedCount: integer("redeemed_count").notNull().default(0),
  codeValidUntil: timestamp("code_valid_until"),
  paidAt: timestamp("paid_at"),
  verifiedBy: varchar("verified_by"),
  gatewayRef: text("gateway_ref"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  collegeDriveOrdersCollegeIdx: index("college_drive_orders_college_idx").on(t.collegeId),
  collegeDriveOrdersDriveUnique: uniqueIndex("college_drive_orders_drive_unique").on(t.driveId).where(sql`${t.driveId} IS NOT NULL`),
  collegeDriveOrdersBatchUnique: uniqueIndex("college_drive_orders_batch_unique").on(t.seatBatchId).where(sql`${t.seatBatchId} IS NOT NULL`),
  slotsPos: check("college_drive_orders_slots_pos", sql`${t.slots} > 0`),
  feePos: check("college_drive_orders_fee_pos", sql`${t.feePerStudentMinor} > 0`),
  amountEq: check("college_drive_orders_amount_eq", sql`${t.amountMinor} = ${t.slots} * ${t.feePerStudentMinor}`),
  creditNonneg: check("college_drive_orders_credit_nonneg", sql`${t.creditMinor} >= 0`),
  payableNonneg: check("college_drive_orders_payable_nonneg", sql`${t.amountMinor} - ${t.creditMinor} >= 0`),
  statusValid: check("college_drive_orders_status_valid", sql`${t.status} IN ('pending','paid','failed','refunded','partially_refunded')`),
  countsValid: check("college_drive_orders_counts_valid", sql`${t.issuedCount} >= 0 AND ${t.redeemedCount} >= 0 AND ${t.issuedCount} <= ${t.slots} AND ${t.redeemedCount} <= ${t.issuedCount}`),
}));

export type CollegeDriveOrder = typeof collegeDriveOrders.$inferSelect;
