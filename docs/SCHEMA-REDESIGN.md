# Schema redesign: v1 (MySQL) → v2 (Postgres / Drizzle)

The v2 schema is a faithful redesign of the 65-table v1 MySQL schema. Every live column is carried
forward; naming, typing, and structure are modernized. This document records the deliberate changes
so the data-migration ETL (Phase 5) has an unambiguous mapping.

## Global rules

- **Naming:** `PascalCase`/`camelCase` MySQL identifiers → `snake_case` Postgres columns; Drizzle
  exposes them as camelCase in TS. Tables are singular-domain, plural form (`profiles`, `reviews`).
- **Primary keys:** `int AUTO_INCREMENT` → `bigint generated always as identity`.
- **Public identifiers:** entities exposed in URLs keep/gain a `uuid` (`public_id`) column.
- **Booleans:** MySQL `tinyint(1)` / `bit(1)` → real `boolean`.
- **Timestamps:** `datetime`/`timestamp` → `timestamptz`, stored UTC. Standard `created_at` /
  `updated_at`; soft-deletable tables use `deleted_at`.
- **Enums:** MySQL `enum(...)` and numeric/string status codes → Postgres `pgEnum` with readable
  values (`'active' | 'inactive' | 'archived'` instead of `'1' | '0' | '-1'`).
- **JSON:** `longtext`/`mediumtext`/`text` columns holding JSON → `jsonb`.
- **Foreign keys:** all implied relationships (`ProfileID`, `UserID`, …) become real FK constraints
  with indexes.

## Dropped tables

| v1 table        | Reason                                                              |
| --------------- | ------------------------------------------------------------------ |
| `review_backup` | Dead historical backup, not used by the app.                       |
| `migrations`    | CodeIgniter migration bookkeeping — replaced by Drizzle's journal.  |
| `login_history` | CI session store; v2 uses `auth_sessions` for refresh tokens.       |

## Renamed / fixed

| v1                          | v2                              | Note                                  |
| --------------------------- | ------------------------------- | ------------------------------------- |
| `notificaiton_navbar`       | folded into `notification_seen` | typo fixed; modeled as seen-tracking  |
| `invite_recipient`          | `contacts`                      | clearer domain name                   |
| `invite_campaign`           | `campaigns`                     |                                       |
| `invite_scheduler`          | `campaign_schedules`            |                                       |
| `invite_tracker`/`invite_history`/`invite_funnel_activity` | `campaign_events` | unified, typed activity log |
| `social_stream`             | `social_accounts`               | it models connected accounts          |
| `newsletter_newsletter`     | `newsletters`                   |                                       |
| `newsletter_category`       | `newsletter_categories`         |                                       |

## Normalized (de-stringified)

| v1                                   | v2                                                        |
| ------------------------------------ | -------------------------------------------------------- |
| `invite_recipient.Tags` (CSV string) | `contact_tags` + `contact_tag_assignments` (m:n)         |
| `invite_recipient.CustomField`       | `contacts.custom_fields jsonb`                           |
| `messaging.conversation` (blob)      | `conversations` + `messages` (one row per message)       |
| `notificaiton_navbar.SeenReview` CSV | `notification_seen` rows                                 |

## Split: the `profile` god-table

v1 `profile` had 100+ columns mixing concerns. v2 splits it into focused tables (1:1 with `profiles`),
so each domain owns its settings and the core row stays small:

| v2 table                       | Holds (from v1 `profile`)                                                      |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `profiles`                     | identity, address, phone, timezone, lat/long, suspension, lifecycle dates      |
| `profile_google`              | Google place/CID/LRD, review dialog, maps URL, review list                     |
| `profile_review_settings`     | star texts/shape, happy threshold, thank-you/feedback messages, stream/aggregate flags |
| `profile_email_settings`      | campaign from-name/email/reply-to, recipient auto-activation rules             |
| `profile_messaging_settings`  | SMS number/SID/token, messaging service id, auto-response, sms limit, timezone  |
| `profile_newsletter_settings` | newsletter colors, header/footer, button                                       |
| `profile_affiliate`           | affiliate active/code/footer                                                   |
| `profile_prompts`             | social prompt URLs (facebook/twitter/instagram/youtube/web/oggvo)              |

No column is lost; each lands in exactly one table. The ETL writes the parent row then the satellites.
