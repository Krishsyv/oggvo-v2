import { boolean, integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { fk, pk, timestamps } from "./_helpers.js";
import { profiles } from "./tenancy.js";

/** v1 `linkmaster` — platform catalog (Google, Facebook, Trustpilot, …). */
export const linkMasters = pgTable("link_masters", {
  id: pk(),
  name: varchar("name", { length: 255 }),
  imageUrl: varchar("image_url", { length: 255 }),
  category: varchar("category", { length: 255 }),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** v1 `link` — a profile's review link/button for a platform. */
export const links = pgTable("links", {
  id: pk(),
  profileId: fk("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  masterLinkId: fk("master_link_id").references(() => linkMasters.id),
  name: varchar("name", { length: 255 }),
  url: text("url"),
  reviewMonitoringUrl: text("review_monitoring_url"),
  rank: integer("rank"),
  imageUrl: varchar("image_url", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  opensInNewWindow: boolean("opens_in_new_window").notNull().default(false),
  skipInstructions: boolean("skip_instructions").notNull().default(false),
  showOnDesktop: boolean("show_on_desktop").notNull().default(true),
  showOnMobile: boolean("show_on_mobile").notNull().default(true),
  deviceAndroid: boolean("device_android").notNull().default(true),
  deviceBlackberry: boolean("device_blackberry").notNull().default(true),
  deviceIos: boolean("device_ios").notNull().default(true),
  deviceWindows: boolean("device_windows").notNull().default(true),
  showInReviewFunnel: boolean("show_in_review_funnel").notNull().default(true),
  ...timestamps,
});

/** v1 `crawler_history` — review-monitoring crawl log. */
export const crawlerHistory = pgTable("crawler_history", {
  id: pk(),
  profileId: fk("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  siteName: varchar("site_name", { length: 255 }),
  reviewUrl: text("review_url"),
  lastRun: timestamp("last_run", { withTimezone: true }),
  newReviewsFound: integer("new_reviews_found"),
  errors: integer("errors"),
  ...timestamps,
});
