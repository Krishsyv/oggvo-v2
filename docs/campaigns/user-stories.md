# Campaigns — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/campaigns.md`](../feature-spec/campaigns.md).
> v2 target: module `apps/api/src/modules/campaigns` · tables `campaigns`, `campaign_schedules`,
> `campaign_events`, `campaign_presets` (`@oggvo/db`) · queues `sender` / `newsletter` / `email-send`
> (BullMQ) · build phase 2.
>
> Companion: [activity-diagrams.md](./activity-diagrams.md) · UI mockups
> `campaigns-list.html`, `campaigns-templates.html`, `campaigns-editor.html` in
> [../design-system/mockups/](../design-system/mockups/).

**Personas**
- **Operator** — authenticated profile user composing and managing campaigns.
- **Admin** (`AccountType >= OGGVO_ADMIN`) — manages the shared template library, can view any campaign.
- **System** — API + `sender`/`newsletter`/`email-send` workers + SendGrid/Twilio.

**Global rules**
- Every read/write is scoped to `profileId`; admins bypass ownership in `show` + template management.
- **Delivery is always asynchronous** — the portal writes campaign + schedule rows and stores HTML/JSON
  in S3; workers fan out the actual sends. The portal never sends bulk synchronously.
- **Scheduling is per-profile timezone** (fix-on-rebuild: v1 hardcodes `America/Los_Angeles`); weekend
  skipping and due-time math run in the profile's tz.
- Campaign bodies (HTML/JSON) live in **object storage**, not Postgres.

---

## Epic C1 — Browse & manage campaigns

### US-C1.1 — List campaigns by type
**As an** Operator **I want** to see my campaigns of a given type with live stats **so that** I can judge performance.
- **AC1** Type tabs: **Review (Email)**, **SMS**, **Newsletter**, **Birthday**, **Anniversary**, **ThankYou**; switching tab resets the status filter and refetches.
- **AC2** Table columns: Name + Subject (→ editor), Subscribed, Sent, Opens, Clicks, Status badge, an info tooltip (schedule / Immediately·Next-Day·In-N-Days, send-on-weekends, target/exclude tags), and an actions dropdown.
- **AC3** Status badges: `0`→yellow "Paused"; non-Email/SMS `1 & Inactive`→red "Inactive", `1 & active`→green "Active"; Email/SMS `1`→green "Active" (recurring types are never Inactive).
- **AC4** Empty = "No campaigns" + CTA; loading = 5 skeleton rows.
- **Fix-on-rebuild:** v1 fetches stats one request per row (N+1) — v2 returns stats inline or batched; v1 portal list isn't paginated — paginate in v2.

### US-C1.2 — Filter & search
- **AC1** A debounced search matches Name/Subject (sent as `query`); a Status multi-select sends `Status[]` (`0` Paused / `1` Active / `2` Inactive).

### US-C1.3 — Activate / pause a campaign
- **AC1** The actions dropdown toggles Activate/Pause; activating an expired/unscheduled non-recurring campaign opens the **Schedule** modal (future-only picker; Activate disabled until a future date). `PATCH /campaigns/:id/status` (`status 0|1`, optional `schedule_date`).
- **AC2** Activating re-arms the campaign (sets `Sent=0`); past dates rejected (2-min skew grace).

### US-C1.4 — Send a test
- **AC1** "Send a test" opens a modal: `EmailAddress` (email types) or `Phone` (SMS) + FirstName/LastName, gated by reCAPTCHA; `POST /campaigns/:id/test` renders placeholders and sends now (email via Lambda, SMS via Twilio; SMS tests may reroute to a sandbox number).

### US-C1.5 — Delete a campaign
- **AC1** A confirm modal then `DELETE /campaigns/:id` (also removes S3 objects); list refetches. (Fix-on-rebuild: delete by clean id, not the whole object.)

### US-C1.6 — Configure campaign settings
- **AC1** A Settings modal loads `GET /campaigns/settings`; Email tab edits **From Name** + **Reply To** (`POST /campaigns/settings`). SMS tab shows the provisioned number or a "Setup SMS Account" flow (area-code search → save), with a delete-number path for Account-Managers. (SMS-number endpoints live in the SMS-numbers domain.)

---

## Epic C2 — Create from templates

### US-C2.1 — Browse the template gallery
**As an** Operator **I want** a gallery of pre-built templates **so that** I can start fast.
- **AC1** `GET /campaign-templates?type=&q=` returns templates grouped by category (collapsible accordions, default open); filtered by the type tab and a debounced search; a Category multi-select narrows further.
- **AC2** Each card shows a thumbnail (or "No Image"), name, and a **Preview** button (when an image exists). A **Blank** card starts from scratch. Loading = 4 skeleton cards.

### US-C2.2 — Create a campaign
- **AC1** Clicking a card or Blank opens a Create modal: **Name** + **Subject** (prefilled from template), hidden `template` + `type`. **Continue** → `POST /campaigns` → redirect to `/campaigns/editor/:id`.

### US-C2.3 — Manage the shared library (Admin)
- **AC1** Admins can load/update library templates (`GET|PATCH /campaign-templates/:id`).

---

## Epic C3 — Compose in the editor

### US-C3.1 — Edit name & subject inline
- **AC1** Name and Subject are editable in the editor header (contenteditable; Enter saves).

### US-C3.2 — Design an email body
- **AC1** Email/Newsletter/Birthday/Anniversary/ThankYou use a drag-and-drop email editor seeded from the S3 design; merge tags available (`first_name`, `profile_name`, `profile_url`, `review_us_button`, …; both `[[…]]` and `{{…}}` forms).
- **AC2** On save the system injects footer placeholders (`[[unsubscribe_line]]`, `[[powered_by_line]]`, `[[tracker_line]]`, …) and `PATCH /campaigns/:id` with `{EmailHTML, EmailJson, Name, Subject, ReviewUsButtonText, ScheduledDate}`.
- **AC3** A **Review button text** field (max 40, default "Review Us Now") appears only when the design uses the `[[review_us_button]]` tag.

### US-C3.3 — Compose an SMS body
- **AC1** SMS uses a plain textarea with a 1600-char counter (segmented over 160), an Add-placeholder menu (`[[first_name]]`, `[[profile_name]]`, `[[profile_url]]`, `[[profile_short_url]]`, …), and an image (MMS) picker. Save → `PATCH /campaigns/:id` with `{EmailHTML, Name, Subject, ImageID}`.

### US-C3.4 — Set delivery options
- **AC1** An Options modal sets: **Status** (Active/Paused; Paused→Active opens the future-only Schedule modal); Email/SMS only — **Send on weekends**, **Delay** (`0` Immediately, `1` Next Day, `2..7,14,28,30,45,60,90` days); **Target Tags** (all except ThankYou) and **Exclude Tags** (Email/SMS); newsletters get a **Schedule** datetime. Tags from `GET /campaigns/tags`. **Apply** → `PATCH /campaigns/:id`.

---

## Epic C4 — Stats & dashboard

### US-C4.1 — Per-campaign counters
- **AC1** `GET /campaigns/:id/stats` returns `{subscribers, sent, opens, clicks}` (subscribers = queued `sent=0`, sent = `sent=1` with date, both non-test; opens/clicks from `campaign_events`).

### US-C4.2 — Dashboard timelines
- **AC1** `GET /campaigns/stats?range=1|3|6|12` returns newsletter + anniversary open/click timelines (1mo = daily buckets, else monthly).

---

## Epic C5 — Drip presets

### US-C5.1 — Manage send-time presets
- **AC1** `/campaign-presets` lists public + private presets (`Values` = weekday→times JSON); Operators create/update/delete their own private presets.

---

## Epic C6 — Modals (one AC block per modal)

> Consolidated acceptance criteria per modal; **Copy** lines are verbatim v1. Standard behaviour for all:
> open from the trigger, close on ✕ / Cancel / backdrop / Escape, and Confirm fires a toast. Mocked as
> reachable open states in `campaigns-list.html` (Settings/SendTest/Delete/Schedule),
> `campaigns-templates.html` (Create/Preview), and `campaigns-editor*.html` (SendTest/Schedule + the
> Options panel).

### US-C6.1 — Campaign Settings modal (`SettingsModal`)
**Trigger:** header **Campaign Settings**. Three sub-tabs (`buttonGroup`); the heading changes per tab.
- **AC1 — Settings tab** (heading **"Campaign Settings"**): **Email Settings** → **From Name**, **Reply To**
  (both helper **"If empty, default value will be used"**); **SMS Settings** → **SMS Number** (helper
  **"Invites are sent from this number"**) or a **"Setup SMS Account"** button when none. Primary **Update**
  → `POST /campaigns/settings`, toast **"Data updated successfully!"**.
- **AC2 — SMS setup tab** (heading **"Search SMS Numbers"**): **Area code** + **Search**; **Available numbers**
  list (empty **"No available numbers"**); **Save Number** (Cancel returns to Settings).
- **AC3 — SMS delete tab** (heading **"Delete SMS Account"**): **"Are you sure?"** /
  **"Deleting your SMS number will stop all SMS campaigns!"**; danger **"Yes, Delete it!"** → toast
  **"SMS number deleted successfully!"** then redirect to the Email list. (Account-Manager+ only.)
- **Fix-on-rebuild:** clearing the SMS number must reset local state even if the provider close fails
  (v1 deadlock); SMS-number endpoints live in the SMS-numbers domain.

### US-C6.2 — Send a Test modal (`SendTestModal`)
**Trigger:** row ⋯ → **Send a test**, or the editor **Send a test** button.
- **AC1** Title **"Send a Test"**, description **"Campaign: {Name}"**. Field swaps on type: **Phone Number**
  (SMS) vs **Email Address** (email types); always **First Name** + **Last Name** (all required, first field autofocus).
- **AC2** Primary **Send** → reCAPTCHA (`send_test_email`) then `POST /campaigns/:id/test` (renders placeholders,
  sends now); toast **"Campaign sent successfully!"**. (v1 hides Send-a-test in the SMS editor — surfaced in
  the v2 SMS mockup for parity; confirm.)

### US-C6.3 — Delete modal (`DeleteModal`)
**Trigger:** row ⋯ → **Delete**.
- **AC1** Danger (red trash) confirm; copy **"Are you sure? You won't be able to revert this!"**; buttons
  **Delete** / **Cancel**. `DELETE /campaigns/:id` (also removes S3 objects); list refetches; toast
  **"Campaign deleted"**.
- **Fix-on-rebuild:** v1 modal title is mislabeled **"Delete Post"** and the toast lowercase
  **"campaign deleted successfully!"** — normalize to a campaign-scoped title/casing in v2; delete by clean id.

### US-C6.4 — Create modal (`CreateModal`)
**Trigger:** a template card or the **Blank** card (templates page).
- **AC1** Title **"Create new campaign"**, description = the selected **type**. Fields **Name** + **Subject**
  (required, autofocus on Name) prefilled from the template (`Name`/`Subject`); Blank → both empty; hidden
  `template` (id) + `type`.
- **AC2** Primary **Continue** → `POST /campaigns` → redirect `/campaigns/editor/:id`; toast
  **"Campaign created successfully!"**. Secondary is labelled **Close** (not Cancel). A **Preview** modal
  (eye button, only when the template has an image) shows name + subject + full image, no actions.

### US-C6.5 — Campaign Options modal (`OptionsModal`)
**Trigger:** editor **More options** (a status dot is green when Active, red when Paused). In the v2 editor
this is surfaced as the right-side delivery-options panel.
- **AC1** Title **"Campaign Options"**. **Status** switch — description **"The campaign is Active"** /
  **"The campaign is Paused"**; toggling Paused→Active opens the **Schedule** modal (US-C6.6).
- **AC2 — Email/SMS only:** **Send on weekends** switch (desc **"Campaign will … be sent on weekends"**);
  **Delay** listbox (placeholder **"Select a delay"**; options **Immediately, Next Day, In 2…7 Days, In 14,
  28, 30, 45, 60, 90 Days**); **Exclude Tags** combobox (add Enter / remove ×).
- **AC3 — Target Tags** combobox for all types **except ThankYou**. Footer shows Created/Updated timestamps.
  **Apply** → `PATCH /campaigns/:id`; toast **"Data saved successfully!"**.
- **Open question:** v1 OptionsModal has **no** Review-button-text / `[[review_us_button]]` / max-40 field —
  that lives in the editor design config; the v2 editor panel surfaces it (max 40, shown when the design uses
  the tag). Confirm the canonical home.

### US-C6.6 — Schedule modal (`Campaign Schedule`)
**Trigger:** activating an expired/unscheduled (non-recurring) campaign — from the row ⋯ **Activate** action
or the Options/editor Status switch.
- **AC1** Title **"Campaign Schedule"**, description **"Update schedule date in order to activate this
  campaign"**, field **Schedule Date**; warning **"If you keep the current schedule date, the campaign will
  remain inactive."** Confirm button **Activate** (row) / **Update** (options/editor).
- **AC2** **Future-only:** the confirm button is **disabled until a future date is chosen** (fix-on-rebuild:
  v1 has no client-side future-only guard — enforce in v2). On confirm → `PATCH /campaigns/:id/status`
  (`status 1`, `schedule_date`); toast **"Campaign Status Updated"**.

---

## Cross-cutting acceptance criteria
- **Async only:** create/activate/schedule writes `campaign_schedules` rows; workers (`sender`/`newsletter`) pick up due rows, render the template, and call `email-send` (SendGrid) or Twilio. `SendOnWeekends=false` skips weekend dispatch **in the profile tz**.
- **Nullable timestamps:** v2 uses Postgres nullable `scheduledDate` so zero-date/"1899" bugs disappear.
- **Footer rendering centralized:** one renderer for placeholders so test sends and bulk sends can't drift.
- **Event taxonomy:** consolidate v1's `Activity LIKE` strings + scheduler "sent" into a typed
  `campaign_events.eventType` (`open|click|unsubscribe|sent|test`) while preserving exact counting.

## Open questions (from spec)
- Surveys (`EmailSurvey`/`SmsSurvey`) — campaigns module or a separate `surveys` module?
- Template source (`newsletter_*` tables) — campaigns-owned tables or a shared `templates` module?
- `sendthankyou` route is commented out in v1 — is ThankYou auto-trigger still required?
- Affiliate footer block ownership (campaigns vs affiliate/profile module).

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-C1.1/1.2 | `GET /campaigns?type=&status=&q=` |
| US-C1.3 | `PATCH /campaigns/:id/status` |
| US-C1.4 | `POST /campaigns/:id/test` |
| US-C1.5 | `DELETE /campaigns/:id` |
| US-C1.6 | `GET/PATCH /campaigns/settings` |
| US-C2.1 | `GET /campaign-templates?type=&q=` |
| US-C2.2 | `POST /campaigns` |
| US-C3.* | `PATCH /campaigns/:id` |
| US-C4.1 | `GET /campaigns/:id/stats` |
| US-C4.2 | `GET /campaigns/stats?range=` |
| US-C5.1 | `/campaign-presets*` |
| US-C6.1 | `GET/PATCH /campaigns/settings` (+ SMS-numbers domain) |
| US-C6.2 | `POST /campaigns/:id/test` |
| US-C6.3 | `DELETE /campaigns/:id` |
| US-C6.4 | `POST /campaigns` (+ `GET /campaign-templates`) |
| US-C6.5 | `PATCH /campaigns/:id` |
| US-C6.6 | `PATCH /campaigns/:id/status` |
