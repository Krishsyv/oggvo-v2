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
import {
  campaignChannelEnum,
  campaignEventTypeEnum,
  campaignStatusEnum,
} from "./_enums.js";
import { fk, pk, timestamps } from "./_helpers.js";
import { contacts } from "./contacts.js";
import { profiles } from "./tenancy.js";

/** v1 `invite_campaign` → `campaigns`. Email/SMS review-request campaigns. */
export const campaigns = pgTable(
  "campaigns",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    channel: campaignChannelEnum("channel").notNull().default("email"),
    campaignType: varchar("campaign_type", { length: 45 }),
    status: campaignStatusEnum("status").notNull().default("draft"),
    delayDays: integer("delay_days"),
    scheduledDate: timestamp("scheduled_date", { withTimezone: true }),
    sent: boolean("sent").notNull().default(false),
    sendOnWeekends: boolean("send_on_weekends").notNull().default(false),
    target: varchar("target", { length: 255 }).notNull().default(""),
    exclude: varchar("exclude", { length: 255 }).notNull().default(""),
    subject: varchar("subject", { length: 255 }),
    reviewUsButtonText: varchar("review_us_button_text", { length: 255 }).notNull().default("Review Us Now"),
    backgroundColor: varchar("background_color", { length: 6 }).notNull().default("ffffff"),
    imageId: fk("image_id"),
    emailHtml: text("email_html"),
    emailJson: jsonb("email_json"),
    unlayered: boolean("unlayered").notNull().default(false),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("campaigns_profile_idx").on(t.profileId),
    index("campaigns_scheduled_date_idx").on(t.scheduledDate),
  ],
);

/** v1 `invite_scheduler` → per-recipient scheduled send. */
export const campaignSchedules = pgTable(
  "campaign_schedules",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    campaignId: fk("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    recipientId: fk("recipient_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    scheduledDate: timestamp("scheduled_date", { withTimezone: true }),
    sent: boolean("sent").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("campaign_schedules_profile_date_idx").on(t.profileId, t.scheduledDate),
    index("campaign_schedules_sent_date_idx").on(t.sent, t.scheduledDate),
  ],
);

/**
 * Unified engagement log — replaces v1 `invite_tracker`, `invite_history`,
 * `invite_funnel_activity` and `invite_code` with one typed, indexed event stream.
 */
export const campaignEvents = pgTable(
  "campaign_events",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    campaignId: fk("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    recipientId: fk("recipient_id").references(() => contacts.id, { onDelete: "set null" }),
    type: campaignEventTypeEnum("type").notNull(),
    trackerId: varchar("tracker_id", { length: 255 }),
    channel: campaignChannelEnum("channel"),
    subject: varchar("subject", { length: 255 }),
    detail: text("detail"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [
    index("campaign_events_profile_idx").on(t.profileId),
    index("campaign_events_recipient_idx").on(t.recipientId),
    index("campaign_events_tracker_idx").on(t.trackerId),
    index("campaign_events_profile_occurred_idx").on(t.profileId, t.occurredAt),
  ],
);

/** v1 `campaign_presets` — saved email/campaign templates. */
export const campaignPresets = pgTable("campaign_presets", {
  id: pk(),
  profileId: fk("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 45 }).notNull().default(""),
  values: jsonb("values").notNull().default({}),
  isPrivate: boolean("is_private").notNull().default(true),
  ...timestamps,
});
