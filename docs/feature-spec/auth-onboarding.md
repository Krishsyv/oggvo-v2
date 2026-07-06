# Auth & Onboarding

> **v2 target:** modules `apps/api/src/modules/auth` + `apps/api/src/modules/tenancy` · tables `users`, `auth_sessions`, `verifications`, `profiles`, `user_profiles` (`@oggvo/db`) · queue `email` (transactional, replaces direct Lambda) · build phase `0–1`
> **v1 sources:** frontend `apps/portal-frontend/pages/index.vue`, `activate.vue`, `password/forgot.vue`, `password/reset.vue`, `unsubscribe.vue`, `setup/*.vue`; layouts `layouts/guest.vue`, `layouts/setup.vue`; auth module `@nuxt-alt/auth` (config in `nuxt.config.ts`); API `apps/portal-api/app/Controllers/API/V2/Auth/{Login,Password,Impersonate}.php`, `API/V2/{Account,Unsubscribe}.php`; helper `app/Helpers/jwt_helper.php`; models `app/Models/{UserModel,VerificationModel,ProfileModel}.php`

## 1. Overview
The Auth & Onboarding domain covers everything an unauthenticated visitor does before reaching the portal: logging in, activating a newly-created account, forgetting/resetting a password, unsubscribing from emails, and the multi-step business "setup" onboarding wizard. Authentication is stateless JWT (access + refresh tokens) issued by the API; there is no self-serve signup — accounts are provisioned by staff (Admin/Supervisor/Manager) and the user activates via an emailed link. All pages here use the `guest` layout (or `setup` layout for the wizard) and are reachable without a session. Access to the portal proper requires a valid access token plus at least one accessible `profile` for the user. **Important parity note: the entire `setup/*` onboarding wizard in v1 is an unwired static mockup — it renders the intended UX but makes no API calls and persists nothing (see §3 and §8).**

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/` | `pages/index.vue` | guest | — | guest only (`auth: 'guest'`) |
| `/activate?token=` | `pages/activate.vue` | guest | — | public (`auth: false`); requires valid `NewUser` token |
| `/password/forgot?email=` | `pages/password/forgot.vue` | guest | — | guest only (`auth: 'guest'`) |
| `/password/reset?token=` | `pages/password/reset.vue` | guest | — | guest only (`auth: 'guest'`) |
| `/unsubscribe?id=` | `pages/unsubscribe.vue` | guest | — | public (`auth: false`); requires tracker id |
| `/setup` | `pages/setup/index.vue` | setup | step 1 — Company Details | (mockup; no auth wired) |
| `/setup/questionnaire` | `pages/setup/questionnaire.vue` | setup | step 2 — Questionnaire | (mockup) |
| `/setup/team` | `pages/setup/team.vue` | setup | step 3 — Team | (mockup) |
| `/setup/profiles` | `pages/setup/profiles.vue` | setup | step 4 — Profiles | (mockup) |
| `/setup/automation` | `pages/setup/automation.vue` | setup | step 5 — Automation | (mockup) |
| `/setup/finish` | `pages/setup/finish.vue` | setup | step 6 — Finish | (mockup) |

The `setup` layout (`layouts/setup.vue`) renders a sticky top progress bar (`progressbar-step-N`, N = `$route.meta.step`) and a left sidebar with the 5 named steps (Company Details, Questionnaire, Invite your team, Profiles, Automation) plus a dismissible "Fill out what you know!" info card (state persisted in cookie `view.showSetupAlert`).

## 3. Screen-by-screen

### `/` — Login
![login](_assets/screens/auth/login.png) <!-- placeholder until captured -->
- **Purpose & layout** — Split-screen `guest` layout (form left, branded illustration right). Centered Oggvo logo, login form, "© Oggvo 2023" footer.
- **Elements / fields**
  - `email` — TextInput type=email, `required`, `autofocus`, autocomplete=email.
  - `password` — TextInput type=password, `required`, autocomplete=current-password. Static helper text "Must be at least 8 characters".
  - "Remember me" checkbox — commented out (not rendered).
  - **Sign in** button — `color=primary`, full width, bound to `auth.busy` (loading + disabled).
  - "Forgot your password?" link → `/password/forgot?email=<form.email>` (email forwarded if typed).
- **Behaviour** — Submits via `useAuth().login({ body: form })` (from `@nuxt-alt/auth`, which POSTs to `/api/v2/login`). The hidden `last_viewed_profile` field is seeded from cookie `last_viewed_profile`. On success: `auth.setUser(res.user)`, cookie `last_viewed_profile` set to `res.user.profile.ID`, toast "Welcome back, {first_name}!".
- **States** — Idle, submitting (button spinner/disabled while `auth.busy`). Error: server messages rendered under fields — `errors.email`, `errors.password`, and a generic `errors.error` (e.g. "These credentials do not match our records." or "Your account is not activated…").

### `/activate?token=` — Activate Account
![activate](_assets/screens/auth/activate.png) <!-- placeholder until captured -->
- **Purpose & layout** — Welcomes a newly-provisioned user and lets them set their first password. `guest` layout.
- **On mount** — If no `token` query → redirect to `/404`. Otherwise `GET /api/v2/account?token=<token>` to fetch `{ Name, UUID }`; `Name` shows in heading ("Welcome, {Name}!"), `UUID` is stored into `form.uuid`. On fetch error → redirect to `/404`.
- **Elements / fields**
  - `password` — New Password, TextInput type=password, `required`, `autofocus`. `<PasswordRequirements>` component shows live rule checklist.
  - `password_confirmation` — Confirm Password, TextInput type=password, `required`.
  - **Activate** button — full width, loading state.
  - Hidden form fields: `uuid` (from `/account`), `type: 'activate'`.
- **Behaviour** — Submits `POST /api/v2/passwords/reset` with `{ uuid, password, password_confirmation, type: 'activate' }`. On success: switch to "Congratulations!" panel with a 5-second countdown, then `navigateTo('/')`.
- **States** — Pre-activation form; success/countdown panel; field errors (`errors.password`, `errors.password_confirmation`) cleared on `@change`.

### `/password/forgot?email=` — Forgot password
![forgot-password](_assets/screens/auth/forgot-password.png) <!-- placeholder until captured -->
- **Purpose & layout** — Request a reset link. `guest` layout, centered card with envelope icon.
- **Elements / fields**
  - `email` — TextInput type=email, `required`, `autofocus`, placeholder "Enter your Email", seeded from `?email=` query.
  - **Reset password** button — full width, loading state.
  - "Back to log in" link → `/`.
- **Behaviour** — `POST /api/v2/passwords/forgot` with `{ email }`. On success → success panel "Check your email" / "We sent a password reset link to {email}".
- **Success panel** — Shows the target email; a "Didn't receive the email? Click to resend" button that resets `showSuccess=false` (returns to the form to resubmit); "Back to log in" link.
- **States** — Form, success panel. Error: single `error` string under field (server `messages.error` or fallback "Something went wrong, Please try again!").

### `/password/reset?token=` — Reset / set new password
![reset-password](_assets/screens/auth/reset-password.png) <!-- placeholder until captured -->
- **Purpose & layout** — Set a new password from an emailed reset link. `guest` layout, key icon, success panel uses green check icon.
- **Elements / fields**
  - `password` — TextInput type=password, `required`, `autofocus`, autocomplete=new-password. `<PasswordRequirements>` checklist.
  - `password_confirmation` — TextInput type=password, `required`, autocomplete=new-password.
  - **Reset password** button — full width, loading.
  - Hidden: `uuid` (from `?token=`), `type: 'reset'`.
- **Behaviour** — `POST /api/v2/passwords/reset` with `{ password, password_confirmation, uuid, type: 'reset' }`. On success → "Password reset" panel with "Continue" → `/`.
- **States** — Form, success panel. Errors: top-level `errors.error` (e.g. invalid/expired token) plus per-field `errors.password` / `errors.password_confirmation`.

### `/unsubscribe?id=` — Unsubscribed
![unsubscribe](_assets/screens/auth/unsubscribe.png) <!-- placeholder until captured -->
- **Purpose & layout** — One-shot confirmation page hit from an email "unsubscribe" link. `guest` layout, frown icon.
- **On mount** — If no `?id=` (tracker id) → redirect `/404`. Otherwise `GET /api/v2/unsubscribe?id=<id>`; sets `data.email` and `data.profile` from response `{ Email, Profile }`.
- **Elements** — "We're sorry! Your email has been unsubscribed {email}" heading; a secondary button showing the profile name. No form inputs — unsubscription happens server-side on GET.
- **States** — Success ("We're sorry!" + email) or error ("Something went wrong! Please try again in a few minutes" from `messages.error`).

### `/setup` — Step 1: Company Details ⚠️ UNWIRED MOCKUP
![setup-company](_assets/screens/auth/setup-company.png) <!-- placeholder until captured -->
- **Purpose & layout** — First wizard step. `setup` layout (`meta.step: 1`). All field values are hardcoded `ref`s for demo (e.g. `business_name='Oggvo'`, `website='www.oggvo.com'`); **no submit handler, no API call, nothing persisted.** "Next" is a plain `NuxtLink` to `/setup/questionnaire`; "Previous" is disabled.
- **Elements / fields** (intended)
  - Business Name (text), Website (text, `http://` prefix), Business Email (text), Business Number (US country select + text), Business Address (text), City (text), State (`<select>` from `states`), Zip (text).
  - Industry (`<select>` from `industries`), Category (`<select>` from `categories`), business-open Month + Year (`<select>` each), Bio (textarea, 750-char limit with live "N characters remaining"), logo upload (`<input type=file>`, "PNG, JPG max 800x800"), Color palette: Primary / Secondary / Accent color pickers (`#195AA8`, `#4DB9EA`, `#475467` defaults).
  - Hours of operation table — per-day (Sun–Sat) Open/Closed toggle (Headless UI `Switch`) + begin/end hour chips.
- **States** — Static only; no loading/error/persistence states exist.

### `/setup/questionnaire` — Step 2: Questionnaire ⚠️ UNWIRED MOCKUP
![setup-questionnaire](_assets/screens/auth/setup-questionnaire.png) <!-- placeholder until captured -->
- `meta.step: 2`. All sections badged "Optional". No persistence; "Previous"→`/setup`, "Next"→`/setup/team`.
- **Questions / fields**
  - **Client Base** — "Which system, CRM, or tools do you store your client lists in? (names, emails, dates of service)" — repeatable "System Name" text inputs ("Add another" increments `system_name_counter`).
  - **Top Cities** — "Top 5 cities to prioritize for online presence" — City 1–5 text inputs.
  - **Top Services** — "Top 5 services or products" — Service 1–5 text inputs.
  - **Google Business Page** — radio group (`google_radiobtn`): "Send instructions" / "Walk me thorugh" [sic] / "I don't have a Google Business Page".

### `/setup/team` — Step 3: Invite your team ⚠️ UNWIRED MOCKUP
![setup-team](_assets/screens/auth/setup-team.png) <!-- placeholder until captured -->
- `meta.step: 3`. Sections badged "Optional". No persistence; "Previous"→`/setup/questionnaire`, "Next"→`/setup/profiles`.
- **Admin section** — Name (text), Contact Number (text), email input, role `<select>` (hardcoded "Owner"), avatar upload with a fake upload-progress widget ("Sam_Profile.jpg / 720 KB / 49%").
- **Team section** — repeatable rows of email input + role `<select>` (hardcoded "Member"); "Add another" increments `counts`.

### `/setup/profiles` — Step 4: Connect Social Media ⚠️ UNWIRED MOCKUP
![setup-profiles](_assets/screens/auth/setup-profiles.png) <!-- placeholder until captured -->
- `meta.step: 4`. Explains Oggvo needs access to social profiles to optimize for Google. No persistence; "Previous"→`/setup/team`, "Next"→`/setup/automation`.
- **Elements** — "Add New" button (no-op) + a hardcoded list of platforms (`Twitter`, `Google`, `Instagram`, `Facebook`) each with username + edit/delete icon buttons (no handlers). Status values (`logged out`/`error`/`active`) are static and unused.

### `/setup/automation` — Step 5: Automation Preference ⚠️ UNWIRED MOCKUP
![setup-automation](_assets/screens/auth/setup-automation.png) <!-- placeholder until captured -->
- `meta.step: 5`. No persistence; "Previous"→`/setup/profiles`, "Finish"→`/setup/finish`.
- **Toggles** (Headless UI `Switch`, local `ref`s only):
  - Social Media Posting — "Post on social media on public holidays" (default on).
  - Newsletters — "Send review requests and reminders" (default on).
  - SMS Keyword Triggers — "Reply to dedicated keywords" (default on).
  - Birthday Greetings — "Send automatic greetings with discount coupon" (default off).

### `/setup/finish` — Step 6: Finish ⚠️ UNWIRED MOCKUP
![setup-finish](_assets/screens/auth/setup-finish.png) <!-- placeholder until captured -->
- `meta.step: 6`. Static success screen: green check, "Profile Complete / submitted for review", "Proceed To Dashboard" link → `/dashboard`, "Click for help" link, "Back To Review" → `/setup/automation`. No submission occurs.

## 4. Data & API

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/v2/login` | Authenticate, issue tokens | `email`, `password`, `last_viewed_profile` | `{ user: {id, first_name, last_name, name, email, image, account_type, last_login, suspended, permissions{funnel,widgets,invites,reviews,reporting,support,sms}, profile, shouldSetupSMS, isConnectActive}, access_token, refresh_token }` | `Auth/Login.php::index` |
| POST | `/api/v2/logout` (filter `apiAuth`) | Log out (stateless no-op) | — (Bearer token) | `{ message: "User is disconnected Successfully" }` | `Auth/Login.php::logout` |
| GET | `/rest/login/logout` | Mobile logout (no-op) | — | `{ message }` | `Mobile/Login::logout` (same shape) |
| POST | `/api/v2/refresh` ⚠️ **no auth filter** | Re-issue access+refresh tokens | body `{ refresh_token }` | `{ access_token, refresh_token }` | `Auth/Login.php::refresh` |
| POST | `/api/v2/impersonate/(:num)` (filter `apiAuth`) | Staff login-as lower-privilege user | path `id`; Bearer token | same payload as `/login` | `Auth/Impersonate.php::index` |
| POST | `/api/v2/passwords/forgot` | Send reset link | `email` | `"We have emailed your password reset link!"` (string) | `Auth/Password.php::forgot` |
| POST | `/api/v2/passwords/reset` | Set new password (reset or activate) | `password`, `password_confirmation`, `uuid`, `type` (`reset`\|`activate`) | `respondUpdated()` (200) | `Auth/Password.php::reset` |
| GET | `/api/v2/account?token=` | Resolve activation token → name | query `token` | `{ Name, UUID }` | `Account.php::index` |
| GET | `/api/v2/unsubscribe?id=` | Opt a recipient out via tracker | query `id` (TrackerID) | `{ Profile, Email }` | `Unsubscribe.php::index` |

- **v1 models / tables:**
  - `user` (`UserModel`) — credentials, `Salt`, `AccountType` (0=User,1=Sales,2=Manager,3=Supervisor,4=Admin), 7 `Permission*` bools, `LastLogin`, `Suspended`, `Image`, FCM/APN tokens, `AccessToken`/`RefreshToken` columns (largely unused for JWT).
  - `verification` (`VerificationModel`) — `VerificationType` (`NewUser` / `Password`), `Token` (UUID), `UserID`, `Completed`, `CreateDate`, `ExpireDate`.
  - `profile`, `user_profile` (join), `messaging_settings` (joined in `getActiveProfile` for `shouldSetupSMS` / `isConnectActive`).
  - `tracker`, `recipient` (unsubscribe path).
- **Pagination / filtering / sorting:** none in this domain (all single-record lookups). `last_viewed_profile` is a soft hint only — the `getActiveProfile` filter on `lastProfileId` is **commented out**, so it always returns the first matching profile.
- **JWT (`jwt_helper.php`):** HS256, claims `user_id`, `profile_id`, `typ` (`access`\|`refresh`), `iat`, `exp`. Access TTL = `jwtTimeToLive` (default 86400 = 24h); refresh TTL = `jwtRefreshTTL` (default 30 days). `getPayloadFromToken` maps `typ`→`type`.

## 5. Business rules
- **No self-serve signup.** Users are created by staff (`UserModel::createUser`, role-gated) and receive a `NewUser` verification; they set their password through `/activate` → `passwords/reset` with `type=activate`.
- **Login requires an accessible profile.** After password check, `ProfileModel::getActiveProfile` must return a profile, else login fails with "Your account is not activated…". For `AccountType=User` (0), profile must be linked via `user_profile`; higher roles get the first profile.
- **Verification token expiry:** `NewUser` = +90 days, `Password` = +1 day (`VerificationModel::createVerification`). Tokens are UUID strings. `getValidVerificationByToken` requires matching `VerificationType`, `ExpireDate > NOW()`, and `Completed = 0`.
- **Single-use tokens.** On successful reset/activate, `disableVerification` sets `Completed = 1`.
- **Password rules:** `min_length[8]`, `password` must match `password_confirmation`. `type` must be `in_list[activate,reset]`.
- **Password hashing (legacy, fix in v2):** salted SHA256 with a dual scheme — `hash('sha256', UTF-16LE(password) . salt)` AND `hash('sha256', password . salt)`; either match passes. On successful login the password is silently re-saved as the plain-UTF8 variant. `changePassword` regenerates an 8-byte random salt.
- **LastLogin** is stamped inside `verifyPassword` on each successful login.
- **Impersonation:** only allowed if `session.AccountType > target.AccountType` (strictly lower privilege). Target must have a profile. Issues a full token pair for the target. (LastLogin update is commented out.)
- **Refresh:** validates `type === 'refresh'`, then re-issues both tokens. **No session/revocation check** — any valid refresh token works until expiry.
- **Logout** is a stateless no-op (returns a message; cannot invalidate an outstanding JWT).
- **Unsubscribe** (GET, idempotent-ish): looks up tracker → profile + recipient; if `OptIn == 1`, sets `OptIn = 0`, `Status = 'Inactive'`, and appends `Unsubscribed` to the comma-separated `Tags` (de-duplicated). Re-hitting with `OptIn` already 0 is a no-op but still returns 200.
- **`shouldSetupSMS`** = user has `PermissionSms` AND profile lacks SMSNumber/SID/Token. **`isConnectActive`** = `messaging_settings.active`.
- **Setup wizard persists nothing** — there are no validation, success, or error rules because no submission exists (see §8).

## 6. Integrations
- **AWS Lambda `sendEmail`** (`App\Services\AwsLambda::invoke`, region `us-east-2`) — sends the password-reset / activation email. Payload includes `from_email=support@oggvo.com`, `to_emails`, `subject`, `html_content` (rendered `email/invitation` view with `ActivationURL = {app.frontURL}password/reset?token={token}`), `profile_id`, `message_type=transactional_passwordReset`. Behind the Lambda is SendGrid (Oggvo's transactional email provider).
- **Frontend auth module** — `@nuxt-alt/auth` (refresh scheme); endpoints configured in `nuxt.config.ts` (`login`→`/login`, `refresh`→`/refresh`, `refresh_token` property/data). Redirect `login: '/'`, `callback: '/login'`.
- **Google reCAPTCHA** — `composables/useRecaptcha.js` exists in the app but is not invoked on these auth forms in v1 (candidate to add in v2).
- No Twilio/Stripe/Square/Meta interaction in the auth flow itself; the setup wizard *references* social platforms (Google/Facebook/Instagram/Twitter) and SMS but is non-functional.

## 7. v1 → v2 mapping
- **Modules:**
  - `apps/api/src/modules/auth` — controller/service/repository/DTO for login, refresh, logout, password forgot/reset, account activation, impersonation. JWT issuance + verification as a guard/strategy.
  - `apps/api/src/modules/tenancy` — profile resolution (`getActiveProfile` equivalent), `user_profiles` membership, active-profile selection. Owns `unsubscribe` recipient logic if recipients live under tenancy, else map to a `marketing`/`recipients` module.
- **Drizzle tables (`@oggvo/db`):**
  - `users` — replace dual SHA256+salt with `argon2`/`bcrypt` hash column; keep `account_type` + per-feature permission flags (or move to proper RBAC roles, see below); `suspended`, `last_login_at`, `image`.
  - `auth_sessions` — **NEW** table for refresh-token sessions (token id/hash, user_id, profile_id, user_agent, ip, expires_at, revoked_at). Enables real logout + refresh-token rotation/revocation, which v1 lacks.
  - `verifications` — `type` (`new_user`\|`password`), `token`, `user_id`, `completed_at`, `expires_at`; keep 90d/1d TTLs.
  - `profiles`, `user_profiles` — unchanged shape; expose `shouldSetupSMS`/`isConnectActive` as computed fields (join messaging settings).
- **Queue:** `email` (BullMQ) — replace the synchronous `AwsLambda::invoke('sendEmail')` with an enqueued transactional-email job (provider SendGrid), so `forgot` returns fast and email is retried.
- **Frontend:** v2 routes under `apps/web/app/(auth)/...` — `login`, `activate`, `password/forgot`, `password/reset`, `unsubscribe`; wizard under `apps/web/app/(onboarding)/setup/*`. Reuse `@oggvo/ui` `TextInput`, `Button`, `PasswordRequirements`, `Switch`, plus a shared progress-stepper. Use server actions / typed client generated from OpenAPI.
- **Endpoint mapping (RESTful, OpenAPI-typed):**
  - `POST /api/v2/login` → `POST /auth/login`
  - `POST /api/v2/refresh` → `POST /auth/refresh` (**now authenticated against `auth_sessions` + rotation**)
  - `POST /api/v2/logout` → `POST /auth/logout` (revokes the session row)
  - `POST /api/v2/impersonate/:id` → `POST /auth/impersonate/:id` (RBAC-gated)
  - `POST /api/v2/passwords/forgot` → `POST /auth/password/forgot`
  - `POST /api/v2/passwords/reset` → `POST /auth/password/reset` (single endpoint; `type` distinguishes activate vs reset, or split into `/auth/activate`)
  - `GET /api/v2/account?token=` → `GET /auth/activation/:token` (or `/auth/verifications/:token`)
  - `GET /api/v2/unsubscribe?id=` → `POST /unsubscribe/:trackerId` (state change should not be a GET — see bugs)
- **Known v1 bugs to fix:**
  1. **`/refresh` is unauthenticated** — the `apiAuth` filter is commented out (`Routes.php:66`); any valid refresh token reissues tokens with no session/revocation check.
  2. **No real RBAC** — authorization is ad-hoc `AccountType` integer comparisons + flat `Permission*` bools scattered in controllers/models; no centralized guard. v2 should add role/permission middleware.
  3. **Logout cannot invalidate tokens** — stateless no-op; needs `auth_sessions` + revocation.
  4. **Legacy dual SHA256+salt hashing** with silent re-hash on login — migrate to argon2/bcrypt with a one-time upgrade-on-login path.
  5. **`last_viewed_profile` is dead** — the `lastProfileId` filter in `getActiveProfile` is commented out, so the hint never affects which profile is returned.
  6. **Unsubscribe is a GET that mutates state** — vulnerable to prefetch/scanner-triggered opt-outs; make it a POST (or two-step confirm).
  7. **JWT claim mismatch risk** — `typ` claim is mapped to `type` in `getPayloadFromToken`; keep claim names consistent in v2.
  8. **Setup wizard is entirely unwired** — must be built from scratch with real persistence (see §8).

## 8. Open questions / parity risks
- **Setup wizard has no backend at all.** Every `setup/*.vue` uses hardcoded local `ref`s, has no submit handler, makes no API call, and persists nothing; navigation is plain `NuxtLink`s. There is **no v1 endpoint, model, or table** backing company details, questionnaire answers, team invites, social-profile linking, or automation preferences collected here. This is a full schema + API gap for v2 — decide which tables own each step (e.g. `profiles` for company details/hours/branding; a new `onboarding`/`questionnaire` table for free-form answers; `user_profiles`/invites for team; social-connection tables for profiles; per-profile `automation_settings` for the toggles). Flag: the wizard's intended fields may not map cleanly onto existing v2 tables.
- **No draft/resume semantics** defined for onboarding — does a partially completed wizard persist between sessions? v1 gives no guidance.
- **Avatar/logo uploads** in the wizard are non-functional `<input type=file>` with fake progress UI — real upload pipeline (S3/`@oggvo` media module) and size/type validation (claimed "800x800 PNG/JPG") need defining.
- **"Profile submitted for review"** (finish screen) implies an approval workflow that does not exist in code — clarify whether onboarding requires staff review before portal access.
- **Email deliverability / resend throttling** — `forgot` has no rate limiting; "Click to resend" simply re-shows the form. v2 should add throttling and consistent enumeration-safe responses (v1 leaks whether an email exists: "We can't find a user with that email address.").
- **Token-in-URL** for activation/reset (`?token=`) — acceptable but should be single-use (it is) and short-TTL; confirm v2 keeps 1-day reset / consider shortening 90-day activation.
- **`AccessToken`/`RefreshToken` columns on `user`** appear vestigial under JWT — confirm they can be dropped in favor of `auth_sessions`.
- **Impersonation auditing** — v1 does not log impersonation events (LastLogin update commented out); v2 should record an audit trail.
