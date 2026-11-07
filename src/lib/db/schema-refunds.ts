import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

/** Admin-reviewed refunds. amount_minor is copied from intern_payments, never typed. */
export const paymentRefunds = pgTable("payment_refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  internPaymentId: varchar("intern_payment_id").notNull(),
  entryId: varchar("entry_id"),
  amountMinor: integer("amount_minor").notNull(),
  status: text("status").notNull().default("eligible"),
  gatewayRefundId: text("gateway_refund_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  reason: text("reason"),
  raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
  actor: text("actor"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  initiatedAt: timestamp("initiated_at"),
  settledAt: timestamp("settled_at"),
}, (t) => ({
  amountPositive: check("payment_refunds_amount_positive", sql`${t.amountMinor} > 0`),
  statusValid: check("payment_refunds_status_valid", sql`${t.status} IN ('eligible','review','pending','initiated','refunded','failed')`),
  gatewayRefundUnique: uniqueIndex("payment_refunds_gateway_refund_unique").on(t.gatewayRefundId).where(sql`${t.gatewayRefundId} IS NOT NULL`),
  idempotencyUnique: uniqueIndex("payment_refunds_idempotency_key_unique").on(t.idempotencyKey),
  livePerPayment: uniqueIndex("payment_refunds_live_per_payment").on(t.internPaymentId).where(sql`${t.status} <> 'failed'`),
}));

export type PaymentRefund = typeof paymentRefunds.$inferSelect;
