import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { referralStatusEnum } from "./_enums.js";
import { fk, pk, timestamps } from "./_helpers.js";
import { users } from "./auth.js";
import { profiles } from "./tenancy.js";

/** v1 `referrals` — profile-to-profile referrals. */
export const referrals = pgTable("referrals", {
  id: pk(),
  referrerProfileId: fk("referrer_profile_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  refereeProfileId: fk("referee_profile_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 255 }).notNull().default(""),
  businessName: varchar("business_name", { length: 255 }).notNull().default(""),
  email: varchar("email", { length: 255 }).notNull().default(""),
  phone: varchar("phone", { length: 255 }).notNull().default(""),
  status: referralStatusEnum("status").notNull().default("pending"),
  ...timestamps,
});

/** v1 `history` → `audit_log` — generic action audit trail. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    userId: fk("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 45 }),
    notes: text("notes"),
    relatedId: fk("related_id"),
    relatedTable: varchar("related_table", { length: 64 }),
    ...timestamps,
  },
  (t) => [index("audit_log_related_idx").on(t.relatedTable, t.relatedId)],
);

/** v1 `customerfeedback` → `customer_feedback` — inbound support/feedback. */
export const customerFeedback = pgTable("customer_feedback", {
  id: pk(),
  profileId: fk("profile_id").references(() => profiles.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }),
  action: varchar("action", { length: 255 }),
  phone: varchar("phone", { length: 255 }),
  email: varchar("email", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  message: text("message"),
  statusName: varchar("status_name", { length: 255 }),
  statusDetails: text("status_details"),
  ...timestamps,
});

/** v1 `blacklisted_emails` — suppression list. */
export const blacklistedEmails = pgTable(
  "blacklisted_emails",
  {
    id: pk(),
    email: varchar("email", { length: 255 }).notNull(),
    ...timestamps,
  },
  (t) => [index("blacklisted_emails_email_idx").on(t.email)],
);

/** v1 `monthly_targets` — per-profile monthly goals. */
export const monthlyTargets = pgTable(
  "monthly_targets",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    requests: integer("requests"),
    reviews: integer("reviews"),
    socialMediaPosts: integer("social_media_posts"),
    reviewsPosted: integer("reviews_posted"),
    connections: integer("connections"),
    ...timestamps,
  },
  (t) => [index("monthly_targets_profile_month_idx").on(t.profileId, t.month)],
);

/**
 * New in v2 — feature flags for staged rollout.
 * `profileId` null = global flag; set = per-profile override.
 */
export const featureFlags = pgTable(
  "feature_flags",
  {
    id: pk(),
    key: varchar("key", { length: 128 }).notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(false),
    profileId: fk("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("feature_flags_key_idx").on(t.key)],
);
