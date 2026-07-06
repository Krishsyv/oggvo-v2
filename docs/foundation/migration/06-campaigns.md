# Spec 06 — Campaigns, schedules (recompute!), events

**v1 sources:** `invite_campaign` (+S3 bodies), `invite_scheduler`, `invite_tracker`,
`invite_history`, `invite_funnel_activity` · **v2 targets:** `campaigns`, `campaign_schedules`,
`campaign_events` · **Run:** per profile, after 03 (contacts) and 08 (media, for image_id).

## Prerequisites
- `legacy_id` on campaigns/campaign_schedules/campaign_events (G3).
- Eligibility engine implemented (CAMP epic) — schedules are RECOMPUTED, not row-copied.
- S3 read access to v1 campaign-body bucket (bodies not in MySQL when Unlayered).

## 06a — `invite_campaign` → `campaigns`

| v1 | v2 | transform |
| --- | --- | --- |
| ID | legacy_id | direct |
| Name | name | G7 |
| Delay | delay_days | direct (NULL ok) |
| ScheduledDate | scheduled_date | G1 + **G2: the 1899/2022 template-default dates → NULL** (BF-038 root cause — v1 rows carry them) |
| Sent | sent | G4 |
| Target / Exclude | target / exclude | keep CSV strings verbatim for parity; v2 eligibility parses them (tag names must match spec-03's migrated tag casing — the ETL asserts every referenced tag exists, else warning `CAMPAIGN_TAG_MISSING`) |
| Subject | subject | G6 |
| ReviewUsButtonText | review_us_button_text | direct |
| **Status tinyint** | status enum | **`1→active`, `0→paused`** (v1 semantics: Status gates sending). Draft/archived don't exist in v1 → never produced by ETL. |
| BackgroundColor | background_color | direct |
| ImageID | image_id | media legacy lookup (0→NULL) |
| EmailHTML | email_html | G6. If NULL/empty AND Unlayered → fetch rendered HTML from S3 (`campaign/<v1ProfileID>/<v1ID>/email.html`), else warning `CAMPAIGN_BODY_MISSING` |
| EmailJson | email_json | parse longtext→jsonb; if empty AND Unlayered → S3 `design.json`; unparseable → `{"_raw":...}` + warning (Unlayer re-import tolerates raw) |
| Unlayered int | unlayered | `!=0 → true` |
| SendOnWeekends | send_on_weekends | G4 |
| CampaignType | campaign_type | keep verbatim (`Review/Email`,`SMS`,`Newsletter`,`Birthday`,`Anniversary`,`ThankYou`,`EmailSurvey`,`SmsSurvey`) — v2 `channel` derived: `SMS%/SmsSurvey→sms`, else `email` |
| ProfileID varchar(!) | profile_id | parseInt + legacy lookup (v1 stored it as varchar(11) — trim; non-numeric → skip campaign + warning `CAMPAIGN_BAD_PROFILE`) |
| ClaimedAt | claimed_at | NULL (worker artifact) |
| CreateDate / LastUpdated (timestamp) | created_at / updated_at | G1 |

## 06b — schedules: RECOMPUTE, do not copy (plan §3.5 — read carefully)

1. Run the v2 **eligibility engine** for every migrated `active` campaign → produces candidate
   `campaign_schedules`.
2. Build the **consumed-steps set** from v1: for each (RecipientID, CampaignID) with
   `invite_scheduler.Sent=1` (join `SentDate`) OR a `Sent`-type activity in invite_history via
   tracker → mark that drip step consumed; the recompute must not reschedule it.
3. v1 rows with `Sent=0` (genuinely pending) are cross-checked: candidate set ⊇ pending set is
   expected; **candidates NOT in v1's pending set = the healed blind-spot cohort** — write each to
   the validation report; their `scheduled_date` = next step window (not immediate) and the owner
   is notified (plan §3.5). v1-pending rows NOT in the candidate set (contact now
   suppressed/unsubscribed under v2 rules) → dropped + listed.
4. All new schedule rows carry `legacy_id=NULL` (they're computed, not copied) but the report
   links them to the v1 rows they correspond to.

## 06c — events: unify three v1 tables → `campaign_events`

| v1 source | mapping |
| --- | --- |
| `invite_tracker` | anchor rows: type=`sent` (it's written at send), tracker_id=TrackerID, campaign_id/recipient_id legacy lookups, subject, channel from EmailAddress vs PhoneNumber, occurred_at=CreateDate (G1) |
| `invite_history` | per-activity rows joined via TrackerID: Activity string → enum: `%Open%→opened`, `%Click%→clicked` (`%Clickthrough%` also `clicked` with detail='clickthrough'), `%Bounce%→bounced`, `%Unsubscribe%→unsubscribed`, `%Sent%→sent` (skip if duplicate of tracker anchor), `%Delivered%→delivered`; unmapped → type=`queued`? NO — unmapped → skip + warning `EVENT_UNMAPPED` with the verbatim Activity (v1 used `Activity LIKE` matching — the exact string set is confirmed against InviteHistoryModel before pilot). detail=ActivityDetails. |
| `invite_funnel_activity` | funnel visits/ratings: type=`converted` for review-completed activities, else `clicked` with detail=Activity; recipient via RecipientID; occurred_at=ActivityDate. |

Events are append-only history: **bulk COPY, no upsert**; idempotency via
`ON CONFLICT DO NOTHING` on `(profile_id, legacy_source, legacy_id)` (R0: composite provenance
columns on campaign_events — three sources can't share one legacy_id space).

## Validation
```sql
-- campaign count + per-type distribution parity
SELECT CampaignType, count(*) FROM invite_campaign WHERE ProfileID=:v1id GROUP BY CampaignType;
SELECT campaign_type, count(*) FROM campaigns WHERE profile_id=:v2id GROUP BY campaign_type;
-- consumed-step correctness: nobody rescheduled for an already-sent step
SELECT count(*) FROM campaign_schedules s JOIN migration_consumed c
  ON c.campaign_id=s.campaign_id AND c.recipient_id=s.recipient_id AND s.sent=false; -- 0
-- healed-cohort visibility
SELECT count(*) FROM migration_report_items WHERE profile_id=:v2id AND kind='newly_eligible';
-- events parity (per type, tolerance: EVENT_UNMAPPED count)
SELECT count(*) FROM invite_history h JOIN invite_tracker t ON t.TrackerID=h.TrackerID WHERE t.ProfileID=:v1id;
```
Functional smoke: campaign stats page shows historical opens/clicks for a migrated campaign;
**sender kill switch stays ON until the schedule report is human-approved** (PF-16) — the single
most dangerous moment of the whole migration is enabling sends with a wrong schedule set.
