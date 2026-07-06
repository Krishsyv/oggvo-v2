# Manage / Admin

> **v2 target:** module `apps/api/src/modules/admin` · tables `users`, `user_profiles`, `profiles`, `manage_requests`, `newsletters`, `newsletter_categories`, `push_campaigns`, `referrals` (`@oggvo/db`) · queue `email`, `push` (BullMQ; else —) · build phase 4
> **v1 sources:** frontend `apps/portal-frontend/pages/manage/*`, stores `store/{manage,manageUsers,manageProfiles,manageNotifications}.js`, gate `middleware/manage.global.js`, components `components/Manage/*`, API `apps/portal-api/app/Controllers/API/V2/Admin/*.php`, models `app/Models/{User,UserProfile,Profile,ManageRequest,NewsletterNewsletter,NewsletterCategory,NotificationCampaign,Referral}Model.php`

## 1. Overview
The Manage area is the staff-facing back office for an Oggvo account-manager and above. It lets privileged users administer **multiple business accounts** they oversee: create / edit / suspend / delete users and assign their role + permissions, manage business profiles (including toll-free SMS provisioning), build email/SMS campaign **templates** and their **categories**, send **push notification campaigns** to subscribed devices, browse email & SMS campaign usage, review **referrals**, and approve / deny **deletion requests** raised by lower-privilege staff. The whole area is gated behind `account_type >= 2` (`OGGVO_ACCOUNT_MANAGER`). The account_type hierarchy is `OGGVO_USER=0`, `OGGVO_SALES=1`, `OGGVO_ACCOUNT_MANAGER=2`, `OGGVO_SUPERVISOR=3`, `OGGVO_ADMIN=4`. Some actions (deletion approval, sender activation, FCM API key) require higher tiers within that range. The Manage home is a dashboard of aggregate counts plus a pending-deletions queue.

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/manage` | `pages/manage/index.vue` | default | Pending Deletions tabs: Users / Business Profiles | account_type≥2 |
| `/manage/users` | `pages/manage/users/index.vue` | default | — | account_type≥2 |
| `/manage/users/create` | `pages/manage/users/create.vue` | default | — | account_type≥2 |
| `/manage/users/:id` | `pages/manage/users/[id].vue` | default | — | account_type≥2 |
| `/manage/profiles` | `pages/manage/profiles/index.vue` | default | — | account_type≥2 |
| `/manage/profiles/:id` | `pages/manage/profiles/[id].vue` | default | Profile Details + Toll-Free Fallback panel | account_type≥2 |
| `/manage/newsletters` | `pages/manage/newsletters/index.vue` | default | Type tabs: Email/SMS/Newsletter/Birthday/Anniversary/ThankYou | account_type≥2 |
| `/manage/newsletters/:id` | `pages/manage/newsletters/[id].vue` | default | SMS text editor vs CampaignEditor (drag-drop) | account_type≥2 |
| `/manage/newsletters/categories` | `pages/manage/newsletters/categories/index.vue` | default | — | account_type≥2 |
| `/manage/notifications` | `pages/manage/notifications/index.vue` | default | — | account_type≥2 |
| `/manage/notifications/campaigns/create` | `pages/manage/notifications/campaigns/create.vue` | default | — | account_type≥2 |
| `/manage/campaigns` | `pages/manage/campaigns.vue` | default | (Email campaigns usage) | account_type≥2 |
| `/manage/sms` | `pages/manage/sms.vue` | default | (SMS campaigns usage) | account_type≥2 |
| `/manage/referrals` | `pages/manage/referrals.vue` | default | — | account_type≥2 |

The gate (`middleware/manage.global.js`) is a **global** route middleware: any path matching `/^\/manage?\S+/` with `account_type < 2` is redirected to `/dashboard`. Note the regex makes the `e` optional (`manag` + `e?`) — a known sloppiness to tighten in v2.

## 3. Screen-by-screen

### `/manage` — Manage home / dashboard
![manage-home](_assets/screens/manage/manage-home.png) <!-- placeholder until captured -->
- **Purpose & layout** — Landing page. `PageHeader` titled "Manage" with quick links to Newsletter Management and Notifications. A responsive grid of stat cards (`ManageCard`), then a "Pending Deletions" table with a Users/Business Profiles tab switch.
- **Elements / fields** — Stat cards driven by `GET /admin/stats` keyed by: `users`, `profiles`, `invites` (scheduled invites), `email`, `sms`, `referrals`. Each card shows label, icon, and count; some link to a sub-page (`users`, `profiles`, `campaigns`, `sms`, `referrals`); Scheduled Invites card has no link. `TabBar` toggles `currentType` between `user` and `profile`. `ManageTable` (component) lists pending deletion requests for the selected type.
- **States** — loading (stat fetch sets `loading`); empty pending-deletions list; paginated request list (limit 10).
- **Modals / drawers** — Confirm/Deny deletion confirmations (store `showModal`); should use themed `ConfirmModal.vue` in v2 (never native confirm).
- **Interactions** — `fetchStats()` on mount. Selecting requests (`selected[]`) enables bulk confirm/deny. `confirmRequest(id, type)` deletes the user/profile (executes the requested deletion); `denyRequest(id)` rejects the request (`POST /admin/requests/deny`).

### `/manage/users` — Users list
![manage-users](_assets/screens/manage/users.png) <!-- placeholder until captured -->
- **Purpose & layout** — `PageHeader` "Users" with "Add New User" → `/manage/users/create`. Body is `ManageUsersTable` (component) driven by `manageUsers` store.
- **Elements / fields** — Filters in store: `query` (search), `range` (date range), `types` checkboxes (Members=0 / Sales=1 / Managers=2 / Supervisors=3 / Administrators=4), `includeSuspended`, `includeNotLoggedIn`. Columns: avatar/name, email, role, status, created. Per-row dropdown actions.
- **States** — loading (`loading`), empty, paginated (`meta.pages`), permission-denied (lower-tier users may not see higher-tier rows — `getUsersPaginated` receives caller `accountType`).
- **Modals / drawers** — Delete confirm (single + bulk), suspend/activate confirm, invite confirm (store `showModal`).
- **Interactions** — Row actions call store: `deleteUser(id)`, `deleteUsers()` (bulk via `selectedUsers[]`), `suspendUser(id)` / `activateUser(id)` (both hit the same toggle endpoint), `inviteUser(id)` (resend activation email), `loginAs(id)` → `POST /impersonate/:id` (impersonation; swaps auth token). Filters debounced/throttled 1000 ms.

### `/manage/users/create` — Create user
![manage-users-create](_assets/screens/manage/users-create.png) <!-- placeholder until captured -->
- **Purpose & layout** — Multi-section form. Sections: Personal Information, Role, Profiles, Permissions.
- **Elements / fields** —
  - First Name (text, required, min 3), Last Name (text, required, min 3), Email (text, required, valid email).
  - Profile Picture (file, optional; PNG/JPG/JPEG only, "max 800x800px"). Preview + clear.
  - Role (single-select cards): `User`, `Sales`, `Manager`, `Supervisor`, `Admin` (required). Server validates `in_list[User,Sales,Manager,Supervisor,Admin]`.
  - Profiles (combobox `ManageUsersCombobox`) — hidden when role = Admin. Profiles accessible to this user.
  - Permissions (checkbox list, hidden when role = Admin): Analytics, Design, Widgets, Social Media, Reviews, Connect, Invites, Support. Default checked when role = User: `[Analytics, Design, Widgets, Social Media, Reviews]`; other non-Admin roles default to all. Server cleans against `['Analytics','Design','Widgets','Social','Reviews','Connect','Invites','Support']` (note v1 sends "Social Media" but server whitelists "Social" — a parity bug).
- **States** — submitting (`sending`); per-field client errors.
- **Interactions** — Submits `multipart/form-data` (`permissions[]`, `profiles[]` arrays, file `image`) to `POST /admin/users`. On success an invitation email is sent (AWS Lambda `sendEmail` with activation token) and the user is redirected to `/manage/users`.

### `/manage/users/:id` — Edit user
![manage-users-edit](_assets/screens/manage/users-edit.png) <!-- placeholder until captured -->
- **Purpose & layout** — Same form as create, prefilled from `GET /admin/users/:id`.
- **Elements / fields** — Identical to create plus `image_removed` flag (set when clearing existing image). Prefill maps server fields: `FirstName`, `LastName`, `EmailAddress`, `AccountType`(→role), `Profiles`, `Permissions`, `Image`.
- **States** — loading prefill, submitting.
- **Interactions** — Submits `multipart/form-data` to `POST /admin/users/:id` (POST not PUT in v1; `image_removed` only appended when true). Redirect to `/manage/users`.

### `/manage/profiles` — Profiles list
![manage-profiles](_assets/screens/manage/profiles.png) <!-- placeholder until captured -->
- **Purpose & layout** — `PageHeader` "Profiles" with Add Profile modal (`ManageProfilesAddProfileModel`). Search, status filter (`ManageProfilesFiltersStatus`), date-range picker. Selectable table with bulk Suspend/Delete bar.
- **Elements / fields** — Search (`filter.query`), status filter (`status` = subset of `[0,1,2]` where 1=suspended, 2=expired), date range. Columns: select checkbox, Profile (avatar + Name + Shortname), Owner, Status badge (Expired=red / Suspended=yellow / Active=green), Created, Expiry, row dropdown. Per-row dropdown: Activate (if suspended), Edit, Suspend (if active and not expired), Delete.
- **States** — loading, empty, paginated (`meta.pages`, `meta.total`), row-selected highlight.
- **Modals / drawers** — `ManageProfilesAddProfileModel` (create), `ManageProfilesDeleteProfileModel`, `ManageProfilesSuspendeProfileModel` (sic), driven by `handleDelete([ids])` / `handleStatus([ids])`.
- **Interactions** — `fetchProfiles()` on mount; filters throttled 1000 ms. Activate: `POST /admin/profiles/:id/activate`. Suspend: `POST /admin/profiles/suspend` (body `{ids}`). Delete: `DELETE /admin/profiles` (body `{ids}`). Bulk select via header checkbox; small screens toggle selection on row tap.

### `/manage/profiles/:id` — Edit profile + toll-free fallback
![manage-profiles-edit](_assets/screens/manage/profiles-edit.png) <!-- placeholder until captured -->
- **Purpose & layout** — Two sections. **Profile Details**: Name, Slug (Shortname), Expiry Date. **Toll-Free Fallback** panel (`ManageProfilesTollfreeFallbackPanel`) for Twilio toll-free SMS sender provisioning.
- **Elements / fields** — Profile: `Name` (required), `Shortname` (required), `ExpirationDate` (date, required). Toll-free panel props: `eligible`, `assigned-number`, `verification`, `rejection-reasons`, `history-summary`, `inventory` (available numbers), `selected-number-id`, `summary` (sender-activation summary), loading/action-loading flags.
- **States** — load (`loadProfile`), save loading, sender-summary loading, sender-action loading; per-field server errors.
- **Interactions** — Save profile: `POST /admin/profiles/:id`. Toll-free actions (all under `/admin/profiles/:id/twilio/tollfree`): toggle eligibility (`.../eligibility` body `{enabled}`), assign number (`.../assign-number` body `{tollfree_number_id}`), release number (`.../release-number`), activate sender (`.../activate-sender`), deactivate sender (`.../deactivate-sender`), refresh summary (GET `.../tollfree` + GET `.../tollfree/numbers`). `sync` (`.../sync`) currently returns 501 (not implemented). `history` (GET `.../history`) for the audit list.

### `/manage/newsletters` — Campaign templates
![manage-newsletters](_assets/screens/manage/newsletters.png) <!-- placeholder until captured -->
- **Purpose & layout** — Template library grouped by category, in a card grid with `Disclosure` per category group. Type `TabBar`, search, and a sub-category multi-select popover. Header links to Categories page + Add Template modal (`ManageNewsletterTemplatesAddModal`).
- **Elements / fields** — Type tabs (label→value): Review→`Email`, SMS→`SMS`, Newsletter, Birthday, Anniversary, ThankYou. Search (debounced 500 ms). Card: thumbnail (or "No Image"), Name, Subject, category badge, Active/Inactive badge, preview button (if image). Card dropdown: Send Test (non-SMS), Edit Design (→`/manage/newsletters/:id`), Properties (edit modal), Delete.
- **States** — loading skeleton, empty ("No Templates").
- **Modals / drawers** — Add, Edit (properties), Delete, Preview, Test modals (`ManageNewsletterTemplates*`).
- **Interactions** — `GET /admin/newsletters?type=&search=` returns templates grouped by `CategoryName`. Test send: `POST /admin/newsletters/test`. Create: `POST /admin/newsletters`. Update properties: `POST /admin/newsletters/:id`. Delete: `DELETE /admin/newsletters/:id`. Image generation: `POST /admin/newsletters/:id/image` (renders via wkhtmltoimage → S3).

### `/manage/newsletters/:id` — Template editor
![manage-newsletter-editor](_assets/screens/manage/newsletter-editor.png) <!-- placeholder until captured -->
- **Purpose & layout** — If template `Type == 'SMS'`: a textarea editor (max 1600 chars; 160-char segment note) with a placeholder-insert menu. Otherwise the drag-drop `CampaignEditor` component.
- **Elements / fields** — SMS body textarea (`EmailHTML`); placeholder menu inserts `[[first_name]]`, `[[last_name]]`, `[[profile_name]]`, `[[profile_url]]`, `[[profile_short_url]]`. Header actions: Properties (edit modal), Send a test (non-SMS), Save.
- **States** — loading (`pending`), saving.
- **Interactions** — Loads via `GET /campaigns/templates/:id` (shared campaigns controller, not under /admin). SMS save: `PUT /campaigns/templates/:id` body `{Name,Subject,Body,DesignJson}`. Non-SMS save goes through `CampaignEditor.save('template')`. Test send via `ManageNewsletterTemplatesTestModal` → `POST /admin/newsletters/test`.

### `/manage/newsletters/categories` — Template categories
![manage-categories](_assets/screens/manage/categories.png) <!-- placeholder until captured -->
- **Purpose & layout** — Table of categories with search, date range, Add Category modal.
- **Elements / fields** — Columns: Name, Type, Status badge (1=Active green / 0=Inactive red), Templates count, Created, row dropdown (Edit, Delete). Search (debounced 300 ms), date range.
- **States** — loading skeleton, empty ("No Category"), paginated.
- **Modals / drawers** — `ManageNewsletterCategoryAddModal`, `...EditModal`, `...DeleteModal`.
- **Interactions** — List: `GET /admin/newsletter-categories?query=&page=&dates[]`. Create: `POST /admin/newsletter-categories`. Update: `POST /admin/newsletter-categories/:id`. Delete: `DELETE /admin/newsletter-categories/:id`. A `GET /admin/newsletter-categories/list` exists for select dropdowns (search + type filter).

### `/manage/notifications` — Notifications list
![manage-notifications](_assets/screens/manage/notifications.png) <!-- placeholder until captured -->
- **Purpose & layout** — `PageHeader` "Notifications" + `ManageNotificationsTable`. Lists subscribed devices and/or past campaigns via `manageNotifications` store.
- **Elements / fields** — Devices filters: `page`, `query`, `range`. Campaigns filter: `page`. Device row exposes ProfileID/UserID/Token for removal.
- **States** — loading, paginated.
- **Interactions** — `fetchDevices()` → `GET /admin/notifications/users`; `fetchCampaigns()` → `GET /admin/notifications/campaigns`. Delete device: `DELETE /admin/notifications/user/:token/:user/:profile` → `Notifications::deleteProfile`.

### `/manage/notifications/campaigns/create` — Send push campaign
![manage-notif-create](_assets/screens/manage/notifications-create.png) <!-- placeholder until captured -->
- **Purpose & layout** — Form to compose and immediately send an FCM push campaign.
- **Elements / fields** — Campaign Name (required), Title (required), Description/text (required, maxlength 160), Image (text URL, default Oggvo logo), Action Link (`click_action`, default frontURL), Target Users (combobox, multi, required), Target Profiles (combobox, multi, required). Selecting target users refetches available profiles.
- **States** — loading members/profiles, submitting (`sending`).
- **Interactions** — On mount `fetchMembers()` → `GET /admin/notifications/members`. On target change `fetchProfiles(userIds)` → `GET /admin/notifications/profiles?users[]`. Submit `POST /admin/notifications` body `{name,title,text,image,click_action,target[],profiles[]}` → resolves device tokens, sends via FCM, inserts a `push_campaigns` row (`Type='manual'`, `Status='sent'`), redirect to `/manage/notifications`.

### `/manage/campaigns` — Email campaign usage
![manage-campaigns](_assets/screens/manage/campaigns.png) <!-- placeholder until captured -->
- **Purpose & layout** — Read-only table of business email campaigns across accounts.
- **Elements / fields** — Search (name/owner), date-range. Columns: Name & Subject, Owner, Created, View (opens `/campaigns/editor/:id` in new tab).
- **States** — loading skeleton, empty, paginated.
- **Interactions** — `GET /admin/campaigns?CampaignType=Email&page=&query=&dates[]`. Filters throttled 1000 ms.

### `/manage/sms` — SMS campaign usage
![manage-sms](_assets/screens/manage/sms.png) <!-- placeholder until captured -->
- **Purpose & layout** — Same as campaigns but `CampaignType=SMS`. Columns: Name, Owner, Created, View.
- **Interactions** — `GET /admin/campaigns?CampaignType=SMS&page=&query=&dates[]`.

### `/manage/referrals` — Referrals
![manage-referrals](_assets/screens/manage/referrals.png) <!-- placeholder until captured -->
- **Purpose & layout** — Read-only table of referred businesses.
- **Elements / fields** — Search (name/email/phone), date range. Columns: Name & Business, Contact (phone/email), Referred By, Date.
- **States** — loading skeleton, empty, paginated.
- **Interactions** — `GET /admin/referrals?page=&query=&dates[]`. Server also supports `perpage`, `sort[field]`, `sort[sort]`.

## 4. Data & API
All endpoints live under the route group `admin` (`Routes.php` line 444) with namespace `App\Controllers\API\V2\Admin` and filter `apiAuth`. The frontend `$http` base prepends `/api/v2`, so these resolve to `/api/v2/admin/...`.

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/admin/stats` | Dashboard counts | — | `{users,profiles,email,sms,invites,referrals}` | `Manage.php::index` |
| GET | `/admin/requests` | Pending deletion requests | `type`(0 user/1 profile), `page` | paginated `{meta,data}` (limit 10) | `ManageRequest.php::index` |
| POST | `/admin/requests/deny` | Deny deletion requests | `{requests:[ids]}` | message | `ManageRequest.php::deny` (≥ SUPERVISOR) |
| GET | `/admin/users` | Users list | `page,query,range[],types[],suspended,not_logged_in` | `{meta,data}` | `Users.php::index` |
| GET | `/admin/users/count` | User count | — | number | `Users.php::count` |
| GET | `/admin/users/:id` | Single user | path id | `{user}` | `Users.php::get_user` |
| GET | `/admin/users/:id/profile-ids` | Profile ids for user | path id | array | `Users.php::profileIds` |
| POST | `/admin/users` | Create user | multipart: first,last,email,role,image,profiles[],permissions[] | created + invite email | `Users.php::create` |
| POST | `/admin/users/:id` | Update user | multipart (same + image_removed) | updated | `Users.php::update` |
| DELETE | `/admin/users/:id` | Delete user (or raise request) | path id | deleted/request created | `Users.php::delete` |
| DELETE | `/admin/users/delete` | Bulk delete users | `{users:[ids]}` | deleted/requests | `Users.php::delete_bulk` |
| POST | `/admin/users/:id/invite` | Resend activation invite | path id | message | `Users.php::invite` |
| POST | `/admin/users/:id/suspend` | Toggle suspend/activate | path id | updated | `Users.php::suspend` |
| GET | `/admin/profiles` | Profiles list | `page,query,status[],dates[]` | `{results,meta}` (perPage 10) | `Profiles.php::index` |
| GET | `/admin/profiles/count` | Profile count | — | number | `Profiles.php::getcount` |
| GET | `/admin/profiles/list` | Profile search / by-user | `query` or `user_id` | array (`ID,Name,Shortname`) | `Profiles.php::list_all` |
| GET | `/admin/profiles/:id` | Single profile | path id | `{profile}` | `Profiles.php::show` |
| POST | `/admin/profiles/create` | Create profile | JSON (Name, Shortname, …) | created | `Profiles.php::create` |
| POST | `/admin/profiles/:id` | Update profile | JSON `{Name,Shortname,ExpirationDate}` | updated | `Profiles.php::update` |
| DELETE | `/admin/profiles` | Delete profiles (or request) | `{ids:[]}` | deleted/request | `Profiles.php::delete` |
| POST | `/admin/profiles/suspend` | Suspend profiles | `{ids:[]}` | updated | `Profiles.php::suspend` |
| POST | `/admin/profiles/:id/activate` | Activate profile | path id | updated | `Profiles.php::activate` |
| GET | `/admin/profiles/:id/twilio/tollfree` | Toll-free summary | path id | eligibility + assigned_number + verification + rejections + sender_activation + history | `ProfileTollfree.php::show` |
| GET | `/admin/profiles/:id/twilio/tollfree/numbers` | Available numbers | path id | `{numbers:[]}` (reserved/released) | `ProfileTollfree.php::numbers` |
| POST | `/admin/profiles/:id/twilio/tollfree/eligibility` | Toggle eligibility | `{enabled:bool}` | `{profile_id,eligible}` | `ProfileTollfree.php::setEligibility` |
| POST | `/admin/profiles/:id/twilio/tollfree/assign-number` | Assign number | `{tollfree_number_id}` | assignment | `ProfileTollfree.php::assignNumber` |
| POST | `/admin/profiles/:id/twilio/tollfree/release-number` | Release number | path id | release | `ProfileTollfree.php::releaseNumber` |
| POST | `/admin/profiles/:id/twilio/tollfree/activate-sender` | Activate TF sender | path id | `{sender_mode:'active'}` | `ProfileTollfree.php::activateSender` |
| POST | `/admin/profiles/:id/twilio/tollfree/deactivate-sender` | Deactivate sender | path id | `{sender_mode:'disabled'}` | `ProfileTollfree.php::deactivateSender` |
| POST | `/admin/profiles/:id/twilio/tollfree/sync` | Sync from Twilio | path id | **501 not implemented** | `ProfileTollfree.php::sync` |
| GET | `/admin/profiles/:id/twilio/tollfree/history` | TF event history | path id | `{history:[]}` | `ProfileTollfree.php::history` |
| GET | `/admin/campaigns` | Email/SMS campaign usage | `CampaignType(Email/SMS),page,query,dates[]` | paginated `{data,pages}` (perPage 10) | `Campaigns.php::get` |
| GET | `/admin/campaigns/count` | Campaign count | `type(email/sms)` | number | `Campaigns.php::count` |
| GET | `/admin/schedules/count` | Sent-invite count | — | `{invites}` | `Schedules.php::count` |
| GET | `/admin/newsletters` | Templates grouped by category | `type,search` | `{categoryName:[templates]}` | `Newsletter.php::index` |
| POST | `/admin/newsletters` | Create template | JSON Subject,Name(unique),Type,SubCategory | `{id}` | `Newsletter.php::create` |
| POST | `/admin/newsletters/test` | Send test email | FirstName/LastName/EmailAddress/Phone + template ID | created | `Newsletter.php::test` |
| POST | `/admin/newsletters/:id` | Update template props | Subject,Name,Type,SubCategory,IsActive,Image | updated | `Newsletter.php::update` |
| DELETE | `/admin/newsletters/:id` | Delete template | path id | deleted | `Newsletter.php::delete` |
| POST | `/admin/newsletters/:id/image` | Render+upload thumbnail | path id | `{image}` | `Newsletter.php::image` |
| GET | `/admin/newsletter-categories` | Categories list | `query,page,dates[]` | `{data,total,page,pages}` | `NewsletterCategory.php::index` |
| GET | `/admin/newsletter-categories/list` | Category select options | `search,type` | array (`ID,Name`) | `NewsletterCategory.php::list` |
| POST | `/admin/newsletter-categories` | Create category | JSON | created | `NewsletterCategory.php::create` |
| POST | `/admin/newsletter-categories/:id` | Update category | JSON | updated | `NewsletterCategory.php::update` |
| DELETE | `/admin/newsletter-categories/:id` | Delete category | path id | deleted | `NewsletterCategory.php::delete` |
| POST | `/admin/notifications/` | Send push campaign | `{name,title,text,image,click_action,target[],profiles[]}` | `{campaign_id}` | `Notifications.php::send` |
| GET | `/admin/notifications/users` | Subscribed devices | `page,perpage,query,range[]` | `{meta,results}` | `Notifications.php::users` |
| GET | `/admin/notifications/members` | Subscribed members | `pagination[page],pagination[perpage],query[search]` | `{data}` | `Notifications.php::members` |
| GET | `/admin/notifications/user/:id` | Device by user | path id | data | `Notifications.php::user` |
| DELETE | `/admin/notifications/user/:id` | Delete user device | path id | message | `Notifications.php::deleteUser` |
| DELETE | `/admin/notifications/user/:token/:user/:profile` | Delete device subscription | path parts | message | `Notifications.php::deleteProfile` |
| GET | `/admin/notifications/campaigns` | Past push campaigns | `page,perpage` | paginated | `Notifications.php::campaigns` |
| GET | `/admin/notifications/profiles` | Profiles for target users | `users[],query[search]` | `{results}` (deduped) | `Notifications.php::profiles` |
| GET | `/admin/notifications/apikey` | FCM API key | — | `{apiKey}` (**ADMIN only**) | `Notifications.php::apikey` |
| GET | `/admin/referrals` | Referrals list | `page,perpage,sort[field],sort[sort],query,dates[]` | `{data,...meta}` | `Referrals.php::index` |

Non-admin endpoints touched by these pages: `POST /impersonate/:id` (login-as), `GET /campaigns/templates/:id` + `PUT /campaigns/templates/:id` (template editor), `NuxtLink` → `/campaigns/editor/:id`.

- **v1 models / tables:** `user` (UserModel), `user_profile` (UserProfileModel), `profile` (ProfileModel) + `twilio_tollfree_number` / `twilio_tollfree_verification` / `twilio_tollfree_verification_rejection` / `twilio_tollfree_verification_event`, `manage_requests` (ManageRequestModel), `newsletter_newsletter` (NewsletterNewsletterModel), `newsletter_category` (NewsletterCategoryModel), `notification_campaign` (NotificationCampaignModel), `user_notification_channel` (UserNotificationChannelModel), `campaign` (CampaignModel), `schedule` (ScheduleModel), `referral` (ReferralModel), `verification` (VerificationModel).
- **Pagination / filtering / sorting:** Most lists use page + perPage 10. `query` is a substring search (LIKE). Date filters arrive as `dates[]`/`range[]` of `YYYY-MM-DD`. Profile/user `status`/`types` arrive as integer arrays intersected against allowed sets server-side. Referrals support explicit sort field/direction whitelists.

## 5. Business rules
- **Gate:** all `/manage/*` requires `account_type >= 2` (`OGGVO_ACCOUNT_MANAGER`) at the frontend; controllers re-check on sensitive actions. `ProfileTollfree::requireAdmin` rejects `< OGGVO_ACCOUNT_MANAGER` (403). `ManageRequest::deny` requires `>= OGGVO_SUPERVISOR` (3). `Notifications::apikey` requires exactly `OGGVO_ADMIN` (4).
- **Deletion request workflow:** when an `OGGVO_ACCOUNT_MANAGER` deletes a user/profile, instead of hard-deleting it creates a `manage_requests` row ("Request created"). `OGGVO_SUPERVISOR`+ deletes immediately ("deleted successfully"). The Manage home pending-deletions queue lets supervisors confirm (execute) or deny those requests; deny stamps the denier's user id.
- **Role hierarchy & visibility:** user create/update validates role `in_list[User,Sales,Manager,Supervisor,Admin]`; `getUsersPaginated`/`updateUser`/`deleteUser` receive the caller's `accountType` to scope what a caller may see/modify (a manager cannot manage higher tiers).
- **Permissions:** the canonical permission set is `[Analytics, Design, Widgets, Social, Reviews, Connect, Invites, Support]`; Admin role gets no explicit permissions (full access). Permissions are ignored for Admin role.
- **Invitations:** create-user and `invite` generate a `verification` token and fire AWS Lambda `sendEmail` (`transactional_sendInvitation`) with an `activate?token=` link. Failure of the Lambda fails the request.
- **Toll-free provisioning:** eligibility must be enabled before a number can be assigned; a profile may hold only one active number (states `assigned|verified|active`); numbers are assignable only from `reserved|released`. Sender activation requires the policy `TollfreeSenderActivationPolicy::summary().can_activate` (blocking reasons: assigned_number_required, approved_verification_required, inbound_routing_unavailable, pilot_scope_not_supported — only `web_connect_only` pilot scope). Every TF admin action writes a `twilio_tollfree_verification_event` audit row with an idempotency key and actor user id. Timestamps stored in UTC (`gmdate`).
- **Push campaigns:** sent immediately (synchronous FCM call) and persisted with `Type='manual'`, `Status='sent'`; requires at least one resolved device token across the selected users×profiles, else fails. Default image = Oggvo logo, default click action = frontURL.
- **Template image rendering:** `Newsletter::image` shells out to `wkhtmltoimage` with an `X-Oggvo-Secret` header, generates a 300×300 thumb via GD, uploads both to S3, then stores the filename. Side-effecting and slow (a job candidate in v2).
- **SMS template length:** editor caps at 1600 chars; messages over 160 segment on arrival.
- **Timezone:** list dates rendered via `useTimezone().dbToUser`; DB stored in UTC.

## 6. Integrations
- **Twilio** — toll-free number provisioning, verification, and sender activation (`ProfileTollfree`); webhook `webhook/twilio/tollfree/status` (`TwilioTollfreeStatus::handle`) feeds verification status. `sync` endpoint is a stub (501).
- **Firebase Cloud Messaging (FCM)** — push notification delivery (`Notifications::send` via `sngrl/php-firebase-cloud-messaging`); `apikey` exposes the server key to ADMIN only.
- **AWS SES via Lambda (`sendEmail`)** — user invitation emails and newsletter test sends (`transactional_sendInvitation`, `transactional_testNewsletter`).
- **AWS S3** — template image/thumbnail storage (`AwsS3`), template thumbnail URLs.
- **wkhtmltoimage** — server-side template screenshot generation.

## 7. v1 → v2 mapping
- **Module:** `apps/api/src/modules/admin` — sub-resources `users`, `profiles`, `tollfree`, `newsletters`, `newsletter-categories`, `push-campaigns`, `referrals`, `manage-requests`, `stats`. Each as controller/service/repository/DTO; guard each with `@Roles` (RBAC) requiring at least ACCOUNT_MANAGER, with finer guards (SUPERVISOR for deny, ADMIN for FCM key).
- **Drizzle tables:** `users`, `user_profiles`, `profiles`, `manage_requests`, `newsletters` (was `newsletter_newsletter`), `newsletter_categories` (was `newsletter_category`), `push_campaigns` (was `notification_campaign`), `referrals`. Toll-free tables (`twilio_tollfree_*`) belong to the toll-free/SMS module — reuse, don't re-model here. Field-shape changes: snake_case columns and ISO timestamps replace v1 PascalCase (`Name`→`name`, `Shortname`→`slug`, `ExpirationDate`→`expires_at`, `IsActive`→`is_active`, `AccountType`→`account_type`/role enum). Note `push_campaigns` keeps `type`/`status` enums.
- **Queue:** `email` (invitations + newsletter test), `push` (FCM send should be enqueued, not synchronous), and an image-render job for template thumbnails. RBAC list reads stay synchronous.
- **Frontend:** v2 routes under `apps/web/app/(portal)/manage/...` mirroring the table in §2. Reuse `@oggvo/ui` primitives for `DataTable`, `Combobox`, `Badge`, `ConfirmModal` (replace v1 native confirm patterns), `DateRangePicker`, `PageHeader`. Permissions/role selectors become typed components.
- **Endpoint mapping (RESTful, OpenAPI-typed):**
  - `GET /admin/stats` → `GET /admin/stats`
  - `GET /admin/users` → `GET /admin/users`; `POST /admin/users` → `POST /admin/users`; `POST /admin/users/:id` (update) → `PATCH /admin/users/:id`; `DELETE /admin/users/:id` + `/delete` (bulk) → `DELETE /admin/users/:id` + `POST /admin/users/bulk-delete`; `:id/suspend` → `PATCH /admin/users/:id/status`; `:id/invite` → `POST /admin/users/:id/invite`.
  - `GET/POST /admin/profiles*` → `GET/POST/PATCH /admin/profiles`; suspend/activate → `PATCH /admin/profiles/:id/status`; toll-free → `/admin/profiles/:id/tollfree/*`.
  - `GET /admin/requests` + `/deny` → `GET /admin/manage-requests` + `POST /admin/manage-requests/:id/deny` (and confirm path).
  - `GET/POST/DELETE /admin/newsletters*` → `/admin/newsletters`; categories → `/admin/newsletter-categories`.
  - `POST /admin/notifications` → `POST /admin/push-campaigns`; device list → `GET /admin/push-campaigns/devices`.
  - `GET /admin/campaigns` (Email/SMS) → `GET /admin/campaigns?type=`; `GET /admin/referrals` → `GET /admin/referrals`.
- **Known v1 bugs to fix:**
  - Gate regex `^\/manag(e)?\S+/` is loose — use exact `/manage` prefix matching.
  - Permissions parity bug: UI sends `Social Media` but server whitelists `Social` (and `Connect/Invites/Support` not in the User default set) — unify the canonical permission vocabulary.
  - `Users.php::update`/`create` accept `POST` for updates — make update `PATCH`/`PUT`.
  - Suspend & activate hit the same toggle endpoint with optimistic toast text — make status explicit (`status: active|suspended`).
  - `Newsletter::index` join hint `"BOTH"` and `ProfileTollfree::sync` 501 stub — implement properly.
  - Synchronous FCM send + synchronous wkhtmltoimage render block the request — move to queues.
  - N+1 / dedupe done in PHP (`Notifications::profiles`) — push into SQL.
  - `NewsletterCategory::delete` swallows error (missing `return` on `$this->fail`).

## 8. Open questions / parity risks
- **`manage_requests` shape:** v1 distinguishes user (type 0) vs profile (type 1) requests and stores `RequestID`/`UserID`; confirm v2 `manage_requests` table covers both target types and the confirm-vs-deny actor columns. The dashboard "confirm" path reuses the user/profile delete endpoints rather than a dedicated approve route — decide whether v2 keeps that or adds an explicit `/approve`.
- **Scheduled Invites:** the dashboard counts `invites` from `ScheduleModel::countSent(0)` and the card has no destination page — is there a planned Scheduled Invites management screen, or is it count-only? No v2 schema home identified for the schedule/invite queue (flag as gap).
- **Campaign usage tables:** `/manage/campaigns` and `/manage/sms` read from the `campaign` table (per-business campaigns), which is the Campaigns/Connect module — confirm cross-module read ownership.
- **Toll-free tables ownership:** `twilio_tollfree_*` tables are referenced by admin but conceptually belong to the SMS/toll-free module; ensure the admin module imports rather than redefines them, and that `TollfreeSenderActivationPolicy` is shared.
- **FCM key exposure:** `GET /admin/notifications/apikey` returns the raw server key to ADMIN — likely should not be surfaced at all in v2 (security review).
- **Impersonation (`/impersonate/:id`):** login-as is invoked from the users table but lives outside the admin group — confirm where it belongs in v2 and that RBAC limits which roles can impersonate whom.
- **Permission catalogue:** the 8 permissions are hardcoded in the Vue pages; v2 should source them from a typed enum/config shared with the API.
- **`push_campaigns` audience persistence:** v1 stores only campaign metadata, not the resolved target user/profile list — decide whether v2 should persist recipients for auditing.
