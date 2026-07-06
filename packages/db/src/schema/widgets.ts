import { boolean, index, integer, jsonb, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { fk, pk, timestamps } from "./_helpers.js";
import { profiles } from "./tenancy.js";

/** v1 `widgets` — embeddable widget config (Properties was a JSON blob). */
export const widgets = pgTable(
  "widgets",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    widgetType: integer("widget_type").notNull().default(0),
    properties: jsonb("properties").notNull().default({}),
    ...timestamps,
  },
  (t) => [index("widgets_profile_idx").on(t.profileId)],
);

/** v1 `funnel_designs` — exported landing-page/funnel builds. */
export const funnelDesigns = pgTable(
  "funnel_designs",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 255 }).notNull().default(""),
    active: boolean("active").notNull().default(false),
    exportedJson: jsonb("exported_json"),
    exportedHtml: text("exported_html"),
    ...timestamps,
  },
  (t) => [index("funnel_designs_profile_idx").on(t.profileId)],
);
