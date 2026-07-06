import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { manageRequestStatusEnum, manageRequestTypeEnum } from "./_enums.js";
import { fk, pk, timestamps } from "./_helpers.js";
import { users } from "./auth.js";

/**
 * v1 `profile` (100+ columns) is split into a small core row + focused satellite tables.
 * See docs/SCHEMA-REDESIGN.md for the full column mapping.
 */
export const profiles = pgTable(
  "profiles",
  {
    id: pk(),
    publicId: uuid("public_id").defaultRandom().notNull().unique(),
    name: varchar("name", { length: 255 }),
    shortname: varchar("shortname", { length: 255 }).unique(),
    internalId: varchar("internal_id", { length: 255 }),
    businessName: varchar("business_name", { length: 255 }),
    logo: varchar("logo", { length: 255 }).notNull().default(""),
    address: varchar("address", { length: 255 }).notNull().default(""),
    address2: varchar("address2", { length: 255 }).notNull().default(""),
    city: varchar("city", { length: 255 }).notNull().default(""),
    state: varchar("state", { length: 255 }).notNull().default(""),
    zipcode: varchar("zipcode", { length: 45 }).notNull().default(""),
    phone: varchar("phone", { length: 45 }).notNull().default(""),
    timezone: varchar("timezone", { length: 255 }).notNull().default("America/Los_Angeles"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    suspended: boolean("suspended").notNull().default(false),
    migrated: boolean("migrated").notNull().default(false),
    createdBy: fk("created_by").references(() => users.id),
    lastUpdatedBy: fk("last_updated_by").references(() => users.id),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    lastRecipientActivationAt: timestamp("last_recipient_activation_at", { withTimezone: true }),
    expirationDate: timestamp("expiration_date", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("profiles_shortname_idx").on(t.shortname)],
);

/** user ↔ profile membership (v1 `user_profile`). */
export const userProfiles = pgTable(
  "user_profiles",
  {
    id: pk(),
    userId: fk("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("user_profiles_user_profile_idx").on(t.userId, t.profileId),
    index("user_profiles_profile_idx").on(t.profileId),
  ],
);

/** Review-funnel display settings (from v1 `profile`). */
export const profileReviewSettings = pgTable("profile_review_settings", {
  profileId: fk("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  happyMinimum: integer("happy_minimum").notNull().default(4),
  starShape: varchar("star_shape", { length: 32 }).notNull().default("star"),
  starText1: varchar("star_text_1", { length: 255 }).notNull().default("Poor"),
  starText2: varchar("star_text_2", { length: 255 }).notNull().default("Subpar"),
  starText3: varchar("star_text_3", { length: 255 }).notNull().default("Just OK"),
  starText4: varchar("star_text_4", { length: 255 }).notNull().default("Great"),
  starText5: varchar("star_text_5", { length: 255 }).notNull().default("Excellent"),
  messageHeader: text("message_header"),
  messageText: text("message_text"),
  messageHappy: text("message_happy"),
  messageUnhappy: text("message_unhappy"),
  thankYouHeading: varchar("thank_you_heading", { length: 255 }).notNull().default("Thank you for your review!"),
  thankYouBody: text("thank_you_body"),
  thankYouMessage: varchar("thank_you_message", { length: 255 }).notNull().default("Thank you for the positive feedback!"),
  negativeFeedbackMessage: varchar("negative_feedback_message", { length: 255 }).notNull().default("We appreciate your feedback!"),
  customPoweredBy: text("custom_powered_by"),
  showBusinessNameText: boolean("show_business_name_text").notNull().default(false),
  showReviewStream: boolean("show_review_stream").notNull().default(false),
  showLocationDetails: boolean("show_location_details").notNull().default(false),
  useCaptcha: boolean("use_captcha").notNull().default(false),
  showPoweredBy: boolean("show_powered_by").notNull().default(false),
  hideOggvoReviews: boolean("hide_oggvo_reviews").notNull().default(true),
  doNotFilter: boolean("do_not_filter").notNull().default(false),
  showReviews: boolean("show_reviews").notNull().default(false),
  includeEmpty: boolean("include_empty").notNull().default(false),
  showAggregate: boolean("show_aggregate").notNull().default(false),
  useReviewersLastInitial: boolean("use_reviewers_last_initial").notNull().default(false),
  numberOfReviews: integer("number_of_reviews").notNull().default(10),
  reviewNotificationThreshold: integer("review_notification_threshold"),
  streamThreshold: integer("stream_threshold").notNull().default(4),
  socialThreshold: integer("social_threshold").notNull().default(-1),
  socialReviewMessage: varchar("social_review_message", { length: 255 }).notNull().default(""),
  reviewWidgetButtonBgColor: varchar("review_widget_button_bg_color", { length: 7 }).notNull().default("27b9f9"),
  reviewWidgetButtonTextColor: varchar("review_widget_button_text_color", { length: 7 }).notNull().default("ffffff"),
  locationBusinessName: varchar("location_business_name", { length: 255 }).notNull().default(""),
  locationPostalCode: varchar("location_postal_code", { length: 45 }).notNull().default(""),
  locationBusinessPhone: varchar("location_business_phone", { length: 45 }).notNull().default(""),
  // Relations to design/palette are declared in relations.ts to avoid an import cycle.
  paletteId: fk("palette_id"),
  designId: fk("design_id"),
  useDesign: boolean("use_design").notNull().default(false),
  ...timestamps,
});

/** Google review integration config (from v1 `profile`). */
export const profileGoogle = pgTable("profile_google", {
  profileId: fk("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  googlePlaceId: varchar("google_place_id", { length: 255 }).notNull().default(""),
  googleCid: varchar("google_cid", { length: 255 }).notNull().default(""),
  googleLrd: varchar("google_lrd", { length: 255 }).notNull().default(""),
  googleReviewDialog: text("google_review_dialog"),
  googleAlternateReview: text("google_alternate_review"),
  googleMapsUrl: text("google_maps_url"),
  googleReviewList: text("google_review_list"),
  ...timestamps,
});

/** Email-campaign + recipient-activation settings (from v1 `profile`). */
export const profileEmailSettings = pgTable("profile_email_settings", {
  profileId: fk("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  fromName: varchar("from_name", { length: 255 }).notNull().default(""),
  fromEmail: varchar("from_email", { length: 255 }).notNull().default(""),
  replyTo: varchar("reply_to", { length: 255 }).notNull().default(""),
  autoActivateRecipients: boolean("auto_activate_recipients").notNull().default(false),
  autoActivateLimit: integer("auto_activate_limit").notNull().default(10),
  activeRecipientLimit: integer("active_recipient_limit").notNull().default(10),
  daysBeforeRemovingPastRecipients: integer("days_before_removing_past_recipients").notNull().default(100),
  deactivateOnOpen: boolean("deactivate_on_open").notNull().default(false),
  deactivateOnClick: boolean("deactivate_on_click").notNull().default(false),
  deactivateOnClickthrough: boolean("deactivate_on_clickthrough").notNull().default(false),
  timeActivateRecipients: varchar("time_activate_recipients", { length: 8 }).notNull().default(""),
  ...timestamps,
});

/** SMS / Connect messaging settings (merges v1 `profile` SMS cols + `messaging_settings`). */
export const profileMessagingSettings = pgTable("profile_messaging_settings", {
  profileId: fk("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  smsNumber: varchar("sms_number", { length: 20 }).notNull().default(""),
  smsNumberSid: varchar("sms_number_sid", { length: 255 }).notNull().default(""),
  smsNumberToken: varchar("sms_number_token", { length: 255 }).notNull().default(""),
  smsNumberId: varchar("sms_number_id", { length: 255 }),
  messagingServiceId: varchar("messaging_service_id", { length: 255 }),
  autoResponse: boolean("auto_response").notNull().default(false),
  autoResponseDetails: text("auto_response_details"),
  smsLimit: integer("sms_limit").notNull().default(200),
  active: boolean("active").notNull().default(false),
  ...timestamps,
});

/** Newsletter widget styling (from v1 `profile`). */
export const profileNewsletterSettings = pgTable("profile_newsletter_settings", {
  profileId: fk("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  bgColor: varchar("bg_color", { length: 7 }).notNull().default("1259a8"),
  textColor: varchar("text_color", { length: 7 }).notNull().default("ffffff"),
  header: varchar("header", { length: 255 }).notNull().default("Subscribe To Our Newsletter"),
  footer: varchar("footer", { length: 255 }).notNull().default("Stay Connected With Us"),
  buttonId: fk("button_id"),
  ...timestamps,
});

/** Affiliate program fields (from v1 `profile`). */
export const profileAffiliate = pgTable("profile_affiliate", {
  profileId: fk("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(false),
  code: varchar("code", { length: 255 }).notNull().default(""),
  footerText: varchar("footer_text", { length: 255 }).notNull().default(""),
  ...timestamps,
});

/** "Prompt visitors to connect" social URLs (from v1 `profile`). */
export const profilePrompts = pgTable("profile_prompts", {
  profileId: fk("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  promptVisitorsToConnect: boolean("prompt_visitors_to_connect").notNull().default(false),
  facebook: varchar("facebook", { length: 255 }).notNull().default(""),
  twitter: varchar("twitter", { length: 255 }).notNull().default(""),
  instagram: varchar("instagram", { length: 255 }).notNull().default(""),
  youtube: varchar("youtube", { length: 255 }).notNull().default(""),
  web: varchar("web", { length: 255 }).notNull().default(""),
  promptOggvo: boolean("prompt_oggvo").notNull().default(false),
  ...timestamps,
});

/** Account/profile deletion (GDPR) requests — v1 `manage_request`. */
export const manageRequests = pgTable("manage_requests", {
  id: pk(),
  type: manageRequestTypeEnum("type").notNull(),
  requestId: fk("request_id"),
  status: manageRequestStatusEnum("status").notNull().default("pending"),
  requesterId: fk("requester_id")
    .notNull()
    .references(() => users.id),
  performerId: fk("performer_id").references(() => users.id),
  performedAt: timestamp("performed_at", { withTimezone: true }),
  ...timestamps,
});
