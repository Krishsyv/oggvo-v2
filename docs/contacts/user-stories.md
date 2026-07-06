# Contacts — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/contacts.md`](../feature-spec/contacts.md).
> v2 target: module `apps/api/src/modules/contacts` · tables `contacts`, `contact_tags`,
> `contact_tag_assignments`, `contact_imports` · queue `contacts-import` (BullMQ) · build phase 1.
>
> Companion docs: [activity-diagrams.md](./activity-diagrams.md) (flow diagrams) ·
> [../design-system/README.md](../design-system/README.md) (UI) · mockups in
> [../design-system/mockups/](../design-system/mockups/).

**Personas**
- **Operator** — the everyday authenticated user of a profile (business owner / staff) who manages the
  address book. All stories below are this persona unless noted.
- **System** — the platform (API + workers + scheduler) acting on the Operator's behalf.

**Global rules that apply to every story**
- Every read/write is scoped to the caller's active `profileId` (TenantGuard). No cross-tenant reads.
- A contact must have **(First OR Last name)** AND **(Phone OR Email)**.
- Phone is normalized to digits only; Email + Phone are unique among non-deleted contacts in the profile.
- Money/dates render in the **profile timezone** (fix-on-rebuild: v1 hardcoded `America/Los_Angeles`).

---

## Epic E1 — Browse, search & find contacts

### US-1.1 — View the contacts list
**As an** Operator **I want** a paginated table of my contacts **so that** I can see my whole address book at a glance.
- **AC1** `GET /contacts` returns non-deleted contacts scoped to my profile, default sort `firstName` asc, page 1, 25/page.
- **AC2** Columns: select checkbox, Name (avatar + first/last + phone), Status badge, Phone, Email, Tags (first 3 pills), Date Added, Recent Activity.
- **AC3** Empty state shows a UserGroup icon, "No contacts", and an **Add Contact** CTA.
- **AC4** Loading state shows 5 skeleton rows.
- **AC5** Rows-per-page selectable: 10 / 25 / 50 / 100; numeric + Prev/Next pagination.

### US-1.2 — Filter by status
**As an** Operator **I want** to filter contacts by lifecycle status **so that** I can focus on a segment.
- **AC1** A TabBar offers **All / Active / Pending / Inactive** (colors gray/green/yellow/red), default **All**.
- **AC2** Selecting a tab calls `GET /contacts?status=…` and resets to page 1.
- **AC3** The active tab is reflected in the URL query (`status`), omitted when `All`.

### US-1.3 — Filter by date added
- **AC1** A select offers **anytime** (default) / **last 7 / 30 / 90 days**.
- **AC2** `anytime` is sent as no param; others apply a `createdAt >=` cutoff server-side.

### US-1.4 — Search contacts
**As an** Operator **I want** to search by name, email, phone, or tag **so that** I can find one person fast.
- **AC1** Search box placeholder: "Search over {total} contacts by name, email, phone or tags".
- **AC2** Input is debounced; each query resets to page 1 and calls `GET /contacts?query=…`.
- **AC3** Server matches FirstName / LastName / concatenated name / Phone / Email / Tags.

### US-1.5 — Sort the list
- **AC1** Name (`firstName`), Date Added (`createdAt`), and Recent Activity (`lastActivity`) headers are sortable.
- **AC2** Sort + dir are mirrored to the URL and re-applied on return.
- **Fix-on-rebuild:** `lastActivity` must come from a joined/denormalized read model, **not** a per-row correlated subquery (v1 N+1).

### US-1.6 — Restore list state on return
- **AC1** Scroll position and all params (sort, dir, page, perpage, query, status, date range) persist (sessionStorage) so navigating into a detail page and back restores the view.

---

## Epic E2 — Create & edit a contact

### US-2.1 — Add a contact manually
**As an** Operator **I want** to add one contact via a form **so that** I can capture a lead immediately.
- **AC1** Fields: First Name, Last Name, Phone, Email, Photo, Tags, Note, Birthday, Anniversary, Opted-In (default **on**).
- **AC2** Validation enforces (First OR Last) AND (Phone OR Email); per-field inline errors.
- **AC3** Phone is normalized to digits; Email validated and checked against the blacklist.
- **AC4** Duplicate Phone/Email (non-deleted, same profile) is rejected with a field error.
- **AC5** On success the contact is created with status **Pending**, source **manual**, and I'm redirected to `/contacts` with a success toast. `POST /contacts`.
- **AC6** When opened from a Connect conversation (`?cid=`, `?phone=`), those values prefill hidden fields.

### US-2.2 — Attach a photo
- **AC1** Image picker accepts `image/*`, shows a live preview, and offers Delete/Update.
- **AC2** On edit, replacing the image removes the previous file (fix-on-rebuild: store in S3/media module, not local disk).

### US-2.3 — Tag a contact with free-create + suggestions
- **AC1** The tag combobox suggests existing tags (`GET /contacts/tags`) and lets me create new ones inline.
- **AC2** Tags are normalized lowercase/trimmed/deduped and persisted relationally (`contact_tags` + `contact_tag_assignments`).

### US-2.4 — Edit a contact
**As an** Operator **I want** to edit a contact and see its activity **so that** I can keep records current.
- **AC1** `GET /contacts/:id` loads the same form; header shows avatar, name, "Uploaded on {date}", `#id`, tag pills.
- **AC2** **Save** is disabled until something changes; a **Reset** button appears when there are changes.
- **AC3** Saving calls `PATCH /contacts/:id`; uniqueness + identity rules re-checked.
- **AC4** A **Send Message** action routes to `/connect`.

---

## Epic E3 — Manage the contact lifecycle

### US-3.1 — Activate a contact
**As an** Operator **I want** to activate a contact **so that** they're enrolled into matching campaigns.
- **AC1** Activation sets status **Active** + `activatedAt = now`, cancels pending schedules, then schedules matching active campaigns.
- **AC2** Scheduling honours each campaign's Target/Exclude tags + Delay, requires `optIn = true`, and uses **profile timezone + daily activation time**; if Delay=0 and the time already passed today, the send pushes to tomorrow.
- **AC3** SMS campaigns only schedule when the profile has an SMS number/SID/token.
- **AC4** `POST /contacts/activate` accepts `ids[]`; ownership is re-checked per id.

### US-3.2 — Deactivate a contact
- **AC1** Deactivation sets status **Inactive** and unschedules all pending sends. `POST /contacts/deactivate`.

### US-3.3 — Restart an active contact
- **AC1** The **Restart** row action appears only when status is **Active**; it re-runs the activation/scheduling flow.

### US-3.4 — Delete a contact
- **AC1** Delete is a **soft-delete** (status Deleted / `deletedAt`), never a hard delete; it unschedules pending sends and fires `recipient_deleted`.
- **AC2** A confirm modal is required. `DELETE /contacts` with `{ ids[] }`.

### US-3.5 — Bulk actions
**As an** Operator **I want** to act on many contacts at once **so that** I can manage segments efficiently.
- **AC1** Selecting ≥1 row reveals bulk controls; the Actions dropdown appears at ≥2 selected.
- **AC2** Options: Activate, Deactivate (confirm modal), Delete, **Delete All** (passes `all=true` → `DELETE /contacts?all=true`), Clear selection.
- **AC3** Header checkbox selects all visible rows and shows an indeterminate state on partial selection.
- **AC4** Every bulk success refreshes the list, the profile, and the active count.

---

## Epic E4 — Activity & pipelines

### US-4.1 — See a contact's activity timeline
**As an** Operator **I want** to see what's happened with a contact **so that** I understand their engagement.
- **AC1** The detail sidebar renders pipeline cards from `GET /contacts/:id/activity` in order: campaign_history, reviews, newsletters, birthday, anniversary, thankyou, other.
- **AC2** Each card has a title, a status badge (Active green / History gray / other red), and a vertical timeline (title, subtitle, timestamp).
- **AC3** Loading shows a skeleton; empty shows "No pipeline activity…".
- **AC4** A day-grouped variant (`?grouped=true`) backs the Connect drawer.
- **Fix-on-rebuild:** repeated email "open" pixel hits for the same tracker within 10 min collapse into one activity (Apple/Gmail proxy guard).

---

## Epic E5 — Bulk import (CSV)

### US-5.1 — Import contacts from CSV
**As an** Operator **I want** to upload a CSV of contacts **so that** I can onboard my existing list.
- **AC1** The import modal accepts a single `.csv` (required), a unique list **Name** (per profile), and a per-target column mapping (FirstName, LastName, Email, Phone, Tags, Birthday, Anniversary, Note).
- **AC2** Client preview parses the first ~10 rows so I can map columns confidently.
- **AC3** Toggles: KeepEmail (on), KeepPhone (on), OptIn (on, required), Update/Enrich Existing (on), MakeInactive (off).
- **AC4** Submitting enqueues an async job (`POST /contact-imports` → `contacts-import` queue); I'm not blocked waiting.
- **AC5** Imported contacts start **Pending** (or **Inactive** if MakeInactive); enrich = union tags + fill empty birthday/anniversary/note.
- **Fix-on-rebuild:** one unified worker job (no divergent sync-PHP vs async-Lambda paths); fix the v1 `keep_email = keepphone` bug.

### US-5.2 — Track import progress
**As an** Operator **I want** a history of my imports with live status **so that** I know when an import is done.
- **AC1** `GET /contact-imports` lists imports: File Name (link), Total Rows, Imported (green), Duplicate (yellow), Failed (red), Size, Status (queued/in-progress/completed/failed), Upload Date.
- **AC2** A **Refresh List** action re-fetches; empty state shows an UploadCloud icon + import CTA.

### US-5.3 — Inspect import results row-by-row
**As an** Operator **I want** to browse each imported/duplicate/failed row **so that** I can fix data problems.
- **AC1** Status tabs **Imported / Duplicate / Failed**, each with a count.
- **AC2** Columns: First Name, Last Name, Tags, Email, Phone, Birthday; the **Failed** tab adds a **Reason** column.
- **AC3** Search needs a "search by" key (FirstName/LastName/Email/Phone); searching adds a Status column.
- **AC4** **Download File** exports the rows as xlsx. `GET /contact-imports/:id/export`.
- **Schema gap:** per-row outcomes have no v2 table yet (v1 = DynamoDB). Needs a `contact_import_rows` table or object-store equivalent before this screen is buildable.

---

## Epic E6 — Export

### US-6.1 — Export contacts
- **AC1** An **Export** action streams an xlsx of contacts, honouring the current status filter. `GET /contacts/export`.

---

## Epic E7 — Configuration (auto-activation)

### US-7.1 — Configure automatic daily activation
**As an** Operator **I want** the system to enrol a set number of contacts each day **so that** my pipeline stays warm without manual work.
- **AC1** Settings form (loads `GET /profiles/me`, saves `POST /profiles/save-settings`): **Automatic Contact Activation** switch; **Daily activation time** (hh:mm A, disabled unless auto-activate on, shown in profile timezone); **Contacts to activate per day** (0–500); **Auto-deactivate after review** switch.
- **AC2** A daily job activates up to `AutoActivateLimit` (max 500) Inactive/Pending contacts at the configured time when auto-activate is on, using the profile timezone.
- **AC3** Legacy `DeactivateRecipientsOnOpen` / `…OnClick` are always submitted false.

### US-7.2 — Pause & resume campaigns
**As an** Operator **I want** to pause all campaigns from the Contacts page **so that** I can stop sends without changing contact statuses.
- **AC1** A banner derives state from `CampaignsPaused`, `AutoActivateRecipients`, and active count: paused→orange "Campaigns paused"; active+autoactivate→green "Campaigns active"; active>0 & autoactivate off→yellow "New activations paused"; else gray "Campaigns dormant".
- **AC2** It shows "Active contacts in cadence: {count}" from `GET /contacts/count?status=Active`.
- **AC3** **Pause Campaigns** (confirm modal) halts pending scheduled sends without changing status; disabled when count is 0. When paused, **Resume Campaigns** is shown. `POST /profiles/pause-campaigns` / `…/resume-campaigns`.
- **Note:** these profile fields belong to Settings/Campaigns but are surfaced here — confirm ownership during build.

---

## Cross-cutting acceptance criteria

- **Tenancy:** ownership re-checked before every bulk activate/deactivate/delete.
- **Blacklist/opt-out:** an email failing blacklist validation forces `optIn=false` and tags the contact `invalid`; SendGrid bounces set Inactive + optIn false + tag `Bounced` + blacklist + unschedule.
- **Status mapping (open):** v1 Active/Pending/Inactive/Deleted vs v2 enum `pending/activated/bounced/unsubscribed/suppressed`. `Inactive` has no clean target — resolve before the Inactive tab + Restart ship.
- **Events:** `recipient_edited` on create/update; `recipient_deleted` on delete.
- **Legacy date `0000-00-00`** for Birthday/Anniversary coerces to NULL.

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-1.1–1.5 | `GET /contacts` |
| US-2.1 | `POST /contacts` |
| US-2.3 | `GET /contacts/tags` |
| US-2.4 | `GET /contacts/:id`, `PATCH /contacts/:id` |
| US-3.1/3.3 | `POST /contacts/activate` |
| US-3.2 | `POST /contacts/deactivate` |
| US-3.4/3.5 | `DELETE /contacts` (`{ids[]}` / `?all=true`) |
| US-4.1 | `GET /contacts/:id/activity` (`?grouped=true`) |
| US-5.1 | `POST /contact-imports` |
| US-5.2 | `GET /contact-imports` |
| US-5.3 | `GET /contact-imports/:id/rows`, `…/export` |
| US-6.1 | `GET /contacts/export` |
| US-7.1 | `GET /profiles/me`, `POST /profiles/save-settings` |
| US-7.2 | `GET /contacts/count`, `POST /profiles/pause-campaigns`/`resume-campaigns` |
