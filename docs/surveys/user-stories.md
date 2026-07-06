# Surveys — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/surveys.md`](../feature-spec/surveys.md).
> v2 target: module `apps/api/src/modules/surveys` · tables `surveys`, `survey_questions`,
> `survey_answers`, `survey_tracking`, `survey_tracking_actions`, `survey_style` (`@oggvo/db`) ·
> queue `—` (no async jobs; invites delegate to the campaigns queue, completion notify is synchronous
> best-effort) · build phase 3.
>
> Companion docs: [activity-diagrams.md](./activity-diagrams.md) (flow diagrams) ·
> [../design-system/README.md](../design-system/README.md) (UI) · mockups in
> [../design-system/mockups/](../design-system/mockups/) (`surveys-list.html`, `survey-builder.html`,
> `survey-results.html`, `survey-public.html`).

**Personas**
- **Operator** — the everyday authenticated portal user of a profile (business owner / staff) who builds
  surveys, publishes them, invites contacts, and reads results. All stories are this persona unless noted.
- **Respondent** — an unauthenticated visitor taking a published survey on the public page (`/s/:slug`).
- **System** — the platform (API + public web controller + campaigns module + notifications) acting on
  the Operator's or Respondent's behalf.

**Global rules that apply to every story**
- Every authenticated read/write is scoped to the caller's active `profileId` (TenantGuard); a survey not
  owned by the profile 404s. No cross-tenant reads.
- The public survey page is **unauthenticated** and only renders when the survey is **active**
  (`active = true`); an inactive or missing slug returns 404.
- A survey owns exactly one `survey_style` row (1:1, `surveyId` is the PK) plus an ordered set of
  `survey_questions`. Question `type` is the lowercase `surveyQuestionTypeEnum`
  (`name, email, phone, address, website, short_text, long_text, ranking_scale, star_rating,
  multiple_choice, yes_no, date_time, file_upload`).
- Dates/times render in the **profile timezone** (fix-on-rebuild: v1 hardcoded Pacific business hours in
  several subsystems); timestamps are stored UTC.
- Money is irrelevant here; counters (`viewsCount`, `startedCount`, `completedCount`, `sentCount`) are
  integers with a single, idempotent source of truth (fix-on-rebuild: v1 double-bumped views).

---

## Epic E1 — Browse, search & manage the survey list

### US-1.1 — View the surveys list
**As an** Operator **I want** a paginated table of my surveys **so that** I can see everything I've built at a glance.
- **AC1** `GET /surveys` returns non-deleted surveys scoped to my profile, sort `createdAt` desc (recently updated first), page 1, 10/page.
- **AC2** Columns: Name (title + description, links to `/surveys/:id/results`), Type, Responses (`startedCount`), Completion % (`floor(completedCount*100/startedCount)`), Status badge (green Active / gray Inactive), Updated, row-actions dropdown.
- **AC3** Empty state shows a clipboard icon, "No surveys", and a **Create Survey** CTA that opens the create modal.
- **AC4** Loading state shows 5 skeleton rows.
- **AC5** Pagination is numeric + Prev/Next at 10/page.

### US-1.2 — Filter by status
- **AC1** A Status filter popover offers **Active** (`active=true`) and **Paused/Inactive** (`active=false`) checkboxes; the trigger badge shows the count of applied filters.
- **AC2** Applying a filter calls `GET /surveys?status=…` and resets to page 1.

### US-1.3 — Search surveys
**As an** Operator **I want** to search by name **so that** I can find one survey fast.
- **AC1** Search box (placeholder "Search surveys…") is debounced (~250ms); each query resets to page 1 and calls `GET /surveys?q=…`.
- **AC2** Server matches survey title/description.

### US-1.4 — Create a survey
**As an** Operator **I want** to create a survey from a title **so that** I can start building immediately.
- **AC1** The create modal collects `title` (required) and `description` (optional). `POST /surveys`.
- **AC2** On success the System generates a unique `slug`, seeds a default `survey_style` row, and I'm redirected to the builder `/surveys/:id/edit`.
- **AC3** Validation errors render inline; the modal stays open.

### US-1.5 — Duplicate a survey
- **AC1** The row action **Duplicate** opens a modal (optional new title/description) and calls `POST /surveys/:id/duplicate`.
- **AC2** The clone copies style + all questions, gets a **fresh unique slug**, and resets all counters to 0; status starts inactive.

### US-1.6 — Activate / deactivate a survey
**As an** Operator **I want** to toggle a survey live or paused **so that** I control when it accepts responses.
- **AC1** The row action label toggles on current status; it calls `PATCH /surveys/:id` `{active}` (or `POST /surveys/:id/status`).
- **AC2** Deactivating makes the public page 404 for new respondents; existing in-flight sessions are not destroyed but cannot submit.

### US-1.7 — Delete a survey
- **AC1** Delete requires a themed confirm modal (no native `confirm()` — per design memory). `DELETE /surveys/:id`.
- **AC2** Delete is a **soft-delete cascade**: survey then style, questions, answers, tracking, and tracking actions all set `deletedAt`; the list refreshes.

---

## Epic E2 — Build & design the survey

### US-2.1 — Add, edit & order questions
**As an** Operator **I want** a builder with an ordered question list **so that** I can compose the survey flow.
- **AC1** The builder (`GET /surveys/:id` returns the full builder payload: survey + style + ordered questions + welcome/thankyou) shows a left list of question cards and a right editor panel for the selected question.
- **AC2** **Add question** appends a typed question with defaults at `order = lastOrder + 1` (normalized to start at 1 — fix-on-rebuild). `POST /surveys/:id/questions`.
- **AC3** Editing a question (text, type, options, required switch) calls `PATCH /surveys/:id/questions/:qid`; the editor reflects the selected card.
- **AC4** Dragging a question card by its grip reorders the list and calls `PUT /surveys/:id/questions/order` with the new id array; a toast confirms "Order saved".
- **AC5** Duplicate (`POST /surveys/:id/questions/:qid/duplicate`, inserts at `order+1`, shifts the rest) and Delete (`DELETE /surveys/:id/questions/:qid`, optimistic with rollback + contiguous reorder) are per-card actions.

### US-2.2 — Configure type-specific options
**As an** Operator **I want** per-type option editors **so that** each question captures the right data.
- **AC1** **Multiple-choice**: editable `choices[]` (add/remove) plus `min`/`max` selects bounded by choice count.
- **AC2** **Star rating**: per-star `label1..5` + `color1..5`.
- **AC3** **Ranking scale**: `start`/`end` (1–10) + `variant` (square/rectangle).
- **AC4** **Long text**: `rows` (3–10). **Address**: per-line checkboxes. **Yes/No**: `showLabel` + `showThumbs`. **DateTime**: `date`/`time` checkboxes.
- **AC5** A **Required** switch (on/off) sets `required: boolean` on the question.

### US-2.3 — Edit Welcome & Thank-You pages
- **AC1** The Welcome page edits `title`, `description`, `buttonText` (start button, max 40 chars).
- **AC2** The Thank-You page edits `title`, `description`, `redirect` URL, and `seconds` (0–30) auto-redirect delay.
- **AC3** The legacy auto-populated `oggvo.com` redirect default is stripped on read and never shown to respondents (BF-040).

### US-2.4 — Theme the survey (Design)
**As an** Operator **I want** to brand the survey **so that** it matches my business.
- **AC1** Design edits `font` plus six colors (`questionColor`, `bodyColor`, `buttonColor`, `buttonTextColor`, `backgroundColor`, `progressColor`) each as a color picker + `#hex6` input.
- **AC2** `logo` and `backgroundImage` uploaders accept PNG/JPG/GIF with preview + Remove; replacing removes the previous file (fix-on-rebuild: store in S3/media module, not local disk).

### US-2.5 — Save the builder
- **AC1** **Save** is disabled until something changes (`isDirty`); leaving with unsaved changes warns (confirm modal + `beforeunload`).
- **AC2** Save persists survey fields, style, welcome/thankyou, and questions via the survey/sub-resource PATCH endpoints; success clears the dirty flag.
- **AC3** **Preview** opens the public page in demo mode (`/s/:slug?demo=true`) which never writes tracking/answers.

---

## Epic E3 — Publish, share & invite

### US-3.1 — Share the public link
- **AC1** The results page shows a Share card with the public `Url` (`/s/:slug`) and a copy button; a toast confirms the copy.

### US-3.2 — Invite contacts
**As an** Operator **I want** to push the survey to existing contacts **so that** I can collect targeted responses.
- **AC1** A recipient picker loads contacts (`GET /contacts` or `GET /surveys/invite/contacts`, paginated, tag-filterable).
- **AC2** Invite calls `POST /surveys/:id/invite` with `recipients[]` + `types[]` (`sms`/`email`); the System tags the recipients `Survey #<id>` and spins up a survey campaign through the campaigns module.
- **Open question:** v1 never increments `sentCount` from invite — v2 must define whether the campaign send bumps it.

---

## Epic E4 — Take the survey (public)

### US-4.1 — Open & step through the survey
**As a** Respondent **I want** to take the survey on a clean themed page **so that** I can answer easily.
- **AC1** `GET /public/s/:slug` loads the survey only when active; it renders Welcome (if enabled) → one question per page (with a progress bar) → Thank-You (optional auto-redirect after `seconds`).
- **AC2** Loading the page creates or continues a tracking session, logs `Opened`, and bumps `viewsCount` **once** (fix-on-rebuild: v1 double-bumped).
- **AC3** `?id=<trackingCode>` resumes an existing session at its saved `step`.

### US-4.2 — Submit answers
- **AC1** Each answer posts to `POST /public/s/:slug/submit` with `questionId` + `trackingCode` + per-type fields, validated per type (Email valid, Phone US format, Website URL, RankingScale 1–10, StarRating 1–5, YesNo in Yes/No, DateTime `Y-m-d H:i`, MultipleChoice enforces min/max, required non-empty).
- **AC2** The **first** answer to the first question logs `Started` and increments `startedCount` exactly once; re-answers update the existing row (idempotent — BF-011).
- **AC3** Answering the **last** question the first time logs `Completed`, increments `completedCount` once, and fires the owner completion notification **best-effort** (a notify failure must never fail the respondent's submit).
- **AC4** In demo/editor mode submissions are short-circuited (no save) so builder Preview never pollutes real metrics.

---

## Epic E5 — Read results & responses

### US-5.1 — Results overview with aggregates
**As an** Operator **I want** charted per-question results **so that** I understand responses at a glance.
- **AC1** `GET /surveys/:id/results` returns a stats strip (Views, Started, Completed, Abandoned = started − completed, Completion Rate %) plus per-question aggregates.
- **AC2** Aggregable types (MultipleChoice, DateTime, YesNo, StarRating, RankingScale) render an option breakdown with votes, rate %, and a bar; StarRating shows a rating distribution. Non-aggregable types show a "N responses" count + sample answers.
- **AC3** A date-range filter re-fetches with `start_date`/`end_date` (fix-on-rebuild: v1 sent the range swapped — fix it).
- **AC4** Loading shows 5 skeleton cards; empty shows "No questions" + an Edit Survey button.

### US-5.2 — Response grid + export
- **AC1** `GET /surveys/:id/responses` returns a wide table, one column per question, one row per response session, paginated by session, with search + date-range + collapsed/expanded toggle.
- **AC2** **Export** streams an XLSX of all responses. `GET /surveys/:id/export`.

### US-5.3 — Per-recipient engagement log (Activity)
**As an** Operator **I want** a per-recipient action log **so that** I can see who engaged.
- **AC1** `GET /surveys/:id/activity` lists tracking actions joined to the invited recipient: Recipient (name + phone, "Unknown" if anonymous), Status (action string), Date (profile timezone).
- **AC2** Search by recipient name/phone; a Filters popover offers `Opened/Started/Answered/Completed`; date-range. Paginated 10/page.
- **Open question:** v1 ships the Activity route but comments out its tab nav — decide whether v2 surfaces it.

---

## Cross-cutting acceptance criteria
- **Tenancy:** ownership re-checked before every mutating action; the public page checks `active` only.
- **Slug uniqueness vs soft-delete:** `slug` is unique but rows are soft-deleted — confirm a partial-unique-index strategy so a deleted slug doesn't block reuse.
- **Counter idempotency:** `viewsCount`/`startedCount`/`completedCount` each have one bump site; re-answers and demo mode never inflate metrics.
- **Question type case:** v1 stores TitleCase, v2 stores the lowercase enum — map during migration and in API serialization.
- **Style defaults drift:** reconcile `progressColor` default (`#2E90FA` schema vs `#175CD3` v1 controller) — v2 uses `#2E90FA`.
- **Demo/editor mode:** the public renderer's no-save short-circuit must be reproduced for builder Preview.

## Fix-on-rebuild (v1 bugs — do NOT reproduce)
- Overview date-range params sent **backwards** (`start_date = dateRange.end`) — fix the wiring.
- Public `show()` bumps `viewsCount` **twice** in the anonymous branch — single idempotent count.
- `Options.Flow` branching is editable + persisted but the renderer ignores it (linear stepping) — either implement branching or drop the dead Logic tab.
- `overview`/`responses` load all answers and aggregate in PHP (N+1) — port to set-based Drizzle with indexes.
- `getLastQuestionOrder` returns 1 for an empty survey, so the first question gets order 2 — normalize ordering to start cleanly at 1.
- `getStats` recomputes the MultipleChoice `$total` per answer inside the loop — compute it once.
- OAuth/upload paths storing on local disk — move uploads to object storage; export must emit correct URLs.

## Open questions / parity risks
- **Activity + Logic visibility:** both routes are built but their UI is commented out in v1 — ship or drop in v2.
- **Branching semantics:** `Flow` keys differ by type and values are target question IDs; v1 never executed it — confirm runtime behavior before implementing.
- **Invite ↔ Campaigns contract:** invite reuses the campaigns subsystem; define the surveys→campaigns cross-module contract and whether the send updates `sentCount`.
- **Counter single-source:** v1 bumps counters in `show`, `track`, and `saveAnswer` — pick one source of truth in v2.

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-1.1–1.3 | `GET /surveys` |
| US-1.4 | `POST /surveys` |
| US-1.5 | `POST /surveys/:id/duplicate` |
| US-1.6 | `PATCH /surveys/:id` `{active}` |
| US-1.7 | `DELETE /surveys/:id` |
| US-2.1 | `GET /surveys/:id`, `POST/PATCH/DELETE /surveys/:id/questions[/:qid]`, `PUT /surveys/:id/questions/order`, `POST /surveys/:id/questions/:qid/duplicate` |
| US-2.2–2.5 | `PATCH /surveys/:id` (+ question/style sub-resources) |
| US-3.1 | `GET /surveys/:id/results` (Share `Url`) |
| US-3.2 | `GET /contacts`, `POST /surveys/:id/invite` |
| US-4.1 | `GET /public/s/:slug` |
| US-4.2 | `POST /public/s/:slug/submit` (+ `…/track`) |
| US-5.1 | `GET /surveys/:id/results` |
| US-5.2 | `GET /surveys/:id/responses`, `GET /surveys/:id/export` |
| US-5.3 | `GET /surveys/:id/activity` |
