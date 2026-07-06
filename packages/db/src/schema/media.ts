import { index, pgTable, varchar } from "drizzle-orm/pg-core";
import { mediaSourceEnum } from "./_enums.js";
import { fk, pk, timestamps } from "./_helpers.js";
import { profiles } from "./tenancy.js";

/** v1 `image`. */
export const images = pgTable(
  "images",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 255 }).notNull(),
    source: mediaSourceEnum("source").notNull().default("social"),
    ...timestamps,
  },
  (t) => [index("images_profile_idx").on(t.profileId)],
);

/** v1 `video`. */
export const videos = pgTable(
  "videos",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 255 }).notNull(),
    source: mediaSourceEnum("source").notNull().default("social"),
    ...timestamps,
  },
  (t) => [index("videos_profile_idx").on(t.profileId)],
);
