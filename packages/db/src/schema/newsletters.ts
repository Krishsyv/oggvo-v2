import { boolean, index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { fk, pk, timestamps } from "./_helpers.js";

/** v1 `newsletter_category`. */
export const newsletterCategories = pgTable("newsletter_categories", {
  id: pk(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  type: varchar("type", { length: 500 }),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** v1 `newsletter_newsletter` → `newsletters`. */
export const newsletters = pgTable(
  "newsletters",
  {
    id: pk(),
    categoryId: fk("category_id")
      .notNull()
      .references(() => newsletterCategories.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull().unique(),
    subject: varchar("subject", { length: 255 }).notNull(),
    body: text("body").notNull(),
    designJson: jsonb("design_json"),
    image: varchar("image", { length: 255 }),
    defaultDate: timestamp("default_date", { withTimezone: true }),
    active: boolean("active").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("newsletters_default_date_idx").on(t.defaultDate)],
);
