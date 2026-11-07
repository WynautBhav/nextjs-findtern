import { sql } from "drizzle-orm";
import { bigserial, boolean, check, index, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

// Mirrors drizzle/0023_messaging.sql column for column.

export const threads = pgTable("threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employerId: varchar("employer_id").notNull(),
  internId: varchar("intern_id").notNull(),
  proposalId: varchar("proposal_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at"),
}, (t) => ({
  threadsPairUniq: uniqueIndex("threads_pair_uniq").on(t.employerId, t.internId, sql`COALESCE(${t.proposalId}, '')`),
  threadsInternIdx: index("threads_intern_idx").on(t.internId),
  threadsEmployerIdx: index("threads_employer_idx").on(t.employerId),
}));

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar("thread_id").notNull(),
  senderId: varchar("sender_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
}, (t) => ({
  messagesThreadCreatedIdx: index("messages_thread_created_idx").on(t.threadId, t.createdAt),
  messagesBodyLenChk: check("messages_body_len_chk", sql`char_length(${t.body}) BETWEEN 1 AND 4000`),
}));

export const userPresence = pgTable("user_presence", {
  userId: varchar("user_id").primaryKey(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});

export const realtimeEvents = pgTable("realtime_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(), // REALTIME_EVENT_TYPES in lib/realtime/events.ts
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  realtimeEventsUserIdIdx: index("realtime_events_user_id_idx").on(t.userId, t.id),
}));

export const notificationPrefs = pgTable("notification_prefs", {
  userId: varchar("user_id").primaryKey(),
  emailMessages: boolean("email_messages").notNull().default(true),
  pushMessages: boolean("push_messages").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
