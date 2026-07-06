# Connect (Messaging, Calls & Auto-Responder) — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/connect-messaging.md`](../feature-spec/connect-messaging.md).
> v2 target: module `apps/api/src/modules/messaging` · tables `conversations`, `messages`,
> `keywords`/`keyword_insights`, `call_logs`, `call_settings`, `call_status_history`, `audio`,
> `twilio_verifications` (`@oggvo/db`) · queue `sender` (BullMQ) · build phase 2.
>
> Companion: [activity-diagrams.md](./activity-diagrams.md) · UI mockups
> `connect-inbox.html`, `connect-new.html`, `connect-calls.html`, `connect-preference.html`,
> `connect-keyword.html`, `connect-scheduled.html` in [../design-system/mockups/](../design-system/mockups/).

**Personas**
- **Operator** — authenticated user with the `sms` permission, on a Connect-active profile.
- **Account-Manager** (`AccountType >= OGGVO_ACCOUNT_MANAGER`) — can activate Connect / release the number.
- **Admin** (`OGGVO_ADMIN`) — can raise SMS credit limits.
- **Contact** — an external person texting/calling the profile's Twilio number.
- **System** — API + `sender` worker + Twilio + OpenAI.

**Global rules**
- Gated by `permissions.sms` + an "is Connect active" flag. No `sms` → upgrade-plan modal; has `sms` but
  inactive → activation screen.
- Every read/write is scoped to `profileId` from the token.
- **SMS credits:** each recipient and each attachment costs 1 credit; sends blocked when insufficient;
  decremented on success, refunded on failure. Only Admin raises the limit.
- **Scheduling is per-profile timezone** stored on the message (fix-on-rebuild: v1 maps only 5 tz ids and
  defaults to Pacific — the `sender` queue must resolve the message's actual tz).

---

## Epic M1 — Two-way inbox

### US-M1.1 — Browse conversations
**As an** Operator **I want** a threaded inbox **so that** I can see all customer texts in one place.
- **AC1** `GET /conversations` lists conversations (10/page) with avatar, name/phone, last-message snippet, unread badge; filters: All vs Closed/Archived, platform multi-select, debounced search (300ms).
- **AC2** Unread totals (`total/active/closed`) and the tag list come back with the list.

### US-M1.2 — Read a thread
- **AC1** Selecting a conversation loads `GET /conversations/:id/messages` (20/page) rendering message bubbles (outbound = "Me", inbound = contact), media/file/audio attachments, forwarded-call entries, and date dividers.
- **AC2** Empty state when none selected ("Click on a conversation…"); archived/deleted threads disable compose.
- **Fix-on-rebuild:** v1 serializes the whole thread as a blob and rewrites it on every append (N+1) — v2 stores one row per message.

### US-M1.3 — Send a message
- **AC1** Compose has a textarea, MMS media picker, send button, and a schedule toggle; 160-char awareness.
- **AC2** `POST /messages` (`recipients[]`, `message`, attachments, optional `scheduledAt`/`scheduleTimezone`) sends now or schedules; credits checked first.

### US-M1.4 — Archive / restore
- **AC1** Archive moves a conversation to Closed (`PATCH /conversations/:id {archived:true}`); restore unarchives.

### US-M1.5 — Unsubscribe state
- **AC1** Inbound `STOP` sets the contact unsubscribed (badge shown) and suppresses auto-response; `START` clears it.

---

## Epic M2 — New broadcast message

### US-M2.1 — Pick recipients and compose
**As an** Operator **I want** to text several contacts at once **so that** I can broadcast.
- **AC1** Recipient multi-select from contacts (`GET /contacts?with_phone_number=1`), name search, infinite scroll; checkbox enabled only when the contact has a phone; tags shown (invalid = red).
- **AC2** A selected-count footer + "Unselect All (n)"; "Add New Recipient" → `/contacts/create`.
- **AC3** Compose sends to all selected `recipients[]` (each recipient = 1 credit).

---

## Epic M3 — Scheduled messages

### US-M3.1 — List & manage scheduled messages
- **AC1** `GET /messaging/scheduled` lists scheduled sends (10/page) in a table with multi-select + bulk delete (`POST /messaging/delete` with `messageIds[]`).

### US-M3.2 — Edit a scheduled message
- **AC1** Edit shows read-only recipient name/phone + editable message (160 char), media picker, and a datetime picker; saves text/date/media (`POST /messaging/:id/edit`).

---

## Epic M4 — Keyword auto-responder

### US-M4.1 — Toggle auto-response & timezone
- **AC1** The Preference page shows an SMS usage card (plan/limit/used), a timezone Listbox, and an auto-response Enabled/Disabled Listbox; changing either auto-saves (`POST /messaging/settings`), skipping the save on first hydrate.

### US-M4.2 — Create / edit a keyword responder
**As an** Operator **I want** to auto-reply to inbound keywords **so that** common questions answer themselves.
- **AC1** Fields: name (required), keyword chips (≥1 required, **max 5**, exact-match; `*` = wildcard replies to all), Response textarea (max 160, counter), media picker (max 6), a Response-Timings switch with Start/End time inputs (regex-validated when enabled), and cadence follow-ups (`+N Days`).
- **AC2** Create → `POST /messaging/keywords/create`; edit → `POST /messaging/keywords/update` (prefilled via `GET /messaging/keywords/:id`); edit page adds a QR-code modal.

### US-M4.3 — Reorder keywords
- **AC1** The keywords table supports drag-reorder; reordering auto-saves (`POST /messaging/keywords/reorder`). *(v2 mockup uses the reusable `OggvoShell.sortable` helper.)*

---

## Epic M5 — Line Forwarding (calls)

### US-M5.1 — View call logs
**As an** Operator **I want** a log of forwarded calls **so that** I can follow up on missed calls.
- **AC1** `GET /calls` lists calls (10/page): direction icon, caller (number + name or "Unknown"), **AI-generated Call Topic**, a play button (when audio exists), Status + humanized Duration, and Date.
- **AC2** Filters: debounced search, Status multi-select (`queued/busy/ringing/in-progress/completed/canceled/failed/no-answer`), date range. Empty = "You have no logs".

### US-M5.2 — Configure forwarding, voicemail & recording
- **AC1** A master forwarding switch (`POST /calls/settings/status`) and a settings modal: ForwardTo number, voicemail (active + text/audio), missed-call text, recording (allow + warning message). Saved via `POST /calls/settings`.
- **AC2** Voicemail audio can be TTS-generated (`POST /calls/voicemail/generate`, 6 OpenAI voices).

### US-M5.3 — Review a call
- **AC1** A details modal plays the recording and shows the transcript; the Topic is an OpenAI gpt-4 summary (≤254 chars) of the transcription.

---

## Epic M6 — Number provisioning

### US-M6.1 — Provision a Twilio number
- **AC1** Setup creates a Twilio subaccount (`POST /sms-numbers/setup`); area-code search (`GET /sms-numbers/search?code=`, US→CA fallback); **Save** buys the number, wires SMS + voice webhooks, creates a Messaging Service, stores `MessagingServiceId`, and seeds a tollfree verification row.
- **AC2** Account-Managers can release the number (`DELETE /sms-numbers`, closes the subaccount + resets profile SMS info).

---

## Epic M7 — Modals & gated states (one AC block each)

> Consolidated acceptance criteria per modal / gated screen; **Copy** lines are verbatim v1. Standard
> behaviour for modals: open from the trigger, close on ✕ / Cancel / backdrop / Escape, Confirm fires a
> toast. Mocked as reachable states in the connect mockups (cross-referenced per block).

### US-M7.1 — Archive (chat "delete") modal (`Chat/DeleteModal`)
- **Copy:** title **"Archive Conversation"**, body **"Are you sure you want to archive your conversation with ({name|phone})?"**, buttons **Archive** / **Cancel**.
- **AC1** `PATCH /conversations/:id {archived:true}`; the thread leaves Inbox and appears under **Archived**; restoring (header **Unarchive**) toasts **"Conversation has been restored"**. (Note: the v1 "delete" affordance is actually **archive** — there is no hard delete of a conversation.)
- Mock: `connect-inbox.html` (Archive action).

### US-M7.2 — Schedule message modal (`Chat/ScheduleModal`)
- **Copy:** buttons **Schedule** / **Cancel**; inline validation **"Please select a date"** / **"Please set a time"**; default time `10:00`.
- **AC1** Sending with a future date/time saves an unsent row (`POST /messages` with `schedule`) → appears under **Scheduled Messages** (US-M3); the composer Send button label flips **Send → Schedule** when a schedule is set; future-only.
- Mock: `connect-inbox.html` (clock toggle reveals the date/time row).

### US-M7.3 — Line-forward settings modal (`Calls/SettingsModal`)
- **Copy:** title **"Line Forward Settings"**; switches **Line Forward**, **Allow Recording Forwarded Calls**, **Voicemail** (with **Timeout Delay** `0s/5s/10s/15s/20s`, default 20), **Call Recording Warning** (+ message field), **Missed Call Text Back** (+ message field); buttons **Apply** / **Cancel**.
- **AC1** **Apply** → `POST /calls/settings` (+audio); toast **"Data updated successfully!"**. The header forwarding switch is separate → `POST /calls/settings/status`, toast **"Status updated successfully!"** / error **"Failed to change status!"**.
- **AC2** The voicemail **Generate** (TTS) → `POST /calls/voicemail/generate`, voices `alloy/echo/fable/onyx/nova/shimmer`; toast **"Audio generated successfully!"**; or upload `.mp3` ≤10 MB.
- Mock: `connect-calls.html` (Settings modal; switches + Generate voiceover wired).

### US-M7.4 — Call-details modal (`Calls/DetailsModal`)
- **AC1** Opens from a row's play button: caller (fallback **"Unknown"**), a waveform audio player (`call.Audio`), and the transcript block showing **Call topic** with an **AI-Generated** tag + the transcript; CTA **"Reply via Connect"** → `/connect`. Read-only (no own toasts).
- Mock: `connect-calls.html` (Call-details modal).

### US-M7.5 — Keyword QR-code modal (`ConnectKeywordQrCodeModal`)
- **Copy:** trigger **"Preview QR"**; subheading **"Scan to preview content"** (name fallback **"No Name"**); a **Download** button (`${name}.png`); the keyword badges; field **"Pre-written Message"** (placeholder **"Text to include in the message..."**, limit 160); warning **"Make sure to include keyword(s) in the text"**.
- **AC1** QR payload encodes `SMSTO:${phone}:${message}`; shown only on the **edit** keyword page.
- Mock: `connect-keyword.html` (QR-code modal).

### US-M7.6 — Scheduled-messages delete modal (`ScheduledMessages/DeleteModal`)
- **Copy:** title **"Delete Messages"**, body **"Are you sure you want to delete these messages?"** (plural) / **"...this message?"** (single), recipient badge(s), buttons **Delete** / **Cancel**.
- **AC1** Bulk **Delete all** / per-row delete → `POST /messaging/delete {messageIds[]}`; the bulk bar shows the selected count with **Clear**; toast on success.
- Mock: `connect-scheduled.html` (bulk bar → Delete confirm modal).

### US-M7.7 — Scheduled-message edit (`scheduled/[id]`, full page in v1; modal in v2 mock)
- **Copy:** **Recipient Information** (read-only name + phone), **Message** (textarea, `maxlength 160`, counter `160 − len`, media ≤6), **Schedule date & time** (DateTimePicker), buttons **Cancel** / **Save**.
- **AC1** **Save** → `POST /messaging/:id/edit`; toast **"Message updated successfully"**. (v1 is a dedicated screen; v2 surfaces it as an edit modal — confirm the chosen surface.)
- Mock: `connect-scheduled.html` (row Edit → edit modal).

### US-M7.8 — Feature-request gate (`UpgradePlanModal`)
- **Trigger/guard:** shown when the profile lacks the `sms` feature. **Copy:** title **"Oggvo Connect"**, **"What is included?"**, four blocks — **SMS Scheduler**, **AI Responder**, **QR Code to SMS Generator**, **Chat Widget** (verbatim copy in the mock); CTA **Activate** → after request **"Request Already Sent"** (gated by cookie `connect.activate`).
- **AC1** **Activate** → `POST /requests/activate`; toast **"Request Submitted · Your dedicated manager will reach out to you."**; closing the gate redirects to `/dashboard`. (Despite the file name, there is **no pricing/upsell** — it's a request-to-activate flow.)
- Mock: `connect-gated.html` (State B).

### US-M7.9 — Activate-Connect screen (`Chat/ActivateConnect`)
- **Trigger/guard:** has the `sms` feature but `isConnectActive == false`. **Copy:** heading **"Oops!"** / **"Connect is not activated yet"**; button **"Activate Connect"** — **rendered only when `account_type == 4`**.
- **AC1** **Activate Connect** → `GET /messaging/activate` (sets `isConnectActive`); error toast **"Failed to activate connect, Please try again!"**.
- Mock: `connect-gated.html` (State A).

---

## Cross-cutting acceptance criteria
- **Inbound routing:** the inbound webhook resolves the profile by the `To` number (US numbers only), matches an existing contact by masked phone or marks the actor "Unknown", appends the message, and fires a notification to the profile's users.
- **Auto-responder:** fires only when enabled; keywords matched case-insensitively; the schedule window (`after`/`between` start/end) gates the reply; placeholders `[[recipient_number]]`, `[[profile_name]]`, `[[review_us_url]]` substituted; cadences enqueue `+N Days` follow-ups.
- **Calls/IVR:** inbound TwiML optionally plays a recording warning, dials ForwardTo with caller-id passthrough + timeout; non-completed → voicemail and/or missed-call text; recordings saved to `audio`, transcriptions summarized into `call_logs.Topic`.
- **Fix-on-rebuild:** enable inbound Twilio signature validation; proper UTF-8 (no `utf8_encode` round-trips for emoji); one row per message (no blob rewrite); unify edit-text/edit-media endpoints; reference media via the `media` table, not bare filenames.

## Open questions (from spec)
- **Platform gap:** v2 `message_platform` enum is `connect|sms|whatsapp`, but v1 threads span `facebook/instagram/google/linkedin/twitter` and `create` branches to FB/IG messenger — social DMs have no v2 schema home (extend enum or move to `social`).
- Keyword table shape (`keyword_insights` = store vs analytics?); cadence builder ship in v2 UI?
- `audio.url` storage strategy (S3/CDN); migrate tmp TTS files?
- Stats/goals endpoints — this module or a reporting surface?

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-M1.1 | `GET /conversations` |
| US-M1.2 | `GET /conversations/:id/messages` |
| US-M1.3 | `POST /messages` |
| US-M1.4 | `PATCH /conversations/:id {archived}` |
| US-M2.1 | `GET /contacts?with_phone_number=1`, `POST /messages` |
| US-M3.1 | `GET /messaging/scheduled`, `POST /messaging/delete` |
| US-M3.2 | `POST /messaging/:id/edit` |
| US-M4.1 | `POST /messaging/settings` |
| US-M4.2 | `POST /messaging/keywords/create|update`, `GET /messaging/keywords/:id` |
| US-M4.3 | `POST /messaging/keywords/reorder` |
| US-M5.1 | `GET /calls` |
| US-M5.2 | `POST /calls/settings`, `/calls/settings/status`, `/calls/voicemail/generate` |
| US-M6.1 | `/sms-numbers/{setup,search,save}`, `DELETE /sms-numbers` |
| US-M7.1 | `PATCH /conversations/:id {archived}` |
| US-M7.2 | `POST /messages` (scheduled) |
| US-M7.3 | `POST /calls/settings`, `/calls/settings/status`, `/calls/voicemail/generate` |
| US-M7.4 | `GET /calls/:id` (audio + transcript) |
| US-M7.5 | keyword QR (`SMSTO:` payload) |
| US-M7.6 | `POST /messaging/delete {messageIds[]}` |
| US-M7.7 | `POST /messaging/:id/edit` |
| US-M7.8 | `POST /requests/activate` |
| US-M7.9 | `GET /messaging/activate` |
