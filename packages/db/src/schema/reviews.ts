import { boolean, index, integer, numeric, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { fk, pk, timestamps } from "./_helpers.js";
import { profiles } from "./tenancy.js";

/**
 * v1 `review` — a review pulled from or created for a profile.
 * (v1 `review_backup` is intentionally dropped — see docs/SCHEMA-REDESIGN.md.)
 * `socialAccountId`, `linkId` and `recipientId` relations are declared in relations.ts.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    site: varchar("site", { length: 45 }),
    body: text("body"),
    score: numeric("score", { precision: 3, scale: 1 }),
    url: text("url"),
    reviewDate: timestamp("review_date", { withTimezone: true }),
    reviewReminders: integer("review_reminders").notNull().default(0),
    reviewerName: varchar("reviewer_name", { length: 255 }),
    reviewerImage: varchar("reviewer_image", { length: 255 }),
    socialAccountId: fk("social_account_id"),
    socialReply: text("social_reply"),
    socialReplyId: text("social_reply_id"),
    linkId: fk("link_id"),
    recipientId: fk("recipient_id"),
    permanentDelete: boolean("permanent_delete").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("reviews_profile_idx").on(t.profileId),
    index("reviews_profile_site_idx").on(t.profileId, t.site),
    index("reviews_review_date_idx").on(t.reviewDate),
  ],
);
