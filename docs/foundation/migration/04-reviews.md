# Spec 04 — Reviews

**v1 source:** `review` · **v2 target:** `reviews` · **Run:** per profile, after 02/03 and spec-05's
`social_accounts` (reviews FK social_account_id) — actual order: 02 → 03 → 05a (accounts only) → 04 → rest of 05.

## Prerequisites
- `reviews.legacy_id` (G3); `reviews.deleted_at` (PF-2 — v2 today only has `permanent_delete` bool, which the foundation replaces with soft delete).

## Column map — `review` → `reviews`

| v1 | v2 | transform |
| --- | --- | --- |
| ID | legacy_id | direct |
| Site | site | normalize casing to the v2 platform-name set (`Google`, `Facebook`, `Zillow`, `Yelp`, `Realtor`, `Oggvo`, …) — exact list from linkmaster names; unknown → keep verbatim + warning `REVIEW_UNKNOWN_SITE` |
| Review | body | G6 encoding repair |
| ReviewScore decimal(10,0) | score numeric(3,1) | direct; >5 or <0 → NULL + warning `REVIEW_BAD_SCORE` |
| ReviewURL | url | direct |
| ReviewDate | review_date | G1. NULL → created_at value + warning `REVIEW_NO_DATE` (feed sorts by this) |
| ReviewReminders | review_reminders | NULL→0 |
| ReviewerName / ReviewerImage | reviewer_name / reviewer_image | G7; image re-key spec-08 (reviewer avatars pulled by bot may be prod-only files — expect `MEDIA_MISSING` warnings, keep original URL string so render degrades gracefully per AD-12) |
| **SocialID** | (dedupe key) | **critical:** store verbatim in a `provider_review_id` R0 column (or reuse `social_id`-style column — R0 decides name). First post-migration `review-puller` run dedupes on it; without this every migrated review duplicates on first pull. '' stays ''. |
| SocialReply / SocialReplyID | social_reply / social_reply_id | direct |
| **LinkID** | link_id / social_account_id | **two meanings in v1** (plan §3.6): if LinkID matches a migrated `social_stream` legacy id → set `social_account_id`; else if it matches a `linkmaster` legacy id (manually-added review) → set `link_id` to the migrated link_masters row; else both NULL + warning `REVIEW_LINK_UNRESOLVED`. Never guess. |
| RecipientID | recipient_id | contact legacy lookup; 0/missing → NULL |
| PermanentDelete | deleted_at | `1` → soft-deleted (`deleted_at` = LastUpdated/CreateDate); keep `permanent_delete=true` too while the column exists |
| CreateDate | created_at | G1 |

**Reviews belonging to soft-deleted streams:** if the resolved `social_accounts` row has
`deleted_at` set (v1 `DeleteDate` grace state), the review migrates **soft-deleted as part of the
disconnect set** (PF-2) — restored if the account reconnects.

## Validation
```sql
SELECT count(*) FROM review WHERE ProfileID=:v1id;                                -- v1
SELECT count(*) FROM reviews WHERE profile_id=:v2id AND legacy_id IS NOT NULL;    -- equal
-- aggregate parity (the number the customer will notice)
SELECT count(*), round(avg(ReviewScore),2) FROM review WHERE ProfileID=:v1id AND PermanentDelete=0;
SELECT count(*), round(avg(score),2) FROM reviews WHERE profile_id=:v2id AND deleted_at IS NULL;
-- provider dedupe readiness
SELECT count(*) FROM reviews WHERE profile_id=:v2id AND site='Google' AND (provider_review_id IS NULL OR provider_review_id=''); -- review manually-added only
-- link resolution accounting
SELECT code, count(*) FROM migration_warnings WHERE entity='reviews' AND profile_id=:v2id GROUP BY code;
```
Functional smoke: feed renders with correct counts/filters; run `review-puller` once against the
pilot's Google connection → **zero new rows for existing reviews** (dedupe proof); reply thread on a
migrated Google review still shows.
