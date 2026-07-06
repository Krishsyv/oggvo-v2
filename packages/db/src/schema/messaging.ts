import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { messageDirectionEnum, messagePlatformEnum, messageStatusEnum } from "./_enums.js";
import { fk, pk, timestamps } from "./_helpers.js";
import { contacts } from "./contacts.js";
import { profiles } from "./tenancy.js";

/**
 * v1 `messaging` stored an entire thread as a serialized blob in `conversation`.
 * v2 splits it into a `conversations` header + one row per `messages`.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    recipientId: fk("recipient_id").references(() => contacts.id, { onDelete: "set null" }),
    recipientPhone: varchar("recipient_phone", { length: 64 }),
    recipientFullName: varchar("recipient_full_name", { length: 255 }),
    platform: messagePlatformEnum("platform").notNull().default("connect"),
    unreadCount: integer("unread_count").notNull().default(0),
    lastThreadAt: timestamp("last_thread_at", { withTimezone: true }),
    isArchived: boolean("is_archived").notNull().default(false),
    isUnsubscribed: boolean("is_unsubscribed").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("conversations_profile_idx").on(t.profileId),
    index("conversations_last_thread_idx").on(t.lastThreadAt),
  ],
);

/** Individual messages within a conversation (inbound/outbound, optionally scheduled). */
export const messages = pgTable(
  "messages",
  {
    id: pk(),
    conversationId: fk("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    body: text("body"),
    attachments: jsonb("attachments").notNull().default([]),
    status: messageStatusEnum("status").notNull().default("sent"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    scheduleTimezone: varchar("schedule_timezone", { length: 64 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    ...timestamps,
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId),
    index("messages_scheduled_idx").on(t.scheduledAt),
  ],
);
