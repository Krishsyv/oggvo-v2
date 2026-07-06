# Spec 07 — Messaging: conversation blobs → rows, settings, calls

**v1 sources:** `messaging` (blob), `messaging_settings`, `keyword_insight` (NOTE: v1 has **no
`keyword` table** — auto-responder keywords live inside `messaging_settings.autoResponseDetails`
JSON, confirmed by extraction), call tables if present in dump (`audio`, call logs — v1 names
verified at implementation), `notification` (review-alert emails → spec-10).
**v2 targets:** `conversations`, `messages`, `profile_messaging_settings` (merge), `audio`,
`call_settings`, `call_logs`, `call_status_history`, `suppressions` (STOP derivation).
**Run:** per profile, after 02/03.

## Prerequisites
- `legacy_id` on conversations/messages/audio/call_logs (G3).
- **Enum extension (R0, from the domain map):** `message_platform` must add `facebook | instagram | inquiry` (current v2: `connect|sms|whatsapp`). v1 Platform values observed: `connect` (default), `inquiry`, `facebook`, `instagram`, plus possibly `google/linkedin/twitter` — unmapped → `connect` + warning `CONV_UNKNOWN_PLATFORM` (G5).

## 07a — `messaging` → `conversations` + `messages`

Conversation row (1:1 with v1 row):

| v1 | v2 | transform |
| --- | --- | --- |
| ID | legacy_id | direct |
| ProfileID / recipientID | profile_id / recipient_id | legacy lookups (recipient 0→NULL) |
| recipientPhone | recipient_phone | E.164 normalize (raw kept on failure + warning) |
| recipientFullName | recipient_full_name | G6/G7 |
| Platform | platform | enum map above |
| LastThread | last_thread_at | G1 |
| UnreadMessages | unread_count | NULL→0 |
| IsArchived / IsUnsubscribed (int) | is_archived / is_unsubscribed | `!=0 → true` |
| conversation (longtext) | → messages rows + `legacy_blob` | see below; raw blob retained 12 months (plan §3.8) in R0 column `conversations.legacy_blob` |

**Blob parsing → `messages`:** v1 stores a serialized array of message objects (shape varies by
era — JSON array; entries with keys like `message/body`, `direction/type` (`sent`/`received` or
`in`/`out`), `date/time/timestamp`, optional `media/attachment`). Parser rules:
1. `json_decode`; on failure try PHP-serialized decode; on failure → conversation migrates with
   ZERO messages + `legacy_blob` + warning `CONV_BLOB_UNPARSEABLE` (support can read raw).
2. Per entry: direction map `sent|out|outbound→outbound`, `received|in|inbound→inbound`, missing →
   infer: entries authored by profile number → outbound; else inbound + warning.
3. body → G6 repair (this is where the emoji damage lives); timestamps → G1 (blob times are
   Pacific wall-clock like everything else); missing timestamp → interpolate between neighbors +
   warning `MSG_TIME_INTERPOLATED` (order preserved by array index).
4. attachments → `attachments` jsonb `[{url}]` with media re-key attempt (spec-08); unresolved
   URLs kept verbatim.
5. status: all historical → `delivered` (v1 kept no per-message status); scheduled pending rows
   (IsScheduled=1, ScheduleStatus=0) → ONE extra `messages` row status=`scheduled`,
   scheduled_at=ScheduleDate (G1 — but see timezone note), schedule_timezone=ScheduleTimeZone,
   body/attachments from ScheduleAttachment. **These fire after cutover — held by the sender kill
   switch until the schedule report is approved (same gate as spec-06).**
   Timezone note: ScheduleDate was entered under ScheduleTimeZone semantics — convert using THAT
   zone (legacy numeric ids: 5=LA, 9=Denver/Phoenix, 11=Chicago, 15=NY, 30=UTC), not the G1 default.

**STOP derivation:** conversations with IsUnsubscribed=1, or whose parsed inbound messages match
`^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$` (case/whitespace-insensitive) → insert
`suppressions(profile_id, channel:'sms', address: recipient_phone, reason:'stop_migrated')`
(PF-17). The count is a headline number in the validation report.

## 07b — `messaging_settings` → merge into `profile_messaging_settings`

Same row spec-02 created (upsert by profile_id): autoResponse→auto_response (`!=0`),
autoResponseDetails→auto_response_details (keep raw text; v2 keyword feature parses it — contains
keyword definitions incl. chips/response/media/timing), smsLimit→sms_limit (also entitlement
`sms_credits_month`, spec-02), timeZone (legacy numeric) → informs nothing (profile tz wins —
PF-3) but recorded in warnings if ≠ profile tz meaning (`MSG_TZ_MISMATCH`), active→active.

## 07c — calls & audio
v1 call/audio tables were not in the extraction target list; before pilot, run the same
extraction for `audio`, `call_log`/`calls`, `call_settings`-equivalents and fill this section
(marked `TODO(v1-schema)` — the v2 targets and enum maps are ready: call_status/call_type enums,
recordings re-keyed via spec-08, transcripts G6). Recording retention: apply PF-18 window from
migration day (old recordings past window are NOT copied — listed in report instead).

## Validation
```sql
SELECT count(*) FROM messaging WHERE ProfileID=:v1id;                                  -- v1 threads
SELECT count(*) FROM conversations WHERE profile_id=:v2id AND legacy_id IS NOT NULL;   -- equal
-- message extraction accounting: parsed + unparseable = total
SELECT count(*) FROM migration_warnings WHERE entity='conversations' AND code='CONV_BLOB_UNPARSEABLE' AND profile_id=:v2id;
-- STOP suppression headline
SELECT count(*) FROM suppressions WHERE profile_id=:v2id AND reason='stop_migrated';
-- no scheduled sends armed pre-approval
SELECT count(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id
 WHERE c.profile_id=:v2id AND m.status='scheduled' AND m.scheduled_at < now();          -- reviewed, not 0-asserted
```
Functional smoke: open a migrated thread → history renders in order with correct bubbles
(in/out), emoji legible; unread badges match; a STOP-ed contact cannot be messaged (gateway
refuses, PF-17).
