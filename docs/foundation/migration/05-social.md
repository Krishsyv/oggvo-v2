# Spec 05 — Social: accounts (vault!), posts, campaigns, automator, insights

**v1 sources:** `social_stream`, `social_post`, `social_post_media`, `social_campaigns`,
`campaign_posts`, `scheduled_posts_automator`, `social_insight`, `keyword_insight`
**v2 targets:** same-named v2 tables (`social_accounts`, `social_posts`, …)
**Run order inside this spec:** 05a `social_accounts` (before spec-04) → 05b posts/media → 05c campaigns/automator → 05d insights.

## Prerequisites
- `legacy_id` on all targets (G3); vault (AES-GCM) service available offline in the ETL context (PF-9).
- R0 decision from the register: `scheduled_posts_automator` content is **converted into `social_campaigns`**, not kept as a parallel system — but the v2 table exists, so parity-first: migrate raw into `scheduled_posts_automator`, convert in a follow-up v2-side job (keeps ETL reversible).

## 05a — `social_stream` → `social_accounts`

| v1 | v2 | transform |
| --- | --- | --- |
| ID | legacy_id | direct |
| Name | name | this is the platform discriminator in v1 (`Facebook`,`Google`,`Linkedin`/`LinkedIn`,`Twitter`,`Instagram`,`Zillow`,`Stripe`,`Square`,`Clover`,`Clio`,`Liondesk`,`PAM`,`QuickBooks`,`FUB`…). Normalize casing (`Linkedin→LinkedIn`); keep verbatim original in a warning if changed. **Keep/kill list (plan §8, decision owed): rows for killed providers migrate soft-deleted.** |
| Page / PageID | page / page_id | direct |
| AuthorizationID | authorization_id | direct (provider account/user id where v1 captured it) |
| **AuthorizationToken / AuthorizationSecret / SignatureKey** | vault | **encrypt into the R0 vault; the v2 columns hold vault refs, never plaintext.** Empty/NULL → NULL. |
| AuthorizationExpiry | authorization_expiry | G1; already-expired → keep (health check will flag reconnect) |
| ProfileID | profile_id | legacy lookup |
| LastScraped | last_scraped_at | G1 — **preserve accurately**: the puller uses it as the pull-from watermark; resetting it re-pulls everything |
| Active | active | G4 |
| DeleteDate | deleted_at | G1 (grace-state disconnects carry over; their children migrate soft-deleted — PF-2) |
| ClaimedAt / Attempts / NextAttemptAt | claimed_at→NULL / attempts→0 / next_attempt_at→NULL | worker-claim artifacts reset; BullMQ owns retries now |
| CreateDate / LastUpdated | created_at / updated_at | G1 |

**Post-migration health-check job (NOT in ETL — G9):** per account, one taxonomy-classified probe;
`auth_revoked` → flag reconnect-required; owner gets ONE consolidated notification (plan §3.7).

## 05b — posts & media

`social_post` → `social_posts`: ID→legacy_id; ProfileID lookup; LinkID→social_account_id (legacy
lookup; broken ref → NULL + `POST_ACCOUNT_UNRESOLVED`); SocialID→social_id (''→NULL);
SocialName→social_name; ReviewID→review_id (0→NULL; legacy lookup); Message→message (G6);
Type→type; Schedule→scheduled_at (G1); URL→url (''→NULL — v2 nullable); Likes/Shares/Replies
direct; **Status tinyint → enum: `-1→failed`, `0→pending`, `1→posted`; `-2` (v1 in-progress
sentinel) → `pending` + reset** ; FailureReason→failure_reason (G6); Claim/Attempts reset as 05a;
timestamps G1. Posts whose account is in grace → soft-deleted set (needs `deleted_at` on
social_posts — R0 PF-2 column).

`social_post_media` → same name: v1 has **no PK** — composite upsert key `(post legacy id, MediaID
legacy id)`; PostID/MediaID/LinkID via legacy lookups (media rows from spec-08 — run 08 before 05b
for media ids, or two-pass: insert with staging media map); SocialID→social_id; Status → enum as
above. Rows referencing a missing post or media → skip + warning `POSTMEDIA_ORPHAN` (v1 had
orphans; don't invent parents).

## 05c — campaigns & automator

`social_campaigns` → `social_campaigns`: ID→legacy_id; UUID→public_id (invalid→mint);
StyleParams/Preset text→jsonb (parse; unparseable → wrap `{"_raw": "..."}` + warning);
Time→cadence; PostOn→post_on; Type→type; **Status enum('-1','0','1','2') →
`-1→archived, 0→inactive, 1→active, 2→paused`** (v1 meaning of '2' verified against
CampaignModel before pilot — marked `ASSUMPTION` in warnings until confirmed); ClaimedAt→NULL.

`campaign_posts` → `social_campaign_posts`: ID→legacy_id; CampaignID/ReviewID/LinkID legacy
lookups (LinkID here = social_stream → social_account_id); Description (G6); ScheduleDate (G1);
**Status enum('0','1','-1') → `0→scheduled, 1→posted, -1→failed`** (NULL→scheduled);
Processed→processed (G4).

`scheduled_posts_automator` → same name: ID→legacy_id; CampaignID varchar→campaign_ref;
SocialID int→social_account_id (legacy lookup); StyleParams→jsonb;
**Status `0→inactive, 1→active, -1→archived`**; ScheduleDate→scheduled_at.

## 05d — insights

`social_insight` → `social_insights`: straight map (Name, Metric, Value, MetricDate G1);
SocialID→social_account_id legacy lookup (unresolved → skip + warning — insights without an
account are dead data). Respect v2 unique index (profile, account, metric, metric_date): dupes →
keep latest CreateDate.
`keyword_insight` → `keyword_insights`: Keyword (G6), Value, SocialID→social_account_id
(unresolved → NULL, keep row — keywords chart groups by profile).

## Validation
```sql
-- per-table count parity by profile (accounts/posts/media/campaign rows/insights), plus:
SELECT count(*) FROM social_posts WHERE profile_id=:v2id AND status='pending' AND scheduled_at < now(); -- review before enabling social-publish worker: these WOULD fire at cutover; hold via kill switch (PF-16) until human-approved
SELECT count(*) FROM social_accounts WHERE profile_id=:v2id AND authorization_token LIKE 'EAA%';        -- 0 (no plaintext FB tokens)
```
Functional smoke: timeline renders; a grace-state account's posts are hidden; retry button appears
on migrated `failed` posts (BF-044).
