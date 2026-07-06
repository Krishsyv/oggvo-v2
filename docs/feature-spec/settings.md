# Settings

> **v2 target:** module `apps/api/src/modules/tenancy` (profile + satellites) plus a thin settings surface · tables `profiles`, `profile_review_settings`, `profile_google`, `profile_email_settings`, `profile_messaging_settings`, `profile_newsletter_settings`, `profile_affiliate`, `profile_prompts`, `geo_zipcodes`, `geo_zipcodes_profile`, `monthly_targets`, `email_notifications`, `push_channels`, `users` (`@oggvo/db`) · queue `—` (synchronous; logo writes go to object storage) · build phase 1–4
> **v1 sources:** frontend `apps/portal-frontend/pages/settings/index.vue` + `pages/settings/index/{index,accounts,team,notifications,review,referral}.vue`, components `apps/portal-frontend/components/Settings/*` + `components/Preferences/DeleteModal.vue`, admin profile edit `pages/manage/profiles/[id].vue`, API `apps/portal-api/app/Controllers/API/V2/{Profile,Users,Notifications}.php` + `Settings/{Settings,Address,Targets,Widget}.php`, models `app/Models/{ProfileModel,UserModel,GeoZipcodesModel,GeoZipcodesProfileModel,MonthlyTargetModel}.php`, routes `app/Config/Routes.php`

## 1. Overview

Settings is the per-profile + per-user configuration surface for the portal. From a single tabbed page a profile owner manages their business identity (name, contact, address, logos), the Google My Business links derived from their address, geo-tagging ZIP codes, social-platform integrations, team members, review notification emails and push devices, auto-share-to-social rules, and the client referral (affiliate) program. Service-area addresses feed timezone auto-sync and Google link generation; monthly targets and chat-widget config are written through the same settings group but rendered on other screens (dashboard / widgets). Most actions are scoped to the **active profile** (`request.auth.profile_id`) and require an authenticated session; the admin business-profile edit page (`/manage/profiles/[id]`) is gated to staff (`AccountType >= OGGVO_SALES`/supervisor). There is no per-feature permission matrix in v1 — the commented-out roles/permissions UI was never shipped, so effectively the profile owner has full access to everything on these tabs.

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/settings` | `pages/settings/index.vue` (shell) + `settings/index/index.vue` | default (portal) | Profile (default) | authed, active profile |
| `/settings/notifications` | `pages/settings/index/notifications.vue` | default | Notifications | authed |
| `/settings/accounts` | `pages/settings/index/accounts.vue` | default | Integrations | authed |
| `/settings/team` | `pages/settings/index/team.vue` | default | Team | authed |
| `/settings/review` | `pages/settings/index/review.vue` | default | Review Sharing | authed |
| `/settings/referral` | `pages/settings/index/referral.vue` | default | Client Referral Program | authed |
| `/manage/profiles/[id]` | `pages/manage/profiles/[id].vue` | default | — (dedicated edit page) | staff (`AccountType >= OGGVO_SALES`); admin filter on `/admin/profiles/*` |

The tab bar lives in `settings/index.vue` (responsive: `<select>` on mobile, `NuxtLink` tabs on desktop). Tab labels differ from route names: Profile, Notifications, Integrations, Team, Review Sharing, Client Referral Program. The Profile tab also conditionally renders `LazyTwilio` (A2P/toll-free settings cards) above the form when `route.name === "settings-index"`.

## 3. Screen-by-screen

### `/settings` — Profile tab
![profile](_assets/screens/settings/profile.png) <!-- placeholder until captured -->

- **Purpose & layout** — primary business-identity editor. Sectioned form (label column + control column). Loads via `GET /profiles/me` on mount and again through `useLazyAsyncData("my-profile")`. After hydration the form is force-remounted (`formRenderKey++`) to clear browser autofill.
- **Compliance cards (top, conditional)**
  - **A2P 10DLC Compliance** card — shown when `!verificationStatus`; links to `/twilio/compliance`. Button disabled and labelled "In Review" when `Step > 4`. Status from `GET /twilio/verification/show`.
  - **Toll-Free Verification** card — shown when `auth.user.tollfreeFallback.enabled`; links to `/twilio/tollfree`.
- **Basics section / fields**
  - `BusinessName` (text, "Business Name") → saved as `BusinessName`.
  - `Phone` (text, "Business Number") → `Phone`.
  - `Address` (text, "Business Address") → `Address`.
  - `Address2` (text, "Business Address Line 2") → `Address2`.
  - `City`, `State`, `Zipcode` (3-col grid) → `City`/`State`/`Zipcode`.
  - **Timezone status line** — read-only. Shows "Timezone synced from your address: {Timezone}" when a timezone exists and state/zip are unchanged; otherwise "Timezone will update after you save…" / "…will sync after you save a valid state and ZIP code." On submit the frontend resolves an IANA tz from the address via `useGeoTimezone().tzFromAddress(...)` and posts `Timezone`/`Latitude`/`Longitude`.
  - **Profile Logo** uploader — file input (PNG/JPEG/JPG), uploads immediately on select to `POST /profiles/upload-logo` (FormData field `profileImage`); preview, reset (clears `form.Image`), spinner overlay while `uploading`.
  - **Business Logo** uploader — file input opens `LogoCropperModal` first (crop step), then uploads cropped file to `POST /profiles/upload-business-logo` (FormData field `businessImage`); preview uses `object-contain`, reset clears `form.BusinessImage`.
  - **Save / Reset** buttons. Reset restores `formCached`; Save disabled when nothing changed.
- **Google My Business Profile Settings section**
  - When the profile has an address (all three Google fields present): three read-only inputs — **Google Review Dialog** (`GoogleReviewDialog`), **Google Maps URL** (`GoogleMapsURL`), **Google Review List** (`GoogleReviewList`), each with an open-in-new-tab icon. These are generated server-side from the Google Place and are explicitly stripped from `save-settings` posts.
  - When no address: renders `<MapModal>` to pick/save an address.
  - **Remove Current Address** button (danger) → opens a confirm `Modal`; confirming calls `DELETE /settings/addresses`, which blanks all address + Google columns.
- **Geo Tagging Image Settings section** — `<GeoTagsCombobox>`. Up to **5 ZIP codes** tagged to images. Backed by `GET /settings/zip-codes`, `POST /settings/zip-codes`, `DELETE /settings/zip-codes/{id}`.
- **States** — initial load spinner per `useLazyAsyncData`; logo uploaders show spinner overlay; Save shows loading; error toasts via `$notify`. Empty Google section falls back to the map picker.
- **Modals / drawers** — `LogoCropperModal` (business logo crop), confirm `Modal` for address removal, `MapModal` (address entry).

### `/settings/notifications` — Notifications tab
![notifications](_assets/screens/settings/notifications.png) <!-- placeholder until captured -->

- **Purpose** — manage review-alert email recipients and push-notification devices.
- **Review Notification** — `<SettingsNotificationEmailsTable>`: list of subscribed emails from `GET /notifications`. Inline add form (email input, validated `required|valid_email|blacklist_validation`, duplicate-checked) → `POST /notifications`. Per-row Delete → `DELETE /notifications/{id}`. Empty state with InboxIcon + "Add Email" CTA.
- **Push Notifications** — current device detected via user-agent (`GET /settings/devices` returns `{device, user_devices}`). Subscribe button requests browser permission (Safari path uses Apple push package; others use FCM `$messaging.getToken()`), then `POST /notifications/subscribe` with token. Subscribed-devices list (OS + browser + created date, "Current Device" badge) with Unsubscribe per device → confirm modal (`ConfirmModal`) → `DELETE /notifications/unsubscribe` with `{token}`. A `opn` cookie tracks subscription state (`blocked` / token-prefix).
- **States** — table loading skeletons; "You haven't subscribed on any devices yet."; blocked-permission inline warning.

### `/settings/accounts` — Integrations tab
![accounts](_assets/screens/settings/accounts.png) <!-- placeholder until captured -->

- **Purpose** — list and manage connected social/CRM/payment platforms used for auto-sharing reviews.
- **Connected accounts table** — `GET /socials/get` returns connected platforms (name, page, active/inactive). Each row shows platform logo (`/images/platforms/<name>.svg`, `.png` for FollowUpBoss), name, page, Active/Inactive badge, and a trash button → `SettingsDeleteSocialAccountModal`.
- **Connect modal** — `SettingsSocialConnectModal` builds OAuth URLs from `GET /settings/social-accounts` (returns auth URLs for facebook, twitter, linkedin, google, squareup, stripe, clover, clio, liondesk, pam, shopify, quickbooks). On success re-fetches list.
- **Unfinished-process flow** — if a Google/LinkedIn connection has an empty `pageID`, `SettingsFinishConnectProcessModal` prompts to finish page selection.
- **States** — 5-row loading skeleton; "No social connection" empty row.

### `/settings/team` — Team tab
![team](_assets/screens/settings/team.png) <!-- placeholder until captured -->

- **Purpose** — view team members and edit the owner's own user record.
- **Team members table** — single row for the current owner: avatar (`assets/media/avatars/{image}`), name, email, role "Owner", and a `Dropdown` with two actions:
  - **Edit User** (`SettingsUpdateUserModal`) — fields `first_name`, `last_name`, `email`, avatar image; submits FormData to `POST /users/update`; on success `auth.fetchUser()`.
  - **Update Password** (`SettingsUpdatePasswordModal`) — `current_password`, `password`, `password_confirmation`; `PasswordRequirements` helper; submits JSON to `POST /users/change-password`.
- **States** — static single row; invite form and permission matrix exist only as commented-out markup (not shipped). No multi-member management in v1.

### `/settings/review` — Review Sharing tab
![review](_assets/screens/settings/review.png) <!-- placeholder until captured -->

- **Purpose** — configure automatic publishing of reviews to connected social pages.
- **Rating Threshold** — master Switch ("Auto publish reviews is Enabled/Disabled"). When on, a `RatingStar` selector sets `SocialThreshold` (1–5, stored as value−1; `-1` = disabled). Warning banner: reviews below 4★ not published/rejected auto-publish 14 days after submission. Toggling/changing rating posts `POST /profiles/save-settings` with `SocialThreshold` (and `SocialReviewMessage`).
- **Share Template** (visible when active) — mode toggle Shuffle (`rotate`) / Fixed; grid of 5 templates (`type-1..type-5`) each with a Preview button (opens template-preview Modal with `SocialPreviewer` iframe). Validation: rotate mode needs ≥2 templates or switch to fixed. Save → `POST /profiles/save-settings` with `AutoReviewShareMode`, `AutoReviewShareTemplates` (CSV).
- **Platforms** (visible when active) — per-platform Switch (Facebook, Instagram, Google, LinkedIn, Twitter). State from `GET /reviews/auto-share`. Toggle on → `POST /reviews/auto-share/activate {name}`; off → `DELETE /reviews/auto-share/deactivate {name}`.
- **Review Message** — textarea `SocialReviewMessage` with a placeholder dropdown (`[[platform]]`, `[[page]]`, `[[rating]]`, `[[link]]`). Empty defaults to "New Review!". Save → `POST /profiles/save-settings`.
- **States** — sections after the threshold are hidden while disabled; preview modal shows empty state when no saved review exists.

### `/settings/referral` — Client Referral Program tab
![referral](_assets/screens/settings/referral.png) <!-- placeholder until captured -->

- **Purpose** — enable an affiliate program and expose a shareable referral URL.
- **Fields** — Activate Switch (`AffiliateActive`); Default footer text (`AffiliateFooterText`, max 150 chars); read-only Referral URL `{frontURL}ref/{code}` with CopyButton. Loaded via `GET /settings/referral` (generates an affiliate code on first read if absent). Save → `POST /profiles/save-settings` with `AffiliateActive`, `AffiliateFooterText`. Reset restores cached values.

### `/manage/profiles/[id]` — Admin: Edit Profile (business profile edit page)
![manage-profile-edit](_assets/screens/settings/manage-profile-edit.png) <!-- placeholder until captured -->

- **Purpose & layout** — staff-only dedicated edit page (recently converted from a modal — commit `22aaec27`). Breadcrumbs Manage Home › Profiles › Edit Profile. Loads via `GET /admin/profiles/{id}`.
- **Profile Details** — `Name` (required), `Shortname` ("Slug (URL)", required, `alpha_dash`, uniqueness checked server-side), `ExpirationDate` (date). Save → `POST /admin/profiles/{id}`; on success redirects to `/manage/profiles`.
- **Toll-Free Fallback** — `ManageProfilesTollfreeFallbackPanel`: eligibility toggle, number inventory/assignment/release, sender activate/deactivate, verification + rejection-reason + history summary. Backed by `/admin/profiles/{id}/twilio/tollfree*` endpoints (toll-free domain — cross-reference connect-messaging spec).
- **States** — load failure toasts and redirects to list; per-action loading flags.

## 4. Data & API

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v2/profiles/me` | Load active-profile settings | optional `select[]` query | flattened profile fields incl. `BusinessName, Phone, Address, City, State, Zipcode, Timezone, SocialThreshold, SocialReviewMessage, AutoReviewShareMode, AutoReviewShareTemplates, Image{name}, BusinessImage{name}, GoogleReviewDialog/MapsURL/ReviewList, TotalReviews, AverageScore, CampaignsPaused`, activation flags | `Profile.php::me` |
| POST | `/api/v2/profiles/save-settings` | Persist any profile column (settings/review/referral all funnel here) | JSON of allowed `profile` fields; color keys prefixed `#…` stripped; `FromName→EmailCampaignFromName`, `ReplyTo→EmailCampaignReplyTo`; `Logo`/`BusinessLogo` filenames; Google fields **ignored** | updated subset (`BusinessName, Phone, Address…, Image, BusinessImage`) | `Profile.php::saveSettings` |
| POST | `/api/v2/profiles/upload-logo` | Upload profile logo | multipart `profileImage` | `{updated, image:{name}}` | `Profile.php::uploadLogo` |
| POST | `/api/v2/profiles/upload-business-logo` | Upload (pre-cropped) business logo | multipart `businessImage` | `{updated, image:{name}}` | `Profile.php::uploadBusinessLogo` |
| POST | `/api/v2/profiles/pause-campaigns` | Pause campaigns; holds unsent `invite_scheduler` rows (`Sent 0→2`) + `CampaignsPaused=1`, atomic | — | `{message}` | `Profile.php::pauseCampaigns` |
| POST | `/api/v2/profiles/resume-campaigns` | Resume; releases held rows (`Sent 2→0`) + `CampaignsPaused=0`, atomic | — | `{message}` | `Profile.php::resumeCampaigns` |
| GET | `/api/v2/profiles` | List profiles for current user (switcher/admin) | `page`, `search` | `{count, profiles[], pages}` | `Profile.php::index` |
| GET | `/api/v2/profiles/{id}/switch` | Issue tokens for another profile | path id | `{access_token, refresh_token}` | `Profile.php::switch` |
| POST | `/api/v2/users/update` | Update own user (name/email/avatar) | multipart `first_name, last_name, email, image` | updated | `Users.php::update` |
| POST | `/api/v2/users/change-password` | Change password | JSON `current_password, password, password_confirmation` (`min_length[8]`, match) | message | `Users.php::password` |
| GET | `/api/v2/notifications` | List review-alert emails | — | `[{id,email}]` | `Notifications.php::index` |
| POST | `/api/v2/notifications` | Add email | `email` (`valid_email|blacklist_validation`, unique per profile) | created | `Notifications.php::create` |
| DELETE | `/api/v2/notifications/{id}` | Remove email | path id | deleted | `Notifications.php::delete` |
| POST | `/api/v2/notifications/subscribe` | Register push device | JSON `token` (≥100 chars) | `{message}` | `Users.php::subscribe` |
| DELETE | `/api/v2/notifications/unsubscribe` | Unregister push device | JSON `token` | message | `Users.php::unsubscribe` |
| GET | `/api/v2/settings/devices` | Current device + subscribed devices | — | `{device, user_devices[]}` | `Settings/Settings.php::devices` |
| GET | `/api/v2/settings/social-accounts` | OAuth URLs for all integrations | — | `{facebook, twitter, linkedin, google, squareup, stripe, clover, clio, liondesk, pam, shopify, quickbooks}` | `Settings/Settings.php::socialAccounts` |
| GET | `/api/v2/settings/referral` | Affiliate program state (generates code if missing) | — | `{active, code, text}` | `Settings/Settings.php::referral` |
| GET | `/api/v2/settings/zip-codes` | List profile geo-tag ZIPs | — | `[{ZipCodeID, ZipCode}]` | `Settings/Settings.php::zipCodes` |
| POST | `/api/v2/settings/zip-codes` | Add ZIP (max 5; US/CA format; ZipCodeApi lookup→`geo_zipcodes`) | JSON `zip_code` | created | `Settings/Address.php::saveZipCode` |
| DELETE | `/api/v2/settings/zip-codes/{id}` | Remove profile ZIP (by ZipCodeID) | path id | deleted | `Settings/Address.php::deleteZipCode` |
| POST | `/api/v2/settings/addresses` | Save/update profile address (+timezone normalize/sync) | JSON address fields | message | `Settings/Address.php::save` |
| DELETE | `/api/v2/settings/addresses` | Clear address + all Google + lat/long/timezone | — | deleted | `Settings/Address.php::delete` |
| GET | `/api/v2/settings/monthly-targets/show` | Read month's targets | `date` | target row | `Settings/Targets.php::show` |
| POST | `/api/v2/settings/monthly-targets/` | Upsert month targets | `date, reviews, requests, connections, social_media_posts, reviews_posted` | updated | `Settings/Targets.php::update` |
| POST | `/api/v2/settings/chat` | Save chat-widget config | multipart `welcomeText, headerText, openingText, primaryColor, secondaryColor, userImage?` | message | `Settings/Widget.php::chat` |
| GET/POST | `/api/v2/admin/profiles/{id}` | Admin load / edit business profile | `Name, Shortname, ExpirationDate` | profile / updated | `Admin/Profiles.php` |

- **v1 models / tables:** `profile` (god table), `user`, `user_profile`, `notification` (review-alert emails), `user_notification_channels` (push devices), `geo_zipcodes`, `geo_zipcodes_profile`, `monthly_targets`, `widget`/`image` (chat widget), `invite_scheduler` (pause/resume side effect), `profile_notification` (count only).
- **Pagination / filtering / sorting:** only `profiles` list paginates (`page`, `search`, 20/page, ordered by `Name ASC`). Everything else is unpaginated.

## 5. Business rules

- **Profile scoping** — every settings write targets `request.auth.profile_id`; switching profiles re-issues JWTs (`Profile::switch`, requires ownership via `user_profile` or `AccountType >= OGGVO_SALES`).
- **Timezone** — on save, frontend resolves IANA tz from address (`useGeoTimezone`) for worldwide coverage; backend `ProfileModel::saveSettings`/`updateProfileAddress` calls `normalizeTimezone()` (maps legacy numeric offsets/IDs → IANA) and `syncTimezoneFromAddress()` (state→IANA map, longitude-band fallback via `geo_zipcodes`). Backend only overwrites tz when current value is empty/numeric/invalid — manual IANA overrides are preserved. Note duplicate resolver `resolveTimezone()` (prod hotfix) flagged for consolidation.
- **Google links** — `GoogleReviewDialog`, `GoogleMapsURL`, `GoogleReviewList`, `GooglePlaceID`, etc. are server-derived (`updateGooglePlaceInfo`) and **explicitly stripped** from `save-settings`; they are read-only in the UI and only cleared by `DELETE /settings/addresses`.
- **ZIP codes** — hard limit of **5** per profile. Accepts US (`\d{5}(-\d{4})?`) and Canadian postal formats; CA codes normalized to uppercase no-space. Unknown ZIPs are looked up via `ZipCodeApi::search` and inserted into shared `geo_zipcodes`. Duplicate-per-profile rejected.
- **Auto-share review threshold** — stored on `profile.SocialThreshold`; UI value is +1 of stored value, `-1` means disabled. Sub-4★ unhandled reviews auto-publish after **14 days** (enforced elsewhere, surfaced as a warning here). Shuffle mode requires ≥2 templates.
- **Campaign pause/resume** — transactional: holds/releases `invite_scheduler` rows (`Sent` 2 = held) AND sets `CampaignsPaused` so the two can't diverge (v1 fix BF-037). Idempotent enough but not guarded against double-click.
- **Recipient activation time** — when `AutoActivateRecipients=1`, `TimeActivateRecipients` must match `\d{1,2}:\d{1,2} [A-Z]{2}` or save fails ("invalid time").
- **Notification emails** — validated `valid_email` + blacklist; unique per profile.
- **Push devices** — token must be ≥100 chars; robots (user-agent) rejected; device metadata captured via `BrowserDetection`. Subscription state mirrored in an `opn` cookie client-side; Safari uses Apple push package, others FCM.
- **Logos** — server validates MIME ∈ {png,jpeg,jpg}, stores under `public/assets/media/{profile-logos,business-logos}/` with `md5(name+time)` filename, deletes the previous file. Empty `Logo`/`BusinessLogo` in `save-settings` deletes the file; a filename not present on disk is ignored.
- **Password** — `min_length[8]`, new must match confirmation, current verified before change.
- **Color fields** — keys prefixed with `#` (`#NewsletterBgColor`, `#ReviewWidgetButtonBgColor`, etc.) are trimmed of `#` and renamed before persist.
- **Admin profile edit** — `Shortname` uniqueness enforced (`profileSlugExists`); `ExpirationDate` stored with ` 23:59:59`.

## 6. Integrations

- **Google** — Place ID → review/maps/list URLs; OAuth connect via `GoogleProvider`. Address-derived links.
- **Meta (Facebook/Instagram)** — page connect via `FacebookProvider` with explicit page/instagram permission scopes for auto-share.
- **Twitter / LinkedIn** — OAuth connect for auto-share.
- **Square, Stripe, Clover, Clio, LionDesk, Pre-Approve-Me, Shopify, QuickBooks** — OAuth/connect URLs surfaced by `social-accounts` (CRM/payment review-request sources).
- **Twilio** — A2P 10DLC compliance + toll-free fallback cards on the Profile tab; admin toll-free sender management on `/manage/profiles/[id]`. SMS number/sender columns live on `profile`.
- **FCM + Apple Push** — push-device subscription (web push tokens). FCM token via `$messaging`; Safari via Apple push package (`createPushPackage.php`, website-push-id `web.com.oggvo.oggvo`).
- **ZipCodeApi** — external ZIP→lat/long resolution feeding `geo_zipcodes`.
- **AWS S3** — logo/media storage in v2 (v1 writes to local `public/assets/media`).
- No inbound webhooks specific to this domain (OAuth callbacks handled by the social/connect domains).

## 7. v1 → v2 mapping

- **Module:** `apps/api/src/modules/tenancy` owns `profiles` + all `profile_*` satellites (controller/service/repository/DTO per satellite). A thin settings facade composes them for the settings screens. Geo ZIPs, monthly targets, email/push notifications belong to their own small modules (`geo`, `targets`/`misc`, `notifications`) but are surfaced under the settings UI.
- **Drizzle tables & field mapping (v1 `profile` god table → 7 satellites):**
  - **`profiles`** — `Name→name`, `Shortname→shortname`, `BusinessName→businessName`, `Logo→logo`, `Address/Address2/City/State/Zipcode/Phone`, `Timezone→timezone`, `Latitude/Longitude`, `Suspended/Migrated`, `CreatedBy/LastUpdatedBy`, `ExpirationDate→expirationDate`, `UUID→publicId`.
  - **`profile_review_settings`** — `SocialThreshold→socialThreshold` (default `-1`), `SocialReviewMessage→socialReviewMessage`, `ReviewWidgetButtonBgColor/TextColor`, `StreamThreshold`, `NumberOfReviews`, `ShowAggregate`, `IncludeEmpty`, `UseReviewersLastInitial`, `ReviewNotificationThreshold`, star texts, message bodies, `HideOggvoReviews`, `DoNotFilter`, location-business fields.
  - **`profile_google`** — `GoogleReviewDialog/MapsURL/ReviewList/PlaceID/CID/LRD/AlternateReview` (read-only, server-derived).
  - **`profile_email_settings`** — `EmailCampaignFromName→fromName`, `…FromEmail→fromEmail`, `…ReplyTo→replyTo`, `AutoActivateRecipients`, `AutoActivateLimit`, `ActiveRecipientLimit`, `DaysBeforeRemovingPastRecipients`, `DeactivateRecipientsOnOpen/Click/Clickthrough`, `TimeActivateRecipients`.
  - **`profile_messaging_settings`** — `SMSNumber/SID/Token/ID`, `MessagingServiceId`, plus merged `messaging_settings.active/autoResponse`.
  - **`profile_newsletter_settings`** — `NewsletterBgColor→bgColor`, `…TextColor`, `…Header`, `…Footer`, `NewsletterButtonID→buttonId`.
  - **`profile_affiliate`** — `AffiliateActive→active`, `AffiliateCode→code`, `AffiliateFooterText→footerText`.
  - **`profile_prompts`** — `PromptVisitorsToConnect`, `PromptFacebook/Twitter/Instagram/Youtube/PageWeb`, `PromptOggvo`.
  - **`geo_zipcodes` / `geo_zipcodes_profile`** — `ZipCode→zipCode`, `ZipLat→latitude`, `ZipLong→longitude`; junction `ProfileID→profileId`, `ZipCodeID→zipcodeId`.
  - **`monthly_targets`** — `date→month` (now `date` type), `requests/reviews/social_media_posts/reviews_posted/connections`.
  - **`email_notifications`** (v1 `notification`) — `EmailAddress→email`. **`push_channels`** (v1 `user_notification_channels`) — token/user/profile composite PK + device metadata; `is_active` replaces tombstone.
  - **`users`** — `FirstName/LastName/EmailAddress/Image` for the team/profile-editor.
- **Queue:** — (synchronous). Logo uploads stream to S3 via the media module; campaign pause/resume runs in a DB transaction (no queue).
- **Frontend:** v2 routes under `apps/web/app/(portal)/settings/{page,notifications,integrations,team,review,referral}` and admin `apps/web/app/(portal)/manage/profiles/[id]`. Reuse `@oggvo/ui`: tabbed page header, sectioned form layout, `Switch`, `RatingStar`, `LogoCropperModal`, `ConfirmModal` (themed — never native confirm), `CopyButton`, table/skeleton primitives, `SocialPreviewer`.
- **Endpoint mapping (RESTful, typed via OpenAPI):**
  - `GET /profiles/me` → `GET /profiles/current` (typed composed DTO across satellites).
  - `POST /profiles/save-settings` → split into resource-scoped `PATCH /profiles/current`, `PATCH /profiles/current/review-settings`, `PATCH /profiles/current/affiliate`, etc. (no more single god-endpoint).
  - `POST /profiles/upload-logo|upload-business-logo` → `POST /profiles/current/logos/{profile|business}` (S3-backed).
  - `pause-campaigns`/`resume-campaigns` → `POST /profiles/current/campaigns/{pause|resume}`.
  - `settings/zip-codes` CRUD → `GET/POST/DELETE /profiles/current/geo-zipcodes[/{id}]`.
  - `settings/addresses` → `PUT/DELETE /profiles/current/address`.
  - `settings/monthly-targets` → `GET/PUT /profiles/current/monthly-targets?month=`.
  - `notifications` (emails) → `GET/POST/DELETE /profiles/current/email-notifications[/{id}]`.
  - `notifications/subscribe|unsubscribe` → `POST/DELETE /me/push-channels`.
  - `settings/devices` → `GET /me/push-channels`.
  - `settings/social-accounts` → `GET /integrations/oauth-urls`.
  - `settings/referral` → `GET /profiles/current/affiliate`.
  - `users/update` / `users/change-password` → `PATCH /me`, `POST /me/password`.
  - `settings/chat` → widgets module (`PUT /profiles/current/widgets/chat`).
- **Known v1 bugs / debt to fix:**
  - Two competing timezone resolvers (`resolveTimezone` vs `guessTimezoneFromAddress`/`syncTimezoneFromAddress`) — consolidate to one.
  - `save-settings` is a single endpoint that writes any allowed `profile` column from the client — replace with typed, satellite-scoped PATCH endpoints (no mass-assignment surface).
  - `getProfilesByUser` builds a correlated subquery for `notifications_count` and uses string interpolation in `MonthlyTargetModel::getMonthlyTarget` (`{$ProfileID}` in JOIN) — parameterize.
  - Logo existence checked with `file_exists(FCPATH…)` — move to object storage with proper URLs; `Image`/`BusinessImage` returned as `{name}` only.
  - Team tab supports only the owner; invite/roles UI is dead markup — decide whether v2 ships real multi-member RBAC.
  - `BrowserDetection`-based device fingerprinting and the `opn` cookie subscription hack should become server-tracked `push_channels.is_active`.

## 8. Open questions / parity risks

- **Schema gaps (no v2 home yet):**
  - `BusinessLogo` — v2 `profiles` has only `logo`; the separate **business logo** (with crop) needs a column or media row.
  - `CampaignsPaused` — not present on v2 `profiles` or any satellite; pause/resume needs a flag (and the held-`invite_scheduler` semantics must be reproduced).
  - `AutoReviewShareMode` / `AutoReviewShareTemplates` — not in `profile_review_settings`; the Share-Template feature (Shuffle/Fixed + `type-1..5` CSV) has no v2 column.
  - Per-profile **review-notification email** rows: v1 `notification` → v2 `email_notifications` exists, but the `profile_notification` count surfaced in the profile switcher maps to `profile_notifications` (different table) — keep distinct.
- **Permissions / team** — v1 has no real RBAC on settings (owner-only, commented-out matrix). Confirm v2 intent: single-owner parity vs. shipping the unbuilt manager/member roles.
- **Google link generation** — derivation logic (`updateGooglePlaceInfo`) lives outside the settings flow; confirm which v2 module owns regenerating these on address/place change.
- **Chat widget** under `/settings/chat` is written through the settings group but rendered in the widgets domain — confirm ownership boundary (likely widgets module, surfaced via settings).
- **Monthly targets** are saved via settings but consumed on the dashboard — confirm whether the v2 settings UI exposes them at all or they move entirely to the dashboard.
- **Affiliate code generation** is lazy (on first GET) — decide whether v2 generates eagerly at profile creation to avoid read-side writes.
- **Address vs save-settings duplication** — v1 has both `POST /settings/addresses` and address fields inside `save-settings`; the frontend uses `save-settings`. Pick one path in v2.
