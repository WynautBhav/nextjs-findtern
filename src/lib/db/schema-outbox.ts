import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, index, check } from "drizzle-orm/pg-core";

export const emailCampaigns = pgTable("email_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: text("order_id").notNull(),
  kind: text("kind").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  status: text("status").notNull().default("draft"),
  counts: jsonb("counts").notNull().default({}),
}, (t) => ({
  statusCk: check("email_campaigns_status_check", sql`${t.status} IN ('draft','running','done','cancelled')`),
  orderIdx: index("email_campaigns_order_idx").on(t.orderId),
}));

export const emailOutbox = pgTable("email_outbox", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: text("campaign_id").notNull(),
  entryId: text("entry_id").notNull(),
  toEmail: text("to_email").notNull(),
  template: text("template").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  nextAt: timestamp("next_at").notNull().defaultNow(),
  lastError: text("last_error"),
  providerId: text("provider_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  statusCk: check("email_outbox_status_check", sql`${t.status} IN ('queued','sending','sent','failed','dead')`),
  statusNextIdx: index("email_outbox_status_next_idx").on(t.status, t.nextAt),
  campaignIdx: index("email_outbox_campaign_idx").on(t.campaignId),
}));
