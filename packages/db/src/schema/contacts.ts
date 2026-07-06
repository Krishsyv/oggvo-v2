import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { contactSourceEnum, contactStatusEnum, importStatusEnum } from "./_enums.js";
import { fk, pk, timestamps } from "./_helpers.js";
import { profiles } from "./tenancy.js";

/** v1 `invite_recipient` → `contacts`. Tags normalized out; CustomField → `customFields jsonb`. */
export const contacts = pgTable(
  "contacts",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull().default(""),
    phone: varchar("phone", { length: 64 }).notNull().default(""),
    firstName: varchar("first_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }),
    optIn: boolean("opt_in").notNull().default(true),
    status: contactStatusEnum("status").notNull().default("pending"),
    source: contactSourceEnum("source").notNull().default("manual"),
    birthday: date("birthday"),
    anniversary: date("anniversary"),
    image: varchar("image", { length: 255 }),
    customFields: jsonb("custom_fields").notNull().default({}),
    sentCount: integer("sent_count").notNull().default(0),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("contacts_profile_idx").on(t.profileId),
    index("contacts_email_idx").on(t.email),
    index("contacts_phone_idx").on(t.phone),
    index("contacts_profile_status_optin_idx").on(t.profileId, t.status, t.optIn),
  ],
);

/** Tag catalog per profile (was a CSV string on the recipient). */
export const contactTags = pgTable(
  "contact_tags",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("contact_tags_profile_name_idx").on(t.profileId, t.name)],
);

/** Many-to-many: contacts ↔ tags. */
export const contactTagAssignments = pgTable(
  "contact_tag_assignments",
  {
    contactId: fk("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: fk("tag_id")
      .notNull()
      .references(() => contactTags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.tagId] })],
);

/** v1 `contact_imports` — bulk CSV import jobs. */
export const contactImports = pgTable(
  "contact_imports",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull().default(""),
    totalCount: integer("total_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    status: importStatusEnum("status").notNull().default("queued"),
    ...timestamps,
  },
  (t) => [index("contact_imports_profile_idx").on(t.profileId)],
);
