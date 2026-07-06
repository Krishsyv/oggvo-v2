# Messaging Compliance (Twilio A2P 10DLC & Toll-Free) — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/twilio-a2p-compliance.md`](../feature-spec/twilio-a2p-compliance.md).
> v2 target: modules `apps/api/src/modules/messaging` (compliance flows + state machine) +
> `apps/api/src/modules/integrations` (Twilio SDK adapters, webhooks) · tables `twilio_verifications`,
> `twilio_tollfree_numbers`, `twilio_tollfree_verifications`, `twilio_tollfree_verification_events`,
> `twilio_tollfree_verification_rejections` + `profiles.tollfree_*` columns (`@oggvo/db`) ·
> queue `twilio-tollfree-sync` (BullMQ status polling) · build phase 4.
>
> Companion docs: [activity-diagrams.md](./activity-diagrams.md) (flow + state diagrams) ·
> [../design-system/README.md](../design-system/README.md) (UI) · mockup
> [../design-system/mockups/settings/a2p-compliance.html](../design-system/mockups/settings/a2p-compliance.html).

**Personas**
- **Operator** — the authenticated user of a profile (business owner / staff) holding the SMS/Connect
  permission (`PermissionSms`) who completes the regulatory verification so the profile can send A2P SMS.
  All stories are this persona unless noted.
- **Account Manager** — a staff user with `account_type >= OGGVO_ACCOUNT_MANAGER` (2) who manages
  per-profile toll-free eligibility, number assignment, and sender activation (admin panel).
- **System** — the platform (API + integrations adapters + `twilio-tollfree-sync` worker) acting on
  the Operator's behalf.
- **Twilio** — the external TrustHub / Messaging / Toll-Free Verification service that owns the KYC
  objects, approves/rejects brands, campaigns and toll-free numbers, and pushes status callbacks.

**Global rules that apply to every story**
- Every read/write is scoped to the caller's active `profileId` (TenantGuard). No cross-tenant reads;
  admin endpoints additionally require `account_type >= 2` and target a `:id` profile explicitly.
- Every Twilio call uses the **profile's own subaccount credentials** (`SMSNumberSID` / `SMSNumberToken`);
  if either is missing the call fails fast (`409 sms_credentials_missing`), never a generic 500.
- **Statuses are not authored by the Operator** — `BrandStatus`, `CampaignStatus`, and toll-free
  `portal_status` / `twilio_status` are derived from Twilio responses and webhook callbacks; the UI is
  read-only over them and reflects updates asynchronously.
- All timestamps stored UTC (timestamptz); rendered in the **profile timezone**
  (fix-on-rebuild: v1 used `gmdate()` strings + Pacific assumptions in adjacent flows).
- Policy SIDs, the master/parent business SID, and feature flags (`TWILIO_TFV_ENABLED`,
  `TWILIO_TFV_MOCK_MODE`, `TWILIO_TFV_PILOT_SCOPE`, `TWILIO_TFV_INBOUND_ROUTING_ENABLED`) come from
  config/env — never hard-coded in source (fix-on-rebuild).
- Webhooks (`POST /integrations/twilio/tollfree/status`, the per-profile brand/campaign callback) are
  HMAC-validated and idempotent; invalid signature → `401`, duplicate event → `{status:"duplicate"}`.

---

## Epic E1 — A2P 10DLC compliance wizard

### US-1.1 — See my current verification state
**As an** Operator **I want** the wizard to open at my current step **so that** I can resume registration where I left off.
- **AC1** `GET /messaging/compliance` returns `{status, type, step, sid, brandStatus, campaignStatus, email, progressBarVisible, updatedAt}` or `404` when no verification exists.
- **AC2** The horizontal stepper (Business Profile → Brand Registration → Campaign Use-Case → Verification) derives `currentStep` from the returned `step` ordinal; completed steps show a success check, the current step a primary ring, pending steps gray.
- **AC3** A loading state is shown while the request is pending; a `404` renders the "start" entry point at step 1.
- **AC4** When the profile is toll-free eligible, a banner links to the toll-free fallback (Epic E4).
- **Fix-on-rebuild:** `step` is modeled as an explicit ordinal/enum, not the v1 stringly-typed float (`1.1`/`1.2`/`3.1`/`5`).

### US-1.2 — Initialize the customer profile
**As an** Operator **I want** to choose business vs. sole-proprietor and confirm my email **so that** the right KYC bundle is created in Twilio.
- **AC1** `POST /messaging/compliance` accepts `{type: "business"|"personal", email}`; on success it creates the TrustHub customer-profile bundle, persists `type` + `email`, advances `step`, and returns `201`.
- **AC2** Selecting `business` reveals the Business panels; `personal` reveals the Sole-Proprietor panels.
- **AC3** `email` defaults to the value already stored on the verification.

### US-1.3 — Complete the business KYC panels
**As an** Operator (business) **I want** to fill Business information, Address, and an authorized representative **so that** my customer profile passes TrustHub evaluation.
- **AC1** `PUT /messaging/compliance/business-info` saves business name (legal CP575/EIN name), website, business type, registration identifier + number, industry, and regions of operation; `business_identity` is forced server-side to `direct_customer`.
- **AC2** `PUT /messaging/compliance/address` saves the 7 address fields (customer_name, street, street2?, city, region≤2, postal_code, iso_country≤2).
- **AC3** `PUT /messaging/compliance/representative` saves first/last name, email, intl phone (stripped of spaces/dashes), business title, and job position.
- **AC4** Each save returns an `assignmentSid`; re-submitting **deletes and re-creates** the TrustHub assignment so panels are editable, then re-evaluates the policy.
- **AC5** A `noncompliant` evaluation maps Twilio errors back into per-field errors (keyed by panel) and returns the `assignmentSid` so the Operator can retry without losing progress.
- **AC6** Each saved panel shows a success check; **Submit for review** stays disabled until every required panel is saved.

### US-1.4 — Complete the sole-proprietor KYC panels
**As an** Operator (personal) **I want** to fill Personal information and Address **so that** my starter customer profile passes evaluation.
- **AC1** `PUT /messaging/compliance/profile-information` saves first/last name, email, and intl phone, returning an `assignmentSid`.
- **AC2** `PUT /messaging/compliance/address` saves the 7 address fields.
- **AC3** Same edit/idempotency + per-field error mapping as US-1.3 (AC4–AC5).

### US-1.5 — Submit the customer profile for review
**As an** Operator **I want** to submit my completed profile **so that** Twilio begins KYC review.
- **AC1** `POST /messaging/compliance/submit` assigns the profile to the configured parent/master business SID, evaluates the sender-activation policy, submits the customer profile, advances `step`, and returns `201`.
- **AC2** On a server-side compliance failure, errors are mapped back into the relevant panel(s) and `successful=false` is reflected per panel.

### US-1.6 — Create the A2P trust product (and brand)
**As an** Operator **I want** to submit my trust product **so that** my A2P brand is registered.
- **AC1** Business: `POST /messaging/compliance/trust-product` accepts `company_type` (public|private|non-profit|government) and, for `public`, `stock_exchange` + `stock_ticker`; it creates the A2P trust bundle and **implicitly registers the brand** (`skipAutomaticSecVet=true`).
- **AC2** Personal: the same endpoint accepts `brand_name`, `mobile_phone_number` (valid US/CA non-Twilio number), and `vertical`; it creates the Sole-Prop bundle and registers a `SOLE_PROPRIETOR` brand.
- **AC3** On success `step` advances to the campaign step.
- **AC4** Sole-Prop OTP rules are surfaced: reply within 24h, complete within 30 days, ≤3 uses of a mobile across all Sole-Prop brands.

### US-1.7 — Watch brand verification status
**As an** Operator **I want** to see whether my brand is approved **so that** I know when I can register a campaign.
- **AC1** `GET /messaging/compliance/brand` returns `{brandVerified, identityVerified, inReview}`.
- **AC2** The campaign form is **disabled** until brand `APPROVED` (and for personal, identity `VERIFIED`); warning banners explain why.
- **AC3** For a personal brand not yet identity-verified, a **Resend SMS** action calls `POST /messaging/compliance/brand/retry-otp`.

### US-1.8 — Register the campaign use case
**As an** Operator **I want** to register my A2P campaign **so that** my SMS traffic is approved for delivery.
- **AC1** `POST /messaging/compliance/campaign` deletes any prior campaign of the compliance type, re-checks brand `APPROVED`, creates the usAppToPerson campaign, subscribes to campaign event streams, advances `step`, and returns `201` (or `{error, reason}` when gating fails).
- **AC2** Fields: use case (personal forced to `SOLE_PROPRIETOR`; business from the allowed set), description (40–4096), message_flow opt-in description (40–2048), two sample messages (20–1024 each, no `[[name]]`/`{{name}}` placeholders), optional opt-in/opt-out/help messages + keywords, expected volume, and embedded-link/phone toggles.
- **AC3** The allowed business use cases come from `GET /messaging/compliance/campaign/usecases`.
- **Fix-on-rebuild:** `subscribeEventStreams` must actually create the sink + subscription — the v1 early-return for valid types is a bug; brand/campaign streams must be subscribed (with fetch-on-demand as the known-working fallback).

### US-1.9 — Reset my verification
**As an** Operator **I want** to reset a stuck verification **so that** I can start over.
- **AC1** A confirm modal ("Reset 10DLC Verification — Are you sure?") gates a danger action.
- **AC2** `POST /messaging/compliance/reset` clears brand/campaign/trust SIDs, resets `step` to the start, and returns `200` (or `404` when no verification exists).

---

## Epic E2 — Toll-free verification (fallback)

### US-2.1 — See my toll-free verification status
**As an** Operator (toll-free eligible) **I want** a status card for my toll-free number **so that** I know where my verification stands.
- **AC1** `GET /messaging/tollfree` returns `{eligible, assignedNumber, portalStatus, twilioStatus, rejectionReasons[], editAllowed, canResubmit, editExpiresAt, syncState, syncError, identifiers}`; short-circuits to an empty/ineligible payload when not eligible.
- **AC2** The card shows the assigned number + ownership state (or a "no number assigned" empty box), a status DOT badge, the submitted date, and an expected-timeline note.
- **AC3** When `eligible=false` or the feature flag is off, a page-level alert is shown and primary actions are disabled.
- **AC4** Access requires `PermissionSms` + profile `TollfreeFallbackEligible` + `TWILIO_TFV_ENABLED`; otherwise `403`.

### US-2.2 — Start or resume toll-free verification
**As an** Operator **I want** to launch the Twilio-hosted compliance form **so that** I can submit my toll-free verification.
- **AC1** `POST /messaging/tollfree/initialize` accepts `{email}`, reuses an active verification when one exists (`portal_status in in_progress|submitted|needs_correction`) or creates a pending record (`portal_status=in_progress, sync_state=pending`), and returns `{verificationId, portalStatus, registrationId, inquiryId, inquirySessionToken, expiresAt}`.
- **AC2** The primary button reads **Start Verification** when `not_started`, **Resume Verification** when `in_progress`/`needs_correction`, and is disabled when no number is assigned.
- **AC3** In non-mock mode, `initialize` returns `503` if the SDK provider has not populated `registrationId`/`inquiryId`/`inquirySessionTokenExpiresAt`.
- **AC4** The returned session token reveals the embedded Twilio compliance form; on its `submitted`/`completed`/`state-change` events the page schedules debounced syncs (0/2s/5s).

### US-2.3 — Refresh my verification status
**As an** Operator **I want** to refresh status on demand **so that** I see the latest decision without reloading.
- **AC1** `POST /messaging/tollfree/sync` requests a re-sync (queues a `twilio-tollfree-sync` job in v2).
- **AC2** After sync the status card and history re-fetch.
- **Fix-on-rebuild:** v1 `sync` is a stub returning fake `pending`; v2 wires it to `syncVerificationById` + the queue.

### US-2.4 — Review rejection reasons
**As an** Operator **I want** to see why a verification was rejected **so that** I can correct and resubmit.
- **AC1** Active `rejectionReasons[]` render in a red panel (code badge, received_at, reason, optional "Review Twilio guidance" link); hidden when none.
- **AC2** When `editAllowed` and the edit window has not expired, the status maps to `needs_correction` and **Resume Verification** is offered.

### US-2.5 — Browse my verification history
**As an** Operator **I want** a timeline of my attempts **so that** I can track progress over time.
- **AC1** `GET /messaging/tollfree/history` returns attempts ordered newest-first; each row shows portal-status badge, twilio status text, and updated/created timestamps.
- **AC2** Empty state reads "No toll-free verification attempts yet."

---

## Epic E3 — Status updates via Twilio webhooks

### US-3.1 — Reflect toll-free status callbacks
**As** Twilio **I want** to push verification status changes **so that** the Operator's portal reflects approvals, rejections, and correction requests automatically.
- **AC1** `POST /integrations/twilio/tollfree/status` validates `X-Twilio-Signature` (HMAC); invalid → `401`.
- **AC2** Idempotency key = provided `event_id` or `sha1(registration_id + status + occurred_at + verification_sid)`; duplicates short-circuit `{status:"duplicate"}`.
- **AC3** Each accepted callback writes a `twilio_tollfree_verification_events` row, updates the verification, deactivates prior rejections, and inserts a new active rejection when `rejection_reason` is present.
- **AC4** Status mapping: `PENDING_REVIEW→submitted`; `TWILIO_APPROVED→approved` (sets `approvedAt`); `TWILIO_REJECTED→rejected` when `!edit_allowed`, else `needs_correction` while the edit window is open (sets `rejectedAt`).
- **AC5** Unrecognized statuses set `sync_state=error` and log a `status_unrecognized` event rather than corrupting state.
- **Fix-on-rebuild:** verify the HMAC against the **correct per-subaccount auth token** when the toll-free number lives in a subaccount — not a single global account token.

### US-3.2 — Reflect 10DLC brand/campaign status callbacks
**As** Twilio **I want** to push brand/campaign compliance events **so that** the wizard reflects approval without manual refresh.
- **AC1** `POST /integrations/twilio/{profileId}/status` updates `brandStatus`/`campaignStatus` from the event-stream callback.
- **AC2** Fetch-on-demand (`GET /messaging/compliance/brand`, `…/campaign`) remains the authoritative fallback while event-stream subscriptions are stabilized.

---

## Epic E4 — Admin: eligibility, numbers & sender activation

### US-4.1 — Toggle toll-free eligibility
**As an** Account Manager **I want** to enable/disable a profile's toll-free fallback **so that** only vetted profiles enter the pilot.
- **AC1** `POST /admin/profiles/{id}/tollfree/eligibility` accepts `{enabled}`; enabling sets `TollfreeFallbackEligibleAt` + `…ByUserID`, disabling sets `TollfreeFallbackDisabledAt`.

### US-4.2 — Assign / release a toll-free number
**As an** Account Manager **I want** to assign an available number to a profile **so that** it can be verified.
- **AC1** `GET /admin/profiles/{id}/tollfree/numbers` lists available (`reserved`/`released`, unassigned) numbers.
- **AC2** `POST /admin/profiles/{id}/tollfree/assign-number` requires the number in `reserved|released`, the profile eligible, and no existing active number; sets `ownership_state=assigned`.
- **AC3** `POST /admin/profiles/{id}/tollfree/release-number` sets `ownership_state=released`.

### US-4.3 — Activate / deactivate the sender
**As an** Account Manager **I want** to activate sending on an approved number **so that** the profile can route SMS over toll-free.
- **AC1** `POST /admin/profiles/{id}/tollfree/activate-sender` is policy-gated: requires an assigned number, latest verification `portal_status=approved`, `TWILIO_TFV_INBOUND_ROUTING_ENABLED`, and `TWILIO_TFV_PILOT_SCOPE=web_connect_only`; blocking reasons are surfaced individually; on success sets `TollfreeSendMode=active`.
- **AC2** `POST /admin/profiles/{id}/tollfree/deactivate-sender` sets `TollfreeSendMode=disabled`.
- **AC3** Activation/deactivation logs an `admin`-source event with an idempotency key.

### US-4.4 — Admin verification detail & history
**As an** Account Manager **I want** the full verification detail + event log **so that** I can support a profile.
- **AC1** `GET /admin/profiles/{id}/tollfree` returns eligibility, assigned number, latest verification, rejections, sender-activation summary, and recent events (limit 5).
- **AC2** `GET /admin/profiles/{id}/tollfree/history` returns the full event history.

---

## Cross-cutting acceptance criteria

- **Tenancy:** Operator endpoints are profile-scoped; admin endpoints require `account_type >= 2` and an explicit `:id`.
- **Credentials:** missing per-profile subaccount creds fail fast with a typed error, never a generic 500.
- **No DB transaction in v1 multi-step KYC** caused orphaned TrustHub entities on partial failure — v2 must **track created SIDs** for cleanup/rollback (fix-on-rebuild).
- **Inbound routing** resolves an inbound `To` number to a profile preferring a toll-free number in `assigned|verified|active` (not released, not sync-error'd) whose profile is `TollfreeSendMode=active` with an `approved` verification; else falls back to `profiles.SMSNumber`.
- **Events** are append-only and idempotent across both webhook and poll sources to survive push/poll races on `sync_state`/`portal_status`.

## Open questions / parity risks

- **Schema gap (blocking):** the four toll-free tables and seven `profiles.tollfree_*` columns are not yet in `@oggvo/db`; phase 4 must add them (+ the six Postgres enums) before any TFV code lands. Confirm enum unions match v1 exactly (`OwnershipState` incl. `reserved|released|assigned|verified|active`; `PortalStatus` incl. `needs_correction`).
- **Embeddable token lifecycle:** confirm Twilio's real TFV inquiry session-token TTL/refresh contract; v1 only has a mock token and returns `503` in non-mock mode when the SDK provider has not populated identifiers.
- **Push vs. poll source of truth:** event-stream callbacks and the `twilio-tollfree-sync` poller can race on `sync_state`/`portal_status` — decide the authoritative source.
- **Event-stream subscriptions broken in v1:** unclear whether 10DLC brand/campaign status ever arrived via webhook in prod; treat fetch-on-demand as known-working.
- **Pilot scope hard gate:** sender activation only works under `TWILIO_TFV_PILOT_SCOPE=web_connect_only` — confirm or generalize.
- **`business_identity` force-overwrite** to `direct_customer` — confirm no ISV/reseller flow is needed in v2.
- **Number provisioning unmodeled:** no v1 code purchases/reserves toll-free numbers — v2 must define how `twilio_tollfree_numbers` rows are seeded.

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-1.1 | `GET /messaging/compliance` |
| US-1.2 | `POST /messaging/compliance` |
| US-1.3 | `PUT /messaging/compliance/{business-info\|address\|representative}` |
| US-1.4 | `PUT /messaging/compliance/{profile-information\|address}` |
| US-1.5 | `POST /messaging/compliance/submit` |
| US-1.6 | `POST /messaging/compliance/trust-product` |
| US-1.7 | `GET /messaging/compliance/brand`, `POST …/brand/retry-otp` |
| US-1.8 | `POST /messaging/compliance/campaign`, `GET …/campaign/usecases` |
| US-1.9 | `POST /messaging/compliance/reset` |
| US-2.1 | `GET /messaging/tollfree` |
| US-2.2 | `POST /messaging/tollfree/initialize` |
| US-2.3 | `POST /messaging/tollfree/sync` |
| US-2.4 | `GET /messaging/tollfree` (rejectionReasons) |
| US-2.5 | `GET /messaging/tollfree/history` |
| US-3.1 | `POST /integrations/twilio/tollfree/status` |
| US-3.2 | `POST /integrations/twilio/{profileId}/status`, `GET /messaging/compliance/brand` |
| US-4.1 | `POST /admin/profiles/{id}/tollfree/eligibility` |
| US-4.2 | `GET /admin/profiles/{id}/tollfree/numbers`, `POST …/assign-number`, `…/release-number` |
| US-4.3 | `POST /admin/profiles/{id}/tollfree/activate-sender`, `…/deactivate-sender` |
| US-4.4 | `GET /admin/profiles/{id}/tollfree`, `…/history` |

---

# Public Consent & Data-Rights Pages — User Stories & Acceptance Criteria

> These are **public, unauthenticated** pages (no portal shell, no `profileId` from a TenantGuard —
> the request is authorized by an opaque token/code in the URL). v2 target: module
> `apps/api/src/modules/public` (or the existing `integrations` Meta webhook handler for the deletion
> callback) · tables `contacts`/`unsubscribes` (email opt-out) + `deletion_request` (FB data-deletion
> state machine, 30-day grace) · build phase — alongside the Meta Data Deletion Callback. Mockups:
> [`../design-system/mockups/public/unsubscribe.html`](../design-system/mockups/public/unsubscribe.html),
> [`../design-system/mockups/public/data-deletion-status.html`](../design-system/mockups/public/data-deletion-status.html).

**Personas**
- **Recipient** — an unauthenticated end contact who received an OGGVO-sent email (review request /
  campaign) and follows its unsubscribe link. Identified only by an opaque tracker id, never a session.
- **Data Subject** — an unauthenticated person who requested deletion of their Facebook-derived data
  (via Meta's app-settings "remove app" flow) and follows the confirmation-code status URL returned by
  our Meta Data Deletion Callback.
- **Meta** — Facebook/Instagram, which invokes our signed Data Deletion Callback and returns the user a
  `{url, confirmation_code}` pointing at the status page.

**Global rules that apply to every story**
- No auth session; authorization is the URL token/code itself. A missing/invalid/expired token renders a
  safe generic state (404 / "request not found"), never leaks whether an email or account exists.
- Public pages are rate-limited and CAPTCHA-mockable in non-prod (fix-on-rebuild: v1 CAPTCHA only
  bypassed under `ENVIRONMENT==='testing'`).
- All timestamps stored UTC (timestamptz); the 30-day grace window and any rendered dates use the
  profile timezone, not a hardcoded Pacific assumption (fix-on-rebuild).

---

## Epic E5 — Email unsubscribe

### US-5.1 — Confirm I've been unsubscribed
**As a** Recipient **I want** the unsubscribe link to confirm my email is opted out **so that** I stop receiving review-request and campaign emails.
- **AC1** `GET /public/unsubscribe?id=<trackerId>` resolves the tracker to `{email, profile}`, records the opt-out idempotently (re-visiting the link is a no-op, not an error), and returns a success confirmation showing the masked/plain email and the sending profile's name.
- **AC2** A missing or unresolvable `id` renders the generic 404 state (redirect to `/404`); no email is echoed and existence is not disclosed.
- **AC3** The page offers a **Resubscribe** action → `POST /public/resubscribe?id=<trackerId>` that clears the opt-out, also idempotently.
- **AC4** The card shows a brand footer ("Sent on behalf of <profile> · Powered by OGGVO") and is dark-safe / responsive with no portal chrome.
- **Fix-on-rebuild:** honor one-click List-Unsubscribe (RFC 8058 `POST`) so a click opts out without an interstitial; the confirmation page is the human-visible fallback.

---

## Epic E6 — Facebook data-deletion status

### US-6.1 — Look up my data-deletion request status
**As a** Data Subject **I want** to enter or deep-link my confirmation code **so that** I can see whether my Facebook data has been received, is in its grace period, or has been purged.
- **AC1** `GET /public/data-deletion?code=<code>` returns `{status, scheduledPurgeAt?, completedAt?}` where `status ∈ received | pending | completed | cancelled | not_found`; the page also accepts the code typed into a lookup field.
- **AC2** Status mapping to the UI: `received` → "Request received" (queued); `pending` → "Deletion scheduled" with the grace-period purge date and a note that reconnecting cancels it; `completed` → "Data deleted" with the purge date; `cancelled` → "Deletion cancelled" (account reconnected, data retained).
- **AC3** An unknown/expired/invalid code renders `not_found` ("Request not found") without disclosing whether any request exists.
- **AC4** A `?code=` deep link (the exact URL Meta returns to the user alongside the `confirmation_code`) renders the status immediately on load.
- **AC5** The page is the user-facing surface of the **Meta Data Deletion Callback** (`POST /integrations/facebook/data-deletion`, HMAC-verified) which creates the `deletion_request` row and returns `{url, confirmation_code}`; reconnecting the account within the 30-day grace transitions the request to `cancelled`.

---

## Traceability (public pages → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-5.1 | `GET /public/unsubscribe?id=`, `POST /public/resubscribe?id=` |
| US-6.1 | `GET /public/data-deletion?code=` · callback `POST /integrations/facebook/data-deletion` |
