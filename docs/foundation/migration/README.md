# Migration specs — v1 → v2, entity by entity

Execution-grade detail for the MIGR epic. **Audience: both humans and AI agents.** Each spec in
this folder is written so a developer *or* a Claude session can implement that entity's ETL
without reading v1 source code: exact source columns, exact target columns, the transform for
every column, edge cases with decided answers, and validation SQL.

Strategy, runbook, cutover, comms: [`../08-v1-migration-plan.md`](../08-v1-migration-plan.md).
This folder is the per-entity detail layer under it.

## How an AI agent should use a spec (read this first)

1. Implement exactly one spec file per task/session. Do not combine entities.
2. The **column map table is normative** — every v1 column is either mapped, transformed, or
   explicitly dropped with a reason. If you find a v1 column not listed, STOP and flag it
   (that's a spec bug, not your call).
3. ETL code lives in `apps/workers/src/migration/<entity>.ts` (Phase-3 module), takes
   `(v1Connection, v2Db, profileLegacyId)` and is **idempotent**: upsert keyed on
   `(profile_id, legacy_id)` — running twice must be a no-op.
4. Apply the **global rules** below without being re-told in each spec.
5. Finish by implementing the spec's **Validation** queries as part of the migration report
   (MIGR-1.2) — they're the acceptance tests.

## Global transform rules (apply everywhere)

| Rule | Detail |
| --- | --- |
| G1 Timestamps | v1 stores **America/Los_Angeles wall-clock** in DATETIME. Convert to UTC honouring DST at that instant (`luxon` zone conversion). Never treat v1 values as UTC. |
| G2 Zero dates | `0000-00-00`, `0000-00-00 00:00:00`, and template defaults (`1899-*`, `2022-*` newsletter defaults) → `NULL`. |
| G3 legacy_id | Every target row stores the v1 PK in `legacy_id`. Upsert key = `(profile_id, legacy_id)` (global tables: `legacy_id` alone). |
| G4 Booleans | v1 tinyint/bit/`'0'|'1'` strings → real boolean. Treat NULL as `false` unless the spec says otherwise. |
| G5 Enums | Map via the spec's enum table only. An unmapped incoming value → row migrated with the spec's fallback + a `migration_warnings` entry (never crash mid-profile, never invent a value). |
| G6 Text encoding | Run the double-encoded-UTF-8 repair (v1 `utf8_encode` damage) on human-text columns; unrecoverable → keep verbatim + warning row. |
| G7 Trimming | Trim whitespace; empty string → NULL for nullable text columns. |
| G8 Warnings ledger | `migration_warnings(profile_id, entity, legacy_id, code, detail)` — every anomaly lands here; the per-profile report aggregates it. |
| G9 No provider calls | ETL never calls Twilio/Meta/Google/etc. Post-migration health checks (separate job) do that. |
| G10 Order | Run specs in the numbered order below — later entities FK earlier ones. |

## Spec files & run order

| # | Spec | v1 sources | Status |
| --- | --- | --- | --- |
| 01 | [users-auth.md](01-users-auth.md) | user, user_profile, verification | ✅ detailed |
| 02 | [profiles.md](02-profiles.md) | profile (god table → 8 tables), geo_zipcodes links | ✅ detailed |
| 03 | [contacts.md](03-contacts.md) | invite_recipient (+ tags CSV), imports summary | ✅ detailed |
| 04 | [reviews.md](04-reviews.md) | review | ✅ detailed |
| 05 | [social.md](05-social.md) | social_stream (+ token vault), social_post(+media), social_campaign, campaign_posts, scheduled_posts_automator, social_insight, keyword_insight | ✅ detailed |
| 06 | [campaigns.md](06-campaigns.md) | invite_campaign (+S3 bodies), invite_scheduler (recompute!), trackers/history → campaign_events | ✅ detailed |
| 07 | [messaging.md](07-messaging.md) | messaging (blob→rows), messaging_settings, keyword(s), call tables, audio | ✅ detailed |
| 08 | [media.md](08-media.md) | image, video, S3-Files objects → S3 + media_references discovery | ✅ detailed |
| 09 | [surveys.md](09-surveys.md) | survey, survey_question/answer/tracking(+actions)/style | ✅ detailed |
| 10 | [misc.md](10-misc.md) | notification→NOTIF prefs, profile_notification, monthly_target, referrals, links/linkmaster, widget, newsletters+categories, manage_request | ✅ detailed |

## Consolidated R0 schema prerequisites (surfaced by the specs)

Implement BEFORE any spec (they're referenced as "R0" throughout):

1. `legacy_id bigint` (indexed) on every migrated table; composite provenance
   `(legacy_source, legacy_id)` on `campaign_events` (three v1 source tables share it).
2. `users.legacy_password jsonb` (scheme/hash/salt — argon2 upgrade-on-login).
3. `account_type` enum aligned to AD-09 (`none|sales|manager|supervisor|admin`) — current
   `user|staff|admin|superadmin` loses Sales/Manager (spec-01).
4. `message_platform` enum + `facebook | instagram | inquiry` (spec-07).
5. `deleted_at` on `contacts`, `reviews`, `social_posts` (PF-2 soft-delete sets).
6. `reviews.provider_review_id` (puller dedupe — spec-04).
7. `conversations.legacy_blob text` (12-month raw retention — spec-07).
8. `migration_warnings` + `migration_reports`/`migration_report_items` tables (G8, MIGR-1.2).
9. `user_profiles.role`, plans/subscriptions/entitlements, `suppressions`, `media_references`
   (already on the R0 list in ../05-roadmap.md).

**Known TODO:** spec-07c (calls/audio) needs a v1 schema extraction pass for the call tables —
they weren't in the first extraction batch. Marked inside the spec.

Schema ground truth used by these specs: v1 `base_schema_2026-05-19.sql` · v2
`packages/db/src/schema/` — extracted 2026-07-06. If either schema changes, regenerate the
affected column maps before implementing.
