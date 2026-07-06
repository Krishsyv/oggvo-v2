import { boolean, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { accountTypeEnum, verificationTypeEnum } from "./_enums.js";
import { fk, pk, timestamps } from "./_helpers.js";

/** v1 `user`. Passwords stored as proper argon2/bcrypt hashes (v1 used blob password+salt). */
export const users = pgTable(
  "users",
  {
    id: pk(),
    publicId: uuid("public_id").defaultRandom().notNull().unique(),
    firstName: varchar("first_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash"),
    accountType: accountTypeEnum("account_type").notNull().default("user"),

    // Granular permissions carried over from v1 bit columns.
    permFunnel: boolean("perm_funnel").notNull().default(false),
    permWidgets: boolean("perm_widgets").notNull().default(false),
    permInvites: boolean("perm_invites").notNull().default(false),
    permReviews: boolean("perm_reviews").notNull().default(false),
    permReporting: boolean("perm_reporting").notNull().default(false),
    permSupport: boolean("perm_support").notNull().default(false),
    permSms: boolean("perm_sms").notNull().default(false),

    image: varchar("image", { length: 255 }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastProfileViewUuid: uuid("last_profile_view_uuid"),
    suspended: boolean("suspended").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("users_email_idx").on(t.email)],
);

/** Refresh-token sessions (replaces v1 `login_history` CI session store). Token stored hashed. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: pk(),
    userId: fk("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    userAgent: varchar("user_agent", { length: 512 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

/** v1 `verification` — email/password tokens. */
export const verifications = pgTable("verifications", {
  id: pk(),
  userId: fk("user_id").references(() => users.id, { onDelete: "cascade" }),
  type: verificationTypeEnum("type").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  completed: boolean("completed").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps,
});
