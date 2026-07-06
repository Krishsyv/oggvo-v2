# @oggvo/db

The single source of truth for the Oggvo data model: Drizzle table definitions, Postgres enums,
relations, migrations, and seeds. Both `apps/api` and `apps/workers` import from here — there is no
second copy of the model anywhere (this is the explicit fix for v1's duplicated Go structs).

## Layout

```
src/
├── client.ts            createDb() + a default `db` singleton (postgres-js driver)
├── index.ts             package entrypoint (re-exports client + schema)
├── migrate.ts           applies ./drizzle migrations (pnpm db:migrate)
├── seed.ts              reference-data seed (pnpm db:seed)
├── schema.test.ts       schema smoke tests (vitest)
└── schema/
    ├── _enums.ts        every pgEnum, defined once
    ├── _helpers.ts      pk(), fk(), timestamps, softDelete helpers
    ├── auth.ts          users, auth_sessions, verifications
    ├── tenancy.ts       profiles + 7 settings satellites, user_profiles, manage_requests
    ├── design.ts        designs, palettes, buttons
    ├── reviews.ts       reviews
    ├── links.ts         link_masters, links, crawler_history
    ├── contacts.ts      contacts, contact_tags, contact_tag_assignments, contact_imports
    ├── campaigns.ts     campaigns, campaign_schedules, campaign_events, campaign_presets
    ├── messaging.ts     conversations, messages
    ├── social.ts        social_accounts, social_posts, social_post_media, social_campaigns,
    │                    social_campaign_posts, scheduled_posts_automator, social_insights,
    │                    keyword_insights, platform_whitelist
    ├── surveys.ts       surveys, survey_questions, survey_answers, survey_tracking,
    │                    survey_tracking_actions, survey_style
    ├── widgets.ts       widgets, funnel_designs
    ├── newsletters.ts   newsletter_categories, newsletters
    ├── notifications.ts email_notifications, profile_notifications, notification_seen,
    │                    push_campaigns, push_channels, push_campaign_devices
    ├── geo.ts           geo_zipcodes, geo_zipcodes_profile
    ├── twilio.ts        audio, call_settings, call_logs, call_status_history, twilio_verifications
    ├── media.ts         images, videos
    ├── misc.ts          referrals, audit_log, customer_feedback, blacklisted_emails,
    │                    monthly_targets, feature_flags
    └── relations.ts     Drizzle relations() for the query API
```

## Conventions

- **camelCase in TS, snake_case in Postgres.** The client is created with `casing: "snake_case"`,
  so property names map to snake_case columns automatically.
- **PKs:** `bigserial` surrogate `id`. Externally-exposed entities also carry a `public_id uuid`.
- **Timestamps:** `created_at` / `updated_at` (`timestamptz`, UTC). Soft-deletable tables add
  `deleted_at`.
- **Enums:** every status/type is a `pgEnum` in `_enums.ts` with human-readable values.
- **JSON:** all serialized blobs from v1 are `jsonb`.

This schema is a redesign of the v1 MySQL schema; see [`../../docs/SCHEMA-REDESIGN.md`](../../docs/SCHEMA-REDESIGN.md)
for the table-by-table mapping (dropped tables, renames, the profile split, normalizations).

## Workflow

```bash
# after editing any schema/*.ts file
pnpm db:generate     # generate a SQL migration into ./drizzle
pnpm db:migrate      # apply it to the database in DATABASE_URL
pnpm db:seed         # load reference data
pnpm db:studio       # browse data in Drizzle Studio

# quick local iteration without a migration file
pnpm db:push
```

## Usage from an app

```ts
import { createDb, schema } from "@oggvo/db";

const db = createDb(process.env.DATABASE_URL);
const profile = await db.query.profiles.findFirst({
  where: (p, { eq }) => eq(p.shortname, "acme"),
  with: { reviewSettings: true, google: true },
});
```
