# Connect — Messaging, Calls & Auto-Responder

> **v2 target:** module `apps/api/src/modules/messaging` · tables `conversations`, `messages`, `keywords`/`keyword_insights`, `call_logs`, `call_settings`, `call_status_history`, `audio`, `twilio_verifications` · queue `sender` (BullMQ) · build phase 2
> **v1 sources:** frontend `apps/portal-frontend/pages/connect/*`, stores `store/connect.js`, `store/connectSchedule.js`, `store/connectDashboard.js`, API `apps/portal-api/app/Controllers/API/V2/{Messaging,Keywords,Calls,SmsNumber}.php`, `Traits/AutoResponder.php`, webhooks `Controllers/Webhook/Twilio.php`, `Controllers/Webhook/Calls/Twilio.php`, models `app/Models/{Messaging,MessagingSettings,Keyword,CallLog,CallSettings,CallStatus,Audio}Model.php`

## 1. Overview
Connect is Oggvo's two-way SMS/MMS messaging hub. A profile provisions a dedicated Twilio number, then sends/receives texts in a threaded inbox, schedules messages for later, and auto-replies to inbound keywords. It also handles call forwarding: inbound calls to the Twilio number are diverted to a real line, recorded, transcribed (OpenAI-summarised "Call Topic"), and can fall through to voicemail or a missed-call text. Access is gated by the `sms` permission flag plus an "is connect active" flag on the user; activation toggling requires Account-Manager level (`AccountType >= OGGVO_ACCOUNT_MANAGER`), and SMS-credit increases require Admin (`OGGVO_ADMIN`). When the user lacks the `sms` permission the page shows an upgrade-plan modal; when they have it but Connect is not active they see an activation screen.

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/connect` | `pages/connect/index.vue` (wrapper) | full-height split | renders `<NuxtPage>` if `isConnectActive`, else `ChatActivateConnect`; upgrade modal if no `sms` permission | authed + `permissions.sms` |
| `/connect` (index child) | `pages/connect/index/index.vue` | split inbox + thread | inbox list (`ChatAside`) + thread (`ChatHeader`/`ChatBody`/`ChatCompose`) + `ContactHistory` drawer | authed + `sms` |
| `/connect/new` | `pages/connect/index/new.vue` | composer | recipient picker + grouped `ChatCompose` | authed + `sms` |
| `/connect/calls` | `pages/connect/calls/index.vue` | table | call logs list, status/date filters, settings modal | authed + `sms` |
| `/connect/preference` | `pages/connect/preference/index.vue` | settings grid | SMS usage, timezone, auto-response toggle, keywords table (drag-reorder) | authed + `isConnectActive` (redirects to `/connect`) |
| `/connect/preference/keywords/create` | `pages/connect/preference/keywords/create.vue` | form | keyword auto-responder create | authed + `sms` |
| `/connect/preference/keywords/[id]` | `pages/connect/preference/keywords/[id].vue` | form | keyword edit + QR modal | authed + `sms` |
| `/connect/scheduled` | `pages/connect/scheduled/index.vue` | table | scheduled messages list (`ScheduledMessagesTable`) | authed + `sms` |
| `/connect/scheduled/[id]` | `pages/connect/scheduled/[id].vue` | form | edit a scheduled message (text/media/date) | authed + `sms` |

## 3. Screen-by-screen

### `/connect` — Inbox + thread
![inbox](_assets/screens/connect/inbox.png)
- **Purpose & layout** — Left `ChatAside` lists conversations; right pane shows the selected thread (`ChatHeader`, `ChatBody`, `ChatCompose`) and an optional `ContactHistory` drawer. Empty state ("Hey there! Click on a conversation…") when none selected.
- **Elements** — Inbox filters: `InboxFilter`/`ConversationFilter`/`SearchFilter`/`Tabs` (all vs closed/archived; platform multi-select `connect, inquiry, facebook, instagram, google, linkedin, twitter`; search box). Each list item shows avatar, recipient name/phone, last-thread snippet, unread badge. Thread body renders message bubbles (`MessageItem`, `Message/*`, `AudioMessage`, `FileMessage`, `AttachmentsPreview`, `MessageCall` for forwarded-call entries, `DateDivider`). `ChatCompose`: textarea, media picker (MMS), send button, schedule toggle (`ChatScheduleModal`), 160-char awareness.
- **States** — empty (no conversation selected / no conversations), loading (`Preloader`, skeletons), error (toast), deleted/archived thread disables compose (`is-deleted`). Inbox is paginated (`pages` from `ceil(total/10)`), thread messages paginate via `page`/`perpage` (default 20).
- **Modals / drawers** — `ChatDeleteModal` (archive), `ChatScheduleModal` (pick schedule date/timezone), `ContactHistory` drawer (recipient profile), `ChatSetupModal` / `ChatActivateConnect` (provisioning/activation).
- **Interactions** — debounced filter watcher (300ms) refetches conversations; selecting a chat fetches messages; polling refresh on send; archive/unarchive; STOP/START unsubscribe state shown via badge.

### `/connect/new` — New message
![new](_assets/screens/connect/new.png)
- **Purpose & layout** — Recipient multi-select from contacts (`GET /recipients?with_phone_number=1`), name filter, infinite scroll (`loadMoreContacts`), then grouped `ChatCompose` for a broadcast send.
- **Elements** — name search input, contact rows (checkbox enabled only if `hasPhone`, avatar, tags as `Badge`; `Invalid` tag = red), "Unselect All (n)", "Add New Recipient" link to `/contacts/create`.
- **States** — loading skeleton (`SkeletonsTableRowContact`), empty list, selected-count footer.
- **Interactions** — toggle selection; compose sends to all selected `recipients[]`.

### `/connect/calls` — Line Forwarding (call logs)
![calls](_assets/screens/connect/calls.png)
- **Purpose & layout** — "Line Forwarding" page: master switch (`CallsForwardingSwitch`), settings modal (`CallsSettingsModal`), refresh, and a paginated call-log table.
- **Elements / columns** — call-direction icon (`CallsCallIcon` by status), Caller (number + `CallerName ?? Unknown`), "Call Topic (AI Generated)", play button (opens `CallsDetailsModal`, only if `call.Audio`), Status + humanized Duration, Date (two lines). Filters: search box (debounced 300ms), Status multi-select (`queued, busy, ringing, in-progress, completed, canceled, failed, no-answer`), `DateRangePicker`.
- **States** — loading skeleton rows, empty ("You have no logs"), paginated (`paginationPageNumbers`).
- **Modals** — `CallsSettingsModal` (forwarding/voicemail/IVR config — see §5), `CallsDetailsModal` (playback + transcript), `CallsVoicemail` (audio generation).

### `/connect/preference` — Connect Preference
![preference](_assets/screens/connect/preference.png)
- **Purpose & layout** — SMS usage card (`SMSUsageCard`: plan, limit, used), timezone Listbox, auto-response Enabled/Disabled Listbox, and a `ConnectKeywordsTable` with drag-reorder. Header shows current SMS number with copy button + `ChatSMSDeleteModal`, or `ChatSetupModal` if `shouldSetupSMS`.
- **Elements** — timezone options are hardcoded 5 zones `{id:5 Pacific, 9 Mountain, 15 Eastern, 11 Central, 30 GMT/UTC}`; auto-response `{1 Enabled, 2 Disabled}`. Changing either auto-saves via `POST /messaging/settings` (FormData `schedule_timezone`, optional `enable_auto_response=on`). Keywords table rows have a `.reorder` handle (vueuse `useSortable`), reorder auto-saves via `POST /messaging/keywords/reorder`.
- **States** — first-load guard (skip auto-save on hydrate), loading skeleton, redirect to `/connect` if not `isConnectActive`.

### `/connect/preference/keywords/create` & `/[id]` — Keyword auto-responder
![keyword-edit](_assets/screens/connect/keyword-edit.png)
- **Purpose & layout** — contenteditable title/description, keyword chips (max 5, exact-match note), Response textarea (max 160 chars, char counter), media picker (max 6, `MediaPicker source="Connect"`), Response Timings switch with Start/End time inputs, and a (commented-out) cadence builder. Edit page adds `ConnectKeywordQrCodeModal`.
- **Elements / validation** — name required, ≥1 keyword required, response required; start/end time regex `^\d{2}:\d{2}( [ap]m)?$` when timing enabled; media filenames regex `^\S+.\S{3}$`; cadence periods limited to `1/2/3/7/14/30/40 Days` with message ≥5 chars.
- **Interactions** — Enter adds a keyword chip; click/dblclick removes; submit POSTs `/messaging/keywords/create` (create) or `/messaging/keywords/update` (edit). On `[id]`, prefilled via `GET /messaging/keywords/{id}`.

### `/connect/scheduled` & `/[id]` — Scheduled messages
![scheduled](_assets/screens/connect/scheduled.png)
- **Purpose & layout** — list page header + `ScheduledMessagesTable` (`ScheduledMessages/Table.vue`, `DeleteModal.vue`); "Add New" → `/connect/new`. Edit page: read-only recipient name/phone, editable message textarea (160 char), media picker, `DateTimePicker` (`DD MMMM YYYY - hh:mm A`).
- **Interactions** — table multi-select + bulk delete (`POST /messaging/delete` with `messageIds[]`); edit submits `POST /messaging/{id}/edit` (FormData `edit_message`, `schedule_date` reformatted to `DD-MM-YYYY hh:mm A`, `media[]`). Preview load via `GET /messaging/preview?previewID=`.

## 4. Data & API
All under `/api/v2`, `apiAuth` filter, `profile_id` from token.

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/messaging/index` | settings + phone + keywords; auto-creates settings row & wires Twilio sms webhook if missing | — | `{phone, settings:{smsLimit,timeZone,auto_response,keywords[]}}` | `Messaging::index` |
| GET | `/messaging/recipients` | inbox conversation list | `inbox, closed, page, search, platforms[]` | `{pages, unread:{total,active,closed}, tags, conversations[]}` | `Messaging::recipients` |
| GET | `/messaging/conversation` | one thread (paginated) | `id, page, perpage` | `{meta, recipient, scheduledCount, conversation[]}` | `Messaging::conversation` |
| POST | `/messaging/create` | send (or schedule) SMS/MMS, or FB/IG message | `recipients[], message, uploaded[], conversation, schedule_messages, schedule_date, schedule_timezone, ProfileID` | `{message, conversation_id, recipient:{name,phone}}` or `{messages[]}` | `Messaging::create` |
| DELETE | `/messaging/archive/{id}` | archive conversation | path id | updated msg | `Messaging::archive` |
| POST | `/messaging/{id}/unarchive` | restore conversation | path id | updated msg | `Messaging::unarchive` |
| POST | `/messaging/settings` | save timezone + auto-response toggle | `schedule_timezone, enable_auto_response` | updated msg | `Messaging::settings` |
| GET | `/messaging/activate` | activate Connect for profile | — | updated | `Messaging::activate` (AccountManager+) |
| POST | `/messaging/increase` | bump SMS credit limit | `limit` | updated | `Messaging::increase` (Admin only) |
| POST | `/messaging/recipient` | attach recipient to a conversation | `RecipientID, ConversationID` | `{recipient_id, recipient_name}` | `Messaging::recipient` |
| GET | `/messaging/scheduled` | list scheduled messages | `page` | `{meta:{total,pages}, data[]}` | `Messaging::scheduled` |
| GET | `/messaging/{id}/scheduled` | scheduled messages for a recipient | path id | `{messages[]}` | `Messaging::scheduledMessages` |
| GET | `/messaging/preview` | one scheduled message detail | `previewID` | `{data:{recipient_name,recipient_phone,payload,schedule_time}}` | `Messaging::preview` |
| POST | `/messaging/{id}/edit` | edit scheduled message text/date | `edit_message, schedule_date, media[]` | updated | `Messaging::edittext` |
| POST | `/messaging/editupload` | edit scheduled message media (files) | `messageId, files` | updated | `Messaging::editupload` |
| POST | `/messaging/delete` | bulk-delete scheduled messages | `messageIds[]` | deleted | `Messaging::delete` |
| GET | `/messaging/fetch` | raw Twilio message list (last 20) | — | `[twilioMessage]` | `Messaging::fetch` |
| GET | `/messaging/insights` (`/messaging/insights/goals`) | stats / monthly target | `range`, `date` | stats | `Messaging::stats`, `::goals` |
| GET | `/messaging/keywords/{id}` | get keyword | path id | `{phone, keyword}` | `Keywords::show` |
| POST | `/messaging/keywords/create` | create keyword | `name, description, response, keywords[], respond_timing_enabled, start_time, end_time, media[], cadences[]` | created | `Keywords::create` |
| POST | `/messaging/keywords/update` | update keyword | same + `id` | updated | `Keywords::update` |
| DELETE | `/messaging/keywords/{id}` | delete keyword | path id | deleted | `Keywords::delete` |
| POST | `/messaging/keywords/` | bulk delete keywords | `[ids]` | deleted | `Keywords::delete_multiple` |
| POST | `/messaging/keywords/reorder` | reorder/save all keywords | `keywords[]` | updated | `Keywords::reorder` |
| GET | `/calls` | call logs | `page, search, status[], dates[]` | `{data[], pages, ...}` | `Calls::index` |
| GET | `/calls/{id}` | one call | path id | call object | `Calls::getCall` |
| GET | `/calls/settings` | call settings | — | settings object | `Calls::settings` |
| POST | `/calls/settings` | save call settings (+audio upload) | `Enabled, ForwardTo, VoiceMail, VoiceMailActive, VoiceMailText, MissedCallTextActive, MissedCallText, Audio, AllowRecording, RecordingWarningActive, RecordingWarningMessage` | msg | `Calls::save` |
| POST | `/calls/settings/status` | toggle forwarding | `Enabled (0/1)` | msg | `Calls::status` |
| POST | `/calls/voicemail/generate` | TTS voicemail audio (OpenAI) | `text, voice (alloy/echo/fable/onyx/nova/shimmer)` | `{audio:filename}` | `Calls::generate` |
| DELETE | `/sms-numbers` | release Twilio number (close subaccount) | — | deleted | `SmsNumber::delete` (AccountManager+) |
| POST | `/sms-numbers/setup` | create Twilio subaccount | — | msg | `SmsNumber::setup` |
| GET | `/sms-numbers/search` | search available numbers (US→CA fallback) | `code` (3-digit area code) | `[{Number,Name}]` | `SmsNumber::search` |
| POST | `/sms-numbers/save` | buy + provision number, create messaging service, seed tollfree verification | `phone` (`+1XXXXXXXXXX`) | updated | `SmsNumber::save` |

**Webhooks (no auth filter):**
- `POST /webhook/twilio/trigger` → `Webhook\Twilio::trigger` — inbound SMS/MMS routing.
- `POST /webhook/twilio/{num}/inbound`, `/{num}/fallback`, `/{num}/status` — tollfree inbound/fallback/status.
- `POST /webhook/twilio/tollfree/status` — tollfree verification status.
- `POST /webhook/calls/twilio/{num}/answer` → TwiML for inbound call.
- `POST /webhook/calls/twilio/status` — dial result → voicemail/missed-call text.
- `POST /webhook/calls/twilio/voicemail` — voicemail recording finished.
- `POST /webhook/calls/twilio/recordings` — recording status → save audio.
- `POST /webhook/calls/twilio/transcriptions` — transcription → OpenAI gpt-4 summary into `Topic`.

- **v1 models / tables:** `messaging`, `messaging_settings` (keywords live in JSON `autoResponseDetails`, no keyword table), `call_logs`, `call_settings`, `call_status`, `audio`, `twilio_verifications`; `profile` holds `SMSNumber/SMSNumberSID/SMSNumberToken/MessagingServiceId`.
- **Pagination/filtering:** conversations 10/page; thread 20/page; calls 10/page; scheduled 10/page. Search is `LIKE`; date filters `Y-m-d`; status filtered against an allowed list.

## 5. Business rules
- **Threads as serialized blobs (v1):** the entire conversation is `serialize()`d in `messaging.conversation` keyed by unix timestamp; each entry `{actor, message, mediaUrl[], mediaTypes[], type, call_id}`. Outbound `actor='Me'`; inbound `actor=recipientFullName`; call entries `type='call'`.
- **SMS credits:** every recipient + every attachment costs 1 credit (`checkProfileCredits`); send is blocked if insufficient. Credits decremented on success, refunded on failure. Default new-profile limit 200. Only Admin can raise the limit.
- **Scheduling timezone (BUG):** v1 maps only 5 ids `{5→America/Los_Angeles, 9→America/Denver, 11→America/Chicago, 15→America/New_York, 30→UTC}` in both `AutoResponder` trait and `Webhook\Twilio`. Scheduled-message processing assumes these; anything else silently mishandled and defaults toward Pacific. **v2 must store the message's actual timezone and have the `sender` queue resolve per-profile tz.**
- **Auto-responder:** runs only if `messaging_settings.autoResponse` is on. Keywords matched case-insensitively; `"*"` wildcard replies to all inbound. Schedule window (`type: after|between`, start/end) gates whether the reply fires. Placeholders `[[recipient_number]]`, `[[profile_name]]`, `[[review_us_url]]` are substituted. Cadences enqueue follow-up scheduled messages at `+N Days`.
- **Inbound STOP/START:** `STOP` sets `IsUnsubscribed=1`, `START` sets it back to 0; the inbound message is appended and a notification fired; no auto-response on those.
- **Inbound routing:** `TollfreeInboundResolver::resolveProfileForIncomingNumber(To)` finds the profile; only US numbers accepted (10-digit, or `+1`/`1`-prefixed normalized); existing recipient matched by masked phone pattern; otherwise actor = `Unknown`. Each inbound fires a `send_notification` event to the profile's users.
- **Calls / IVR:** `answer` builds TwiML — if `VoiceMailActive && Timeout==0` go straight to voicemail; else optional recording warning (`Polly.Joanna`), then `dial(ForwardTo)` with caller-id passthrough, timeout, `record-from-ringing`, status + recording callbacks. On non-completed dial → record voicemail (plays stored audio then records, transcribe=true) and/or send `MissedCallText`. Recordings saved to `audio`; transcriptions summarized by OpenAI gpt-4 (≤254 chars) into `call_logs.Topic`.
- **Voicemail generation:** OpenAI TTS `tts-1` produces an mp3 into `audio/tmp`, finalized on settings save; old voicemail audio is deleted. Audio upload accepts `audio/mpeg|mp3` only; filename regex enforced.
- **Number provisioning:** `setup` creates a Twilio subaccount (idempotent); `save` buys a number, wires sms webhook (`/webhook/twilio/trigger`) + voice webhook (`/webhook/calls/twilio/{pid}/answer`), creates a Messaging Service with `useInboundWebhookOnNumber`, stores `MessagingServiceId`, and seeds a `twilio_verifications` row (Status 0, Step 1.1). `delete` closes the subaccount and resets profile SMS info (AccountManager+).
- **Send via MessagingService:** if `profile.MessagingServiceId` set, sends include `messagingServiceSid`.

## 6. Integrations
- **Twilio** — subaccount provisioning, number search/purchase, Messaging Service, outbound SMS/MMS (`TwilioSmsTransport`, `TollfreeSenderResolver`), inbound SMS webhooks, voice TwiML (forwarding, recording, voicemail), recording/transcription callbacks, request signature validation (`RequestValidator`, currently commented out in inbound trigger), A2P/tollfree verification (`twilio_verifications`).
- **OpenAI** — TTS (`tts-1`, 6 voices) for voicemail greetings; `gpt-4` chat for transcription summarization into the call "Topic".
- **Facebook / Instagram** — `Messaging::create` routes to `sendFBMessage` for `platform in (facebook, instagram)`; uses `SocialModel.AuthorizationToken` and the messenger helper. (Conversations also span `inquiry, google, linkedin, twitter` as filter platforms.)
- **FCM / notifications** — inbound messages/calls fire `send_notification` events to the profile's users.

## 7. v1 → v2 mapping
- **Module:** `apps/api/src/modules/messaging` (controller/service/repository/DTO); call/voicemail likely a `calls` sub-feature or sibling module sharing the `audio` table.
- **Drizzle tables:** `conversations` (header) + `messages` (one row per message, replacing the serialized blob; `direction` inbound/outbound, `attachments` jsonb, `status`, `scheduledAt`/`scheduleTimezone`, `providerMessageId`); `call_logs`, `call_settings` (PK = profileId), `call_status_history`, `audio` (`url`, `source` call/voicemail), `twilio_verifications`. **Keywords** need their own table (spec'd `keywords`/`keyword_insights`) instead of the v1 JSON blob — fields: name, description, words[], response, media[], schedule {type,start,end}, cadences[], order/position, updated_at.
- **Queue:** `sender` (BullMQ, `apps/workers/src/processors/sender.processor.ts`) for scheduled + cadence delivery; **must honour `messages.scheduleTimezone` / per-profile tz** rather than the v1 hardcoded 5-zone map.
- **Frontend:** v2 routes under `apps/web/app/(portal)/connect/*` (inbox, new, calls, preference, keywords/[id], scheduled/[id]); reuse `@oggvo/ui` table/badge/modal/listbox/date-picker/media-picker components.
- **Endpoint mapping (examples):** `GET /messaging/recipients` → `GET /conversations`; `GET /messaging/conversation` → `GET /conversations/:id/messages`; `POST /messaging/create` → `POST /messages` (with `scheduledAt`); `DELETE /messaging/archive/{id}` → `PATCH /conversations/:id {archived:true}`; keyword endpoints → REST `/keywords`; `/calls*` → `/calls`, `/call-settings`, `/calls/:id`; `/sms-numbers/*` → `/sms-numbers`. All typed via OpenAPI.
- **Known v1 bugs to fix:** (1) hardcoded Pacific/5-zone scheduling timezone; (2) inbound Twilio signature validation commented out (should be enabled); (3) `utf8_encode`/`mb_convert_encoding` round-trips for emoji — use proper UTF-8; (4) N+1 / full-blob rewrite on every message append; (5) credit refund logic uses inconsistent increments (`$CurrentUserCredits++` vs `+= $creditCount`); (6) `editupload`/`edittext` split across two endpoints — unify; (7) media stored as bare filenames assembled into URLs — use `media` table references.

## 8. Open questions / parity risks
- **Platform coverage gap:** v2 `message_platform` enum is `connect | sms | whatsapp`, but v1 conversations/recipients filter across `connect, inquiry, facebook, instagram, google, linkedin, twitter` and `Messaging::create` branches to Facebook/Instagram messenger. Social-DM threads have no obvious v2 schema home — flag as schema gap (either extend the enum or move social DMs to the `social` module).
- **Keyword table shape undefined:** confirm whether `keyword_insights` is the keyword-autoresponder store or a separate analytics table; the autoresponder needs schedule + cadences + media + ordered position.
- **Cadence builder** is commented out in current v1 UI but the backend (`scheduleCadenceMessages`) and validation are live — decide whether v2 ships cadences in the UI.
- **Data migration:** deserializing `messaging.conversation` blobs into `messages` rows (timestamp keys, mixed entry shapes incl. `type=call`, `mediaUrl`/`mediaTypes`); migrating `autoResponseDetails` JSON keywords into the keywords table; mapping numeric `timeZone` ids (5/9/11/15/30) to IANA strings.
- **`audio.url` vs filename:** v1 stores bare filenames under `assets/media/uploads/audio`; v2 `audio.url` — confirm storage strategy (S3/CDN) and whether tmp-generated TTS files migrate.
- **Signature validation / abuse:** enabling Twilio signature validation on inbound may require storing the subaccount auth token per profile (currently `SMSNumberToken`).
- **Stats/goals endpoints** (`Messaging::stats`, `::goals`, `connectDashboard.js`) belong to a dashboard surface — confirm whether they live in this module or a reporting one.
