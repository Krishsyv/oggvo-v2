import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import {
  notificationStatusEnum,
  pushCampaignStatusEnum,
  pushCampaignTypeEnum,
} from "./_enums.js";
import { fk, pk, timestamps } from "./_helpers.js";
import { users } from "./auth.js";
import { profiles } from "./tenancy.js";

/** v1 `notification` — email addresses subscribed to a profile's review alerts. */
export const emailNotifications = pgTable("email_notifications", {
  id: pk(),
  profileId: fk("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  ...timestamps,
});

/** v1 `profile_notification` — in-app notifications shown in the portal. */
export const profileNotifications = pgTable(
  "profile_notifications",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    url: varchar("url", { length: 255 }).notNull().default(""),
    status: notificationStatusEnum("status").notNull().default("unread"),
    seenBy: fk("seen_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("profile_notifications_profile_idx").on(t.profileId)],
);

/** Replaces the typo'd v1 `notificaiton_navbar` (CSV of seen review ids) with proper rows. */
export const notificationSeen = pgTable(
  "notification_seen",
  {
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    userId: fk("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewId: fk("review_id").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.userId, t.reviewId] })],
);

/** v1 `user_notification_campaigns` — push notification campaigns (FCM). */
export const pushCampaigns = pgTable("push_campaigns", {
  id: pk(),
  name: varchar("name", { length: 55 }).notNull().default("1"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  image: varchar("image", { length: 255 }).notNull().default(""),
  badge: varchar("badge", { length: 255 }).notNull().default(""),
  color: varchar("color", { length: 255 }),
  clickAction: varchar("click_action", { length: 1055 }),
  sound: varchar("sound", { length: 255 }),
  type: pushCampaignTypeEnum("type").notNull().default("single"),
  status: pushCampaignStatusEnum("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

/** v1 `user_notification_channels` — device push tokens. Composite PK (user, token, profile). */
export const pushChannels = pgTable(
  "push_channels",
  {
    token: varchar("token", { length: 255 }).notNull(),
    userId: fk("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    deviceOsType: varchar("device_os_type", { length: 55 }),
    deviceOsFamily: varchar("device_os_family", { length: 55 }),
    osName: varchar("os_name", { length: 55 }),
    osVersion: varchar("os_version", { length: 55 }),
    deviceType: varchar("device_type", { length: 55 }),
    browserName: varchar("browser_name", { length: 55 }),
    browserVersion: varchar("browser_version", { length: 55 }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.token, t.profileId] }),
    index("push_channels_profile_idx").on(t.profileId),
  ],
);

/** v1 `user_notification_campaign_devices` — which devices a push campaign targets. */
export const pushCampaignDevices = pgTable(
  "push_campaign_devices",
  {
    campaignId: fk("campaign_id")
      .notNull()
      .references(() => pushCampaigns.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.token, t.profileId] })],
);
