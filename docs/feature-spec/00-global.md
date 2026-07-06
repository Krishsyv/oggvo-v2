<!--
Global / cross-cutting domain. Adapted from _template.md: section 2/3 document
cross-cutting "areas" (auth flow, layouts, sidebar, shared components) rather than
a single feature route list. All 8 sections filled.
-->

# Global — Auth, Multi-Tenancy, RBAC, Layouts, Navigation, Shared UI, Timezone

> **v2 target:** modules `apps/api/src/modules/auth` + `apps/api/src/modules/tenancy` · tables `users`, `auth_sessions`, `verifications`, `profiles`, `user_profiles`, `manage_requests`, `feature_flags` (`@oggvo/db`) · queue `email-send` (password-reset / invite mail) · build phase 0–1
> **v1 sources:** API `apps/portal-api/app/Controllers/API/V2/Auth/{Login,Password,Impersonate}.php`, `User.php`, `Profile.php`, `NavBadges.php` · filters `app/Filters/{JwtAuthFilter,AdminFilter,ConnectFilter,Throttle,RequestLogger}.php` · helper `app/Helpers/jwt_helper.php` · routes `app/Config/Routes.php` · filter wiring `app/Config/Filters.php` · constants `app/Config/Constants.php` · models `app/Models/{UserModel,UserProfileModel,ProfileModel}.php` · frontend `apps/portal-frontend/{layouts,middleware,store/sidebar.js,components/Sidebar,composables/{useNavBadges,useTimezone}.js,plugins/userTimezone.client.ts,nuxt.config.ts}` · shared UI `components/{Button,Modal,ConfirmModal,TabBar}.vue`, `components/{Pagination,Skeletons,Notify}/`

## 1. Overview

This document covers the foundations every other domain depends on: how a user authenticates, how a request is scoped to one tenant (a "profile"), how roles and permissions gate access, the application shell (layouts + sidebar + nav badges + middleware), the shared UI primitives reused everywhere, and timezone handling.

In v1 the product is a single-page Nuxt 3 SPA (`apps/portal-frontend`, `ssr: false`) talking to a CodeIgniter 4 REST API (`apps/portal-api`) under `/api/v2`. Authentication is JWT bearer-token based via `@nuxt-alt/auth`. Multi-tenancy is implicit: every authenticated user works "inside" exactly one active profile at a time, encoded in the JWT (`profile_id`), and switching profiles re-issues new tokens. There is no team/org concept beyond the user↔profile join.

Access is governed by an `AccountType` (0–4 ladder) plus seven boolean permission flags. The portal is usable by any authenticated user; the `/manage` (admin) area requires `account_type >= 2`. Internal/elevated account types can impersonate lower-privileged users.

**Known structural problems carried into v2:** the `/refresh` endpoint is unauthenticated and trusts any well-formed refresh JWT (no server-side session, no rotation/revocation); RBAC is coarse (a single `AdminFilter` checks `account_type >= 2`, and per-feature permission flags are enforced inconsistently — only Connect/`messaging` has a dedicated filter); the `profile` table is a 100+ column god table. v2 replaces all of this with `auth` + `tenancy` NestJS modules, hashed rotating refresh tokens in `auth_sessions`, and `@Roles` / `@RequirePermission` guards plus a `TenantGuard`.

## 2. Areas (cross-cutting, not a single route list)

This domain is not one feature page; it is the set of cross-cutting concerns below. Frontend route gating and API filter wiring are summarised here; per-area detail follows in §3.

| Area | v1 source | Layer | Gate / scope |
| --- | --- | --- | --- |
| Login / password / refresh / logout | `Controllers/API/V2/Auth/*` | API (guest + authed) | public (login/forgot/reset/refresh); `apiAuth` for logout/impersonate |
| Impersonation | `Auth/Impersonate.php` | API | `apiAuth` + caller `account_type` strictly `>` target |
| JWT issue/validate | `Helpers/jwt_helper.php`, `Filters/JwtAuthFilter.php` | API | all `/api/v2` authed routes |
| Tenant scoping (active profile) | `JwtAuthFilter` injects `profile_id`; `Profile::switch` | API | every authed request carries `profile_id` |
| Profile switching | `Controllers/API/V2/Profile.php::switch`, `SidebarProfileSwitcher.vue` | API + FE | `apiAuth`; user must own profile unless `account_type >= 1` |
| RBAC — account types | `Config/Constants.php`, `Filters/AdminFilter.php` | API | `/api/v2/admin/*` requires `account_type >= 2` |
| RBAC — Connect permission | `Filters/ConnectFilter.php` | API | `/api/v2/messaging/*` requires `PermissionSms` |
| App shell (4 layouts) | `layouts/{default,guest,setup,support}.vue` | FE | `default` requires `$auth.loggedIn` |
| Sidebar + nav | `store/sidebar.js`, `components/Sidebar/*` | FE | `/manage` item shown only if `account_type >= 2` |
| Nav badge polling | `composables/useNavBadges.js`, `Controllers/API/V2/NavBadges.php` | FE + API | authed; scoped to active profile |
| Route middleware | `middleware/01.maintenance.global.js`, `middleware/manage.global.js` | FE | global; `/manage*` redirects if `account_type < 2` |
| Timezone | `composables/useTimezone.js`, `plugins/userTimezone.client.ts`, `ProfileModel` tz helpers | FE + API | per active profile |
| Shared UI primitives | `components/{Button,Modal,ConfirmModal,TabBar}.vue`, `Pagination/`, `Skeletons/`, `Notify/` | FE | everywhere |

Frontend route protection is global: `nuxt.config.ts` sets `auth.globalMiddleware: true` and `enableMiddleware: true`, so the `@nuxt-alt/auth` middleware redirects unauthenticated users to `/` (login). Guest pages opt out via the `guest` layout / auth config.

## 3. Screen-by-screen / area-by-area

### Auth flow (login, refresh, logout, impersonation)
![login](_assets/screens/global/login.png) <!-- placeholder until captured -->

- **Purpose & layout** — `POST /api/v2/login` (guest) validates `email` + `password`, then resolves the active profile and issues an access + refresh token pair. The login page uses the `guest` layout (split panel: form left, branded image right).
- **Login request** — body `{ email (required, valid_email), password (required), last_viewed_profile? }`. `UserModel::getUserByEmail` → `UserModel::verifyPassword` (SHA-256 with per-user `Salt`; legacy UTF-16LE hash also accepted and silently re-hashed on success; updates `LastLogin`). On success `ProfileModel::getActiveProfile(userId, accountType, lastViewedProfile)` picks the tenant. `last_viewed_profile` is currently **ignored** (the `where` is commented out) — the first profile by query order is returned regardless.
- **Login response** — `{ user: { id, first_name, last_name, name, email, image, account_type, last_login, suspended, permissions{funnel,widgets,invites,reviews,reporting,support,sms}, profile{ID,UUID,Name,Shortname,Suspended,shouldSetupSMS,isConnectActive}, shouldSetupSMS, isConnectActive }, access_token, refresh_token }`. Failure returns generic `"These credentials do not match our records."`; an inactive/no-profile account returns an activation message.
- **Refresh** — `POST /api/v2/refresh` with `{ refresh_token }`. Decodes the JWT, checks `payload.type === 'refresh'`, and re-issues a fresh access + refresh pair. **No `apiAuth` filter** (the filter line is commented out in `Routes.php`) and **no server-side session lookup** — any unexpired, correctly-signed refresh token is accepted indefinitely; tokens are never rotated/revoked server-side. (Fix in v2.)
- **Logout** — `POST /api/v2/logout` (filter `apiAuth`). Returns a static success message only; it does **not** invalidate any token server-side (stateless JWT). Frontend clears local token state via `$auth.logout()`.
- **Impersonation** — `POST /api/v2/impersonate/{id}` (filter `apiAuth`). Caller must have `account_type` strictly greater than the target user's (`<=` is rejected). Issues a brand-new access/refresh pair for the target user + their active profile, returning the same shape as login. `LastLogin` update is commented out. There is no audit trail and no "stop impersonating" / token-of-origin link.
- **States** — invalid credentials, validation errors (`failValidationErrors`), no active profile, account/profile suspended (enforced at request time by `JwtAuthFilter`, not at login).

### Password reset / activation
![password-reset](_assets/screens/global/password-reset.png) <!-- placeholder until captured -->

- **Forgot** — `POST /api/v2/passwords/forgot` `{ email }`. Looks up the user; on success creates a `Password`-type verification token (`VerificationModel::createVerification`) and sends `password/reset?token=…` via the `sendEmail` AWS Lambda (region `us-east-2`, template `email/invitation`). Returns a generic success string. (Note: leaks existence — returns a distinct "We can't find a user…" error when the email is unknown.)
- **Reset / activate** — `POST /api/v2/passwords/reset` `{ password (min 8, matches password_confirmation), password_confirmation, uuid, type ∈ {activate,reset} }`. `type=activate` validates a `NewUser` verification; `type=reset` validates a `Password` verification (`VerificationModel::getValidVerificationByToken`). On success `UserModel::changePassword` regenerates `Salt` and stores SHA-256 hash, then disables the verification token.

### Multi-tenancy & profile switching
![profile-switcher](_assets/screens/global/profile-switcher.png) <!-- placeholder until captured -->

- **Purpose & layout** — every request operates inside one active profile (`profile_id` in the JWT). The sidebar "Switch Profiles" item (`SidebarProfileSwitcher.vue`) opens a left drawer listing the user's profiles with a search box, infinite scroll, and an unread-notification count badge per profile.
- **Switch** — `GET /api/v2/profiles/{id}/switch`. Server check: `account_type >= OGGVO_SALES (1)` OR `UserProfileModel::verifyProfileOwner(profileId, userId)`; otherwise generic failure. Re-issues access + refresh tokens bound to the new `profile_id`. Frontend then `auth.setUserToken(access, refresh)`, sets cookie `last_viewed_profile`, and `window.location.reload()`s the app.
- **Profile list** — `GET /api/v2/profiles?page&search` → `ProfileModel::getProfilesByUser` (paginated, page size 20, ordered by Name; for `account_type 0` joins `user_profile`; includes `notifications_count` per profile in minimal mode; can force-include the currently active profile).
- **Elements** — search input (150 ms debounce, resets to page 1), per-profile row with name + unread badge (caps at `99+`), active profile highlighted, "Loading…" / "No profiles" states, load-more on scroll-end.
- **Interactions** — switching to the already-active profile shows an info notification instead of re-issuing tokens.

### App shell — layouts
![default-layout](_assets/screens/global/default-layout.png) <!-- placeholder until captured -->

Four Nuxt layouts:
- **`default.vue`** — the authenticated portal. Renders only when `$auth.loggedIn`. Fixed `Sidebar` + content area whose left padding tracks sidebar expansion (`lg:pl-[311px]` expanded / `lg:pl-[72px]` collapsed, cookie `view.sidebar.expanded`). Mobile top bar with logo + hamburger (`isMobileSidebarOpen`). `onMounted` → `startBadgePolling()`, `onBeforeUnmount` → `stopBadgePolling()`.
- **`guest.vue`** — unauthenticated pages (login, forgot/reset password). Split layout: form column + branded image (`/images/auth_bg.svg`).
- **`setup.vue`** — multi-step onboarding wizard. Top progress bar driven by `$route.meta.step`; left rail with a vertical stepper (completed steps link back, current highlighted) of named steps with descriptions.
- **`support.vue`** — marketing/support-styled shell with a Popover mega-menu header (Home, Solutions, …) and standalone footer; used for support/help surfaces.

### Sidebar & navigation
![sidebar](_assets/screens/global/sidebar.png) <!-- placeholder until captured -->

- **Structure** (`store/sidebar.js`) — primary `navigation`: Dashboard `/dashboard`, Analytics `/analytics`, Design `/design`, Widgets `/widgets`, Connect `/connect`, Reviews `/reviews`, Contacts `/contacts`, Campaigns `/campaigns`, Social `/social`, Surveys `/surveys`, Tutorials `/tutorials`. `bottomNavigation`: Settings `/settings`, plus **Manage `/manage` prepended only when `account_type >= 2`**.
- **Components** — `Sidebar.vue` (desktop fixed rail, width toggles 311px/72px, `PerfectScrollbar`), `MobileSidebar.vue` (drawer), `SidebarMenuItem.vue` (icon + label + count badge; collapsed state shows a red dot for non-zero counts and tooltips), `SidebarAccount.vue` (avatar, name, profile name, logout button → `$auth.logout()`), `SidebarProfileSwitcher.vue`, `CollapseSidebar.vue` / `ExpandSidebar.vue`.
- **Nav badges** — counts for Reviews/Social/Surveys are applied onto nav items from `useNavBadges` state via a deep watch. Note: the menu item shows `count`, but the badge state keys are `reviews/social/surveys`; the store maps them by `href`.
- **States** — expanded vs collapsed (cookie-persisted), mobile open/closed, badge dot vs numeric pill.

### Nav badge polling
- `useNavBadges.js` exposes shared `useState('nav-badges', {reviews,social,surveys,total})` and `fetch()` → `GET /api/v2/nav/badges`; errors are swallowed (badges are non-critical).
- `store/sidebar.js` `startBadgePolling()` fetches immediately then every 60 s via a single guarded `setInterval` (`badgePollTimer`), and `stopBadgePolling()` clears it. **Known v1 bug fixed here (BF-032):** previously every layout remount stacked a new interval that kept firing after unmount/logout.
- `NavBadges::index` computes counts scoped to the active `profile_id`: unanswered reviews (`SocialReply` null/empty, not permanently deleted), failed social posts (`Status = -1`), and distinct completed survey responses in the last 7 days.

### Route middleware
- **`01.maintenance.global.js`** — global; if `runtimeConfig.app.maintenanceMode === 'true'` redirects everything to `/maintenance` (and away from `/maintenance` when off).
- **`manage.global.js`** — global; redirects `/manage*` to `/dashboard` when `useAuth().user?.account_type < 2`. (Client-side guard mirroring the server `AdminFilter`.)

### Timezone
- **Storage model** — the DB stores schedule/date values in a fixed app timezone (`America/Los_Angeles`, the v1 sender-bot/scheduler assumption). Each profile has an IANA `Timezone` derived by the backend from its address.
- **Frontend** — `plugins/userTimezone.client.ts` fetches `GET /api/v2/profiles/me` after login and caches `Timezone` in `useState('userTimezone')` (default Pacific). `composables/useTimezone.js` exposes `dbToUser` (Pacific → user tz for display), `userToDb` (user tz → Pacific for save), `dbToUserObj`, `tzAbbr`, and `userLegacyTzId` (maps IANA → the 5 legacy numeric IDs the SMS scheduler understands: LA=5, Denver/Phoenix=9, Chicago=11, NY=15, UTC=30).
- **Backend** (`ProfileModel`) — `normalizeTimezone` (coerce offset/legacy-id/IANA → valid IANA), `guessTimezoneFromAddress` (state/province map, then zipcode longitude bands via `geo_zipcodes`), `syncTimezoneFromAddress` (auto-set on address change unless a valid IANA name is already stored), `resolveTimezone` (a separate prod-backported resolver — **redundant with the above and flagged for reconciliation**). Default fallback everywhere: `America/Los_Angeles`.

### Shared UI primitives
![shared-ui](_assets/screens/global/shared-ui.png) <!-- placeholder until captured -->

- **`Button.vue`** — props `as` (default `button`), `type`, `size` (xs…2xl), `color` (white/primary/danger/secondary/google/linkedin), `loading` (shows spinner). Tailwind `@apply` size/color classes.
- **`Modal.vue`** — Headless UI Dialog teleported to body; props `show`, `maxWidth` (sm…6xl), `title`, `description`, `closeable`, `showCloseButton`, `padding`, `initialFocus`; named slots `icon/title/description/default`; locks body scroll while open; emits `close`.
- **`ConfirmModal.vue`** — promise-based confirm dialog (`open(opts) → Promise<boolean>`); options `{title,message,confirmText,cancelText,tone: danger|primary}`; built on `Modal` + `Button`. **Project rule: use this, never native `confirm()`/`alert()`.**
- **`TabBar.vue`** — segmented pill tabs; `v-model` value mode or router-link mode (`opts[].to`); props `modelValue`, `options[{label,value,to?}]`, `fullWidth`.
- **`Pagination/Index.vue`**, **`Skeletons/*`** (ReviewCard, SocialPostCard, SocialPostTile, TableRowActivity, TableRowContact — loading placeholders), **`Notify/{index,Item}.vue`** (toast system invoked as `$notify({type,title,description})`).

## 4. Data & API

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/v2/login` | authenticate, issue tokens | `email, password, last_viewed_profile?` | `{user{…,permissions,profile}, access_token, refresh_token}` | `Auth/Login.php::index` |
| POST | `/api/v2/refresh` | re-issue tokens (⚠ unauthenticated) | `{refresh_token}` | `{access_token, refresh_token}` | `Auth/Login.php::refresh` |
| POST | `/api/v2/logout` | logout (no-op server-side) | — (Bearer) | `{message}` | `Auth/Login.php::logout` |
| POST | `/api/v2/impersonate/{id}` | login-as lower-privileged user | path `id` (Bearer) | login-shaped `{user, access_token, refresh_token}` | `Auth/Impersonate.php::index` |
| POST | `/api/v2/passwords/forgot` | send reset email | `{email}` | success string | `Auth/Password.php::forgot` |
| POST | `/api/v2/passwords/reset` | set new password / activate | `{password, password_confirmation, uuid, type}` | updated | `Auth/Password.php::reset` |
| GET | `/api/v2/user` | hydrate current user + profile | — (Bearer) | `{user{…,permissions,profile,tollfreeFallback,shouldSetupSMS,isConnectActive}}` | `User.php::user` |
| GET | `/api/v2/profiles` | list switchable profiles | `page, search` | `{count, profiles[], pages}` | `Profile.php::index` |
| GET | `/api/v2/profiles/{id}/switch` | switch active tenant | path `id` (Bearer) | `{access_token, refresh_token}` | `Profile.php::switch` |
| GET | `/api/v2/profiles/me` | active profile detail (incl. Timezone) | — (Bearer) | profile fields + review aggregates | `Profile.php::me` |
| GET | `/api/v2/nav/badges` | sidebar badge counts | — (Bearer) | `{reviews, social, surveys, total}` | `NavBadges.php::index` |

- **v1 models / tables:** `user`, `user_profile` (UserID↔ProfileID join), `profile`, `verification` (password/activation tokens), `messaging_settings` (joined for `isConnectActive`), `manage_request` (delete-user/delete-profile approval queue), plus `review`/`social_post`/`survey_*` for badge counts.
- **Auth wiring** — `Config/Filters.php` aliases: `apiAuth → JwtAuthFilter`, `admin → AdminFilter`, `connect → ConnectFilter`, `throttle`, `requestLogger`. Globals: `throttle` (before), `requestLogger` (after). Path filters: `admin` before `/api/v2/admin/*`, `connect` before `/api/v2/messaging/*`. Most authed routes attach `apiAuth` at the `api/v2` group level.
- **Pagination convention** — `?page` (1-based) + `?search`; responses carry `meta{total,pages}` or `{count,pages}`; default page sizes 10 (admin lists) / 20 (profile switcher).
- **Rate limiting** — `Throttle` filter throttles non-GET requests, keyed by `md5(userID_profileID)` (or IP when unauthenticated), default 60/min, returns 429 on exceed.

## 5. Business rules

- **JWT** (`jwt_helper.php`, HS256, secret `config('Keys')->jwtSecretKey`): access token TTL 24h (`jwtTimeToLive`, default 86400s); refresh token TTL 30 days (`jwtRefreshTTL`). Payload: `user_id`, `profile_id`, `typ` (`access`|`refresh`), `iat`, `exp`. (v2 target: 15-min access, 30-day rotating refresh.)
- **Request authentication** (`JwtAuthFilter::before`): extract Bearer token → decode → load user by `user_id`. For `OGGVO_USER (0)` only, reject if the user is `Suspended` or the JWT's `profile_id` profile is `Suspended`. On success injects `$request->auth = {user, profile_id}`. Any failure → 401 `{message:'Access Denied!', error}`.
- **Account types** (`Constants.php`): `OGGVO_USER=0`, `OGGVO_SALES=1`, `OGGVO_ACCOUNT_MANAGER=2`, `OGGVO_SUPERVISOR=3`, `OGGVO_ADMIN=4`. Labels: User/Sales/Manager/Supervisor/Admin.
- **Permission flags** (booleans on `user`, surfaced as `permissions{}`):
  - `PermissionFunnel` → Design area.
  - `PermissionWidgets` → Widgets area.
  - `PermissionInvites` → Invites/Campaigns.
  - `PermissionReviews` → Reviews area.
  - `PermissionReporting` → Analytics/Reporting.
  - `PermissionSupport` → Support area.
  - `PermissionSms` → Connect/Messaging (the only flag enforced server-side, via `ConnectFilter` on `/api/v2/messaging/*`).
- **RBAC gates:** `AdminFilter` rejects `account_type < 2` on `/api/v2/admin/*`. Frontend `manage.global.js` mirror-redirects `/manage*` to `/dashboard` for `account_type < 2`; sidebar hides the Manage item below 2. **Gap:** the seven permission flags are passed to the frontend but only `PermissionSms` is enforced by the API — other areas trust the SPA to hide nav items. v2 must enforce all via `@RequirePermission`.
- **User creation/edit privilege ladder** (`UserModel`): only Admin can create/edit Admins & Supervisors; Supervisor+ can create Managers & Sales; Manager+ can create Users; nobody can edit a peer or higher (except self); only Supervisor/Admin can change `AccountType`.
- **Delete approval queue:** Supervisor+ deletes a user/profile immediately and resolves any pending `manage_request`; Account Managers instead enqueue an `OGGVO_DELETE_USER (0)` / `OGGVO_DELETE_PROFILE (1)` request for approval.
- **Profile switching authorization:** `account_type >= 1` may switch into any profile; a plain user must own it (`user_profile`).
- **Timezone:** all stored timestamps are Pacific (`America/Los_Angeles`); display/convert per profile IANA timezone; SMS scheduler uses legacy numeric tz IDs. (v1 sender-bot hardcodes Pacific business hours — v2 must honour per-profile timezone.)
- **Suspension cascade** (`UserModel::suspendUser`): suspending a user suspends all their profiles and deletes their recipients; unsuspend reverses the suspend flags.
- **Side effects / async:** password-reset & invite emails go through the `sendEmail` AWS Lambda; profile creation seeds default campaigns (S3), a funnel, and `messaging_settings`.
- **Idempotency:** none server-side for token issuance; pause/resume-campaigns wrap flag + backlog update in a DB transaction (BF-037).

## 6. Integrations

- **AWS Lambda `sendEmail`** (region `us-east-2`) — transactional password-reset and user-invite emails (`Auth/Password.php`, admin invite). v2 → `email-send` BullMQ queue.
- **AWS S3** — profile-creation seeds default campaign JSON/HTML and funnel templates.
- **Twilio** — surfaced in the global user payload (`tollfreeFallback`, `shouldSetupSMS`, `isConnectActive` from `messaging_settings`); full detail in the Twilio A2P / Connect domains. Profile deletion closes the Twilio subaccount.
- **Google reCAPTCHA v3** — site key wired in `nuxt.config.ts` (`recaptchaSiteKey`) and `useRecaptcha`; used on public-facing forms.
- **No webhooks** are owned by this global domain (webhooks live under `/webhook/*`, documented in Integrations).

## 7. v1 → v2 mapping

- **Modules:**
  - `apps/api/src/modules/auth` — login, refresh (rotating), logout (session revoke), password reset/activation, impersonation (with audit + revertable session). Controller/service/repository/DTO + Vitest.
  - `apps/api/src/modules/tenancy` — profiles, user↔profile membership, profile switching, active-tenant resolution. `TenantGuard` injects `profileId` into the request context; every repository query scoped to it.
- **Drizzle tables (`@oggvo/db`):**
  - `users` ← v1 `user` (snake_case; split out push tokens; permission flags retained or promoted to a roles/permissions model).
  - `auth_sessions` (new) — one row per refresh token, **hashed**, with `expires_at`, rotation lineage, and revocation; replaces the stateless-refresh defect.
  - `verifications` ← v1 `verification` (password reset / activation tokens).
  - `profiles` ← v1 `profile` **split** out of the god table (settings/branding/messaging into satellite tables).
  - `user_profiles` ← v1 `user_profile` membership join.
  - `manage_requests` ← v1 `manage_request` delete-approval queue.
  - `feature_flags` (new) — replaces ad-hoc env checks like `TWILIO_TFV_ENABLED` (see `User::isTollfreeFeatureEnabled`).
- **Queue:** `email-send` for password-reset/invite mail; otherwise `—`.
- **Frontend:** v2 routes under `apps/web/app/(portal)/…` (authenticated dashboard) and `apps/web/app/(auth)/…` (login/reset). Reuse `@oggvo/ui` primitives `Button`, `Modal`, `ConfirmModal`, `TabBar`, `Pagination`, `Skeleton`, toast/`Notify`. Layouts → App Router segment layouts (portal shell, guest, onboarding wizard, support). Sidebar/badge polling → a client component using the typed `@oggvo/api-client`.
- **Endpoint mapping (RESTful, typed via OpenAPI):**
  - `POST /api/v2/login` → `POST /auth/login`
  - `POST /api/v2/refresh` → `POST /auth/refresh` (authenticated by the refresh token; rotates + persists hashed session)
  - `POST /api/v2/logout` → `POST /auth/logout` (revokes the session)
  - `POST /api/v2/impersonate/{id}` → `POST /auth/impersonate/{userId}`
  - `POST /api/v2/passwords/forgot` → `POST /auth/password/forgot`
  - `POST /api/v2/passwords/reset` → `POST /auth/password/reset`
  - `GET /api/v2/user` → `GET /auth/me`
  - `GET /api/v2/profiles` → `GET /profiles`
  - `GET /api/v2/profiles/{id}/switch` → `POST /tenancy/switch/{profileId}`
  - `GET /api/v2/profiles/me` → `GET /profiles/active`
  - `GET /api/v2/nav/badges` → `GET /notifications/nav-badges`
- **Known v1 bugs to fix:**
  - **Unauthenticated `/refresh`** trusting any signed refresh JWT, with no rotation/revocation — fix with hashed `auth_sessions` + rotation.
  - **No real RBAC** — only `PermissionSms` is enforced server-side; enforce all seven via `@RequirePermission` and account-type via `@Roles`.
  - **Stateless logout** does nothing server-side — revoke the session.
  - **`last_viewed_profile` ignored** at login (commented-out `where`) — honour it.
  - **Impersonation has no audit/revert** — record actor + provide a "stop impersonating" path.
  - **Forgot-password enumerates accounts** (distinct "user not found" error) — return a uniform response.
  - **Generic SHA-256 + salt password hashing** (with a legacy UTF-16LE variant) — migrate to argon2/bcrypt.
  - **Redundant timezone resolvers** (`resolveTimezone` vs `normalizeTimezone`/`syncTimezoneFromAddress`) — consolidate to one resolver; honour per-profile tz in schedulers.
  - **Profile-switch requires a full `window.location.reload()`** — re-hydrate client state without a hard reload in v2.

## 8. Open questions / parity risks

- **Profile selection at login is non-deterministic** — `getActiveProfile` returns the first matching profile (the `lastProfileId` filter is commented out). v2 should define a deterministic "default/last active profile" rule; confirm whether `last_viewed_profile` cookie should drive it.
- **No org/team entity** — multi-tenancy is purely user↔profile. If v2 introduces agencies/teams, `user_profiles` may need a role-per-profile column (today `account_type` is global to the user, not per profile).
- **Permission model granularity** — v1 has a fixed set of 7 booleans + a 5-level account-type ladder. Decide whether v2 keeps booleans (`@RequirePermission('reviews')`) or moves to a normalized roles/permissions table; the spec assumes flags are preserved.
- **Suspension semantics** — `JwtAuthFilter` only checks suspension for `account_type 0`; higher account types are never blocked even if `Suspended`. Confirm intended behaviour for v2.
- **Maintenance mode** is a build-time env flag (`NUXT_MAINTENANCE_MODE`) read client-side only; v2 likely needs a server-enforced maintenance gate.
- **`feature_flags` mapping** — v1 uses scattered env vars (e.g. `TWILIO_TFV_ENABLED`) read directly in controllers; need a migration list of every such flag into the `feature_flags` table.
- **Token TTL change** (24h → 15min access) materially increases refresh traffic; confirm the web client transparently refreshes and that `auth_sessions` rotation handles concurrent tabs without logging the user out.
- **Schema home for `verifications` types** — v1 distinguishes `NewUser` (activation) vs `Password`; ensure the v2 `verifications` table enumerates all token types (also email-change, etc., if added).
- **Avatar/logo storage** — v1 stores filenames on disk under `public/assets/media/...` (avatars, profile-logos, business-logos) and serves via proxy; v2 should move these to the `media-process` pipeline / object storage and reconcile URL shapes.
