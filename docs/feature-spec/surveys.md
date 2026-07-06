# Surveys

> **v2 target:** module `apps/api/src/modules/surveys` · tables `surveys`, `survey_questions`, `survey_answers`, `survey_tracking`, `survey_tracking_actions`, `survey_style` (`@oggvo/db`) · queue `—` (no async jobs; completion notification is synchronous best-effort) · build phase 3
> **v1 sources:** frontend `apps/portal-frontend/pages/surveys/{index,[id]/index,[id]/edit,[id]/responses,[id]/activity}.vue`; store `store/survey.js`; composables `composables/useSurvey.js`, `composables/useSurveyAnswer.js`; components `components/Survey/*` (Editor, Editor/Fields/*, Editor/Menu/{Index,Tabs/{Pages,Questions,Logic,Design}}, Welcome/Thankyou/QuestionCard, ShareCard/InviteCard, CreateModal/DuplicateModal/DeleteModal/ToggleStatusModal/SettingsModal, ResponseColumn, DetailsPageHeader); API `app/Controllers/API/V2/Surveys/{Surveys,Questions}.php`, public `app/Controllers/Web/Surveys.php`; models `app/Models/{SurveyModel,SurveyQuestionModel,SurveyAnswerModel,SurveyTrackingModel,SurveyTrackingActionModel,SurveyStyleModel}.php`

## 1. Overview
The Surveys domain lets a profile build branded, multi-step surveys, publish them at a public hosted URL (`/s/:slug`), collect and tabulate responses, and track per-respondent engagement. A drag-and-drop builder composes a Welcome page → ordered question pages → Thank-You page, each question being one of 13 typed fields (Name, Email, Phone, Address, Website, ShortText, LongText, RankingScale, StarRating, MultipleChoice, YesNo, DateTime, FileUpload). Surveys are themed (font, six colors, logo, background image) and can be activated/deactivated, duplicated, and deleted. Respondents take the survey on a public SSR page that records tracking sessions and granular actions (Opened/Started/Answered Question #N/Completed); the owner sees aggregate result charts (Overview), a tabular response grid with XLSX export (Responses), and a per-recipient engagement log (Activity). Invitations push the survey to existing contacts via SMS/Email by spinning up a tagged campaign. Available to any authenticated portal user, scoped to `profile_id` from the JWT auth context; the public survey-taking page is unauthenticated.

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/surveys` | `pages/surveys/index.vue` | default (portal) | — (list + status filter) | authed, scoped to `profile_id` |
| `/surveys/:id` | `pages/surveys/[id]/index.vue` | default | Overview / Responses tab nav (Activity tab is built but commented out) | authed; `id` must be digits (`validate`) |
| `/surveys/:id/edit` | `pages/surveys/[id]/edit.vue` | full-screen builder | builder side-menu tabs: Pages, Questions, Design (Logic tab built but commented out) | authed; `id` digits |
| `/surveys/:id/responses` | `pages/surveys/[id]/responses.vue` | default | — | authed; `id` digits |
| `/surveys/:id/activity` | `pages/surveys/[id]/activity.vue` | default | — (route exists; not linked from tab nav) | authed; `id` digits |
| `/s/:slug` (public) | v1 served via `Web/Surveys.php` (Nuxt public page consumes it) | public/minimal | Welcome → questions → Thank-You steps; `?demo=true`, `?id=<trackingCode>` query | unauthenticated; survey must have `Status=1` (active) |

## 3. Screen-by-screen

### `/surveys` — Survey list
![index](_assets/screens/surveys/index.png) <!-- placeholder until captured -->
- **Purpose & layout** — paginated table of the profile's surveys with a search box, a Status filter popover, and a "New Survey" action (`SurveyCreateModal`). Each row links to the survey Overview.
- **Elements / fields:**
  - Search input (`query`, debounced 250ms) — resets `page` to 1 on input.
  - Status filter popover — checkboxes `1=Active`, `0=Paused`; badge shows count of applied filters.
  - Table columns: **Title + Description** (links to `/surveys/:id`), **SentCount** ("Sent"), **StartedCount** ("Responses"), **CompletionRate %** ("Completion"), **Status** badge (green "Active" / red "Inactive"), **row actions Dropdown**.
  - Row Dropdown actions: Overview (link `/surveys/:id`), Edit Design (link `/surveys/:id/edit`), Duplicate (opens `SurveyDuplicateModal`), Activate/Deactivate (opens `SurveyToggleStatusModal`, label toggles on `Status`), Delete (opens `SurveyDeleteModal`, red).
- **States** — loading: 5 animated skeleton rows; empty: ClipboardIcon + "No Surveys / Get started by adding a new survey" + inline `SurveyCreateModal`; paginated via `Pagination` (10/page).
- **Modals / drawers:**
  - **SurveyCreateModal** — fields `title` (required), `description` (optional); POST `/surveys/create`; on success navigates to the new survey's edit page.
  - **SurveyDuplicateModal** — fields `id` (the survey), optional new `title`/`description`; POST `/surveys/duplicate`.
  - **SurveyDeleteModal** — confirm; DELETE `/surveys/:id`; emits `refresh`.
  - **SurveyToggleStatusModal** — confirm; POST `/surveys/:id/(activate|deactivate)`; emits `refresh`.
- **Interactions** — search + status filter re-fetch via `useLazyAsyncData` watching `params`.

### `/surveys/:id` — Overview (results)
![overview](_assets/screens/surveys/overview.png) <!-- placeholder until captured -->
- **Purpose & layout** — survey title/description header with tab nav (`SurveyDetailsPageHeader`), a date-range filter, a summary stats strip, and a per-question results list with charts; right sidebar holds a Share card.
- **Elements / fields:**
  - `InlineDateRange` filter → re-fetches `overview` with `start_date`/`end_date` (note: v1 maps UI `dateRange.end → start_date`, `dateRange.start → end_date` — swapped, see Open Questions).
  - Stats strip: **Views** (`ViewsCount`), **Started** (`StartedCount`), **Completed** (`CompletedCount`), **Abandoned** (`StartedCount - CompletedCount`), **Completion Rate %** (`FLOOR(Completed*100/Started)`).
  - Per-question cards (ordered): index badge, question text, Type label. For aggregable types (**MultipleChoice, DateTime, YesNo, StarRating, RankingScale**) renders a per-option breakdown with `votes`, `rate %`, and a `ProgressBar`; StarRating renders ⭐ repeated by value. For non-aggregable types renders a plain "N responses" count.
  - **SurveyShareCard** — copy/share the public `Url` (`app_url('s/'+Slug)`). (`SurveyInviteCard` exists but is commented out on this page.)
- **States** — loading: 5 animated skeleton cards; empty: QuestionMarkCircleIcon + "No Questions" + "Edit Survey" button; on fetch failure redirects to `/surveys` with an error notify.

### `/surveys/:id/edit` — Survey builder
![builder](_assets/screens/surveys/builder.png) <!-- placeholder until captured -->
- **Purpose & layout** — full-screen editor. Left: live preview canvas (Welcome / current question / Thank-You rendered with the survey's theme + a `ProgressBar` colored by `ProgressColor`). Right: tabbed side-menu (`SurveyEditorMenu`). Header has Settings, Preview (opens `/s/:slug?demo=true` in new tab), and Save (disabled unless `isDirty`). State lives in Pinia store `useSurveyStore` (`store/survey.js`); leaving with unsaved changes triggers a `ConfirmModal` and a `beforeunload` guard.
- **Elements / tabs (`Editor/Menu/Index.vue`):**
  - **Pages tab** (`Tabs/Pages.vue`) — Welcome Page button, sortable list of question pages (drag handle reorders → POST `/questions/order`), Thank-You Page button. Each page row has a Dropdown: Duplicate (POST `/questions/duplicate`) and Delete (DELETE `/questions/:qid`, optimistic splice + rollback on error). `SurveyEditorQuestionPicker` adds a new question (POST `/questions` with default Type props from `useSurveyQuestions`). Keyboard: ArrowLeft/Right navigate pages, Delete removes the selected question. Welcome/Thankyou `Enabled` checkboxes are hidden but bound.
  - **Questions tab** (`Tabs/Questions.vue`) — context panel for the selected page:
    - *Welcome page*: `Title`, `Description` (textarea), `ButtonText` (Start button text, max 40 chars).
    - *Thank-You page*: `Title`, `Description`, `Redirect` URL, `Seconds` (QuantityInput 0–30) auto-redirect delay.
    - *Question*: `Type` (read-only select), `Required` radio (Required/Optional), then type-specific Options:
      - **StarRating** — shape (star), per-star `label1..5` + `color1..5` color pickers.
      - **RankingScale** — `start`/`end` (1–10, constrained), `variant` (square/rectangle).
      - **MultipleChoice** — editable `choices[]` (add/remove), `min`/`max` selects (bounded by choice count).
      - **LongText** — `rows` (QuantityInput 3–10).
      - **showInputLabel** toggle (Name/Email/Phone/Address/Website).
      - **Address** — checkboxes: line1, line2, city, state, zipCode, country.
      - **YesNo** — `showLabel`, `showThumbs` checkboxes.
      - **DateTime** — `date`, `time` checkboxes.
  - **Design tab** (`Tabs/Design.vue`) — `Font` select (from `useFonts`); color pickers + hex text inputs for `QuestionColor`, `BodyColor`, `ButtonColor`, `ButtonTextColor`, `BackgroundColor`, `ProgressColor`; `BackgroundImage` and `Logo` uploaders (PNG/JPG/GIF, with Remove buttons + Blob preview).
  - **Logic tab** (`Tabs/Logic.vue`, currently commented out in the menu) — "Setup Flow" modal: per-question branching where each question's `Options.Flow` keys (e.g. `1..10`, `yes`/`no`) map to a target question ID ("Go to Page N"). Applied via the standard Save. Branching data is persisted in `Options.Flow` but the public renderer does not yet consume it (see Open Questions).
- **Question field components** (`Editor/Fields/*`): Name, Email, Phone, Address, Website, ShortText, LongText, RankingScale, StarRating, MultipleChoice, YesNo, DateTime, FileUpload, plus `NavButtons`.
- **Save** — POST `/surveys/:id` as `multipart/form-data` (`surveyToFormData`): survey fields (`Title`, `Description`, `Status`), all style fields (incl. `Logo`/`BackgroundImage` File objects), `Welcome[*]`, `Thankyou[*]`, and `questions[<ID>][Type|Question|Description|Required|Options...]`. Clears `isDirty` on success.
- **States** — loading spinner; on fetch failure redirects to `/surveys`.
- **Modals** — `SurveySettingsModal` (Status switch, Title, PageTitle, Description; POST `/surveys/:id`); `ConfirmModal` (unsaved-changes guard).

### `/surveys/:id/responses` — Response grid
![responses](_assets/screens/surveys/responses.png) <!-- placeholder until captured -->
- **Purpose & layout** — wide horizontally-scrollable table, one column per question, one row per response session; search, date-range, a collapsed/expanded view toggle, and Export.
- **Elements / fields:** search (`query`, debounced); `DateRangePicker` (`start_date`/`end_date` formatted `YYYY-MM-DD`); collapsed/expanded toggle (collapsed clamps cells to 2 lines); Export button (GET `/surveys/:id/export` as blob → `file-saver` saves `<title>-responses.xlsx`); per-cell rendering via `SurveyResponseColumn` keyed on question Type. (Row-selection checkboxes and bulk actions are stubbed/commented out.)
- **States** — loading skeleton rows; empty: ClipboardDocumentIcon + "No responses" + Refresh; paginated (page size = 10 sessions, `perpage = limit/questionCount`).

### `/surveys/:id/activity` — Engagement log
![activity](_assets/screens/surveys/activity.png) <!-- placeholder until captured -->
- **Purpose & layout** — table of tracking actions joined to the invited recipient: **Recipient** (FullName + Phone, "Unknown" if anonymous), **Status** (the action string), **Date** (`created_at`, shown in user timezone). Search by recipient name/phone; Filters popover with statuses `Opened, Started, Answered, Completed`; `DateRangePicker`.
- **States** — loading skeleton; empty: ClipboardDocumentListIcon + "No activity" + Refresh; paginated (10/page). On fetch failure redirects to `/surveys`.

### `/s/:slug` — Public survey page (SSR)
![public](_assets/screens/surveys/public.png) <!-- placeholder until captured -->
- **Purpose & layout** — themed public survey. Renders Welcome (if `Welcome.Enabled`) → question steps (one per page, `ProgressBar`) → Thank-You (optional auto-redirect after `Seconds`). Loads its custom Google font via `<Link>`. Submissions go to `Web/Surveys.php::submit`.
- **Modes** — `?demo=true` (preview from builder) and `editor` mode short-circuit submission via `useSurveyAnswer.js` (data not saved, info notify). `?id=<trackingCode>` resumes/continues an existing session at its `Step`.
- **Tracking** — page load (`show`) creates/continues a tracker, logs `Opened`, increments `ViewsCount`; a separate `track` endpoint logs Opened/Started/Completed and bumps counters.
- **Per-type submission inputs** — Name (First/Last), Email, Phone (US format), Address (line1/line2/city/state/zipCode/country), Website (valid URL), ShortText/LongText (Content), RankingScale (1–10), StarRating (1–5), YesNo (Yes/No), DateTime (`Y-m-d H:i`), MultipleChoice (Choices[] enforcing min/max), FileUpload (multiple files).
- **States** — survey not found / inactive → 404 (`Status=0` is treated as not found).

## 4. Data & API

### Authenticated API (`/api/v2/surveys`, filter `apiAuth`, namespace `App\Controllers\API\V2\Surveys`)

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/surveys/` | List surveys | `page`, `query`, `status[]` (`0`/`1`) | `{total, perpage, pages, data:[{ID,Title,Description,Status,SentCount,StartedCount,CompletedCount,CompletionRate}]}` | `Surveys.php::index` |
| GET | `/surveys/:id` | Full survey + questions + style (for builder) | — | `{ID,Title,PageTitle,Description,Slug,Status,Welcome,Thankyou,style:{Font,...,BackgroundImage,Logo},questions:[{ID,Question,Description,Type,Required(bool),Options,Order}]}` | `Surveys.php::survey` |
| GET | `/surveys/:id/overview` | Results with per-question aggregates | `start_date`,`end_date` (Y-m-d) | `{ID,Title,Slug,Description,ViewsCount,StartedCount,CompletedCount,Abandoned,CompletionRate,Url,questions:[{...,Answers}]}` | `Surveys.php::overview` |
| GET | `/surveys/:id/activity` | Per-recipient action log | `page`,`query`,`status[]`(Opened/Started/Answered/Completed),`start_date`,`end_date` | `{ID,Title,Description,total,perpage,page,pages,data:[{ID,SurveyID,RecipientID,FullName,Phone,Action,created_at}]}` | `Surveys.php::activity` |
| GET | `/surveys/:id/responses` | Tabular responses | `page`,`query`,`start_date`,`end_date` | `{ID,Title,Description,page,perpage,pages,questions:[{ID,Question,Type}],responses:[{<questionId>:<answerJson>}]}` | `Surveys.php::responses` |
| GET | `/surveys/:id/export` | XLSX export of all responses | — | binary `.xlsx` (`PhpSpreadsheet`) | `Surveys.php::export` |
| POST | `/surveys/create` | Create survey + default style | `title`(req),`description` | `201 {id}` | `Surveys.php::create` |
| POST | `/surveys/:id` | Update survey + style + questions | `multipart`: `Title`(req),`PageTitle`,`Description`,`Status`(0/1),`Font`,`QuestionColor`/`BodyColor`/`ButtonColor`/`ButtonTextColor`/`BackgroundColor`/`ProgressColor`(`#hex6` req),`Logo`/`BackgroundImage`(file),`Welcome[*]`,`Thankyou[*]`,`questions[<id>][*]` | `200` updated | `Surveys.php::update` |
| POST | `/surveys/duplicate` | Clone survey + style + questions | `id`(req),`title`,`description` | `201 {id}` | `Surveys.php::duplicate` |
| DELETE | `/surveys/:id` | Delete survey + cascade | — | `200` deleted | `Surveys.php::delete` |
| POST | `/surveys/:id/(activate\|deactivate)` | Toggle Status | path segment | `200` updated | `Surveys.php::toggleStatus` |
| GET | `/surveys/recipients` | Contacts for invite picker | `page`,`query`,`tags[]` | `{total,perpage,pages,tags,data:[{ID,FullName,EmailAddress,Phone,Image,Tags[]}]}` | `Surveys.php::recipients` |
| POST | `/surveys/:id/invite` | Invite contacts via campaign | `recipients[]`(IDs),`types[]`(`sms`/`email`) | `201` | `Surveys.php::sendInvite` |
| POST | `/surveys/:id/questions` | Add question | `Question`(req),`Description`,`Type`(enum),`Required`(0/1),`Options` | `200 {id}` | `Questions.php::create` |
| POST | `/surveys/:id/questions/:qid` | Update question | same as create | `200` | `Questions.php::update` |
| DELETE | `/surveys/:id/questions/:qid` | Delete + reorder | — | `200` deleted | `Questions.php::delete` |
| POST | `/surveys/:id/questions/order` | Reorder questions | JSON array of question IDs | `200` | `Questions.php::order` |
| POST | `/surveys/:id/questions/duplicate` | Duplicate question (order+1, shift rest) | `id`(req) | `201 {id}` | `Questions.php::duplicate` |

### Public Web API (`/s/:slug`, namespace `App\Controllers\Web`, no auth)

| Method | v1 endpoint | Purpose | Request | Response | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/s/:slug/` | Load survey for taking; create/continue tracker, log Opened, bump ViewsCount | `?id=<trackingCode 32-hex>` (optional) | `{Title,PageTitle,Welcome,Thankyou,style,questions[],Step,tracker_id}` | `Surveys.php::show` |
| GET | `/s/:slug/track` | Log an action + bump counters | `action`(Opened/Started/Completed, req), `id`(trackingCode, optional) | `{id:<trackingCode>}` | `Surveys.php::index` |
| POST | `/s/:slug/submit` | Submit one answer (per question) | `id`(questionId, req),`tracker_id`(32-hex, req) + per-type fields (First/Last, Email, Phone, Line1.., Website, Content, Value, Choices[], files[]) | `201` | `Surveys.php::submit` |

- **v1 models / tables:** `surveys` (SurveyModel), `survey_questions` (SurveyQuestionModel), `survey_answers` (SurveyAnswerModel), `survey_tracking` (SurveyTrackingModel), `survey_tracking_actions` (SurveyTrackingActionModel), `survey_style` (SurveyStyleModel, 1:1). Invite reuses `CampaignModel`, `RecipientModel`; completion notify uses `NotificationModel`. All five core tables use soft deletes (`deleted_at`).
- **Pagination / filtering / sorting:** lists page at 10/page (`page` param, 1-based). List/activity sort `created_at DESC`. Responses paginate by *session* (limit = `10 * questionCount`, grouped by `SurveyTrackingID`). Status filter values: `0`/`1` for surveys, action strings for activity. Date filters are `Y-m-d`, applied as `>= 00:00:00` / `<= 23:59:59`.

## 5. Business rules
- **Slug generation:** create → `bin2hex(random_bytes(7)) . '-' . slugified(lowercased title)`; duplicate → fresh `random_bytes(7)` prefix on the (possibly new) title. Slugs are unique; counters reset to 0 on duplicate.
- **Question types (enum, must stay in sync):** `Name, Email, Phone, Address, Website, ShortText, LongText, RankingScale, StarRating, MultipleChoice, YesNo, DateTime, FileUpload`. `Options` is JSON; defaults per type live in `useSurvey.js::useSurveyQuestions`.
- **Ordering:** new question order = `getLastQuestionOrder + 1`; delete triggers contiguous `reorder`; duplicate inserts at `order+1` and shifts all `>=` up by 1; explicit reorder via array of IDs builds a `CASE` UPDATE.
- **Welcome/Thankyou:** stored as JSON. `Welcome.Enabled`/`Thankyou.Enabled` parsed from string `'true'`. `Thankyou.Seconds` cast to int (default 5). Public step starts at 0 if Welcome enabled else 1.
- **Thank-You redirect normalization (BF-040):** `SurveyModel::normalizeThankyouRedirect` strips the legacy auto-populated `oggvo.com` default (http/https, optional www, optional trailing slash → `''`); genuine custom URLs pass through. Applied on both the admin `survey()` read (and persisted back if it changed) and the public `show()` so respondents never get the removed default.
- **Tracking lifecycle:** a tracker = one response session (`TrackingCode` = `md5(SurveyID + RecipientID + time)`). Actions logged: `Opened Survey`, `Started Survey`, `Answered Question #N`, `Completed Survey`. A new session is spun up if the last action was a Completed (re-taking).
- **Counters & idempotency (BF-011):** `StartedCount` increments + `Started` logged only on the *first* answer to the first question (re-answers update the existing row, so no double count). `CompletedCount` + completion notification fire only the *first* time the last question is answered. Counter bumps in `show()`/`track()` (ViewsCount/StartedCount) are not idempotent — see Open Questions.
- **Completion notification:** on first completion, `NotificationModel::sendSurveyCompletionNotification(profileId, title)` is called best-effort inside try/catch — a notification failure must never fail the respondent's submission/save.
- **Per-type validation (public submit):** Phone = US regex; Email = valid_email; Website = valid_url_strict; RankingScale 1–10; StarRating 1–5; YesNo in `Yes/No`; DateTime `Y-m-d H:i`; MultipleChoice enforces `min`/`max` against the question's option list; required fields enforce non-empty.
- **Uploads:** Logo/BackgroundImage accept `image/png|jpeg|jpg`, stored under `assets/media/uploads/`, filename `md5(time+name).ext`; removing in builder unlinks the old file. Survey answer FileUpload files stored in the same dir; export emits their `app_url`.
- **Invite:** builds a tag `Survey #<ID>`, creates a survey campaign (`CampaignModel::createSurveyCampaign`) for selected `types` (sms/email), and tags the selected recipients (`RecipientModel::tagRecipients`).
- **Delete cascade:** `deleteSurvey` soft-deletes the survey then style, questions, answers (by question IDs), tracking, and tracking actions.
- **Access:** every authed endpoint scopes by `ProfileID = auth.profile_id` and 404s otherwise. Public page requires `Status=1`.

## 6. Integrations
- **Twilio / Email (SendGrid or configured mailer):** survey **invites** flow through the Campaigns subsystem (`CampaignModel::createSurveyCampaign`) which dispatches SMS (Twilio) and/or email to tagged recipients. No survey-specific webhooks.
- **In-app notifications (FCM/notifications table):** survey-completion notification to the owner via `NotificationModel::sendSurveyCompletionNotification` (best-effort, synchronous).
- **PhpSpreadsheet:** XLSX generation for the Responses export (no external service).
- **Google Fonts:** the public page loads the survey's selected font via a `<Link rel="stylesheet">`.
- No Stripe/Square/Meta/Google-API touchpoints in this domain.

## 7. v1 → v2 mapping
- **Module:** `apps/api/src/modules/surveys` — controller (admin CRUD + questions + overview/activity/responses/export/invite), public controller/route for `/s/:slug` (load/track/submit), service (tracking lifecycle, aggregation, export), repository (Drizzle), DTOs typed via OpenAPI. Consider a `surveys-public` sub-controller mirroring v1's Web split.
- **Drizzle tables (`@oggvo/db`, `packages/db/src/schema/surveys.ts`):**
  - `surveys` — note shape changes: `active: boolean` replaces v1 `Status` (`0/1` string); `welcome`/`thankyou` are `jsonb`; camelCase columns (`profile_id`, `page_title`, `views_count`, `sent_count`, `started_count`, `completed_count`). `pageTitle` is `notNull` in v2 (v1 nullable).
  - `survey_questions` — `type` uses `surveyQuestionTypeEnum` (lowercase enum values in `_enums.ts`; v1 stores TitleCase strings — **map case during migration**); `required: boolean`; `options: jsonb`; `order: integer`.
  - `survey_tracking` — `recipientId` now FKs `contacts.id` (v1 `RecipientID` → `invite_recipient`); `trackingCode` unique; `step` default 0.
  - `survey_answers` — `answer: jsonb` notNull; FKs `question_id`, `survey_tracking_id`.
  - `survey_tracking_actions` — `action: varchar(255)`; FK `survey_tracking_id`.
  - `survey_style` — `surveyId` is the **primary key** (true 1:1; v1 had its own `ID`). Default `progressColor` is `#2E90FA` in v2 vs `#175CD3` created by v1 controller — reconcile.
- **Queue:** `—` (no async jobs). Invites delegate to the campaigns module/queue; completion notification stays synchronous best-effort (or could be enqueued to a notifications queue in v2).
- **Frontend:** v2 routes under `apps/web/app/(portal)/surveys/{page,[id]/page,[id]/edit/page,[id]/responses/page,[id]/activity/page}` and public `apps/web/app/(public)/s/[slug]/page.tsx` (SSR). Reuse `@oggvo/ui` for table, pagination, modals (themed confirm modal per memory — no native `confirm()`), date-range picker, color picker, file upload, charts/progress bars.
- **Endpoint mapping (RESTful, typed via OpenAPI):**
  - `GET /surveys/` → `GET /surveys` (query `page,q,status`)
  - `GET /surveys/:id` → `GET /surveys/:id` (builder payload)
  - `GET /surveys/:id/overview` → `GET /surveys/:id/results`
  - `GET /surveys/:id/activity` → `GET /surveys/:id/activity`
  - `GET /surveys/:id/responses` → `GET /surveys/:id/responses`
  - `GET /surveys/:id/export` → `GET /surveys/:id/export`
  - `POST /surveys/create` → `POST /surveys`
  - `POST /surveys/:id` → `PATCH /surveys/:id` (split style/questions into sub-resources)
  - `POST /surveys/duplicate` → `POST /surveys/:id/duplicate`
  - `DELETE /surveys/:id` → `DELETE /surveys/:id`
  - `POST /surveys/:id/(de)activate` → `PATCH /surveys/:id` `{active}` (or `POST /surveys/:id/status`)
  - `GET /surveys/recipients` → `GET /contacts` (reuse) or `GET /surveys/invite/contacts`
  - `POST /surveys/:id/invite` → `POST /surveys/:id/invite`
  - questions CRUD/order/duplicate → `POST/PATCH/DELETE /surveys/:id/questions[/:qid]`, `PUT /surveys/:id/questions/order`, `POST /surveys/:id/questions/:qid/duplicate`
  - public → `GET /public/s/:slug`, `POST /public/s/:slug/track`, `POST /public/s/:slug/submit`
- **Known v1 bugs to fix:**
  - **Overview date-range swap:** the page sends `start_date = dateRange.end` and `end_date = dateRange.start` — wired backwards; verify and fix in v2.
  - **Double ViewsCount bump:** public `show()` increments `ViewsCount` twice in the anonymous branch (once mid-method, once at the end) — fix to a single, idempotent count.
  - **Branching/Logic not consumed:** `Options.Flow` is editable + persisted but the public renderer ignores it (linear stepping); either implement branching or remove the dead Logic tab.
  - **N+1 / heavy reads:** `overview` and `responses` load all answers then aggregate in PHP; responses uses a compiled subquery join — port to set-based SQL/Drizzle with proper indexes.
  - **Question type case mismatch:** v1 TitleCase vs v2 lowercase enum — handle in migration + API serialization.
  - **`getStats` MultipleChoice `$total`** is recomputed per-answer (`array_sum(array_map('count', $answers))`) inside the loop — inefficient and brittle; recompute once in v2.
  - **`getLastQuestionOrder` default returns 1** (not 0) for an empty survey, so the first question gets order 2 — normalize ordering to start at 1 cleanly.

## 8. Open questions / parity risks
- **Activity tab visibility:** the route `/surveys/:id/activity` exists and is fully built, but `DetailsPageHeader` and the Logic builder tab are commented out. Decide whether v2 ships Activity + Logic or drops them (schema supports both).
- **Branching semantics:** `Flow` keys differ by type (`1..N` for scales, `yes`/`no` for YesNo) and values are target question IDs — confirm intended runtime behavior before implementing, since v1 never executed it.
- **Counter idempotency on Views/Started:** v1 bumps counters in multiple places (`show`, `track`, `saveAnswer`); define a single source of truth in v2 to avoid inflated metrics.
- **`survey_style` defaults drift:** v1 controller seeds `ProgressColor=#175CD3` on create but the store/schema default is `#2E90FA` — pick one.
- **Demo/editor mode parity:** the public renderer's `?demo=true` short-circuit (no save) must be reproduced so the builder Preview doesn't pollute real tracking/answers.
- **Soft-delete + unique slug:** v2 `slug` is `unique` but rows are soft-deleted — a deleted survey's slug could block reuse; confirm partial-unique-index strategy.
- **File storage:** v1 stores uploads on local disk (`assets/media/uploads`); v2 likely moves to object storage (S3/`@oggvo` media module) — answer FileUpload + Logo/Background need a storage home and the export must emit correct URLs.
- **Invite coupling to Campaigns:** invite reuses `CampaignModel`/`RecipientModel`; v2 must define the cross-module contract (surveys → campaigns) and whether `SentCount` is updated by the campaign send (v1 never increments `SentCount` from invite — possible gap).
