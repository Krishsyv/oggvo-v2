<!--
Feature spec for the Contacts (Recipients) domain. v1 → v2 migration reference.
v1 file paths are relative to the `oggvo` repo.
-->

# Contacts (Recipients)

> **v2 target:** module `apps/api/src/modules/contacts` · tables `contacts`, `contact_tags`, `contact_tag_assignments`, `contact_imports` (`@oggvo/db`) · queue `contacts-import` (BullMQ) · build phase `1`
> **v1 sources:** frontend `apps/portal-frontend/pages/contacts/*`, composable `apps/portal-frontend/composables/useContacts.js`, API `apps/portal-api/app/Controllers/API/V2/Recipients.php` + `ContactImports.php` + `Activity.php`, models `app/Models/RecipientModel.php` + `ContactImportModel.php` + `ActivityModel.php`, Lambda `lambdas/process-contacts-uploads`

## 1. Overview

Contacts (called **Recipients** in the v1 DB/code) is the customer/lead address book for a profile. Every campaign (reviews, newsletters, SMS, birthday/anniversary, thank-you) targets contacts, so this domain is the data backbone of the product. Users can create contacts one at a time, bulk-import them from CSV, tag and segment them, attach a free-text note and dates (birthday/anniversary), view a per-contact activity timeline + campaign pipelines, and activate/deactivate/delete them individually or in bulk. A profile-level configuration controls **automatic daily activation** (how many inactive contacts get enrolled into campaigns each day, at what time) and **auto-deactivation** once a contact engages. Access is gated to any authenticated user and every query is scoped to the caller's `profile_id` (`$this->request->auth->profile_id`) — there is no extra account_type/permission gate beyond auth + tenancy.

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/contacts` | `pages/contacts/index.vue` | default | Status TabBar (All / Active / Pending / Inactive) | authed + profile-scoped |
| `/contacts/create` | `pages/contacts/create.vue` | default | — | authed + profile-scoped |
| `/contacts/:id` | `pages/contacts/[id].vue` | default | edit form + activity pipeline sidebar (`id` must be digits) | authed + profile-scoped |
| `/contacts/settings` | `pages/contacts/settings.vue` | default | — | authed + profile-scoped |
| `/contacts/imports` | `pages/contacts/imports/index.vue` | default | — | authed + profile-scoped |
| `/contacts/imports/:id` | `pages/contacts/imports/[id].vue` | default | Status tabs (Imported / Duplicate / Failed) (`id` must be digits) | authed + profile-scoped |

## 3. Screen-by-screen

### `/contacts` — Contacts list

![index](_assets/screens/contacts/index.png) <!-- placeholder until captured -->

- **Purpose & layout** — Paginated, searchable, sortable table of all non-deleted contacts. Header actions: **Import** (→ `/contacts/imports`), **Export** (`ContactsExportModal`), **Configuration** (→ `/contacts/settings`), **Add** (→ `/contacts/create`). On mobile these collapse into a Dropdown menu. Above the table sits a **campaign-status banner**.
- **Campaign-status banner** — A `Badge` + message derived from `profile.CampaignsPaused`, `profile.AutoActivateRecipients`, and the active-contact count:
  - paused → orange "Campaigns paused"; active+autoactivate → green "Campaigns active"; active count > 0 but autoactivate off → yellow "New activations paused"; otherwise gray "Campaigns dormant".
  - Shows "Active contacts in cadence: {count}" (from `GET /recipients/count?status=Active`).
  - **Pause Campaigns** button (`POST /profiles/pause-campaigns`) opens a confirm `Modal`; disabled when count is 0. When paused, shows **Resume Campaigns** (`POST /profiles/resume-campaigns`). (These profile endpoints live in the Settings/Campaigns domain but are surfaced here.)
- **Filters / controls**
  - **Status** — `TabBar` bound to `params.status`; options from `useContactStatuses()` = `All, Active, Pending, Inactive` (colors gray/green/yellow/red). Default `All`.
  - **Date Added** — `select` `params.date_added_range`: `anytime` (default, sent as undefined), `7`, `30`, `90` days.
  - **Search** — `params.query`, debounced via reactive watch; placeholder "Search over {total} contacts by name, email, phone or tags". Resets page to 1 on input.
  - URL query sync: `sort, dir, page, perpage, query, status, date_added_range` are mirrored into the route (defaults omitted). `sessionStorage` saves scroll position + params so returning from a detail page restores state.
- **Table columns**
  - Select checkbox (header = select-all-visible, indeterminate when partial).
  - **Name** (sortable, field `FirstName`) — avatar (`uploads/recipients/{Image}`) + `FirstName LastName` + phone (`$usPhone`); links to `/contacts/:id`.
  - **Status** — `Badge` (Active green / Pending yellow / Inactive red).
  - **Phone** (`$usPhone(Phone)`), **Email address** (`EmailAddress`).
  - **Tags** — first 3 tags rendered as blue pills (CSV split, deduped).
  - **Date Added** (sortable, field `CreateDate`) — `MMM DD, YYYY` + time.
  - **Recent Activity** (sortable, field `LastActivity`) — split on `" - "`; shows activity label + date.
  - Row actions Dropdown: **Edit**, **Restart** (only when Status=Active; triggers activate modal), **Activate/Deactivate** (toggles per current status), **Delete**.
- **Bulk actions** — visible when ≥1 selected; the Actions dropdown appears when ≥2 selected (`hasBulkActions`). Options: **Activate**, **Deactivate** (→ `ContactsChangeStatusModal`), **Delete**, **Delete All** (→ `ContactsDeleteModal`, passes `'all'`), **Clear selection**.
- **States** — loading (`SkeletonsTableRowContact` ×5); empty (UserGroup icon, "No contacts" + Add Contact CTA); paginated (Prev/Next + numeric pages via `paginationPageNumbers`, rows-per-page select 10/25/50/100).
- **Modals** — `ContactsDeleteModal` (ref `deleteDialogRef`), `ContactsChangeStatusModal` (ref `statusDialogRef`), Pause-campaigns confirm Modal. All refresh the list + profile + active-count on success.

### `/contacts/create` — Add contact

![create](_assets/screens/contacts/create.png) <!-- placeholder until captured -->

- **Purpose & layout** — Single-column form, `PageHeader` with back-button to `/contacts`. Submits multipart `FormData` to `POST /recipients`.
- **Fields**
  | Field | Form key | Type | Required | Notes |
  | --- | --- | --- | --- | --- |
  | First Name | `FirstName` | text | one of First/Last required | `autocomplete=given-name` |
  | Last Name | `LastName` | text | one of First/Last required | |
  | Phone Number | `Phone` | text | one of Phone/Email required | normalized server-side to digits; copy button |
  | Email Address | `EmailAddress` | email | one of Phone/Email required | server validates `valid_email` + blacklist |
  | Photo | `Image` | file (image/*) | no | preview via object URL; Delete/Update |
  | Tags | `Tags` | `RecipientTagsCombobox` (array) | no | free-create + suggest from `GET /recipients/tags` |
  | Note | `CustomField` | textarea (5 rows) | no | single free-text "note" |
  | Birthday | `Birthday` | date picker | no | sent as `YYYY-MM-DD` |
  | Anniversary | `Anniversary` | date picker | no | sent as `YYYY-MM-DD` |
  | Opted In | `OptIn` | switch | default **true** | certifies recipient consent |
  - Hidden prefill: `ConversationID` (from `?cid=`), `Phone` (from `?phone=`) — used when creating a contact from a Connect conversation.
- **States / interactions** — per-field error text from `data.messages`; Save shows loading; success → redirect to `/contacts` + success toast. Cancel → `/contacts`.

### `/contacts/:id` — Contact detail & edit

![detail](_assets/screens/contacts/detail.png) <!-- placeholder until captured -->

- **Purpose & layout** — Two-column grid: left = the same edit form as create (fetched via `GET /recipients/:id`, mapped into `form`); right = **activity pipeline** sidebar. `PageHeader` shows avatar, name, "Uploaded on {date}", `#id`, and tag pills. **Send Message** action routes to `/connect`.
- **Form** — identical fields to create; `OptIn` mapped from `'1'`, Tags split from CSV (deduped/lowercased), dates formatted `MMM DD, YYYY`. **Reset** button appears when `hasChanges`; **Save** disabled unless changed. Submits `POST /recipients/update/:id` (multipart). Updating image deletes the old file.
- **Activity sidebar (pipelines)** — from `GET /recipients/activity/:id` (`pipelines[]`). Each pipeline card: title + status badge (Active green / History gray / else red) and a vertical timeline of items (title, subtitle, timestamp). Pipeline keys (ordered): `campaign_history, reviews, newsletters, birthday, anniversary, thankyou, other` — mapped from campaign type. Loading skeleton; empty state "No pipeline activity…". (The `ContactHistory/*` components render the **day-grouped** variant from `GET /recipients/activity/:id/grouped`, used in the Connect drawer.)
- **States** — full-page spinner while loading; per-field validation errors; "Something went wrong" toast on failure.

### `/contacts/settings` — Configuration

![settings](_assets/screens/contacts/settings.png) <!-- placeholder until captured -->

- **Purpose & layout** — Form editing profile-level activation behaviour. Loads `GET /profiles/me`, saves `POST /profiles/save-settings`.
- **Fields**
  | Field | Form key | Type | Notes |
  | --- | --- | --- | --- |
  | Automatic Contact Activation | `AutoActivateRecipients` | switch | "Automatically activate contacts each day" |
  | Daily activation time | `TimeActivateRecipients` | timepicker `hh:mm A` | disabled unless auto-activate on; shown in profile `Timezone` (link to `/settings`) |
  | Contacts to activate per day | `AutoActivateLimit` | number (0–500) | "Maximum: 500" |
  | Auto-deactivate after review | `DeactivateRecipientsOnClickthrough` | switch | defaults on if no deactivation rule set |
  - Hidden/legacy: `DeactivateRecipientsOnOpen` and `DeactivateRecipientsOnClick` are always submitted as `false`.
- **States** — success/error toasts; Save loading.

### `/contacts/imports` — Import list

![imports-index](_assets/screens/contacts/imports-index.png) <!-- placeholder until captured -->

- **Purpose & layout** — History of CSV imports. `GET /recipients/imports?page=`. Header: **Refresh List**, **Import** (`ContactsImportModal`). Includes `TutorialsRoutePrompts`.
- **Columns** — File Name (links to `/contacts/imports/:id`), Total Rows (`TotalCount`), Imported (green badge), Duplicate (yellow badge), Failed (red badge), Size (`$formatSize(FileSize)`), Status badge (queued gray / in-progress primary / completed green / failed red), Upload Date (`created_at`).
- **States** — skeleton ×5; empty state (UploadCloud icon, "No Imports" + import CTA); paginated via `Pagination` (10/page).
- **Import modal (`Contacts/ImportModal`)** — trigger "Upload .CSV". Fields:
  - `File` — `.csv` only, required; name shown after select. Parsed client-side (PapaParse, first ~10 rows) to populate header preview.
  - `Name` — required, list name (server enforces `is_unique[contact_imports.Name]`).
  - **Column mapping** `fields{}` — select per target column to a CSV column index: `FirstName, LastName, EmailAddress, Phone, Tags, Birthday, Anniversary, CustomField`.
  - Toggles: `KeepEmail` (default true), `KeepPhone` (default true), `OptIn` (default true, required), `UpdateData` ("Enrich Existing Data", default true), `MakeInactive` (default false).
  - Submits multipart `POST /recipients/imports/upload`; emits `refresh`; per-field errors from `data.messages`.

### `/contacts/imports/:id` — Import detail

![imports-detail](_assets/screens/contacts/imports-detail.png) <!-- placeholder until captured -->

- **Purpose & layout** — Per-import row browser backed by **DynamoDB**. Header shows import name + "{total} Rows", **Refresh List**, **Download File** (xlsx export).
- **Status tabs** — `imported` (default), `duplicated`, `failed`, each with a count from `import.imported/duplicated/failed`.
- **Search** — `TextInput` + a Listbox "Search by" key picker (`FirstName, LastName, Phone, EmailAddress`); search disabled until a key is selected. When searching, a **Status** column is added (badge imported/duplicated/failed).
- **Columns** — First Name, Last Name, Tags, Email Address, Phone, Birthday; for `failed` tab an extra **Reason** column (tooltip showing `FailureReason`).
- **Pagination** — DynamoDB **key-based** infinite scroll: response returns a `key` cursor; `InfiniteLoading` calls `loadMore` which refetches with the key until exhausted. Switching tab/search resets records + key.
- **Export** — `GET /recipients/imports/:id/export?type=` returns a blob saved as `{name}-contacts.xlsx`.
- **States** — skeleton rows while loading; empty state "No Data"; 404 redirect if import not found.

## 4. Data & API

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v2/recipients` | List contacts | `sort(FirstName\|LastActivity\|CreateDate), dir, page, perpage(10/25/50/100), query, status(Active\|Pending\|Inactive\|All), date_added_range(7/30/90), with_phone_number` | `{ data[], page, perpage, total, pages, sort, field }` | `Recipients.php::index` |
| GET | `/api/v2/recipients/:id` | Single contact | path id | `{ FirstName, LastName, Phone, EmailAddress, Image, Tags, CustomField, Birthday, Anniversary, OptIn, CreateDate }` | `Recipients.php::show` |
| GET | `/api/v2/recipients/count` | Count by status | `status` | integer | `Recipients.php::count` |
| GET | `/api/v2/recipients/tags` | Tag list | — | `string[]` (distinct tag names) | `Recipients.php::tags` |
| POST | `/api/v2/recipients` | Create contact | multipart: `FirstName, LastName, Phone, EmailAddress, Image, Tags, CustomField, Birthday, Anniversary, OptIn, ConversationID` | `{ id }` (201) | `Recipients.php::create` |
| POST | `/api/v2/recipients/update/:id` | Update contact | multipart: same fields | 200 updated | `Recipients.php::update` |
| DELETE | `/api/v2/recipients` | Soft-delete | `ids[]` or `all=true` | 200 deleted | `Recipients.php::delete` |
| POST | `/api/v2/recipients/activate` | Bulk activate | `ids[]` | `{ message }` | `Recipients.php::activate` |
| POST | `/api/v2/recipients/deactivate` | Bulk deactivate | `ids[]` | 200 | `Recipients.php::deactivate` |
| POST | `/api/v2/recipients/upload` | **Legacy** synchronous CSV upload | `csv[], OptIn, UpdateData, KeepEmail, KeepPhone, MakeInactive` | `{ errors, updated, inserted, failed, failed_file }` | `Recipients.php::csvUpload` |
| GET | `/api/v2/recipients/export` | Export contacts xlsx | `status` | xlsx stream | `Recipients.php::export` |
| GET | `/api/v2/recipients/activity/:id` | Flat activity + pipelines | `page, perpage, sort(ActivityDate\|CampaignName), dir` | `{ data[], total, page, pages, perpage, meta, contact, pipelines[] }` | `Recipients.php::activity` |
| GET | `/api/v2/recipients/activity/:id/grouped` | Day-grouped activity | `page, perpage` | `{ days[], total, page, pages, perpage, meta, contact }` | `Recipients.php::activityGrouped` |
| GET | `/api/v2/recipients/imports` | List imports | `page` | `{ page, pages, data[] }` | `ContactImports.php::index` |
| POST | `/api/v2/recipients/imports/upload` | **Async** CSV upload | multipart: `File(.csv), Name(unique), fields{}, OptIn, KeepEmail, KeepPhone, UpdateData, MakeInactive` | 201 created | `ContactImports.php::upload` |
| GET | `/api/v2/recipients/imports/:id/contacts` | Import rows (DynamoDB) | `type(imported\|duplicated\|failed), query, key, searchKey(FirstName\|LastName\|EmailAddress\|Phone)` | `{ import{name,total,imported,duplicated,failed}, data[], key }` | `ContactImports.php::contacts` |
| GET | `/api/v2/recipients/imports/:id/export` | Export import rows xlsx | `type` | xlsx stream | `ContactImports.php::export` |
| — | (profile) `POST /api/v2/profiles/pause-campaigns`, `/resume-campaigns`, `/save-settings`, `GET /profiles/me` | Pause/resume/auto-activate config | — | — | Profiles controller (Settings domain) |

- **v1 models / tables:** `RecipientModel` → `invite_recipient`; `ContactImportModel` → `contact_imports`; `ActivityModel` → `invite_funnel_activity` (joined to `invite_tracker`, `invite_campaign`, `invite_scheduler` for pipelines). Import per-row detail lives in **DynamoDB** (`config('Keys')->awsContactsDynamoTable`).
- **Pagination / filtering / sorting:** list uses page/perpage offset pagination; `getRecipientsPaginated` searches `FirstName/LastName/CONCAT names/Phone/EmailAddress/Tags`, filters `Status != 'Deleted'` for `All`, applies `CreateDate >=` cutoff for date range, and computes `LastActivity` via a correlated subquery. Import rows use DynamoDB cursor (`key`) pagination, not offset.

## 5. Business rules

- **Tenancy:** every read/write is scoped to `profile_id` from the auth token; ownership re-checked (`checkRecipientOwner`) before bulk activate/deactivate/delete.
- **Required identity:** a contact must have **First or Last name** AND **Phone or Email** (`required_when_empty` rules). Phone is normalized to digits only (`preg_replace('/[^0-9]/','')`) and validated `numeric`.
- **Uniqueness:** within a profile, Phone and Email must be unique among non-deleted contacts (`checkRecipientPhone` / `checkRecipientEmail`) — both on create and update.
- **Tag normalization:** tags are stored as a **comma-separated string** on the recipient row, normalized to lowercase, trimmed, deduped (`normalizeTags`).
- **Blacklist / opt-out:** if an email fails `blacklist_validation`, the contact is forced `OptIn=false` and tagged `invalid`. SendGrid bounces (`bouncedRecipients`) set Status=Inactive, OptIn=0, tag `Bounced`, blacklist the email, and unschedule.
- **Statuses:** `Pending` (new), `Active` (enrolled, scheduled), `Inactive` (deactivated), `Deleted` (soft-delete — never hard-deleted). Created contacts start `Pending`; CSV imports start `Inactive` if `MakeInactive`, else `Pending`.
- **Activation side-effects:** activating sets Status=Active + `ActivationDate=now`, cancels any pending schedules, then re-schedules matching active campaigns. Scheduling honours campaign `Target`/`Exclude` tags and `Delay`, and uses **profile timezone + daily activation time** (`calculateScheduledDate`) — if Delay=0 and time already passed today, pushes to tomorrow. Requires `OptIn=1`; SMS campaigns only schedule when profile has SMS number/SID/token.
- **Deactivation:** sets Status=Inactive and unschedules all pending sends. Delete sets Status=Deleted, fires `recipient_deleted` event, and unschedules.
- **Auto-activation (profile config):** a daily job activates up to `AutoActivateLimit` (max 500) inactive contacts at `TimeActivateRecipients` when `AutoActivateRecipients` is on. Auto-deactivation on open/click/clickthrough is driven by `DeactivateRecipientsOn*` flags (tracked in `ActivityModel::track`).
- **Pause/Resume:** profile-level `CampaignsPaused` halts pending scheduled sends without changing contact status; distinct from turning off auto-activate.
- **Events fired:** `recipient_edited` (create/update), `recipient_deleted` (delete).
- **Two CSV ingestion paths (parity-sensitive):**
  1. **Legacy synchronous** `POST /recipients/upload` (`uploadCsv`) — parses rows in PHP, validates, dedupes, optionally enriches existing contacts (`enrichRecipient` = union tags, fill empty birthday/anniversary/note), `insertBatch`; returns counts + a CSV of failures. Requires at least one of KeepEmail/KeepPhone and `OptIn=1`.
  2. **Async** `POST /recipients/imports/upload` — splits the CSV into **10,000-row chunks**, inserts a `contact_imports` row per chunk, uploads each chunk to S3 with metadata (`ProfileID, ImportID, OptIn, KeepEmail, KeepPhone, UpdateData, MakeInactive, Fields`). S3 event triggers the **`process-contacts-uploads` Python Lambda**, which: marks the import `in-progress`, detects encoding, validates each row, enriches duplicates when `UpdateData`, inserts valid contacts into `invite_recipient`, writes **every row** (imported/duplicated/failed + Errors) into DynamoDB, then updates `contact_imports` with `ImportedCount/DuplicateCount/FailedCount` and Status=`completed` (or `failed` on exception).
- **Activity de-dup:** repeated email "open" pixel hits for the same `TrackerID` within 10 minutes collapse into one recorded activity (Apple/Gmail proxy refetch guard).

## 6. Integrations

- **AWS S3** — async import chunks uploaded with metadata (`AwsS3::uploadFile`); bucket S3-event triggers the Lambda.
- **AWS Lambda (`process-contacts-uploads`, Python)** — consumes S3 events, reads CSV, writes contacts to MySQL via RDS proxy + per-row results to DynamoDB, updates `contact_imports` counts/status. DB credentials from Secrets Manager (`PortalDBCredentials`).
- **AWS DynamoDB** (`awsContactsDynamoTable`) — stores per-row import outcomes for the import-detail page + xlsx export.
- **SendGrid** — bounce webhooks feed `bouncedRecipients` (deactivate + blacklist + tag).
- **PhpSpreadsheet** — server-side xlsx generation for contact export and import-row export.
- **Local media disk** — contact photos stored at `FCPATH/assets/media/uploads/recipients/`, served as `uploads/recipients/{Image}`.
- No Twilio/Stripe/Square/Google/Meta in this domain directly (campaign scheduling touches Twilio SMS via the Campaigns domain).

## 7. v1 → v2 mapping

- **Module:** `apps/api/src/modules/contacts` — `ContactsController` (CRUD, bulk actions, tags, activity), `ContactImportsController`, `ContactsService`, `ContactsRepository`, DTOs (validated via class-validator / OpenAPI). Activity timeline read model lives here or in a shared `funnel` module.
- **Drizzle tables (`@oggvo/db`, already scaffolded in `schema/contacts.ts`):**
  - `contacts` — `id, profileId, email, phone, firstName, lastName, optIn, status, source, birthday, anniversary, image, customFields(jsonb, default {}), sentCount, lastSentAt, activatedAt, timestamps (incl. deletedAt soft-delete)`. v1 `CustomField` (single Note) → `customFields` JSONB key. v1 `Tags` CSV → relational tables below.
  - `contact_tags` — per-profile tag catalog (`profileId, name`, unique per profile).
  - `contact_tag_assignments` — M:N `(contactId, tagId)`.
  - `contact_imports` — `name, totalCount, importedCount, duplicateCount, failedCount, fileSize, status(queued/in_progress/completed/failed)`.
- **Queue:** `contacts-import` (BullMQ) — replaces the S3→Lambda path. A worker job validates rows, upserts/enriches contacts, records per-row outcomes, and updates `contact_imports`. Chunking handled by job batching rather than file splitting.
- **Frontend:** v2 routes under `apps/web/app/(portal)/contacts/` — `page.tsx` (list), `new/page.tsx`, `[id]/page.tsx`, `settings/page.tsx`, `imports/page.tsx`, `imports/[id]/page.tsx`. Reuse `@oggvo/ui` table, badge, modal, combobox (tags), date-picker, switch.
- **Endpoint mapping (RESTful, typed via OpenAPI):**
  - `GET /recipients` → `GET /contacts`
  - `GET /recipients/:id` → `GET /contacts/:id`
  - `POST /recipients` → `POST /contacts`
  - `POST /recipients/update/:id` → `PATCH /contacts/:id`
  - `DELETE /recipients` (ids/all) → `DELETE /contacts` (body `{ ids[] }`) + `DELETE /contacts?all=true`
  - `POST /recipients/activate|deactivate` → `POST /contacts/activate` / `POST /contacts/deactivate`
  - `GET /recipients/count` → `GET /contacts/count`
  - `GET /recipients/tags` → `GET /contacts/tags`
  - `GET /recipients/activity/:id[/grouped]` → `GET /contacts/:id/activity` (+`?grouped=true`)
  - `GET /recipients/export` → `GET /contacts/export`
  - `GET /recipients/imports` → `GET /contact-imports`
  - `POST /recipients/imports/upload` → `POST /contact-imports`
  - `GET /recipients/imports/:id/contacts` → `GET /contact-imports/:id/rows`
  - `GET /recipients/imports/:id/export` → `GET /contact-imports/:id/export`
- **Known v1 bugs / debt to fix:**
  - `LastActivity` computed via a per-row correlated subquery → N+1/expensive; replace with a joined/denormalized last-activity column or read model.
  - Two divergent CSV code paths (sync PHP vs async Lambda) with duplicated validation/enrich logic → unify into one worker job.
  - Contact photos on local disk → move to S3/media module.
  - `contact_imports.Name` global-ish uniqueness check is awkward — scope uniqueness per profile or drop.
  - Mixed timezone handling (`America/Los_Angeles` hardcoded in `ActivityModel::track`) → use per-profile timezone consistently.
  - `keep_email = metadata['keepphone']` bug in the Lambda (reads keepphone for email) — fix in the rebuild.

## 8. Open questions / parity risks

- **Status enum mismatch (schema gap):** v1 statuses are `Active / Pending / Inactive / Deleted` (varchar), but the v2 `contact_status` enum is `pending / activated / bounced / unsubscribed / suppressed`. There is no `active`/`inactive`/`deleted` value. Mapping needed: `Active→activated`, `Pending→pending`, `Deleted→` soft-delete via `deletedAt`, and **`Inactive` has no clear target** (manually deactivated vs bounced vs suppressed). The "Restart" action and the list's Inactive tab depend on resolving this.
- **Import-row detail has no v2 home (schema gap):** the per-row imported/duplicated/failed records (with error reasons) live only in DynamoDB. v2 `contact_imports` stores counts but no row detail. The import-detail page + export need either a `contact_import_rows` table or a JSONB/object-store equivalent — not yet in the schema.
- **CustomField → customFields:** v1 only ever uses a single free-text "Note". v2 `customFields` is JSONB (designed for arbitrary custom fields). Migration should map the Note into a known key (e.g. `note`); the create/edit UI must decide whether to expose structured custom fields or keep a single note.
- **Tags migration:** v1 CSV string → normalized `contact_tags` + `contact_tag_assignments`. Migration must split, lowercase, dedupe, and create the catalog; preserve the implicit `invalid`/`Bounced`/`LionDesk` system tags. Decide whether those become real tags or status fields.
- **Profile-level coupling:** Pause/Resume, auto-activate (`AutoActivateRecipients/Limit/Time`), and auto-deactivate flags live on the profile and are surfaced on Contacts pages but belong to Settings/Campaigns. Confirm which v2 module owns them and how the contacts UI reads them.
- **Legacy `/recipients/upload`:** confirm whether the synchronous path is still used anywhere (mobile?) or can be dropped entirely in favour of the queued import.
- **`source` mapping:** v1 `Source` is a free string (`Upload`, `LionDesk`, the creating UserID, etc.); v2 `contact_source` enum is `manual/csv_import/api/widget`. The creator's UserID and partner integrations (LionDesk) don't map cleanly — needs a `createdByUserId` field and an integration-source convention.
- **`with_phone_number=1` expand mode:** the list endpoint has a special "expand" pagination mode (returns `limit*page`) used by some caller (likely SMS recipient picker) — verify the consumer so the v2 API keeps that affordance.
- **Date `0000-00-00` legacy values** for Birthday/Anniversary must be coerced to NULL during migration (already handled defensively in v1).
