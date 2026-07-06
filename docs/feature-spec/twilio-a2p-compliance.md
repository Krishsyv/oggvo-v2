# Twilio A2P 10DLC & Toll-Free Compliance

> **v2 target:** modules `apps/api/src/modules/messaging` (compliance flows) + `apps/api/src/modules/integrations` (Twilio SDK adapters, webhooks) · tables `twilio_verifications`, `twilio_tollfree_numbers`, `twilio_tollfree_verifications`, `twilio_tollfree_verification_events`, `twilio_tollfree_verification_rejections` (`@oggvo/db`) · queue `twilio-tollfree-sync` (status polling) · build phase `4`
> **v1 sources:** frontend `apps/portal-frontend/pages/twilio/compliance.vue`, `pages/twilio/tollfree.vue`, `components/Twilio/{index,Reset}.vue`, `components/Twilio/Steps/Profile.vue`, `components/Twilio/Forms/{Initialize,Campaign}.vue`, `components/Twilio/Forms/Business/{Type,Profile,Address,AuthorizedRepresentative}.vue`, `components/Twilio/Forms/Personal/{Type,Profile,Address}.vue`, `components/Twilio/Tollfree/{StatusCard,RejectionList,ComplianceEmbed}.vue`, `utils/twilio-tollfree.mjs` · API `apps/portal-api/app/Controllers/API/V2/Twilio/{Verification,Brand,Campaign,Tollfree}.php`, `Twilio/Personal/{CustomerProfile,TrustProduct}.php`, `Twilio/Business/{CustomerProfile,TrustProduct}.php`, `Admin/ProfileTollfree.php`, `Webhook/TwilioTollfreeStatus.php` · trait `app/Traits/TwilioComplianceTrait.php` · services `app/Services/Twilio/{TollfreeVerificationService,TollfreeStatusMapper,TollfreeSenderActivationPolicy,TollfreeInboundResolver,TwilioRequestTollfreeWebhookValidator,TwilioSdkTollfreeInitializeProvider,TwilioSdkTollfreeStatusSyncProvider,Mock*}.php` · models `app/Models/{TwilioVerificationModel,TwilioTollfreeNumberModel,TwilioTollfreeVerificationModel,TwilioTollfreeVerificationEventModel,TwilioTollfreeVerificationRejectionModel}.php` · routes `app/Config/Routes.php` (the `/api/v2/twilio` group, the admin `profiles/:id/twilio/tollfree/*` group, and the public webhook `webhook/twilio/tollfree/status`)

## 1. Overview

This domain implements the regulatory verification a profile must complete before it can send application-to-person (A2P) SMS in the US/Canada. Two distinct, mutually-fallback paths exist:

1. **A2P 10DLC compliance** (`/twilio/compliance`) — the primary path. A guided multi-step wizard that performs Twilio TrustHub KYC: it creates a customer profile (personal "Sole Proprietor" or business "Standard"), an A2P trust product, registers an A2P brand, and registers a campaign use case. All KYC objects live in Twilio (TrustHub / Messaging API); the portal stores only SIDs, the current step, and brand/campaign status flags in `twilio_verifications`.
2. **Toll-free verification (TFV)** (`/twilio/tollfree`) — a fallback path, feature-flagged and per-profile-eligibility-gated, used when a Connect profile is blocked in the A2P process. It runs a Twilio-hosted embeddable compliance form, tracks verification status/history, handles rejection reasons, and (admin-side) manages toll-free number assignment and "sender activation".

**Who can use it.** Both flows require an authenticated user with the SMS/Connect permission (`PermissionSms`). The compliance wizard is gated by `validate: () => !useAuth().user.shouldSetupSMS` (only shown when the profile still needs SMS setup). The toll-free page is gated by `validate: () => !!useAuth().user?.permissions?.sms` AND per-profile `TollfreeFallbackEligible` AND the `TWILIO_TFV_ENABLED` env flag. Admin toll-free management (`/admin/profiles/:id/twilio/tollfree/*`) requires `account_type >= OGGVO_ACCOUNT_MANAGER` (2).

**Where it sits.** The compliance wizard is the onboarding gate for SMS — until it is submitted/approved the profile cannot run review campaigns over SMS. Toll-free is a parallel, opt-in pilot ("web_connect_only" pilot scope) controlled by staff.

**Business value.** Without 10DLC/TFV registration US carriers filter or block business SMS; this flow is mandatory for deliverability. It is the active feature on git branch `feature/twilio-toll-free-portal-flow`.

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/twilio/compliance` | `pages/twilio/compliance.vue` | default | Stepper (not tabs): step 01 Create Profile → 02 Create A2P Trust Product → 03 Register Campaign Use Cases → "completed" | authed + `!user.shouldSetupSMS` |
| `/twilio/tollfree` | `pages/twilio/tollfree.vue` | default | single page (status card, embed, rejections, details + history grid; admin sender panel inline) | authed + `user.permissions.sms` + profile `TollfreeFallbackEligible` + `TWILIO_TFV_ENABLED` |

Note: there is **no** dedicated frontend route for admin toll-free management — it is surfaced inline on `/twilio/tollfree` (the `ManageProfilesTollfreeFallbackPanel`, shown when `account_type >= 2` and the feature flag is on). The admin endpoints `/admin/profiles/:id/twilio/tollfree/*` back that panel and any future admin profile-detail screen.

## 3. Screen-by-screen

### `/twilio/compliance` — A2P 10DLC Compliance Wizard
![compliance](_assets/screens/twilio/compliance.png) <!-- placeholder until captured -->

- **Purpose & layout.** A 3-step horizontal stepper (`steps` array: `01 Create Profile`, `02 Create A2P Trust Product`, `03 Register Campaign Use Cases`; a 4th implicit `completed` state). On mount it calls `GET /twilio/verification/show` and sets `currentStep` from the returned `Step` (parsed as `parseInt(Step)`, zero-padded to 2 digits). Steps 02-03 of an old design (`Register An A2P Brand`) are commented out — brand registration now happens implicitly inside the trust-product submit. A loading spinner shows while `pending`. If `user.tollfreeFallback.enabled`, a banner above the forms links to `/twilio/tollfree` ("Need the toll-free fallback path?").
- **`onNext()` flow.** After each step's callback, `refresh()` re-fetches verification, then increments `currentStep`; once past step 4 it sets `currentStep = "completed"` and shows the "Thank you … under review" panel with a "Go home" link to `/dashboard`.

  **Step 01 — Create Profile** (`Twilio/Steps/Profile.vue`). Has an internal sub-step `init`:
  - **`init` sub-step** = `Twilio/Forms/Initialize.vue`. A `RadioGroup` to pick type (`business` → "Business / For Business"; `personal` → "Sole Proprietor / For Personal Use") plus an **email** field (prefilled from `verification.Email`). "Start Process" → `POST /twilio/initialize` with `{ email, type }`. On success emits `saved({type})`, which switches `formType` and reveals the per-type panel set.
  - **Business panels** (Headless UI `Disclosure` accordions, all default-open; each shows a green check when `successful`; "Submit for review" disabled until every panel saved):
    - `Business information` = `Forms/Business/Profile.vue` → `POST /twilio/business/customer-profile/business-info`
    - `Business Address` = `Forms/Business/Address.vue` → `POST /twilio/business/customer-profile/address`
    - `People to contact` = `Forms/Business/AuthorizedRepresentative.vue` → `POST /twilio/business/customer-profile/representative`
  - **Personal panels:**
    - `Personal information` = `Forms/Personal/Profile.vue` → `POST /twilio/personal/customer-profile/profile-information`
    - `Address information` = `Forms/Personal/Address.vue` → `POST /twilio/personal/customer-profile/address`
  - Bottom row: `Cancel` (→ `/dashboard`), `Submit for review` (`POST /twilio/submit-review`), and `Reset verification` (`Twilio/Reset.vue`). On submit-review error, per-panel server errors are mapped back into each accordion's `errors` and `successful=false`.

  **Step 02 — Create A2P Trust Product.** Renders `Forms/Business/Type.vue` (if `data.Type=='business'`) or `Forms/Personal/Type.vue` (if `personal`). These submit the trust product, which **also implicitly creates the A2P brand registration** (see §4 TrustProduct controllers).

  **Step 03 — Register Campaign.** Renders `Forms/Campaign.vue` (passed `verification=data`). Submits the US-app-to-person campaign use case.

- **Step-01 form fields (every field):**

  - **Initialize** — `type` (radio: business|personal, required), `email` (email, required).
  - **Business / Profile.vue** (`/business/customer-profile/business-info`): `business_name` (text, required; help tooltip about exact CP575/EIN legal name), `website_url` (text, required), `business_type` (select; required; options: Partnership, Limited Liability Corporation, Co-operative, Non-profit Corporation, Corporation), `business_registration_identifier` (select; options EIN, DUNS, CBN, CN, ACN, CIN, VAT, VATRN, RN, Other), `business_industry` (select; ~32 options incl. AUTOMOTIVE, BANKING, HEALTHCARE, TECHNOLOGY, NOT_FOR_PROFIT…), `business_regions_of_operation` (select: USA_AND_CANADA, LATIN_AMERICA, AFRICA, EUROPE, ASIA), `business_registration_number` (text, required). Hidden constant: `business_identity = 'direct_customer'` (forced server-side regardless of payload). Carries an `assignment_sid` round-trip used to delete+recreate the Twilio end-user assignment on edit.
  - **Business / Address.vue** (`/business/customer-profile/address`): `customer_name` (required), `street` (required), `street2` (optional), `city` (required), `region` (state, required, maxlen 2), `postal_code` (required), `iso_country` (required, maxlen 2), `assignment_sid` (round-trip).
  - **Business / AuthorizedRepresentative.vue** (`/business/customer-profile/representative`): `business_title` (labeled "Business name", required), `job_position` (select: CEO, CFO, Director, GM, VP, General Counsel, Other), `first_name`, `last_name` (required), `email` (required), `phone_number` (vue-tel-input, intl, required; stripped of spaces/dashes server-side), `assignment_sid`. (A second authorized representative is fully commented out in v1.)
  - **Personal / Profile.vue** (`/personal/customer-profile/profile-information`): `first_name`, `last_name` (required), `email` (required), `phone_number` (vue-tel-input intl, required), `assignment_sid`.
  - **Personal / Address.vue** (`/personal/customer-profile/address`): same 7 address fields as business address + `assignment_sid`.

- **Step-02 form fields:**
  - **Business / Type.vue** (`/business/trust-product/index`): `company_type` (select: public|private|non-profit|government, required); if `public`: `stock_exchange` (required), `stock_ticker` (required). Buttons: Cancel→`/dashboard`, Submit, plus `Reset verification`.
  - **Personal / Type.vue** (`/personal/trust-product/index`): `brand_name` (text, required; tooltip "you can use your personal name"), `mobile_phone_number` (vue-tel-input intl, required; warnings: must be valid US/CA number you can receive SMS on, not a Twilio number; OTP must be answered within 24h; max 3 uses per mobile across all Sole-Prop brands; OTP within 30 days of registration), `vertical` (select; ~23 options incl. COMMUNICATION, FINANCIAL, HEALTHCARE, TECHNOLOGY…).

- **Step-03 form fields — Campaign.vue** (`/twilio/campaign/create`, body wrapped in `{ body: form }`):
  - On mount calls `GET /twilio/brand/status` → `{brand_verified, identity_verified, in_review}`. Form is **disabled** until brand `APPROVED` and (for personal) identity `VERIFIED`. Warning banners shown for each. For personal not-yet-identity-verified, a "Resend SMS" button (`POST /twilio/brand/retry-otp`) is offered.
  - `us_app_to_person_usecase` (select; for personal forced to single option `SOLE_PROPRIETOR`; for business ~20 options: MARKETING, AGENTS_FRANCHISES, CHARITY, PROXY, 2FA, ACCOUNT_NOTIFICATION, CUSTOMER_CARE, DELIVERY_NOTIFICATION, FRAUD_ALERT, EMERGENCY, HIGHER_EDUCATION, K12_EDUCATION, MIXED, LOW_VOLUME, POLLING_VOTING, POLITICAL, PUBLIC_SERVICE_ANNOUNCEMENT, SOCIAL, SWEEPSTAKE, SECURITY_ALERT).
  - `description` (textarea, required, 40-4096 chars), `message_flow` ("How do recipients opt-in?", required, 40-2048), `message_sample1` & `message_sample2` (required, 20-1024 each; client-side validation rejects template placeholders like `[[name]]`/`{{name}}`), `opt_in_message`/`opt_out_message` (optional, 20-320), `opt_in_keywords`/`opt_out_keywords`/`help_keywords` (optional, ≤255), `help_message` (optional, 20-320), `has_embedded_links` (toggle, default true), `has_embedded_phone` (toggle, default true).
  - Buttons: Cancel→`/dashboard`, Submit, `Reset verification` (hidden while `brandInReview`).

- **States.** Loading spinner (`pending`); per-panel "saved/green-check"; "completed" thank-you panel; submit-for-review disabled until all panels saved; campaign form disabled until brand approved.
- **Modals.** `Twilio/Reset.vue` opens a themed `Modal` ("Reset 10DLC Verification — Are you sure?") with Cancel / danger Reset → `POST /twilio/verification/reset` then redirect to `/dashboard`.

### `/twilio/tollfree` — Toll-Free Verification status & history
![tollfree](_assets/screens/twilio/tollfree.png) <!-- placeholder until captured -->

- **Purpose & layout.** `PageHeader` ("Toll-Free Verification", breadcrumbs Settings → Toll-Free Verification). On mount runs three lazy fetches (each short-circuits to an empty payload if not eligible): `GET /twilio/tollfree/status`, `GET /twilio/tollfree/history`, and (if `account_type >= 2` && feature enabled) `GET /admin/profiles/:id/twilio/tollfree`. A page-level alert appears when not eligible / feature disabled.
- **`TollfreeStatusCard`** — derived UI state via `utils/twilio-tollfree.mjs` `deriveTollfreeUiState(payload, {eligible})` → label/description/badge color from `tollfreeStatusMeta`. Shows: assigned number + ownership state (or "no number assigned" empty box), sync error box, primary action button (`Start Verification` when `portal_status==not_started`; `Resume Verification` when `in_progress`/`needs_correction`; disabled if no assigned number), `Refresh Status` (sync), and a "Current Sync" tile (sync state + edit-window expiry).
  - **Primary action** → `POST /twilio/tollfree/initialize` `{email}`. Stores returned `inquiry_session_token`, reveals the embed, refreshes status+history.
  - **Refresh** → `POST /twilio/tollfree/sync`, then refresh status+history.
- **`ComplianceEmbed`** (`Twilio/Tollfree/ComplianceEmbed.vue`) — renders the Twilio-hosted embeddable compliance form using `config.public.twilioTollfreeEmbeddableUrl` + the `inquiry_session_token`. Emits `submitted`/`completed`/`state-change`; on any of those the page schedules debounced syncs at 0/2s/5s (`schedulePostSubmissionSync`).
- **`ManageProfilesTollfreeFallbackPanel`** (sender-only, admin) — visible when `account_type >= 2` && feature enabled. Activate → `POST /admin/profiles/:id/twilio/tollfree/activate-sender`; Deactivate → `…/deactivate-sender`; Refresh → re-fetch admin summary.
- **`RejectionList`** — red panel listing active `rejection_reasons` (code badge, received_at, reason text, optional "Review Twilio guidance" doc link). Hidden if none.
- **Verification Details (left card).** Read-only `<dl>`: Portal Status (Badge), Twilio Status (Badge or "Not available"), Verification ID, Registration ID, Inquiry Expires. Badge color derived by regex: green for approved/active/verified/complete/success, red for reject/fail/error/declin, yellow for pending/progress/review/submitted/correction/wait, gray otherwise.
- **History (right card).** Timeline of attempts (`GET /twilio/tollfree/history`); each entry: portal-status badge, twilio status text, updated/created timestamp. "Reload" button (disabled if not eligible). Empty state "No toll-free verification attempts yet."
- **States.** Loading (combined status+history pending); empty (history); page-alert (not eligible / feature disabled); permission-denied (server 403 from `authorizedProfile`).

## 4. Data & API

All `/twilio/*` routes are under group `['namespace'=>'App\Controllers\API\V2\Twilio','filter'=>'apiAuth']`. Admin routes under `App\Controllers\API\V2\Admin` + `apiAuth`. The webhook is public (HMAC-validated). Bodies wrapped in `{ body: form }` from the FE are read via `getJSON()`.

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v2/twilio/verification/show` | Current verification state for active profile | — | `{Status,Type,Step,Sid,ProgressBarVisibility,Email,BrandStatus,CampaignStatus,updated_at}` or 404 | `Verification.php::show` |
| POST | `/api/v2/twilio/initialize` | Create the TrustHub customer profile bundle; set Type+Email | `{type:business\|personal, email}` | 201 | `Verification.php::initialize` |
| POST | `/api/v2/twilio/hide-progress` | Hide wizard progress bar | — | updated | `Verification.php::hideProgressBar` |
| POST | `/api/v2/twilio/submit-review` | Assign to parent profile, evaluate policy, submit customer profile for review | — | 201 or field-mapped errors | `Verification.php::submitForReview` |
| POST | `/api/v2/twilio/verification/reset` | Reset brand/campaign/trust SIDs, Step→1.1 | — | "ok" / 404 | `Verification.php::reset` |
| POST | `/api/v2/twilio/personal/customer-profile/profile-information` | Create end-user `starter_customer_profile_information`, assign, evaluate; Step→1.2 | first_name,last_name,email,phone_number,assignment_sid | `{assignment_sid}` | `Personal/CustomerProfile.php::profileInformation` |
| GET | `/api/v2/twilio/personal/customer-profile/policy` | Fetch starter customer-profile policy | — | Twilio policy | `Personal/CustomerProfile.php::policy` |
| POST | `/api/v2/twilio/personal/customer-profile/address` | Create address + supporting doc, assign, evaluate | 7 address fields + assignment_sid | `{assignment_sid}` | `Personal/CustomerProfile.php::address` |
| POST | `/api/v2/twilio/personal/trust-product/index` | Create Sole-Prop A2P trust bundle + end-user + assignments + evaluate + submit + **create SOLE_PROPRIETOR brand**; Step→3.1 | brand_name,vertical,mobile_phone_number | 201 | `Personal/TrustProduct.php::index` |
| POST | `/api/v2/twilio/business/customer-profile/business-info` | Create end-user `customer_profile_business_information`, assign, evaluate; Step→1.2 | business_* fields + assignment_sid | `{assignment_sid}` | `Business/CustomerProfile.php::businessInfo` |
| POST | `/api/v2/twilio/business/customer-profile/representative` | Create end-user `authorized_representative_1`, assign, evaluate; Step→1.3 | first/last/email/phone/business_title/job_position + assignment_sid | `{assignment_sid}` | `Business/CustomerProfile.php::representative` |
| POST | `/api/v2/twilio/business/customer-profile/address` | Address + supporting doc, assign, evaluate | 7 address fields + assignment_sid | `{assignment_sid}` | `Business/CustomerProfile.php::address` |
| POST | `/api/v2/twilio/business/trust-product/index` | Create A2P trust bundle + end-user `us_a2p_messaging_profile_information` + assignments + evaluate + submit + **create brand (skipAutomaticSecVet)**; Step→3.1 | company_type, stock_exchange?, stock_ticker? | 201 | `Business/TrustProduct.php::index` |
| GET | `/api/v2/twilio/brand/status` | Brand + identity status | — | `{brand_verified, identity_verified, in_review}` | `Brand.php::status` |
| POST | `/api/v2/twilio/brand/retry-otp` | Re-send brand OTP SMS | — | 201 | `Brand.php::retryOtp` |
| GET | `/api/v2/twilio/brand/vetting-records` | External vetting records | — | Twilio brandVettings list | `Brand.php::vettingRecords` |
| GET | `/api/v2/twilio/campaign/usecases` | Allowed A2P use cases for brand | — | Twilio usAppToPersonUsecases | `Campaign.php::usecases` |
| POST | `/api/v2/twilio/campaign/create` | Delete prior campaign, verify brand approved, create usAppToPerson campaign, subscribe event streams; Step→5 | campaign fields (see §3) | 201 or `{error,reason}` | `Campaign.php::create` |
| GET | `/api/v2/twilio/campaign/status` | Campaign registration status | — | Twilio usAppToPerson | `Campaign.php::status` |
| DELETE | `/api/v2/twilio/campaign/delete` | Delete A2P campaign | `messaging_service_sid` | Twilio delete | `Campaign.php::delete` |
| GET | `/api/v2/twilio/tollfree/status` | TFV status snapshot for assigned number | — | see `statusPayload` below | `Tollfree.php::status` |
| POST | `/api/v2/twilio/tollfree/initialize` | Create/resume pending TFV; return embeddable session token | `{email}` | `{verification_id,portal_status,registration_id,inquiry_id,inquiry_session_token,expires_at}` | `Tollfree.php::initialize` |
| POST | `/api/v2/twilio/tollfree/sync` | Request status re-sync (stub: returns `pending`) | — | `{profile_id,sync_state:'pending'}` | `Tollfree.php::sync` |
| GET | `/api/v2/twilio/tollfree/history` | Verification attempt history | — | `{history:[{verification_id,portal_status,twilio_status,registration_id,inquiry_id,created_at,updated_at}]}` | `Tollfree.php::history` |
| GET | `/api/v2/admin/profiles/:id/twilio/tollfree` | Admin TFV detail (eligibility, assigned number, latest verification, rejections, sender activation summary, recent events) | — | full admin payload | `Admin/ProfileTollfree.php::show` |
| GET | `/api/v2/admin/profiles/:id/twilio/tollfree/numbers` | Available (reserved/released, unassigned) toll-free numbers | — | `{numbers:[…]}` | `Admin/ProfileTollfree.php::numbers` |
| POST | `/api/v2/admin/profiles/:id/twilio/tollfree/eligibility` | Toggle `TollfreeFallbackEligible` | `{enabled:bool}` | `{profile_id,eligible}` | `Admin/ProfileTollfree.php::setEligibility` |
| POST | `/api/v2/admin/profiles/:id/twilio/tollfree/assign-number` | Assign an available number to profile | `{tollfree_number_id}` | `{ownership_state:'assigned'}` | `Admin/ProfileTollfree.php::assignNumber` |
| POST | `/api/v2/admin/profiles/:id/twilio/tollfree/release-number` | Release assigned number | — | `{ownership_state:'released'}` | `Admin/ProfileTollfree.php::releaseNumber` |
| POST | `/api/v2/admin/profiles/:id/twilio/tollfree/activate-sender` | Set `TollfreeSendMode='active'` (policy-gated) | — | `{sender_mode:'active',activated_at,activated_by_user_id}` | `Admin/ProfileTollfree.php::activateSender` |
| POST | `/api/v2/admin/profiles/:id/twilio/tollfree/deactivate-sender` | Set `TollfreeSendMode='disabled'` | — | `{sender_mode:'disabled'}` | `Admin/ProfileTollfree.php::deactivateSender` |
| POST | `/api/v2/admin/profiles/:id/twilio/tollfree/sync` | Admin sync (stub: 501 not implemented until Task 6) | — | 501 | `Admin/ProfileTollfree.php::sync` |
| GET | `/api/v2/admin/profiles/:id/twilio/tollfree/history` | Full admin event history | — | `{history:[event…]}` | `Admin/ProfileTollfree.php::history` |
| POST | `/webhook/twilio/tollfree/status` | Twilio TFV status callback (HMAC-validated) | `registration_id,status,edit_allowed,edit_expiration,rejection_*,documentation_url,event_id,occurred_at,verification_sid` | snapshot or `{status:'duplicate'\|'ignored'}` | `Webhook/TwilioTollfreeStatus.php::handle` |

**`statusPayload` (TFV status) shape:** `{eligible, assigned_number:{id,phone_number,phone_number_sid,messaging_service_sid,ownership_state}|null, portal_status, twilio_status, rejection_reasons:[{code,reason,documentation_url,is_active,received_at}], edit_allowed, can_resubmit, edit_expires_at, sync_state, sync_error, identifiers:{verification_id,registration_id,verification_sid,inquiry_id,expires_at}}`.

- **v1 models / tables:**
  - `twilio_verifications` (`TwilioVerificationModel`) — fields: `ProfileID, Email, Type, Status, BrandStatus, CampaignSid, CampaignStatus, Step, Sid (customer profile SID), BrandSid, TrustProductSid, ProgressBarVisibility, created_at, updated_at`.
  - `twilio_tollfree_numbers` (`TwilioTollfreeNumberModel`) — `ProfileID, TwilioAccountSid, PhoneNumber, PhoneNumberSid, MessagingServiceSid, OwnershipState (reserved|released|assigned|verified|active), AssignedAt, VerifiedAt, ActivatedAt, ReleasedAt, SyncState, SyncError`.
  - `twilio_tollfree_verifications` (`TwilioTollfreeVerificationModel`) — `ProfileID, TollfreeNumberID, PortalStatus (not_started|in_progress|submitted|needs_correction|approved|rejected), TwilioStatus (PENDING_REVIEW|TWILIO_APPROVED|TWILIO_REJECTED), TwilioAccountSid, NotificationEmail, CustomerProfileSid, RegistrationId, VerificationSid, InquiryId, InquirySessionTokenExpiresAt, EditAllowed, EditExpiration, SyncState (pending|ok|error), SyncError, SubmissionSnapshotJson, LatestTwilioPayloadJson, SubmittedAt, ApprovedAt, RejectedAt`.
  - `twilio_tollfree_verification_events` (`TwilioTollfreeVerificationEventModel`) — `VerificationID, ProfileID, Source (admin|twilio_event_stream|twilio_poll), EventType, PortalStatusFrom/To, TwilioStatusFrom/To, ActorUserID, IdempotencyKey, PayloadJson`.
  - `twilio_tollfree_verification_rejections` (`TwilioTollfreeVerificationRejectionModel`) — `VerificationID, Code, Reason, DocumentationUrl, IsActive, PayloadJson, ReceivedAt`.
  - `profiles` toll-free columns: `TollfreeFallbackEligible, TollfreeFallbackEligibleAt, TollfreeFallbackEligibleByUserID, TollfreeFallbackDisabledAt, TollfreeSendMode (disabled|active), TollfreeActivatedAt, TollfreeActivatedByUserID`; plus the A2P SMS columns `Shortname, SMSNumberSID, SMSNumberToken, MessagingServiceId, SMSNumber`.
- **Pagination / filtering / sorting:** none on these endpoints. History is ordered `ID DESC`; admin `show` history limited to 5, admin `history` unlimited. No query params.

## 5. Business rules

- **Per-profile Twilio credentials.** Every A2P call instantiates the Twilio SDK with the profile's own subaccount creds `new Client($profile->SMSNumberSID, $profile->SMSNumberToken)`. If either is missing, the call fails with "Something went wrong". The compliance trait's `$parentProfileSid = 'BU9ee606cdd4c869c4dacea9ef981ab332'` (master business) is assigned to the customer profile at submit-review time.
- **Hard-coded policy SIDs** (TrustHub). Customer-profile policies: business `RNdfbf3fae0e1107f8aded0e7cead80bf5`, personal/starter `RN806dd6cd175f314e1f96a9727ee271f4`. Trust-product policies: business A2P `RNb0d4771c2c98518d916a3d4cd70a8f8b`, personal Sole-Prop `RN670d5d2e282a6130ae063b234b6019c8`. Campaign `complianceType` (usAppToPerson SID) `QE2c6890da8086d771620e9b13fadeba0b`. These are global constants in v1 and must move to config/env in v2.
- **Step state machine** (string `Step` in `twilio_verifications`): `1.1` after initialize → `1.2` (business-info / personal-profile saved) → `1.3` (business representative saved) → `2.1` (submit-for-review) → `3.1` (trust product + brand created) → `5` (campaign created). Sub-steps gate each form server-side (`(float)Step < 1.1` etc. reject out-of-order submission).
- **Brand creation is implicit.** The "Register A2P Brand" step is removed from the UI; brand registration happens inside the trust-product submit (`brandRegistrations->create`). Business brand uses `skipAutomaticSecVet=true`; personal uses `brandType=SOLE_PROPRIETOR`.
- **Edit/idempotency on KYC forms.** Each customer-profile form returns an `assignment_sid`; re-submitting deletes the existing TrustHub entity assignment before re-creating, so forms are editable. After each create the policy is re-evaluated; `noncompliant` results are parsed (`TwilioComplianceTrait::parseErrors`) into per-field error maps and returned with the `assignment_sid` so the FE can retry without losing the assignment.
- **Campaign gating.** Campaign create first deletes any existing campaign of `complianceType`, then re-fetches brand; requires `status==APPROVED` (and for personal `identityStatus==VERIFIED`) else fails with `{error,reason}`. Sets `BrandStatus=1` then creates the campaign and subscribes to campaign event streams.
- **Sole-Prop OTP rules** (surfaced in UI): mobile must be a real US/CA number that can receive SMS (not a Twilio number); user must reply to the OTP within 24h (else resend via `brand/retry-otp`); OTP must complete within 30 days; a mobile number can be used at most 3 times across all Sole-Prop brands (incl. other vendors).
- **Event-stream subscriptions.** `subscribeEventStreams($profile,'brand'|'campaign')` creates a Twilio Events `sink` (webhook → `app_url("webhook/twilio/{profileId}/status")`) and a `subscription` for brand-registered/failure/unverified (brand) or campaign-submitted/failure/approved (campaign). **Bug:** the guard `if (in_array($type, array_keys($types))) return;` returns *early for valid types* — so subscriptions are never actually created. Fix in v2.
- **TFV feature gating.** `Tollfree::authorizedProfile()` requires: `TWILIO_TFV_ENABLED` truthy, `user.PermissionSms`, and profile `TollfreeFallbackEligible`. Otherwise 403. `TWILIO_TFV_MOCK_MODE` switches initialize/sync between SDK and mock providers; in non-mock mode `initialize` returns 503 if the SDK provider has not populated `RegistrationId/InquiryId/InquirySessionTokenExpiresAt` ("not implemented for normal mode").
- **TFV initialize resume.** If an active verification exists (`PortalStatus in in_progress|submitted|needs_correction`) it is reused rather than re-created. `createPendingRecord` seeds `PortalStatus='in_progress', SyncState='pending'`.
- **Status mapping** (`TollfreeStatusMapper`). Supported Twilio statuses: `PENDING_REVIEW→submitted`, `TWILIO_APPROVED→approved`, `TWILIO_REJECTED→` (`rejected` if `!edit_allowed`; `needs_correction` if edit allowed and edit window not expired; else `rejected`). Unsupported statuses set `SyncState='error'` and log a `status_unrecognized` event (webhook) / `poll_status_unrecognized` (poll). Approved sets `ApprovedAt`; rejected/needs_correction sets `RejectedAt`.
- **Webhook idempotency & security.** `TwilioRequestTollfreeWebhookValidator` validates `X-Twilio-Signature` (HMAC via account auth token from `Config\Keys`/`keys.AccountToken`); invalid → 401. Idempotency key = provided `event_id` or `sha1(registration_id+status+occurred_at+verification_sid)`; duplicate keys short-circuit with `{status:'duplicate'}`. Each accepted webhook writes a `twilio_tollfree_verification_events` row and updates the verification + active rejection (deactivates prior rejections, inserts new if `rejection_reason` present).
- **Sender-activation policy** (`TollfreeSenderActivationPolicy`). `can_activate` requires ALL: an assigned number, latest verification `PortalStatus==approved`, `TWILIO_TFV_INBOUND_ROUTING_ENABLED` (defaults to "true if `TollfreeInboundResolver` class exists"), and `TWILIO_TFV_PILOT_SCOPE=='web_connect_only'`. Blocking reasons surfaced individually. Activation/deactivation writes `profiles.TollfreeSendMode` and logs an `admin`-source event with idempotency key `admin-{type}-{profileId}-{userId}-{rand}`.
- **Inbound routing** (`TollfreeInboundResolver`). Resolves an inbound number (To) to a profile: normalizes phone to E.164/10-digit candidates, prefers a toll-free number in state assigned/verified/active that is not released, not sync-error'd, whose profile has `TollfreeSendMode=='active'` and an `approved` verification for that number; otherwise falls back to `profiles.SMSNumber`.
- **Admin eligibility timestamps.** Enabling sets `TollfreeFallbackEligibleAt`+`…ByUserID`; disabling sets `TollfreeFallbackDisabledAt`. Assign requires number in `reserved|released`, profile eligible, and no existing active number. All timestamps `gmdate('Y-m-d H:i:s')` (UTC).
- **Stub endpoints.** `Tollfree::sync` and `Admin/ProfileTollfree::sync` are placeholders (return `pending` / 501) — real polling deferred to "Task 6"; the actual sync logic lives in `TollfreeVerificationService::syncVerificationById` (wired to the SDK/mock status providers + `twilio-tollfree-sync` job in v2).

## 6. Integrations

- **Twilio TrustHub v1** — customer profiles, end-users, supporting documents, addresses, entity assignments, evaluations (KYC for 10DLC). Per-profile subaccount credentials.
- **Twilio Messaging v1** — brand registrations (+ OTP, brand vettings), messaging services, usAppToPerson campaigns.
- **Twilio Events v1** — sinks + subscriptions to brand/campaign compliance event streams (currently no-op due to bug; see §5).
- **Twilio Toll-Free Verification** — the hosted embeddable compliance form (`twilioTollfreeEmbeddableUrl` + `inquiry_session_token`) and the TFV status callback.
- **Webhooks:**
  - `POST /webhook/twilio/{profileId}/status` — brand/campaign + customer-profile/trust-product `statusCallback` (set on TrustHub object creation).
  - `POST /webhook/twilio/tollfree/status` — TFV status callback, HMAC-validated, idempotent, event-logged.

## 7. v1 → v2 mapping

- **Modules.** Compliance orchestration + state machine → `apps/api/src/modules/messaging` (controller/service/repository/DTO per A2P object). Twilio SDK adapters, the TFV initialize/status-sync providers (SDK + mock), and both webhook handlers → `apps/api/src/modules/integrations`. Keep the `TollfreeStatusMapper`, `TollfreeSenderActivationPolicy`, and `TollfreeInboundResolver` as pure services.
- **Drizzle tables.** `twilio_verifications` already exists in `@oggvo/db` (`packages/db/src/schema/twilio.ts`) with camelCase columns (`brandSid, brandStatus, campaignSid, campaignStatus, step default "1.2", sid, trustProductSid, progressBarVisible`). **Schema gap:** the four toll-free tables are NOT yet defined — must add `twilio_tollfree_numbers`, `twilio_tollfree_verifications`, `twilio_tollfree_verification_events`, `twilio_tollfree_verification_rejections`, plus the seven `profiles.tollfree_*` columns. Add Postgres enums for `tollfree_ownership_state`, `tollfree_portal_status`, `tollfree_twilio_status`, `tollfree_sync_state`, `tollfree_send_mode`, `tollfree_event_source`.
- **Queue.** `twilio-tollfree-sync` (BullMQ) for status polling (the deferred "Task 6" sync). 10DLC brand/campaign status can stay request-driven or move to an event-stream consumer.
- **Frontend.** v2 routes `apps/web/app/(portal)/twilio/compliance` and `…/twilio/tollfree`. Reuse `@oggvo/ui` Stepper, Disclosure/Accordion, Listbox/Select, Switch, Badge, Modal/ConfirmModal, phone-input. Keep `twilio-tollfree.mjs` state derivation as a typed util.
- **Endpoint mapping (RESTful, OpenAPI-typed).** `GET /twilio/verification/show` → `GET /messaging/compliance`; `POST /twilio/initialize` → `POST /messaging/compliance`; `POST /twilio/submit-review` → `POST /messaging/compliance/submit`; `POST /twilio/verification/reset` → `POST /messaging/compliance/reset`; the per-section saves → `PUT /messaging/compliance/{section}`; `…/campaign/create` → `POST /messaging/compliance/campaign`; brand status → `GET /messaging/compliance/brand`. Toll-free: `GET /messaging/tollfree`, `POST /messaging/tollfree/initialize`, `POST /messaging/tollfree/sync`, `GET /messaging/tollfree/history`; admin under `GET/POST /admin/profiles/{id}/tollfree…`; webhook `POST /integrations/twilio/tollfree/status`.
- **Known v1 bugs to fix:**
  1. `subscribeEventStreams` early-returns for valid types → event-stream subscriptions never created.
  2. Hard-coded policy/parent SIDs in PHP source → move to config/env.
  3. `Business/TrustProduct.php` & `Personal/TrustProduct.php` each duplicate a local `parseErrors` instead of using the trait (TODO comment present).
  4. Multi-step KYC has no DB transaction — partial failures leave orphaned TrustHub entities; v2 should track created SIDs for cleanup/rollback.
  5. `twilio_verifications.Step` is a stringly-typed float — model as an explicit enum/step ordinal in v2.
  6. `Tollfree::sync` and admin `sync` are stubs returning fake "pending"/501 — wire to the real `syncVerificationById` + queue.
  7. Webhook HMAC uses a single global `keys.AccountToken`, but TrustHub objects belong to per-profile subaccounts — verify the correct auth token per subaccount in v2.

## 8. Open questions / parity risks

- **Schema gap (blocking).** None of the four toll-free tables nor the `profiles.tollfree_*` columns exist in `@oggvo/db` yet — phase 4 must add them before any TFV code lands. Confirm enum value sets match v1 string unions exactly (esp. `OwnershipState` includes `reserved|released|assigned|verified|active` and `PortalStatus` includes `needs_correction`).
- **Embeddable token lifecycle.** In non-mock mode the SDK initialize provider must populate `RegistrationId/InquiryId/InquirySessionTokenExpiresAt`; v1 returns 503 if not. Confirm Twilio's real "Trusted Communications / TFV inquiry" embeddable contract (session token TTL, refresh) — v1 only has a mock token (`mock-session-{id}`).
- **Sync not implemented.** Both user and admin `sync` are stubs; the real polling path (`TollfreeVerificationService::syncVerificationById` + status providers) is built but not routed. Decide push (event stream) vs poll (queue) as the source of truth — they can race on `SyncState`/`PortalStatus`.
- **Event-stream subscriptions broken in v1** (see §7 bug 1): unclear whether 10DLC brand/campaign status updates ever arrived via webhook in production, or only via the on-demand `brand/status`/`campaign/status` fetches. Treat fetch-on-demand as the known-working path.
- **Pilot scope hard gate.** Sender activation only works when `TWILIO_TFV_PILOT_SCOPE=='web_connect_only'`; confirm this remains the only supported scope or generalize.
- **Per-subaccount webhook auth.** TFV webhook validates against one global account token; if TFV numbers live in per-profile subaccounts the signature check may be against the wrong token. Validate before go-live.
- **`business_identity` is force-overwritten** to `direct_customer` server-side regardless of input — confirm no ISV/reseller flow is needed in v2.
- **Number provisioning unmodeled.** Toll-free numbers enter the system in `reserved`/`released` state but no v1 code purchases or reserves them — assumed populated out-of-band. v2 must define how `twilio_tollfree_numbers` rows are seeded.
