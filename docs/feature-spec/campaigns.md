# Campaigns

> **v2 target:** module `apps/api/src/modules/campaigns` · tables `campaigns`, `campaign_schedules`, `campaign_events`, `campaign_presets` (`@oggvo/db`) · queues `sender` / `newsletter` / `email-send` (BullMQ) · build phase `2`
> **v1 sources:** frontend `apps/portal-frontend/pages/campaigns/{index,templates}.vue`, `pages/campaigns/editor/[id].vue`, components `components/Campaign/*`; stores `store/{campaigns,campaignsDashboard,campaignPosts}.js`; API `apps/portal-api/app/Controllers/API/V2/{Campaigns,CampaignTemplates,Presets}.php`; models `app/Models/{CampaignModel,ScheduleModel,PresetModel}.php`; views `app/Views/campaign_templates/*`, `app/Views/email/invitation.php`; delivery `lambdas/{sender-bot,newsletter-bot,send-email}`, `bots/{sender,newsletter}` (Go)

## 1. Overview
Campaigns is the outbound marketing engine of the portal. A profile owner creates email or SMS messages that invite their customers to leave reviews, plus automated lifecycle messages (birthday, anniversary, thank-you) and scheduled one-off newsletters. Each campaign is composed in a drag-and-drop email editor (Unlayer / `@elmehdi/oggvo-vue-email-editor`) or a plain-text SMS composer, optionally seeded from a template library. Campaigns target/exclude recipient tags, honour a per-campaign delay (drip), can be paused/activated, and emit tracked sends (opens, clicks, unsubscribes) that roll up into per-campaign and dashboard stats. Delivery is **always asynchronous** — the portal only writes campaign + schedule rows and stores HTML/JSON in S3; Go worker bots (and SendGrid/Twilio) actually fan out the messages on a schedule. Access is gated to authenticated profile users; SMS requires a provisioned Twilio number; admins (`AccountType >= OGGVO_ADMIN`) can view any campaign and manage the shared template library.

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/campaigns` | `pages/campaigns/index.vue` | default | Type tabs: **Review (Email)**, **SMS**, **Newsletter**, **Birthday**, **Anniversary**, **ThankYou** | authed; SMS tab implies SMS-enabled profile |
| `/campaigns/templates` | `pages/campaigns/templates.vue` | default | same 6 type tabs; opened via `?type=` query | authed |
| `/campaigns/editor/:id` | `pages/campaigns/editor/[id].vue` | default | — (editor surface differs per type: Unlayer canvas vs SMS textarea) | authed + campaign ownership; admins may open any |

The campaign **Settings** and **Create** flows are modals launched from `/campaigns` and `/campaigns/templates`, not separate routes. There is also a campaigns **dashboard/stats** view fed by `store/campaignsDashboard.js` (newsletter + anniversary charts).

## 3. Screen-by-screen

### `/campaigns` — Campaign list
![index](_assets/screens/campaigns/index.png) <!-- placeholder until captured -->
- **Purpose & layout** — Lists campaigns of the currently selected type with live per-row stats. Header shows the profile name, a **Campaign Settings** modal trigger, and a **Create New Campaign** button that routes to `/campaigns/templates?type=<currentType>`. A `LazyTwilio` banner sits above (SMS onboarding prompt). A `TutorialsRoutePrompts` helper appears under the header.
- **Type tabs (`TabBar`)** — `Review→Email`, `SMS`, `Newsletter`, `Birthday`, `Anniversary`, `ThankYou`. Switching tab resets the status filter and refetches.
- **Filters row** — debounced **Search** text input (matches `Name`/`Subject`, sent as `query`); a **Status** filter component (`components/Filters/Status.vue`) sending `Status[]`. Status semantics: `0 = Paused`, `1 = Active`, `2 = Inactive`.
- **Table columns** — Name + Subject (links to editor); **Subscribed** (`stats.subscribers`); **Sent** (`stats.sent`); **Opens** (`stats.opens`); **Clicks** (`stats.clicks`); **Status badge**; an **info tooltip** (schedule date / "Immediately|Next Day|In N Days", Send-on-weekends, Exclude tags, Target tags); a per-row **actions dropdown**.
- **Status badge rules** — `Status==0` → yellow "Paused". For non-Email/SMS types: `Status==1 && Inactive` → red "Inactive"; `Status==1 && !Inactive` → green "Active". Email/SMS with `Status==1` → green "Active" (these recurring types are never "Inactive").
- **Per-row stats** — fetched lazily one request per row via `GET /campaigns/:id/stats` after the list loads (per-row skeletons while pending). This is an N+1 fan-out (see parity risks).
- **States** — loading skeleton rows (5); empty state ("No campaigns" + Add campaign CTA); per-row stat skeletons; error toasts via `$notify`.
- **Actions dropdown** — (non-Email/SMS only) **Activate/Pause** toggle: activating an expired/unscheduled non-recurring campaign opens the **Campaign Schedule** modal (future-only `DateTimePicker`, Activate disabled until a future date is chosen). All types: **Send a test** (opens `CampaignSendTestModal`), **Edit** (→ editor), **Delete** (opens `CampaignDeleteModal`).
- **Modals** — **CampaignSettingsModal** (header), **CampaignDeleteModal** (confirm + `DELETE /campaigns/:id`), **CampaignSendTestModal**, inline **Campaign Schedule** modal in the dropdown.

### `/campaigns` modals

#### CampaignSettingsModal (`components/Campaign/SettingsModal.vue`)
- **settings tab** — Email: **From Name** (`FromName`, optional → default), **Reply To** (`ReplyTo`, email, optional → default). SMS: if profile has an SMS account, shows the **SMS Number** (`Phone`); "Delete SMS Account" button visible to `account_type >= 2` (ACCOUNT_MANAGER) → confirm tab. If no SMS account: "Setup SMS Account" → `POST /sms-numbers/setup`.
- **setup tab** — **Area code** search (`GET /sms-numbers/search?code=`), select a number, **Save Number** (`POST /sms-numbers/save?phone=`).
- **delete tab** — confirm deletion (`DELETE /sms-numbers`), then refetches the user and redirects to `/campaigns?type=Email`.
- Loads via `GET /campaigns/settings`; saves email settings via `POST /campaigns/settings`. (SMS number endpoints live in the SMS-numbers domain, not the campaigns group.)

#### CampaignSendTestModal (`components/Campaign/SendTestModal.vue`)
- Trigger: per-row dropdown or editor "Send a test". Fields: `EmailAddress` (Email types) **or** `Phone` (SMS), plus `FirstName`, `LastName` (all required). Submits `POST /campaigns/test` with a reCAPTCHA `token`. SMS tests may be rerouted to a sandbox phone (`sms.testSandboxPhone`).

#### CampaignDeleteModal (`components/Campaign/DeleteModal.vue`)
- Confirm modal; `DELETE /campaigns/:id`; refetches list. (NOTE: it posts `campaign.value` which is the whole campaign object set via `handleDelete(campaign.ID)` — id is passed in v1.)

### `/campaigns/templates` — Select template
![templates](_assets/screens/campaigns/templates.png) <!-- placeholder until captured -->
- **Purpose & layout** — Gallery of pre-built templates grouped by **category** (collapsible `Disclosure` sections), filtered by type tab and search; plus a **Blank** card to start from scratch.
- **Elements** — type `TabBar` (same 6 types); debounced **Search** (500 ms, sent as `search`); a **Category** multi-select popover (checkboxes built from response keys). Each template card shows a thumbnail (or "No Image" placeholder), a name badge, and a **Preview** eye button (opens `ManageNewsletterTemplatesPreviewModal`) when an image exists. The Blank card uses `/images/add.png`.
- **Data** — `GET /campaigns/templates?type=<type>&search=<q>` returns categories keyed by category name → array of templates (`ID, Name, Subject, Image, Thumbnail, ...`).
- **States** — 4 pulse skeleton cards while pending; categories render as accordions (default open).
- **Modals** — **CampaignCreateModal** (`ref=statusDialogRef`) opened by clicking a card or Blank, passing `(template, type)`.

#### CampaignCreateModal (`components/Campaign/CreateModal.vue`)
- Fields: **Name** (required, prefilled from template), **Subject** (required, prefilled), hidden `template` (template ID, optional) and `type`. **Continue** → `POST /campaigns` → redirects to `/campaigns/editor/:id`. Validation errors surface inline.

### `/campaigns/editor/:id` — Campaign editor
![editor](_assets/screens/campaigns/editor.png) <!-- placeholder until captured -->
- **Purpose & layout** — Edit one campaign. The **Name** and **Subject** are editable inline in the page header (`contenteditable`, Enter saves). Header actions: **CampaignOptionsModal** trigger, a **Schedule** `DateTimePicker` (Newsletter only), **Send a test**, and **Save**.
- **Email / Newsletter / Birthday / Anniversary / ThankYou body** — Unlayer email editor (`components/Campaign/editor.vue` → `EmailEditor`, `projectId: 138792`). Loads `EmailJson` design from S3; provides merge tags (see business rules) and a `userUploads` image provider wired to `media/*` endpoints. On save it exports HTML, injects a footer table with placeholders (`[[thank_you_line]]`, `[[unsubscribe_line]]`, `[[affiliate_line]]`, `[[powered_by_line]]`, `[[tracker_line]]`), stamps `ReviewUsButtonText` into the design body values, and `PUT /campaigns/:id` with `{EmailHTML, EmailJson, Unlayered:1, Name, Subject, ReviewUsButtonText, ScheduledDate}`.
- **SMS body** — plain `<textarea>` (`EmailHTML`), 1600-char counter (segmented over 160), an **Add placeholder** menu (`[[first_name]]`, `[[last_name]]`, `[[profile_name]]`, `[[profile_url]]`, `[[profile_short_url]]`), and an image upload/preview (MediaPicker, `ImageID`). Save → `PUT /campaigns/:id` with `{EmailHTML, Name, Subject, ImageID}`.
- **Review-button text** — a "Review button text" field appears only when the design uses the `[[review_us_button]]` / `{{review_us_button}}` merge tag; kept live via the editor's `has-review-button` event. Max 40 chars, default "Review Us Now".
- **States** — `pending` while fetching `GET campaigns/show/:id`; on 404/error it redirects to `/campaigns` with a toast. `saving` disables Save.
- **Modals** — **CampaignOptionsModal**, **CampaignSendTestModal**, **MediaPicker** (image picker, `source=Campaign`).

#### CampaignOptionsModal (`components/Campaign/OptionsModal.vue`)
- **Status** switch (Active/Paused). Toggling from Paused→Active opens the inline **Campaign Schedule** modal (future-only picker).
- **Review button text** (Email + when `[[review_us_button]]` present): `ReviewUsButtonText`, max 40.
- **Email/SMS only:** **Send on weekends** switch (`SendOnWeekends`); **Delay** listbox (`0`=Immediately, `1`=Next Day, then `2,3,4,5,6,7,14,28,30,45,60,90` days); **Exclude Tags** combobox (multi).
- **All except ThankYou:** **Target Tags** combobox (multi). Tag options from `GET /campaigns/tags`.
- Shows Created/Updated timestamps. **Apply** → `PUT /campaigns/:id` with the form (tags joined, schedule converted to DB tz).

### Campaigns dashboard (`store/campaignsDashboard.js`)
- Fetches `GET /campaigns/stats?range=<1|3|6|12>` (months) and builds two Chart.js line charts (**Newsletter** and **Anniversary**: Open + Click timelines). Range switch is throttled. (The hosting page is part of the analytics/dashboard area, not under `/campaigns/*`.)

## 4. Data & API
All endpoints below are under the authenticated `campaigns` route group (`Config/Routes.php` line ~291), base `/api/v2`.

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/campaigns` | List campaigns of a type | `query`, `type`, `Status[]` | `{campaigns:[{ID,Name,Subject,CampaignType,Status,ScheduledDate,Sent,Target,Exclude,Delay,SendOnWeekends,Expired,Inactive}], affiliate_block}` | `Campaigns.php::index` |
| POST | `/campaigns` | Create campaign (optionally from template) | `name, subject, type, template?, scheduled_date?, Delay?` | `{id, created:true}` | `Campaigns.php::create` |
| GET | `/campaigns/show/:id` | Load one campaign for editor (+S3 html/json) | path `id` | full campaign incl. `EmailJson`/`EmailHTML`, `Target[]`, `Exclude[]`, `Image`, `ReviewUsButtonText`, normalized `ScheduledDate`, `Expired` (Newsletter) | `Campaigns.php::show` |
| PUT | `/campaigns/:id` | Update campaign content/settings | `EmailHTML?, EmailJson?, Name?, Subject?, Target?, Exclude?, Delay?, SendOnWeekends?, Status?, ImageID?, ScheduledDate?, ReviewUsButtonText?` | `respondUpdated` | `Campaigns.php::update` |
| DELETE | `/campaigns/:id` | Delete campaign (+S3 objects) | path `id` | `respondDeleted` | `Campaigns.php::delete` |
| POST | `/campaigns/test` | Send a test email/SMS now | `FirstName, LastName, EmailAddress|Phone, ID, token` | `respondCreated` | `Campaigns.php::test` |
| POST | `/campaigns/:id/status` | Activate/Pause (+optional schedule) | `status (0|1)`, `schedule_date?` | `respondUpdated` | `Campaigns.php::status` |
| GET | `/campaigns/:id/stats` | Per-campaign counters | path `id` | `{subscribers, sent, opens, clicks}` | `Campaigns.php::getCampaignStats` |
| GET | `/campaigns/stats` | Dashboard stats (newsletter + anniversary) | `range (1|3|6|12)` | `{newsletter:{...,timeline}, anniversary:{...,timeline}}` | `Campaigns.php::stats` |
| GET | `/campaigns/settings` | Load email/SMS settings | — | `{ReplyTo, FromName, hasSMSAccount, Phone?}` | `Campaigns.php::settings` |
| POST | `/campaigns/settings` | Save email settings | `FromName, ReplyTo` | `respondUpdated` | `Campaigns.php::saveSettings` |
| GET | `/campaigns/affiliate` | Affiliate footer block HTML | — | `{affiliate}` | `Campaigns.php::affiliate` |
| GET | `/campaigns/tags` | Distinct recipient tags for target/exclude | — | `string[]` | `CampaignTemplates.php::tags` |
| GET | `/campaigns/templates` | Template library grouped by category | `type, search` | `{ [category]: [{ID,Name,Subject,Image,Thumbnail,...}] }` | `CampaignTemplates.php::index` |
| GET | `/campaigns/templates/:id` | Load one template (admin) | path `id` | template incl. `EmailJson`, `EmailHTML`, `Type` | `CampaignTemplates.php::show` |
| PUT | `/campaigns/templates/:id` | Update a template (admin) | `Name?, Subject?, Body?, DesignJson?` | `respondUpdated` | `CampaignTemplates.php::update` |

Presets (drip time presets, separate `presets` group, used by social-post scheduling but backed by `campaign_presets`):

| Method | v1 endpoint | Purpose | Request | Response | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/presets` | List public+private presets | — | `[{ID,Name,Values:{Mon..Sun:[HH:mm]},IsPrivate}]` | `Presets.php::index` |
| POST | `/presets` | Create private preset | `name, preset{day:[times]}` | `{presetId}` | `Presets.php::create` |
| POST | `/presets/:id` | Update preset | `name, preset` | `{presetId}` | `Presets.php::update` |
| DELETE | `/presets/:id` | Delete private preset | path `id` | `respondDeleted` | `Presets.php::delete` |

- **v1 models / tables:**
  - `CampaignModel` → table **`invite_campaign`** (PK `ID`; fields `Name, Subject, CampaignType, Delay, ScheduledDate, Target, Exclude, BackgroundColor, ImageID, Unlayered, SendOnWeekends, ProfileID, Status, Sent, ReviewUsButtonText, CreateDate, LastUpdated`). `CampaignType ∈ {SMS, Email, Birthday, Newsletter, Anniversary, ThankYou, EmailSurvey, SmsSurvey}`.
  - `ScheduleModel` → table **`invite_scheduler`** (`RecipientID, ProfileID, CampaignID, ScheduledDate, Sent, SentDate, IsTest, CreateDate`) — one row per queued send; bots flip `Sent=1, SentDate=...`.
  - `PresetModel` → table **`campaign_presets`** (`ProfileID, Name, Values(json), IsPrivate, created_at, updated_at`).
  - Templates: **`newsletter_newsletter`** + **`newsletter_category`** (category has a `Type`); plus `RecipientModel` (`invite_recipient`), `TrackerModel` (`invite_tracker`), `ActivityModel` (`invite_funnel_activity`) for stats.
  - Campaign HTML/JSON bodies are **not** in MySQL — stored in **S3** at `{ProfileID}/campaigns/{ID}/email.html` and `.../design.json` (`CampaignModel::s3Key`).
- **Pagination / filtering / sorting:** list is **not** paginated in the portal (`getCampaigns` returns all rows for the type, grouped by `ID`); admin `getCampaignsPaginated` supports paging/date filtering elsewhere. Search matches `Name`/`Subject` (LIKE both). Newsletter status filtering has special logic comparing `Sent`/`ScheduledDate` against `CURRENT_TIMESTAMP()`.

## 5. Business rules
- **Campaign types & behaviour:**
  - **Email / SMS** — recurring review invites; never reported "Inactive"; honour **Delay** (drip), **SendOnWeekends**, **Target/Exclude** tags. SMS body capped at 1600 chars (160-char segments).
  - **Newsletter** — one-off, **scheduled** via `ScheduledDate`; after sending `Sent` flips and the campaign is treated as inactive/expired. Has no Delay/weekend semantics.
  - **Birthday / Anniversary** — fire on the recipient's birthday/anniversary date (handled by `birthday-bot` / activator scheduling); target tags supported, no exclude UI for these in the modal beyond the common ones.
  - **ThankYou** — sent to inactive recipients; has **no** Target/Exclude/weekend/delay UI; can be triggered for a recipient via `sendthankyou` (currently route commented out).
- **Delay options:** `0=Immediately, 1=Next Day, 2..7, 14, 28, 30, 45, 60, 90` days.
- **Status:** `0=Paused, 1=Active`. Activating sets `Sent=0` (re-arms). `Status` endpoint validates `in_list[0,1]`. Toggling Paused→Active in the UI requires a future schedule for non-recurring types.
- **Scheduling & timezone (critical):**
  - All `ScheduledDate` values are persisted in the **app/server timezone**, configured as `America/Los_Angeles` (`Config/App.php::$appTimezone`) — this is the hardcoded-**Pacific** behaviour. The frontend (`useTimezone().dbToUser`/`userToDb`) converts between the user's tz and "DB/Pacific" for display/entry.
  - Newsletter scheduling additionally runs `CampaignModel::normalizeScheduledDateForProfile()` which interprets the entered time in the **profile's** timezone and stores it in the server tz so bot `NOW()`/`CURDATE()` comparisons line up.
  - `normalizeScheduledDate()` collapses empty strings, MySQL zero-dates (`0000-00-00...`) and unparseable values to **NULL** (fixes the "30 November 1899" / zero-date bug). `isPastScheduledDate()` rejects past dates (with a 2-minute skew grace) on create/activate/schedule.
- **Validation:** create requires `name`, `subject` (≤255), `type ∈ {SMS,Email,Birthday,Newsletter,Anniversary,ThankYou}`. Tags are lowercased, trimmed, de-duped, comma-joined on save.
- **Merge tags / placeholders** (resolved in `Campaigns::placeholders` and the bots): `first_name`, `last_name`, `profile_name`, `profile_url` (tracked link), `profile_short_url` (`/r/<tracker>`), `logo`, `business_logo`, `custom_field`, `review_tracking_url`, `review_us_button` (uses `ReviewUsButtonText`), `review_me_button`, `address`. Both `[[...]]` and `{{...}}` forms accepted.
- **Footer injection (Unlayered email):** the editor appends `[[thank_you_line]]`, `[[unsubscribe_line]]`, `[[affiliate_line]]`, `[[powered_by_line]]`, `[[tracker_line]]` which the test/send path replaces with: a "did you already write a review?" line (Email only), an unsubscribe link (`unsubscribe?id=<tracker>`), the affiliate block (if `AffiliateActive`), "Powered By Oggvo.com", and a 1×1 tracking pixel (`track?action=Opened+Email&id=<tracker>`).
- **Test sends (`POST /campaigns/test`):** require reCAPTCHA (score ≥ 0.5, skipped in `testing` env); upsert the recipient as Active/`Source=Self Test`; create an `invite_tracker` row with `IsTest=1`; fetch HTML from S3; render placeholders. Email tests invoke the **`sendEmail`** Lambda (region `us-east-2`); SMS tests POST directly to **Twilio** Messages API using the profile's `SMSNumberSID`/`Token` (and `MessagingServiceId`/`MediaUrl` if set). A scheduler row with `IsTest=1, Sent=1` is recorded.
- **Async delivery (production sends):** the portal never sends recurring/newsletter campaigns synchronously. It writes `invite_scheduler` rows; Go bots (`bots/sender`, `bots/newsletter` and their Lambda twins `lambdas/sender-bot`, `lambdas/newsletter-bot`) pick up due rows, render the template (embedded HTML templates: emailV1, reviewbutton, unsubscribeLine, affiliatelink, poweredByLine, trackerLine, thankYouLine), and call the **`send-email`** Lambda → SendGrid for email, or Twilio for SMS. `SendOnWeekends=false` skips weekend dispatch in the worker.
- **Stats:** per-campaign counters come from `invite_scheduler` (subscribers = `Sent=0`, sent = `Sent=1 & SentDate not null`, both `IsTest=0`) and `invite_funnel_activity` joined via `invite_tracker` (opens/clicks by `Activity LIKE`). Dashboard `getStats` computes totals + recent + rate + a timeline bucketed by range (1mo=daily, else monthly). Open-action label varies by type (`Opened Email/Newsletter/Birthday/Anniversary/ThankYou`, SMS uses `Arrived From Mobile`).
- **Ownership:** all profile-scoped queries filter by `ProfileID`; admins (`AccountType >= OGGVO_ADMIN`) bypass the ownership filter in `show` and manage the template library.

## 6. Integrations
- **SendGrid** — actual email delivery, via the `send-email` / `sendEmail` AWS Lambda (region `us-east-2`); used for both test sends and bot-driven bulk sends. Open/click tracking pixels + redirect links feed `invite_funnel_activity`.
- **Twilio** — SMS delivery (Messages API) using per-profile `SMSNumberSID`, `SMSNumberToken`, `SMSNumber`, optional `MessagingServiceId`; number search/provisioning via the `sms-numbers` domain. Inbound webhooks (`Controllers/Webhook/Twilio.php`) handle STOP/replies.
- **AWS S3** — stores each campaign's `email.html` and `design.json` (bodies live here, not MySQL).
- **AWS Lambda** — `sendEmail` (transactional + test), plus the Go worker bots run as Lambdas (`sender-bot`, `newsletter-bot`).
- **Unlayer** (`@elmehdi/oggvo-vue-email-editor`, projectId 138792) — the WYSIWYG email editor; custom image-upload providers wired to the portal `media/*` endpoints.
- **Google reCAPTCHA v3** — gates `POST /campaigns/test`.
- **Affiliate program** — affiliate footer/link block injected when `Profile.AffiliateActive` (uses `AffiliateCode`, `AffiliateFooterText`); affiliate links also appended to SMS bodies.

## 7. v1 → v2 mapping
- **Module:** `apps/api/src/modules/campaigns` — `CampaignsController`, `CampaignsService` (CRUD + activation + scheduling), `CampaignTemplatesService`, `CampaignStatsService`, `CampaignTestService`; repositories per table; DTOs validated via class-validator + OpenAPI. Settings/SMS-number concerns can call into the `profiles`/`sms` modules rather than re-implementing.
- **Drizzle tables (`@oggvo/db`):**
  - `campaigns` ← `invite_campaign` (rename columns to camelCase: `campaignType`, `scheduledDate`, `sendOnWeekends`, `reviewUsButtonText`, `unlayered`, etc.). Keep `status` as small int; consider an enum for `campaignType`. Drop the `EmailSurvey`/`SmsSurvey` types here if surveys move to their own module.
  - `campaign_schedules` ← `invite_scheduler` (`recipientId, campaignId, profileId, scheduledDate, sent, sentDate, isTest`). This is the per-send queue.
  - `campaign_events` ← the open/click/unsubscribe slice of `invite_funnel_activity` joined via `invite_tracker` (normalise the `Activity LIKE` strings into a typed `eventType` enum: `open|click|unsubscribe|sent|test`). Decide whether trackers are folded in here or kept separate.
  - `campaign_presets` ← `campaign_presets` (mostly 1:1; `values` JSON of weekday→times).
  - Bodies: keep HTML/JSON in object storage (S3) keyed `{profileId}/campaigns/{id}/{email.html,design.json}` — do **not** stuff into Postgres.
- **Queue:** `sender` (recurring Email/SMS + birthday/anniversary), `newsletter` (one-off scheduled blasts), `email-send` (the actual SendGrid call) — BullMQ jobs **must honour per-profile timezone** when computing due time and weekend skipping (replace the hardcoded Pacific assumption).
- **Frontend:** v2 routes under `apps/web/app/(portal)/campaigns/` — list (`/campaigns`), templates (`/campaigns/templates`), editor (`/campaigns/[id]`). Reuse `@oggvo/ui` for `TabBar`, `Modal`/drawer, `Badge`, `TextInput`, `Combobox`, `Switch`, `DateTimePicker`, `ConfirmModal` (per memory: never native confirm/alert). Re-evaluate the Unlayer dependency vs a maintained fork.
- **Endpoint mapping (RESTful, typed via OpenAPI):**
  - `GET /campaigns` → `GET /campaigns?type=&status=&q=` (paginated)
  - `POST /campaigns` → `POST /campaigns`
  - `GET /campaigns/show/:id` → `GET /campaigns/:id`
  - `PUT /campaigns/:id` → `PATCH /campaigns/:id`
  - `DELETE /campaigns/:id` → `DELETE /campaigns/:id`
  - `POST /campaigns/:id/status` → `PATCH /campaigns/:id/status`
  - `GET /campaigns/:id/stats` → `GET /campaigns/:id/stats`
  - `GET /campaigns/stats` → `GET /campaigns/stats?range=`
  - `POST /campaigns/test` → `POST /campaigns/:id/test`
  - `GET|POST /campaigns/settings` → `GET|PATCH /campaigns/settings`
  - `GET /campaigns/affiliate` → fold into settings/profile response
  - `GET /campaigns/tags` → `GET /campaigns/tags`
  - `GET /campaigns/templates` → `GET /campaign-templates?type=&q=`
  - `GET|PUT /campaigns/templates/:id` → `GET|PATCH /campaign-templates/:id` (admin)
  - `/presets*` → `/campaign-presets*`
- **Known v1 bugs to fix:**
  - **Hardcoded Pacific timezone** (`$appTimezone = America/Los_Angeles`) — all scheduling math assumes Pacific; v2 must schedule and skip weekends in each profile's own timezone.
  - **N+1 stats fan-out** — the list page fires one `GET /campaigns/:id/stats` per row after load. v2 should return stats inline or in one batched call.
  - **Zero-date / "1899" dates** — v1 patched this with `normalizeScheduledDate`; v2 should use nullable timestamps natively (Postgres) so the class of bug disappears.
  - **DeleteModal id handling** — v1 passes the whole campaign object in one path; ensure v2 deletes by a clean id.
  - **No list pagination** in the portal — large accounts load every campaign of a type; paginate in v2.
  - **Footer placeholders duplicated** across the API view layer and the Go bot templates — centralise rendering so test sends and bulk sends can't drift.

## 8. Open questions / parity risks
- **Surveys:** `EmailSurvey`/`SmsSurvey` are valid `CampaignType`s in `CampaignModel` and `createSurveyCampaign`, but they aren't exposed in the campaigns UI. Do they belong in the `campaigns` module/tables or a separate `surveys` module? (Schema decision needed.)
- **Template library source:** templates come from `newsletter_newsletter`/`newsletter_category`, not a campaigns-owned table. v2 needs to decide whether campaign templates get their own tables or share a `templates` module — flag as a potential **schema gap** for `campaign_events`/templates.
- **`campaign_events` shape:** v1 has no single events table — opens/clicks/unsubscribes live in `invite_funnel_activity` (string `Activity`) joined through `invite_tracker`, and "sent" lives in `invite_scheduler`. Consolidating into `campaign_events` requires deciding the canonical event taxonomy and whether trackers are a separate entity.
- **`sendthankyou` route is commented out** in v1 — confirm whether ThankYou auto-trigger is still required and where it's invoked from.
- **Affiliate block** is computed inside the campaigns controller (`affiliate()`, returned as `affiliate_block` on the list) — in v2 it likely belongs to the affiliate/profile module; confirm ownership.
- **SMS settings vs campaigns:** the Settings modal mixes campaign email settings (`/campaigns/settings`) with SMS-number provisioning (`/sms-numbers/*`). Decide module boundaries in v2.
- **Stats accuracy:** open/click counting relies on `Activity LIKE '%...%'` substring matching and `IsTest=0` filters; the v2 `campaign_events` migration must preserve exact counting semantics (including the recent-vs-total/rate computation and timeline bucketing).
- **Per-profile timezone data quality:** `ProfileModel` maps state/abbreviation strings to IANA zones with many fallbacks; some profiles may have missing/ambiguous timezone data, which affects correct scheduling once Pacific hardcoding is removed.
