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
| 01 | [users-auth.md](01-users-auth.md) | user, user_profile, verification | ⏳ being written (schema extraction in progress) |
| 02 | [profiles.md](02-profiles.md) | profile (god table → 8 tables), geo_zipcodes links | ⏳ being written (schema extraction in progress) |
| 03 | [contacts.md](03-contacts.md) | invite_recipient (+ tags CSV), imports summary | ⏳ being written (schema extraction in progress) |
| 04 | [reviews.md](04-reviews.md) | review | ⏳ being written (schema extraction in progress) |
| 05 | [social.md](05-social.md) | social_stream (+ token vault), social_post(+media), social_campaign, campaign_posts, scheduled_posts_automator, social_insight, keyword_insight | ⏳ being written (schema extraction in progress) |
| 06 | [campaigns.md](06-campaigns.md) | invite_campaign (+S3 bodies), invite_scheduler (recompute!), trackers/history → campaign_events | ⏳ being written (schema extraction in progress) |
| 07 | [messaging.md](07-messaging.md) | messaging (blob→rows), messaging_settings, keyword(s), call tables, audio | ⏳ being written (schema extraction in progress) |
| 08 | [media.md](08-media.md) | image, video, S3-Files objects → S3 + media_references discovery | ⏳ being written (schema extraction in progress) |
| 09 | [surveys.md](09-surveys.md) | survey, survey_question/answer/tracking(+actions)/style | ⏳ being written (schema extraction in progress) |
| 10 | [misc.md](10-misc.md) | notification→NOTIF prefs, profile_notification, monthly_target, referrals, links/linkmaster, widget, newsletters+categories, manage_request | ⏳ being written (schema extraction in progress) |

Schema ground truth used by these specs: v1 `base_schema_2026-05-19.sql` · v2
`packages/db/src/schema/` — extracted 2026-07-06. If either schema changes, regenerate the
affected column maps before implementing.
