import * as argon2 from "argon2";
import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import {
  linkMasters,
  newsletterCategories,
  profiles,
  userProfiles,
  users,
} from "./schema/index.js";

/**
 * Seeds reference data needed by a fresh database, plus a demo tenant + admin so the
 * auth/tenancy slice is exercisable end-to-end:
 *   email: admin@oggvo.test   password: password123   →   member of the "Demo Co" profile.
 * Idempotent: safe to re-run on an existing DB.
 */
async function main() {
  const db = createDb();

  console.warn("Seeding link masters (review platforms)…");
  await db
    .insert(linkMasters)
    .values([
      { name: "Google", category: "review", active: true },
      { name: "Facebook", category: "review", active: true },
      { name: "Yelp", category: "review", active: true },
      { name: "Trustpilot", category: "review", active: true },
    ])
    .onConflictDoNothing();

  console.warn("Seeding newsletter categories…");
  await db
    .insert(newsletterCategories)
    .values([
      { name: "General", active: true },
      { name: "Promotions", active: true },
      { name: "Holidays", active: true },
    ])
    .onConflictDoNothing();

  console.warn("Seeding demo admin user + profile…");
  const demoEmail = "admin@oggvo.test";
  const passwordHash = await argon2.hash("password123");

  await db
    .insert(users)
    .values({
      email: demoEmail,
      passwordHash,
      firstName: "Demo",
      lastName: "Admin",
      accountType: "admin",
      permFunnel: true,
      permWidgets: true,
      permInvites: true,
      permReviews: true,
      permReporting: true,
      permSupport: true,
      permSms: true,
    })
    .onConflictDoNothing({ target: users.email });

  await db
    .insert(profiles)
    .values({ name: "Demo Co", shortname: "demo-co", businessName: "Demo Company LLC" })
    .onConflictDoNothing({ target: profiles.shortname });

  // Re-read to get ids whether the rows were just inserted or already existed.
  const [user] = await db.select().from(users).where(eq(users.email, demoEmail)).limit(1);
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.shortname, "demo-co"))
    .limit(1);

  if (user && profile) {
    await db
      .insert(userProfiles)
      .values({ userId: user.id, profileId: profile.id })
      .onConflictDoNothing();
  }

  console.warn("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
