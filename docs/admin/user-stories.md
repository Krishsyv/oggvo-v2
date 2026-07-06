# Manage / Admin — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/manage-admin.md`](../feature-spec/manage-admin.md).
> v2 target: module `apps/api/src/modules/admin` · tables `users`, `user_profiles`, `profiles`,
> `manage_requests`, `newsletters`, `newsletter_categories`, `push_campaigns`, `referrals`,
> `twilio_tollfree_*` (toll-free module, reused) · queues `email`, `push`, image-render (BullMQ) ·
> build phase 4.
>
> Companion docs: [activity-diagrams.md](./activity-diagrams.md) (flow + state diagrams) ·
> [../design-system/README.md](../design-system/README.md) (UI) · mockups in
> [../design-system/mockups/](../design-system/mockups/) (`admin.html`).

**Personas**
- **Account Manager** (`OGGVO_ACCOUNT_MANAGER`, tier 2) — staff who oversee a set of business
  accounts: create/edit/suspend users and profiles, build templates, send push campaigns, browse
  usage and referrals. **Deletions they request are queued**, not executed immediately.
- **Supervisor** (`OGGVO_SUPERVISOR`, tier 3) — everything a manager can do, **plus** hard-deletes
  execute immediately and they can **confirm/deny** the deletion-request queue.
- **OGGVO_ADMIN** (tier 4) — the highest tier. All of the above plus admin-only surfaces (FCM server
  key) and full role assignment (can create/promote Admins). The only persona with truly unrestricted
  cross-tenant reach.
- **Sales** (`OGGVO_SALES`, tier 1) — below the Manage gate; included only to define the boundary
  (cannot enter `/manage/*`).
- **Operator / Member** (`OGGVO_USER`, tier 0) — the everyday tenant user; the **subject** of admin
  actions (impersonation target, suspended account) but never an actor in this domain.
- **System** — API + workers (`email`, `push`, image-render queues) + the Twilio/FCM/SES/S3
  integrations acting on an actor's behalf.

**The account-type hierarchy** (ascending privilege): `OGGVO_USER=0` < `OGGVO_SALES=1` <
`OGGVO_ACCOUNT_MANAGER=2` < `OGGVO_SUPERVISOR=3` < `OGGVO_ADMIN=4`.

---

## Global rules (apply to every story)

- **RBAC gate (admin-only area).** Every `/admin/*` endpoint and every `/manage/*` route requires
  `accountType >= ACCOUNT_MANAGER` (tier 2), enforced server-side by `@Roles(ACCOUNT_MANAGER)` on
  the admin controllers — **not** trusted from the frontend. Finer guards layer on top:
  `@Roles(SUPERVISOR)` for deletion confirm/deny, `@Roles(ADMIN)` for the FCM key.
  - **Fix-on-rebuild:** v1 RBAC is mostly unenforced (flat permission bools, the gate is frontend
    middleware with a loose regex `^/manag(e)?\S+/`). v2 enforces via guards on every controller and
    matches the `/admin` prefix exactly.
- **Cross-tenant access is admin-only and bounded by tier.** The Manage area is the **only** place
  the `profileId` tenant scope is lifted. A caller may only see/act on rows **at or below their own
  tier**: `getUsersPaginated`, `updateUser`, `deleteUser` all receive the caller's `accountType` and
  scope visibility accordingly. A manager can neither view, edit, promote, nor impersonate a
  Supervisor or Admin.
- **Impersonation is an audited, tier-bounded privilege.** "Login as" swaps the caller's session for
  the target's. It is restricted to managers-and-above acting on a **lower-tier** target, and **every
  use writes an audit entry** (actor, target, timestamp, reason). The original session is restorable.
  - **Fix-on-rebuild:** v1 `/impersonate/:id` lives outside the admin route group with unclear RBAC —
    v2 places it under `/admin` (or a guarded `/admin/impersonate`), enforces tier bounds, and audits.
- **Deletion-request workflow.** When a **manager** deletes a user/profile, the system creates a
  `manage_requests` row (status pending) instead of hard-deleting. A **supervisor+** delete executes
  immediately. Supervisors confirm (execute) or deny (reject + stamp denier) queued requests.
- **Timezone.** All list dates render in the viewer's profile/user timezone; DB stores UTC.
  - **Fix-on-rebuild:** v1 list rendering and the sender/activator hardcode Pacific; v2 honours
    per-profile timezone everywhere.
- **Secrets & webhooks.** OAuth/integration tokens are AES-GCM encrypted (never plaintext). Twilio
  toll-free status webhooks verify signatures. The raw FCM server key is **not** surfaced in the UI in
  v2 (see open questions).
- **Async side-effects.** Invitation/test emails enqueue on `email`; FCM push enqueues on `push`;
  template thumbnail rendering enqueues on an image-render job — none block the request.
  - **Fix-on-rebuild:** v1 sends FCM and runs `wkhtmltoimage` synchronously inside the request.

---

## Epic A1 — Admin console & account directory

### US-A1.1 — See platform KPIs and the account directory
**As an** Account Manager **I want** an admin console with headline counts and a searchable list of
the business accounts I oversee **so that** I can triage the whole portfolio at a glance.
- **AC1** The console loads KPI cards from `GET /admin/stats` keyed by `users`, `profiles`, `email`,
  `sms`, `invites`, `referrals`; each card shows label, icon and count, and the linkable cards route
  to their sub-page (Scheduled Invites is count-only — no destination).
- **AC2** A TabBar offers **Accounts** (default) / **Users** / **Templates**; the active tab is
  mirrored to the URL.
- **AC3** The Accounts table loads from `GET /admin/profiles?page=&query=&status[]=&dates[]=`
  (perPage 10), columns: Business (logo + name + plan/slug), Owner (name + email), Status badge,
  Reviews & Contacts counts, Created, row Actions menu.
- **AC4** Status badge tones map: Active→success, Trial→primary, Suspended→error, Paused/Expiring→
  warning, using the dot-badge component.
- **AC5** A search box (`query`, debounced, resets to page 1) and a status filter row sit above the
  table; a pagination footer shows "Showing X–Y of N" with Prev / numbered / Next.
- **AC6** Loading shows skeleton rows; empty shows an "No accounts match" state.
- **AC7** The whole area is **gated to `ACCOUNT_MANAGER`+**; a tier-1/0 caller hitting any `/admin/*`
  endpoint receives **403** and the route redirects to `/dashboard`.

### US-A1.2 — Search & filter accounts
**As an** Account Manager **I want** to search and status-filter the directory **so that** I can find
one account or focus on a segment (e.g. all Suspended).
- **AC1** `query` matches business name / slug / owner name / owner email (LIKE), debounced, page→1.
- **AC2** The status filter sends `status[]` as an integer subset intersected server-side against the
  allowed set; clearing it returns all.
- **AC3** A date-range filter sends `dates[]` (`YYYY-MM-DD`) applied as a `createdAt` window.

---

## Epic A2 — Impersonate / assume a profile

### US-A2.1 — Impersonate an account to support it
**As an** Account Manager **I want** to "log in as" an account I oversee **so that** I can reproduce
and fix an issue from the customer's seat.
- **AC1** The **Impersonate** action appears in a row's Actions menu **only** when the target is a
  **lower tier** than me; it is absent/disabled for peers and higher tiers.
- **AC2** Invoking it calls `POST /admin/impersonate/:id`; the response swaps my session token for an
  impersonation session that carries `impersonatorUserId` + the target `profileId`.
- **AC3** The action writes an **audit entry** (actor, target user/profile, timestamp) — surfaced in
  the UI as a note next to the action ("logs an audit entry").
- **AC4** While impersonating, a persistent banner shows "Viewing as {account}" with an **Exit
  impersonation** control that restores my original session (`POST /admin/impersonate/exit`).
- **AC5** Attempting to impersonate a peer/higher tier returns **403** and writes no session.
- **Fix-on-rebuild:** move login-as under the admin group, enforce the tier bound, and audit every
  use (v1 did none of these reliably).

---

## Epic A3 — Manage user accounts

### US-A3.1 — Browse users across accounts
**As an** Account Manager **I want** a filtered list of staff/members **so that** I can administer who
has access.
- **AC1** `GET /admin/users?page=&query=&range[]=&types[]=&suspended=&not_logged_in=` returns
  `{meta,data}`; columns: avatar/name, email, role pill, status badge, created.
- **AC2** Visibility is tier-scoped: a caller never sees rows **above** their own tier (the query
  receives the caller's `accountType`).
- **AC3** Filters: `query` search, date `range[]`, role `types[]` (Members=0/Sales=1/Managers=2/
  Supervisors=3/Administrators=4), `includeSuspended`, `includeNotLoggedIn`; all debounced.

### US-A3.2 — Create a user with role, profiles & permissions
**As an** Account Manager **I want** to create a user, pick their role, assign accessible profiles and
permissions, and email them an invite **so that** they can onboard.
- **AC1** Form sections: Personal Information (First ≥3, Last ≥3, Email valid — all required), Profile
  Picture (PNG/JPG/JPEG, optional), Role (User/Sales/Manager/Supervisor/Admin), Profiles (combobox,
  hidden when role=Admin), Permissions (hidden when role=Admin).
- **AC2** Submitting calls `POST /admin/users` (multipart: name, email, role, image, `profiles[]`,
  `permissions[]`); on success the System enqueues an invitation email (`email` queue, activation
  token) and redirects to `/admin/users`.
- **AC3** Role is validated server-side `in_list[User,Sales,Manager,Supervisor,Admin]`; a caller may
  not assign a role **above** their own tier (only Admin may create Admins).
- **AC4** The permission catalogue is a **single canonical typed enum** shared API↔web:
  `[Analytics, Design, Widgets, Social, Reviews, Connect, Invites, Support]`; Admin role gets no
  explicit permissions (full access).
  - **Fix-on-rebuild:** v1 sent `Social Media` but the server whitelisted `Social` — unify the vocab.

### US-A3.3 — Edit a user
**As an** Account Manager **I want** to edit a user prefilled from their record **so that** I can keep
roles/permissions/profiles current.
- **AC1** `GET /admin/users/:id` prefills the same form (maps role, profiles, permissions, image).
- **AC2** Saving calls `PATCH /admin/users/:id` (with an `imageRemoved` flag when clearing the photo).
  - **Fix-on-rebuild:** v1 used `POST` for updates — v2 uses `PATCH`.

### US-A3.4 — Suspend / activate a user
**As an** Account Manager **I want** explicit suspend and activate actions **so that** I can revoke or
restore access deterministically.
- **AC1** `PATCH /admin/users/:id/status` takes an explicit `{status: active|suspended}` (not a blind
  toggle); the status badge and row update on success.
  - **Fix-on-rebuild:** v1 suspend and activate hit the same toggle endpoint with optimistic toast
    text — make status explicit.

### US-A3.5 — Resend an activation invite
- **AC1** `POST /admin/users/:id/invite` re-issues a verification token and enqueues the invitation
  email; a "Invite resent" toast confirms.

### US-A3.6 — Delete a user (queued for managers)
**As an** Account Manager **I want** to request deletion of a user **so that** a supervisor can review
destructive changes.
- **AC1** `DELETE /admin/users/:id` (or `POST /admin/users/bulk-delete` with `{ids[]}`): when the
  caller is a **manager**, a `manage_requests` row is created (toast "Request created"); when
  **supervisor+**, the delete executes (toast "Deleted").
- **AC2** A confirm modal (themed `ConfirmModal`, never native `confirm`) is required.

---

## Epic A4 — Manage business profiles

### US-A4.1 — Browse, suspend, activate & delete profiles
**As an** Account Manager **I want** a profiles list with bulk actions **so that** I can manage account
lifecycle.
- **AC1** `GET /admin/profiles?page=&query=&status[]=&dates[]=` returns `{results,meta}` (perPage 10);
  columns: select, Profile (avatar + Name + slug), Owner, Status badge (Active/Suspended/Expired),
  Created, Expiry, row actions.
- **AC2** Activate: `PATCH /admin/profiles/:id/status {status:'active'}`. Suspend:
  `PATCH /admin/profiles/:id/status {status:'suspended'}` (bulk via `{ids[]}`). Delete:
  `DELETE /admin/profiles {ids[]}` — manager → queued request, supervisor+ → immediate.
- **AC3** Bulk select via header checkbox (indeterminate on partial); a bulk bar exposes Suspend/Delete.

### US-A4.2 — Edit a profile & provision toll-free SMS
**As an** Account Manager **I want** to edit profile details and manage its Twilio toll-free sender
**so that** the account can send compliant SMS.
- **AC1** Profile Details: Name (required), Slug (required), Expiry (required); save
  `PATCH /admin/profiles/:id`.
- **AC2** Toll-free panel loads `GET /admin/profiles/:id/tollfree` (eligibility, assigned number,
  verification, rejections, sender summary, history) and `…/tollfree/numbers` (available inventory).
- **AC3** Actions under `/admin/profiles/:id/tollfree/*`: `eligibility {enabled}`, `assign-number
  {tollfreeNumberId}`, `release-number`, `activate-sender`, `deactivate-sender`, `history`.
- **AC4** **Business rules:** eligibility must be on before assigning; a profile holds **one** active
  number (`assigned|verified|active`); numbers are assignable only from `reserved|released`; sender
  activation requires `TollfreeSenderActivationPolicy.summary().canActivate` (blocking reasons:
  `assigned_number_required`, `approved_verification_required`, `inbound_routing_unavailable`,
  `pilot_scope_not_supported`). Every action writes a `twilio_tollfree_verification_event` audit row
  with an idempotency key + actor id, timestamped UTC.
  - **Fix-on-rebuild:** implement `sync` (v1 returns 501); the toll-free tables belong to the
    SMS/toll-free module — the admin module **imports**, never re-models, them.

---

## Epic A5 — Deletion-request queue

### US-A5.1 — Review & resolve pending deletions
**As a** Supervisor **I want** a queue of manager-raised deletion requests **so that** destructive
changes get a second pair of eyes.
- **AC1** `GET /admin/manage-requests?type=&page=` lists pending requests (user vs profile target),
  perPage 10, with a Users/Profiles tab switch.
- **AC2** **Confirm** executes the requested deletion (reuses the user/profile delete path, or a
  dedicated `POST /admin/manage-requests/:id/approve` — see open questions); **Deny**
  (`POST /admin/manage-requests/:id/deny`) rejects and stamps the denier's user id.
- **AC3** Both confirm and deny require `@Roles(SUPERVISOR)`; a manager hitting them gets **403**.
- **AC4** Bulk select enables bulk confirm/deny; each action uses a themed confirm modal.

---

## Epic A6 — Shared templates & categories

### US-A6.1 — Manage shared campaign templates
**As an** Account Manager **I want** a library of shared email/SMS templates grouped by category **so
that** accounts can reuse vetted content.
- **AC1** `GET /admin/newsletters?type=&search=` returns templates grouped by `categoryName`; type
  tabs Review(Email)/SMS/Newsletter/Birthday/Anniversary/ThankYou; card shows thumbnail, Name,
  Subject, category badge, Active/Inactive badge.
- **AC2** Create `POST /admin/newsletters` (Name unique), update props `PATCH /admin/newsletters/:id`,
  delete `DELETE /admin/newsletters/:id`, test send `POST /admin/newsletters/test` (enqueued email),
  thumbnail render `POST /admin/newsletters/:id/image` (enqueued image-render job).
- **AC3** SMS editor caps at 1600 chars (160-char segment note) with a merge-tag insert menu
  (`[[first_name]]`, `[[last_name]]`, `[[profile_name]]`, `[[profile_url]]`, `[[profile_short_url]]`);
  non-SMS uses the drag-drop editor. Load `GET /campaigns/templates/:id`, save
  `PUT /campaigns/templates/:id`.
  - **Fix-on-rebuild:** move FCM/wkhtmltoimage off the request thread; fix the `Newsletter::index`
    `"BOTH"` join hint.

### US-A6.2 — Manage template categories
- **AC1** `GET /admin/newsletter-categories?query=&page=&dates[]=` lists categories (Name, Type,
  Status, Templates count, Created); CRUD via `POST`/`PATCH`/`DELETE /admin/newsletter-categories[/:id]`.
  - **Fix-on-rebuild:** `NewsletterCategory::delete` swallows its error (missing `return` on `fail`) —
    return a proper status.

---

## Epic A7 — Push campaigns & device registry

### US-A7.1 — Send a push notification campaign
**As an** Account Manager **I want** to compose and send an FCM push to selected users×profiles **so
that** I can broadcast platform announcements.
- **AC1** Form: Name, Title, Description (≤160), Image (default Oggvo logo), Action Link (default
  frontURL), Target Users (multi, required), Target Profiles (multi, required, refetched on user
  change via `GET /admin/push-campaigns/profiles?users[]`).
- **AC2** Submit `POST /admin/push-campaigns {name,title,text,image,clickAction,target[],profiles[]}`
  resolves device tokens, **enqueues** the FCM send (`push` queue), and persists a `push_campaigns`
  row (`type='manual'`, `status='sent'`); requires ≥1 resolved token else 422.
- **AC2.1** Device registry: `GET /admin/push-campaigns/devices` lists subscribed devices; delete a
  subscription via the dedupe'd delete path.
  - **Fix-on-rebuild:** dedupe the target resolution in SQL (v1 did it in PHP, N+1).

### US-A7.2 — View past push campaigns
- **AC1** `GET /admin/push-campaigns` lists prior campaigns with status; loading shows skeleton rows.

---

## Epic A8 — Usage & referrals (read-only)

### US-A8.1 — Browse email/SMS campaign usage across accounts
- **AC1** `GET /admin/campaigns?type=Email|SMS&page=&query=&dates[]=` returns a read-only table (Name
  & Subject, Owner, Created, View → opens the campaign editor in a new tab); perPage 10.

### US-A8.2 — Browse referrals
- **AC1** `GET /admin/referrals?page=&perpage=&query=&dates[]=&sort[field]=&sort[sort]=` returns a
  read-only table (Name & Business, Contact, Referred By, Date) with whitelisted sort.

---

## Epic A9 — Admin notifications & broadcasts

> Mockup: [`admin-notifications.html`](../design-system/mockups/admin/admin-notifications.html) ·
> route `/admin/notifications`. The platform-broadcast surface (push / email / in-app) that sits
> above the per-tenant notification centre; supersedes the v1 `manage/notifications` list +
> `notifications/campaigns/create` composer. Related device-registry/push detail lives in Epic A7.

### US-A9.1 — Browse the platform broadcast log
**As an** Account Manager **I want** a searchable log of every platform notification **so that** I can
see what was announced, to whom, and when.
- **AC1** Headline KPI cards summarise Sent (30d), Scheduled, Recipients reached and Registered
  devices, loaded from `GET /admin/notifications/stats` (device count reuses the push registry).
- **AC2** A search box (`query`, debounced, resets to page 1) plus **channel** (`Push|Email|In-app`)
  and **status** (`sent|scheduled|draft`) filters sit above the table.
- **AC3** The table loads from `GET /admin/notifications?query=&channel=&status=&page=` (perPage 10);
  columns: Broadcast (name + title), Channel pill, Audience, Status badge (Sent→success,
  Scheduled→warning, Draft→gray), Recipients count, When (profile-TZ), row Actions.
- **AC4** Row actions: View details, Duplicate (opens the composer pre-filled), Resend, and Cancel
  (scheduled/draft only) — Cancel uses a themed confirm and never a native `confirm()`.
- **AC5** Loading shows skeleton rows; empty shows a "No broadcasts match" state. The whole surface is
  gated to `ACCOUNT_MANAGER`+; a lower tier receives **403** and redirects to `/dashboard`.

### US-A9.2 — Compose & send a broadcast
**As an** Account Manager **I want** a "New broadcast" composer with audience, channel, message and
schedule **so that** I can announce platform news to the right accounts.
- **AC1** The composer (modal) collects Name, Title, Channel, Audience, Message, Action link
  (optional) and Schedule; Message and Title are required.
- **AC2** **Channel** is a segmented `Push|Email|In-app`; **Audience** is a select
  (`all | active | plan | specific`) that shows a live resolved-recipient hint; picking *specific*
  reveals a profile picker. The resolved audience is deduped in SQL (not PHP), fixing the v1 N+1.
- **AC3** **Message** caps at 160 chars (push compatibility) with a live counter; an Action link is
  optional and defaults to the portal front URL.
- **AC4** **Schedule** toggles Send now vs Schedule (date + time); scheduled times are stored in the
  actor's profile timezone (UTC in DB) and rejected if in the past.
- **AC5** Submitting calls `POST /admin/notifications { name, title, text, channel, audience,
  clickAction, scheduledAt? }`; the send is **enqueued** (`push` for FCM, `email` for email — never
  inline) and a `push_campaigns`/notification row is persisted. Save draft persists without sending.
  - **Fix-on-rebuild:** v1 sent FCM synchronously in-request and resolved recipients in PHP; v2
    enqueues and dedupes in SQL.

---

## Epic A10 — Platform-wide settings

> Mockup: [`admin-settings.html`](../design-system/mockups/admin/admin-settings.html) · route
> `/admin/settings`. Global settings that apply across **all** accounts — distinct from a tenant's own
> Settings page. Extends the v1 `manage/settings.vue` (which exposed only the FB/IG grace-period field).

### US-A10.1 — Set the Meta data-deletion grace period
**As an** Admin **I want** to configure the Facebook/Instagram data-deletion grace window **so that**
disconnected accounts are purged on the right schedule.
- **AC1** `GET /admin/settings` loads `data_deletion_grace_days` (default 30); the field validates as a
  whole number ≥ 1 and saves via `PUT /admin/settings { data_deletion_grace_days }`.
- **AC2** Copy states that changing the window affects only deletions started from now on — requests
  already counting down keep their original date; reconnecting before the deadline cancels deletion.

### US-A10.2 — Toggle global switches & platform defaults
**As an** Admin **I want** platform-wide toggles and default values **so that** I can control features
and new-account provisioning centrally.
- **AC1** Global toggles (Maintenance mode, Allow new sign-ups, Outbound SMS enabled, Enforce webhook
  signature verification) render as switches and persist in the `toggles{}` object on
  `PUT /admin/settings`; turning one off overrides the matching per-tenant setting everywhere.
  - **Fix-on-rebuild:** the webhook-signature toggle defaults **on** (v1 shipped Square/Twilio/Shopify
    signature checks disabled).
- **AC2** Platform defaults (default toll-free policy, trial length, starter SMS credit, support email)
  save in a `defaults{}` object and apply to newly-created accounts unless overridden per tenant.

### US-A10.3 — Manage feature flags with rollout scope
- **AC1** Each feature flag (e.g. `tollfree_verification`, `auto_share_platforms`, `campaign_events_v2`)
  has an enabled switch **and** a rollout-scope select (`All accounts | Beta cohort | Internal only |
  Off`), persisted in `feature_flags{}` on `PUT /admin/settings`.
- **AC2** Write access is `@Roles(ADMIN)` (tier 4); `ACCOUNT_MANAGER`+ may **read** but not change
  global flags. Every change writes an audit row (actor, key, old→new value, timestamp UTC).

---

## Epic A11 — Staff-user form (create / edit with granular permissions)

> Mockup: [`admin-user-form.html`](../design-system/mockups/admin/admin-user-form.html) · route
> `/admin/users/:id`. The full create/edit form behind the Users list (Epic A3). Elaborates
> US-A3.2/US-A3.3 with the granular per-module permission UI; the list-level suspend/invite/delete
> stories stay in Epic A3.

### US-A11.1 — Enter personal info & role
**As an** Account Manager **I want** a form for a staff user's details and role **so that** I can
onboard or maintain them.
- **AC1** Personal Information: First name (≥3), Last name (≥3), Email (valid) — all required; Profile
  picture (PNG/JPG, optional). Clearing an existing photo sends `imageRemoved` on save.
- **AC2** Role is a single-select of `User | Sales | Manager | Supervisor | Admin`; selecting **Admin**
  hides the Profiles and Permissions sections (full access) and shows an Admin note. A caller may not
  assign a role **above** their own tier — only an Admin may create/promote an Admin. Role is validated
  server-side `in_list[User,Sales,Manager,Supervisor,Admin]`.
- **AC3** Create → `POST /admin/users` (multipart: first, last, email, role, image, `profiles[]`,
  `permissions[]`) enqueues an activation email (`email` queue). Edit → `GET /admin/users/:id` prefills,
  save `PUT /admin/users/:id`. Redirects to `/admin/users` on success.
  - **Fix-on-rebuild:** v1 used `POST` for updates — v2 uses `PUT`/`PATCH`.

### US-A11.2 — Assign profiles & granular permissions
**As an** Account Manager **I want** to pick accessible profiles and per-module permissions **so that**
the user sees exactly what they should.
- **AC1** Profiles is a searchable multi-select rendered as removable chips (hidden when role=Admin);
  submitted as `profiles[]`.
- **AC2** Permissions are grouped **per module** as cards drawn from the single canonical typed enum
  shared API↔web: `[Analytics, Design, Widgets, Social, Reviews, Connect, Invites, Support]`. Each card
  has a **master** checkbox and finer scoped checkboxes (e.g. View / Manage / Publish); the master
  toggles all scopes and shows an indeterminate state on partial selection. Selecting a role seeds a
  sensible default set (User → Analytics/Design/Widgets/Social/Reviews).
  - **Fix-on-rebuild:** v1 sent `Social Media` while the server whitelisted `Social` — v2 uses one
    canonical vocab so client and server never diverge.
- **AC3** Select-all / Clear affordances set every module + scope at once; the resolved list submits as
  `permissions[]`. Admin role submits no explicit permissions (implicit full access).

---

## Epic A12 — Admin template editor & categories

> Mockup: [`admin-template-editor.html`](../design-system/mockups/admin/admin-template-editor.html) ·
> route `/admin/templates/:id`. The single-template editor behind the shared library (Epic A6),
> plus an inline categories manager. Elaborates US-A6.1/US-A6.2 from the v1 `newsletters/[id].vue`
> editor and `newsletters/categories` list.

### US-A12.1 — Edit a template (properties, editor, test send)
**As an** Account Manager **I want** to edit a shared template's content and properties **so that**
accounts reuse vetted, on-brand content.
- **AC1** The header shows the template name, subject and an Active/Inactive status dot, with
  **Properties**, **Send a test** and **Save** actions; `GET /admin/templates/:id` loads props +
  design JSON. Properties (Name, Subject, Type, Category, Active) save via `PUT /admin/templates/:id`
  and reflect back into the header.
- **AC2** The editor has two modes: **SMS** uses a plain composer capped at 1600 chars (160-char
  segment note) with an "Add placeholder" menu (`[[first_name]]`, `[[last_name]]`, `[[profile_name]]`,
  `[[profile_url]]`, `[[profile_short_url]]`); **non-SMS** uses the drag-drop editor canvas (blocks
  palette + device preview). Save → `PUT /admin/templates/:id` (SMS: `{Name,Subject,Body,DesignJson}`).
- **AC3** **Send a test** (hidden for SMS) opens a recipient-email modal and enqueues
  `POST /admin/templates/:id/test` on the `email` queue; thumbnail render is
  `POST /admin/templates/:id/image` on an image-render job.
  - **Fix-on-rebuild:** move FCM/`wkhtmltoimage` off the request thread, and render images tolerant of
    a missing sub-asset (one 404 avatar must not fail the whole image).

### US-A12.2 — Manage template categories
**As an** Account Manager **I want** to CRUD template categories inline **so that** the library stays
organised.
- **AC1** A categories table (Name, Type, Status badge, Templates count, Created) loads from
  `GET /admin/template-categories?query=&page=&dates[]=`; Add/Edit use a modal (Name, Type, Active),
  Delete uses a themed confirm. CRUD via `POST` / `PUT` / `DELETE /admin/template-categories[/:id]`.
- **AC2** Deleting a category leaves its templates uncategorised (not deleted).
  - **Fix-on-rebuild:** v1 `NewsletterCategory::delete` swallowed its error (missing `return` on
    `fail`) — v2 returns a proper status.

---

## Cross-cutting acceptance criteria

- **RBAC enforced server-side** on every `/admin/*` endpoint via `@Roles` guards; the frontend gate is
  defense-in-depth only.
- **Tier-bounded visibility & action:** no caller may view, edit, promote, delete, or impersonate a
  subject **above** their own tier; cross-tenant reads exist **only** inside the admin module.
- **Audit everything destructive or privileged:** impersonation, toll-free actions, and
  deletion-request resolutions each write an audit row (actor, target, timestamp).
- **Async side-effects** (email, push, image render) run on BullMQ queues, never inline.
- **UTC storage, profile-timezone rendering** for every date.
- **Themed confirm modals** replace v1 native `confirm()` everywhere a destructive action exists.

---

## Open questions / parity risks

- **`manage_requests` shape:** confirm v2 covers both target types (user/profile) and the
  confirm-vs-deny actor columns, and decide whether confirm reuses the delete endpoints or adds an
  explicit `/approve`.
- **Scheduled Invites:** the dashboard counts `invites` but the card has no destination and there is
  no v2 schema home for the schedule/invite queue — is a management screen planned, or count-only?
  (schema gap).
- **Campaign-usage ownership:** `/admin/campaigns` reads the per-business `campaign` table owned by
  the Campaigns module — confirm cross-module read ownership.
- **Toll-free table ownership:** ensure the admin module imports `twilio_tollfree_*` and the shared
  `TollfreeSenderActivationPolicy` rather than redefining them.
- **FCM key exposure:** `GET /admin/notifications/apikey` returns the raw server key to ADMIN — likely
  should not be surfaced at all in v2 (security review; default to **not** building the UI for it).
- **Impersonation home & RBAC bounds:** confirm the final route (`/admin/impersonate/:id`) and the
  exact tier matrix (who may impersonate whom), plus session-restore semantics.
- **Permission catalogue source:** the 8 permissions must come from one typed enum/config shared
  API↔web, not hardcoded per page.
- **`push_campaigns` audience persistence:** decide whether v2 persists the resolved recipient
  user/profile list for auditing (v1 stored only metadata).
- **Admin-only KPI scope:** `GET /admin/stats` currently returns global counts — confirm whether a
  manager sees portfolio-scoped counts vs platform-wide.

---

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-A1.1–A1.2 | `GET /admin/stats`, `GET /admin/profiles` |
| US-A2.1 | `POST /admin/impersonate/:id`, `POST /admin/impersonate/exit` |
| US-A3.1 | `GET /admin/users` |
| US-A3.2 | `POST /admin/users` |
| US-A3.3 | `GET /admin/users/:id`, `PATCH /admin/users/:id` |
| US-A3.4 | `PATCH /admin/users/:id/status` |
| US-A3.5 | `POST /admin/users/:id/invite` |
| US-A3.6 | `DELETE /admin/users/:id`, `POST /admin/users/bulk-delete` |
| US-A4.1 | `GET /admin/profiles`, `PATCH /admin/profiles/:id/status`, `DELETE /admin/profiles` |
| US-A4.2 | `PATCH /admin/profiles/:id`, `/admin/profiles/:id/tollfree/*` |
| US-A5.1 | `GET /admin/manage-requests`, `POST /admin/manage-requests/:id/{approve,deny}` |
| US-A6.1 | `GET/POST/PATCH/DELETE /admin/newsletters`, `POST /admin/newsletters/test` |
| US-A6.2 | `GET/POST/PATCH/DELETE /admin/newsletter-categories` |
| US-A7.1 | `POST /admin/push-campaigns`, `GET /admin/push-campaigns/{profiles,devices}` |
| US-A7.2 | `GET /admin/push-campaigns` |
| US-A8.1 | `GET /admin/campaigns?type=` |
| US-A8.2 | `GET /admin/referrals` |
| US-A9.1 | `GET /admin/notifications` |
| US-A9.2 | `POST /admin/notifications` |
| US-A10.1–A10.3 | `GET /admin/settings`, `PUT /admin/settings` |
| US-A11.1 | `POST /admin/users`, `GET /admin/users/:id`, `PUT /admin/users/:id` |
| US-A11.2 | `POST/PUT /admin/users` (`profiles[]`, `permissions[]`) |
| US-A12.1 | `GET /admin/templates/:id`, `PUT /admin/templates/:id`, `POST /admin/templates/:id/{test,image}` |
| US-A12.2 | `GET/POST/PUT/DELETE /admin/template-categories` |
