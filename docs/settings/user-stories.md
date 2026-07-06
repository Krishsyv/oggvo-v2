# Settings — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/settings.md`](../feature-spec/settings.md).
> v2 target: module `apps/api/src/modules/tenancy` (profile + satellites) plus a thin settings
> facade · tables `profiles`, `profile_review_settings`, `profile_google`, `profile_email_settings`,
> `profile_messaging_settings`, `profile_newsletter_settings`, `profile_affiliate`, `profile_prompts`,
> `geo_zipcodes`, `geo_zipcodes_profile`, `monthly_targets`, `email_notifications`, `push_channels`,
> `users` · queue `—` (synchronous; logo writes stream to S3 media module) · build phase 1–4.
>
> Companion docs: [activity-diagrams.md](./activity-diagrams.md) (flow diagrams) ·
> [../design-system/README.md](../design-system/README.md) (UI) · mockup in
> [../design-system/mockups/settings/settings.html](../design-system/mockups/settings/settings.html).

**Personas**
- **Owner** — the authenticated user who owns the active profile. In v1 this is effectively the only
  settings persona (owner-only access, commented-out role matrix). All stories are this persona unless
  noted.
- **Team member** — a non-owner user attached to the profile (Admin / Manager / Member). v2-new:
  the role/invite surface that v1 never shipped. Stories tagged **(v2-new)**.
- **Staff** — an OGGVO sales/supervisor account editing a business profile from the admin surface
  (`/manage/profiles/[id]`), gated by `AccountType >= OGGVO_SALES`.
- **System** — the platform (API + media/S3 + external resolvers: ZipCodeApi, Google Place, FCM/Apple
  Push) acting on the persona's behalf.

**Global rules that apply to every story**
- Every settings read/write is scoped to the caller's active `profileId` (TenantGuard injects it). No
  cross-tenant reads or writes; switching profiles re-issues JWTs.
- Writes are **typed and satellite-scoped** (`PATCH /profiles/current`, `…/review-settings`,
  `…/affiliate`, …). The v1 mass-assignment god-endpoint `POST /profiles/save-settings` is **not**
  reproduced — no client may write an arbitrary `profile` column.
- Timezone is **per-profile** and derived from the saved address (IANA). It is never hardcoded to
  `America/Los_Angeles` (fix-on-rebuild). All times render in profile timezone.
- Google-derived fields (`GoogleReviewDialog`, `GoogleMapsURL`, `GoogleReviewList`, `GooglePlaceID`,
  …) are **read-only** and server-derived; they are never accepted on a settings write and are cleared
  only by removing the address.
- Logos are validated (`png/jpeg/jpg`) and stored in S3 via the media module (fix-on-rebuild: v1 wrote
  to local `public/assets/media`). Replacing a logo deletes the previous object.
- RBAC is **enforced** via `@Roles` / `@RequirePermission` guards (fix-on-rebuild: v1 RBAC was flat
  unenforced bools).

---

## Epic E1 — Business profile identity

### US-1.1 — View and edit the business profile
**As an** Owner **I want** to load my business identity into an editable form **so that** I can keep my
name, contact and address current.
- **AC1** `GET /profiles/current` returns a typed composed DTO across satellites (business name, phone,
  address lines, city/state/zip, timezone, logo + business-logo refs, Google links, review/affiliate
  flags). (Replaces v1 `GET /profiles/me`.)
- **AC2** Fields: Business Name, Business Number (Phone), Business Address, Address Line 2,
  City / State / ZIP (3-col grid), Contact email, Website.
- **AC3** **Save** is disabled until a field changes; **Reset** restores the cached values.
- **AC4** Saving calls `PATCH /profiles/current` with only the changed, typed fields; Google-derived
  fields are rejected if sent.
- **AC5** After hydration the form is remounted to clear browser autofill (parity with v1
  `formRenderKey++`).

### US-1.2 — See timezone synced from the address
**As an** Owner **I want** the timezone to follow my saved address **so that** all scheduling and
timestamps are in my local time without me picking a zone by hand.
- **AC1** A read-only status line shows "Timezone synced from your address: {IANA tz}" when a tz exists
  and state/ZIP are unchanged.
- **AC2** When state/ZIP changed but unsaved: "Timezone will update after you save…"; when no valid
  state+ZIP: "…will sync after you save a valid state and ZIP code."
- **AC3** On save, the API resolves an IANA tz from the address (state map → longitude-band fallback via
  `geo_zipcodes`) through **one** resolver; a manual IANA override is preserved (only empty/numeric/
  invalid values are overwritten).
- **AC4** The resolved tz propagates to every consumer (campaign scheduling, activation time, review
  auto-publish window) on next read. (`PATCH /profiles/current` / `PUT /profiles/current/address`.)
- **Fix-on-rebuild:** consolidate v1's two competing resolvers (`resolveTimezone` vs
  `syncTimezoneFromAddress`) into one; never default to Pacific.

### US-1.3 — Manage the business address & Google links
**As an** Owner **I want** to set or clear my address **so that** my Google review/maps links stay
correct.
- **AC1** With an address present, three read-only inputs render — Google Review Dialog, Google Maps
  URL, Google Review List — each with an open-in-new-tab affordance. (`profile_google`.)
- **AC2** With no address, a map picker lets me select/save one; saving calls
  `PUT /profiles/current/address` and triggers server-side Google-link regeneration.
- **AC3** **Remove Current Address** opens a themed confirm modal (never native `confirm`); confirming
  calls `DELETE /profiles/current/address`, blanking address + all Google + lat/long/timezone columns.
- **Open question:** confirm which v2 module owns `updateGooglePlaceInfo` regeneration on address change.

---

## Epic E2 — Branding & logos

### US-2.1 — Upload the profile logo
**As an** Owner **I want** to upload a profile logo **so that** my brand shows across the portal and
sent media.
- **AC1** File input accepts `png/jpeg/jpg`; on select it uploads immediately to
  `POST /profiles/current/logos/profile` (S3-backed) and shows a preview with a spinner overlay while
  uploading.
- **AC2** A **Reset/Remove** action clears the logo (deletes the S3 object); MIME is validated
  server-side; the response returns the object URL (fix-on-rebuild: not a bare `{name}`).

### US-2.2 — Upload and crop the business logo
**As an** Owner **I want** to crop a business logo before upload **so that** it fits the print/email
layout.
- **AC1** Selecting a file opens a crop modal first; the cropped file uploads to
  `POST /profiles/current/logos/business`.
- **AC2** Preview uses `object-contain`; Reset clears the business logo.
- **Schema gap:** v2 `profiles` has only `logo`; the separate **business logo** needs a column or media
  row before this ships.

---

## Epic E3 — Team & roles (v2-new)

### US-3.1 — View team members
**As an** Owner **I want** a table of everyone attached to my profile **so that** I can see who has
access and at what role.
- **AC1** `GET /profiles/current/members` lists members: avatar, name, email, and a **role pill**
  (Owner / Admin / Manager / Member).
- **AC2** The Owner row is always present and cannot be removed or demoted; an empty state past the
  owner shows an "Invite your first teammate" CTA.
- **Open question:** v1 ships only the owner row (invite/role UI is dead markup) — confirm v2 ships real
  multi-member RBAC vs single-owner parity.

### US-3.2 — Invite a team member
**As an** Owner **I want** to invite someone by email and assign a role **so that** they can help manage
the profile.
- **AC1** An **Invite** button opens a form: email (validated, blacklist-checked) + role select
  (Admin / Manager / Member).
- **AC2** Submitting calls `POST /profiles/current/members/invitations` which creates a pending
  invitation and emails a tokenized link; the row shows a **Pending** status badge until accepted.
- **AC3** Re-inviting the same pending email re-sends rather than duplicating; an existing active member
  email is rejected with a field error.

### US-3.3 — Accept an invitation
**As a** Team member **I want** to accept an invite **so that** I gain scoped access to the profile.
- **AC1** `POST /profiles/invitations/accept` consumes a single-use token, attaches the user to the
  profile at the invited role, and revokes the token.
- **AC2** An expired or already-consumed token returns an error and does not grant access.

### US-3.4 — Change a member's role / revoke access
**As an** Owner **I want** to change a member's role or remove them **so that** access matches their
responsibilities.
- **AC1** `PATCH /profiles/current/members/{userId}` updates the role; `@RequirePermission` guards
  enforce that only Owner/Admin may change roles, and Owner cannot be demoted by anyone else.
- **AC2** `DELETE /profiles/current/members/{userId}` (confirm modal) detaches the user; their sessions
  for this profile are revoked.

### US-3.5 — Edit my own user & password
**As an** Owner **I want** to edit my name/email/avatar and change my password **so that** my account
stays current and secure.
- **AC1** Edit User submits `PATCH /me` (multipart `firstName, lastName, email, image`); on success the
  session user is re-fetched. (Replaces v1 `POST /users/update`.)
- **AC2** Change Password submits `POST /me/password` (`currentPassword, password, passwordConfirmation`);
  current is verified, new ≥8 chars and matches confirmation. (Replaces v1 `POST /users/change-password`.)

---

## Epic E4 — Notifications

### US-4.1 — Manage review-alert email recipients
**As an** Owner **I want** to add/remove emails that receive review alerts **so that** the right people
hear about new reviews.
- **AC1** `GET /profiles/current/email-notifications` lists subscribed emails; an empty state shows an
  Inbox icon + **Add Email** CTA.
- **AC2** Adding via `POST /profiles/current/email-notifications` validates `valid_email` + blacklist and
  rejects duplicates per profile.
- **AC3** Per-row delete calls `DELETE /profiles/current/email-notifications/{id}`.

### US-4.2 — Manage push-notification devices
**As an** Owner **I want** to subscribe/unsubscribe browser devices **so that** I get push alerts where I
work.
- **AC1** `GET /me/push-channels` returns the current device + subscribed devices (OS, browser, created
  date, "Current Device" badge).
- **AC2** Subscribe requests browser permission (FCM token, or Apple push package on Safari) then
  `POST /me/push-channels` with the token (≥100 chars; robot user-agents rejected).
- **AC3** Unsubscribe (confirm modal) calls `DELETE /me/push-channels` with the token.
- **Fix-on-rebuild:** subscription state is server-tracked via `push_channels.is_active` — not the v1
  `opn` cookie + `BrowserDetection` fingerprint hack.

---

## Epic E5 — Integrations & messaging compliance

### US-5.1 — Connect & manage integrations
**As an** Owner **I want** to connect social/CRM/payment platforms **so that** reviews auto-share and
review requests flow in.
- **AC1** A **Manage** link from Settings opens the Integrations surface
  ([integrations.html](../design-system/mockups/settings/integrations.html)); OAuth URLs come from
  `GET /integrations/oauth-urls` (facebook, twitter, linkedin, google, squareup, stripe, clover, clio,
  liondesk, pam, shopify, quickbooks). (Replaces v1 `GET /settings/social-accounts`.)
- **AC2** Connected accounts list, connect modal, finish-process flow and disconnect live in the
  integrations domain; Settings only links to it. OAuth tokens are stored AES-GCM-encrypted
  (fix-on-rebuild: v1 plaintext).

### US-5.2 — Reach A2P / toll-free compliance
**As an** Owner **I want** to reach SMS compliance from Settings **so that** I can register 10DLC /
toll-free messaging.
- **AC1** A **Messaging Compliance** link opens
  ([a2p-compliance.html](../design-system/mockups/settings/a2p-compliance.html)); compliance status drives card
  copy ("In Review" when a verification step is advanced).
- **AC2** Webhook signature verification (Twilio) and PAM TLS verification are **enabled** in v2
  (fix-on-rebuild).

---

## Epic E6 — Review sharing, geo-tagging & referral

### US-6.1 — Configure auto-share threshold & message
**As an** Owner **I want** to auto-publish high-rated reviews to social **so that** good reviews spread
without manual effort.
- **AC1** A master switch and a 1–5 star threshold persist via
  `PATCH /profiles/current/review-settings` (`socialThreshold`; stored value = UI − 1, `-1` disabled).
- **AC2** A review-message textarea with placeholder tokens (`[[platform]]`, `[[page]]`, `[[rating]]`,
  `[[link]]`) saves on the same endpoint; empty defaults to "New Review!".
- **AC3** Per-platform toggles read `GET /reviews/auto-share` and activate/deactivate via
  `POST /reviews/auto-share/activate` / `DELETE /reviews/auto-share/deactivate`.
- **Schema gap:** `AutoReviewShareMode` / `AutoReviewShareTemplates` (Shuffle/Fixed + `type-1..5` CSV)
  have no `profile_review_settings` column yet. (Detailed in the Reviews auto-share mockup.)

### US-6.2 — Manage geo-tag ZIP codes
**As an** Owner **I want** up to 5 tagged ZIP codes **so that** my media is geo-tagged to my service
area.
- **AC1** `GET /profiles/current/geo-zipcodes` lists ZIPs; `POST …` adds one (US/CA format; unknown ZIPs
  resolved via ZipCodeApi into shared `geo_zipcodes`); `DELETE …/{id}` removes one.
- **AC2** A hard limit of **5** per profile and duplicate-per-profile rejection are enforced server-side.

### US-6.3 — Enable the client referral program
**As an** Owner **I want** an affiliate program with a shareable URL **so that** clients can refer
others.
- **AC1** `GET /profiles/current/affiliate` returns `{active, code, footerText}` (code generated if
  absent); the read-only Referral URL `{frontURL}ref/{code}` has a CopyButton.
- **AC2** Activate switch + footer text (≤150 chars) save via `PATCH /profiles/current/affiliate`.
- **Open question:** decide whether v2 generates the affiliate code eagerly at profile creation to avoid
  a read-side write.

---

## Epic E7 — Campaign pause & monthly targets (surfaced, owned elsewhere)

### US-7.1 — Pause / resume all campaigns
**As an** Owner **I want** to pause all campaigns **so that** I can halt sends without changing contact
statuses.
- **AC1** `POST /profiles/current/campaigns/pause` holds unsent schedules and sets `CampaignsPaused`
  atomically; `…/resume` releases them. (Idempotent, transactional.)
- **Schema gap:** `CampaignsPaused` is not on v2 `profiles`/satellites yet; the held-schedule semantics
  must be reproduced. (Primary UI lives on the Contacts list banner.)

### US-7.2 — Set monthly targets
**As an** Owner **I want** to set monthly goals **so that** the dashboard tracks progress.
- **AC1** `GET/PUT /profiles/current/monthly-targets?month=` reads/upserts a month's targets
  (reviews, requests, connections, social posts, reviews posted).
- **Open question:** confirm whether the Settings UI exposes targets at all or they move entirely to the
  dashboard.

---

## Epic E8 — Admin: edit a business profile (Staff)

### US-8.1 — Staff edits a profile
**As** Staff **I want** to edit a business profile's core fields **so that** I can onboard/correct an
account.
- **AC1** Gated by `AccountType >= OGGVO_SALES` (`@Roles` guard); `GET /admin/profiles/{id}` loads, and
  `PATCH /admin/profiles/{id}` saves Name (required), Shortname/slug (`alpha_dash`, unique server-side),
  ExpirationDate (stored `23:59:59`).
- **AC2** Toll-free fallback management (eligibility, number assignment/release, sender activate,
  verification) lives on the same page via the toll-free domain endpoints.

---

## Cross-cutting acceptance criteria

- **Tenancy:** every settings write targets the active `profileId`; profile switch re-issues JWTs and
  requires ownership/role.
- **No mass assignment:** the v1 `save-settings` god-endpoint is replaced by typed satellite PATCH
  endpoints; clients cannot write arbitrary columns.
- **Confirm modals:** address removal, member removal and device unsubscribe use the themed
  `ConfirmModal`, never native `confirm`.
- **Color fields:** keys formerly prefixed `#` (`#NewsletterBgColor`, …) are stored as plain hex on
  their satellites.
- **Auth hardening:** `/refresh` rotates in `auth_sessions`; OAuth tokens encrypted; webhook + TLS
  signature checks enabled (fix-on-rebuild items that touch settings-adjacent flows).

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-1.1 | `GET /profiles/current`, `PATCH /profiles/current` |
| US-1.2 | `PATCH /profiles/current`, `PUT /profiles/current/address` |
| US-1.3 | `PUT /profiles/current/address`, `DELETE /profiles/current/address` |
| US-2.1 | `POST /profiles/current/logos/profile` |
| US-2.2 | `POST /profiles/current/logos/business` |
| US-3.1 | `GET /profiles/current/members` |
| US-3.2 | `POST /profiles/current/members/invitations` |
| US-3.3 | `POST /profiles/invitations/accept` |
| US-3.4 | `PATCH/DELETE /profiles/current/members/{userId}` |
| US-3.5 | `PATCH /me`, `POST /me/password` |
| US-4.1 | `GET/POST/DELETE /profiles/current/email-notifications[/{id}]` |
| US-4.2 | `GET/POST/DELETE /me/push-channels` |
| US-5.1 | `GET /integrations/oauth-urls` |
| US-5.2 | (compliance status) `GET /twilio/verification` |
| US-6.1 | `PATCH /profiles/current/review-settings`, `POST/DELETE /reviews/auto-share/*` |
| US-6.2 | `GET/POST/DELETE /profiles/current/geo-zipcodes[/{id}]` |
| US-6.3 | `GET /profiles/current/affiliate`, `PATCH /profiles/current/affiliate` |
| US-7.1 | `POST /profiles/current/campaigns/{pause|resume}` |
| US-7.2 | `GET/PUT /profiles/current/monthly-targets?month=` |
| US-8.1 | `GET /admin/profiles/{id}`, `PATCH /admin/profiles/{id}` |
