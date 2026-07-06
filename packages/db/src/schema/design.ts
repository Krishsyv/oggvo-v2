import { boolean, integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { fk, pk, timestamps } from "./_helpers.js";
import { profiles } from "./tenancy.js";

/** v1 `design` — review-funnel page design template. */
export const designs = pgTable("designs", {
  id: pk(),
  pageColor: varchar("page_color", { length: 6 }).notNull().default("f1f1f1"),
  backgroundImage: varchar("background_image", { length: 255 }).notNull().default(""),
  backgroundPosition: varchar("background_position", { length: 255 }).notNull().default("left top"),
  backgroundPositionValue: varchar("background_position_value", { length: 255 }).notNull().default(""),
  backgroundRepeat: varchar("background_repeat", { length: 255 }).notNull().default("repeat"),
  backgroundSize: varchar("background_size", { length: 255 }).notNull().default("auto"),
  backgroundSizeValue: varchar("background_size_value", { length: 255 }).notNull().default(""),
  panelColor: varchar("panel_color", { length: 6 }).notNull().default("ffffff"),
  nameColor: varchar("name_color", { length: 6 }).notNull().default("ffffff"),
  headerFooterColor: varchar("header_footer_color", { length: 6 }).notNull().default("127bce"),
  headerFooterTextColor: varchar("header_footer_text_color", { length: 6 }).notNull().default("ffffff"),
  bodyColor: varchar("body_color", { length: 6 }).notNull().default("000000"),
  starColor: varchar("star_color", { length: 6 }).notNull().default("edb336"),
  fontFamily: varchar("font_family", { length: 255 }).notNull().default('"Open Sans", sans-serif'),
  fontSize: varchar("font_size", { length: 4 }).notNull().default("36px"),
  newPanel: boolean("new_panel").notNull().default(false),
  showName: boolean("show_name").notNull().default(false),
  ...timestamps,
});

/** v1 `palette` — colour palette preset. */
export const palettes = pgTable("palettes", {
  id: pk(),
  colorA: varchar("color_a", { length: 45 }),
  colorB: varchar("color_b", { length: 45 }),
  colorC: varchar("color_c", { length: 45 }),
  colorD: varchar("color_d", { length: 45 }),
  colorE: varchar("color_e", { length: 45 }),
  neutral0: varchar("neutral_0", { length: 45 }),
  neutral1: varchar("neutral_1", { length: 45 }),
  neutral2: varchar("neutral_2", { length: 45 }),
  neutral3: varchar("neutral_3", { length: 45 }),
  neutral4: varchar("neutral_4", { length: 45 }),
  neutral5: varchar("neutral_5", { length: 45 }),
  ...timestamps,
});

/** v1 `buttons` — per-profile reusable styled button. */
export const buttons = pgTable("buttons", {
  id: pk(),
  profileId: fk("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  text: varchar("text", { length: 255 }).notNull(),
  textColor: varchar("text_color", { length: 6 }).notNull().default("ffffff"),
  textSize: integer("text_size").notNull().default(15),
  isBold: boolean("is_bold").notNull().default(true),
  isItalic: boolean("is_italic").notNull().default(false),
  isTextShadow: boolean("is_text_shadow").notNull().default(false),
  textShadowDistance: integer("text_shadow_distance").notNull().default(1),
  textShadowColor: varchar("text_shadow_color", { length: 6 }).notNull().default("000000"),
  sizeType: integer("size_type").notNull().default(0),
  xPadding: integer("x_padding").notNull().default(25),
  yPadding: integer("y_padding").notNull().default(10),
  xSize: integer("x_size").notNull().default(200),
  ySize: integer("y_size").notNull().default(50),
  styleType: integer("style_type").notNull().default(0),
  cornerRadius: integer("corner_radius").notNull().default(11),
  isBorder: boolean("is_border").notNull().default(false),
  borderSize: integer("border_size").notNull().default(1),
  borderColor: varchar("border_color", { length: 6 }).notNull().default("000000"),
  backgroundColorType: integer("background_color_type").notNull().default(0),
  backgroundColor1: varchar("background_color_1", { length: 6 }).notNull().default("1552ae"),
  backgroundColor2: varchar("background_color_2", { length: 6 }).notNull().default("219885"),
  isShadow: boolean("is_shadow").notNull().default(false),
  shadowSize: integer("shadow_size").notNull().default(1),
  shadowColor: varchar("shadow_color", { length: 6 }).notNull().default("000000"),
  ...timestamps,
});
