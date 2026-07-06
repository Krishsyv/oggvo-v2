# Auth & Onboarding — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/auth-onboarding.md`](../feature-spec/auth-onboarding.md).
> v2 target: modules `apps/api/src/modules/auth` + `apps/api/src/modules/tenancy` · tables `users`,
> `auth_sessions`, `verifications`, `profiles`, `user_profiles` (`@oggvo/db`) · queue `email` (BullMQ
> transactional) · build phase 0–1.
>
> Companion docs: [activity-diagrams.md](./activity-diagrams.md) (flow / sequence diagrams) ·
> [../design-system/README.md](../design-system/README.md) (UI) · mockups in
> [../design-system/mockups/](../design-system/mockups/) (`auth-login.html`, `auth-signup.html`,
> `auth-onboarding.html`).

**Personas**
- **Visitor** — an unauthenticated person on a public page (login, signup, activation, password
  reset, unsubscribe). No session, no profile.
- **New Owner** — a freshly registered/provisioned user running the onboarding wizard for the first
  time; authenticated but their profile is not yet set up.
- **Member** — an existing authenticated user signing back in to an established profile.
- **System** — the platform (API + `email` worker + scheduler) acting on the user's behalf.

**Global rules that apply to every story**
- **Stateless access, stateful refresh.** A successful auth issues a short-lived **access JWT (15 min)**
  + a **rotating refresh token (30 d)** whose hash is stored in `auth_sessions`. Every protected
  endpoint accepts only the access JWT.
- **Enumeration-safe public responses.** Forgot-password and signup must not reveal whether an email
  already exists; they return the same generic success regardless (fix-on-rebuild: v1 leaked "We can't
  find a user with that email address.").
- **Single-use, TTL-bounded tokens.** Verification tokens (`new_user` 90 d, `password` 1 d) are UUIDs,
  valid only while `expires_at > now()` and `completed_at IS NULL`; consuming one stamps `completed_at`.
- **Tenancy boundary.** Reaching the portal requires a valid access JWT **and** at least one accessible
  `profile`; the `TenantGuard` resolves and injects `profileId` (replaces v1 `getActiveProfile`).
- **Dates/times render in the resolved profile timezone**, stored UTC (no hardcoded Pacific).

---

## Epic E1 — Sign in & token lifecycle

### US-1.1 — Log in with email + password
**As a** Member **I want** to sign in with my email and password **so that** I reach my dashboard.
- **AC1** `POST /auth/login` accepts `{ email, password }`; on success it returns the user profile
  summary plus an **access JWT (15 min TTL)** and a **refresh token (30 d TTL)**, and writes a new
  `auth_sessions` row (token hash, `userId`, `profileId`, user-agent, IP, `expiresAt`).
- **AC2** Passwords verify against an argon2/bcrypt hash; a legacy v1 dual-SHA256+salt hash is
  transparently re-hashed to the new scheme on first successful login (upgrade-on-login).
- **AC3** Login fails with a generic credential error when the email is unknown or the password is
  wrong; it must not distinguish the two cases.
- **AC4** Login succeeds only if the user resolves at least one accessible `profile`; otherwise it
  returns "Your account is not activated / has no profile" without issuing tokens.
- **AC5** A `suspended` user is rejected with a distinct, non-retryable message.
- **AC6** On success the UI stamps `last_login_at`, stores the access token in memory and the refresh
  token in an httpOnly cookie, and shows "Welcome back, {firstName}!".
- **AC7** "Remember me" extends only the refresh-token cookie lifetime; the access JWT is always 15 min.
- **AC8** UI states: idle, submitting (button disabled + spinner), field/global error.

### US-1.2 — Rotate tokens on refresh
**As a** Member **I want** my session to renew silently **so that** I'm not logged out every 15 minutes.
- **AC1** `POST /auth/refresh` accepts a refresh token, looks up its **hash** in `auth_sessions`, and
  rejects it if the row is missing, revoked (`revoked_at` set), or expired.
- **AC2** On success it **rotates**: the presented session row is revoked and a brand-new refresh
  token + `auth_sessions` row is issued alongside a fresh 15-min access JWT.
- **AC3** **Reuse detection:** presenting an already-rotated (revoked) refresh token revokes the entire
  session family for that user and forces re-login (token-theft mitigation).
- **AC4** The endpoint is **authenticated against `auth_sessions`** — a structurally-valid but unknown
  refresh token is rejected (fix-on-rebuild: v1 `/refresh` was unauthenticated and never rotated).
- **AC5** Claim names stay consistent: the token carries `userId`, `profileId`, `type` (`access`|`refresh`),
  `iat`, `exp` (fix-on-rebuild: v1 mapped `typ`→`type` inconsistently).

### US-1.3 — Log out and revoke the session
**As a** Member **I want** logout to actually end my session **so that** a stolen refresh token is useless.
- **AC1** `POST /auth/logout` revokes the caller's current `auth_sessions` row (`revoked_at = now`).
- **AC2** After logout the refresh token no longer rotates and the access JWT is allowed to expire
  naturally (fix-on-rebuild: v1 logout was a stateless no-op that could not invalidate tokens).
- **AC3** An optional "log out everywhere" revokes all active sessions for the user.

### US-1.4 — Recover a forgotten password
**As a** Visitor **I want** to request a reset link **so that** I can regain access without support.
- **AC1** `POST /auth/password/forgot` accepts `{ email }` and always returns the same generic
  "If that email exists, we've sent a reset link" response (enumeration-safe).
- **AC2** When the email matches a user, the System creates a `password` verification (1 d TTL) and
  enqueues a transactional email on the `email` queue (so the request returns fast and the send retries).
- **AC3** Resend is rate-limited per email/IP; the success screen offers a throttled "resend" action.

### US-1.5 — Set a new password from a reset link
**As a** Visitor **I want** to choose a new password from the emailed link **so that** I can sign in again.
- **AC1** `POST /auth/password/reset` accepts `{ token, password, passwordConfirmation }`; it validates
  the `password` verification token (unexpired, not completed) and that the passwords match (min length 8).
- **AC2** On success the new argon2/bcrypt hash is stored, the verification is marked `completed_at`,
  **all existing `auth_sessions` for the user are revoked**, and the UI shows a success panel → Continue
  to login.
- **AC3** An invalid/expired/used token yields a clear top-level error (not a per-field error).

---

## Epic E2 — Sign up & activate an account

### US-2.1 — Self-serve signup
**As a** Visitor **I want** to create an account with my name, business, email and password **so that**
I can start setting up OGGVO.
- **AC1** `POST /auth/register` accepts `{ fullName, businessName, email, password }` and `acceptedTerms`;
  it creates a `users` row (argon2/bcrypt hash) and a draft `profiles` row owned by the user, linked via
  `user_profiles`.
- **AC2** Password strength is validated (min length 8; UI shows a live strength hint); terms acceptance
  is required to submit.
- **AC3** A duplicate email is rejected, but the response wording stays enumeration-safe in line with
  the global rule (the form shows a neutral "try signing in" path).
- **AC4** On success the System creates a `new_user` verification (90 d TTL) and enqueues a verification
  email on the `email` queue; the UI shows a "check your email" confirmation.
- **AC5** Registration does **not** issue access/refresh tokens until the email is verified (or, if the
  product chooses immediate login, the account is flagged unverified — confirm in Open Questions).
- **Note:** v1 had **no self-serve signup** (staff-provisioned only); this epic is net-new for v2 and the
  activation machinery from §3 is reused for email verification.

### US-2.2 — Verify the email / activate
**As a** New Owner **I want** to confirm my email from the link **so that** my account is active.
- **AC1** `GET /auth/activation/:token` resolves a `new_user` verification to `{ name, userId }` so the
  page can greet the user; an unknown/expired token redirects to a not-found/expired state.
- **AC2** Confirming via `POST /auth/password/reset` with `type=activate` (or a dedicated
  `POST /auth/activate`) sets the initial password, stamps `completed_at`, and marks the user active.
- **AC3** After activation the user is signed in (full token pair issued via the E1 login flow) and sent
  into the onboarding wizard (US-3.1).

---

## Epic E3 — Onboarding wizard

> Fix-on-rebuild: the entire v1 `setup/*` wizard was an **unwired static mockup** — hardcoded refs, no
> submit handlers, no API calls, nothing persisted. v2 must build it with real persistence. Some target
> tables are schema gaps today (see Open Questions).

### US-3.1 — Step through the onboarding wizard
**As a** New Owner **I want** a guided multi-step setup **so that** my profile is ready to use.
- **AC1** The wizard shows a horizontal step indicator (e.g. **Business info → Connect a platform →
  Invite first contacts → Done**) with the current step highlighted and completed steps marked.
- **AC2** Each step persists on **Continue** (not just on finish) so the wizard is resumable across
  sessions; **Back** returns without losing entered data.
- **AC3** Every step is **skippable** except required identity fields; skipping advances without writing
  optional data.
- **AC4** All writes are scoped to the New Owner's `profileId` via the `TenantGuard`.

### US-3.2 — Business info
**As a** New Owner **I want** to enter my business details **so that** my profile is branded correctly.
- **AC1** `PATCH /profiles/me` (or `POST /profiles/save-settings`) persists business name, website,
  address, industry/category, hours of operation, branding colors and logo.
- **AC2** Logo upload goes through the media/S3 pipeline with type/size validation (fix-on-rebuild: v1
  had a fake `<input type=file>` with a faked progress widget).
- **AC3** Hours and any scheduling render/store in the **profile timezone** (no hardcoded Pacific).

### US-3.3 — Connect a review/social platform
**As a** New Owner **I want** to connect my first platform **so that** OGGVO can collect reviews.
- **AC1** The step offers Google / Facebook connect buttons that begin the OAuth flow for the chosen
  platform; on return the connection is persisted to the integrations vault (AES-GCM encrypted — never
  plaintext, unlike v1).
- **AC2** A **Skip** link advances without a connection.

### US-3.4 — Invite first contacts / team
**As a** New Owner **I want** to invite teammates or add first contacts **so that** I'm not starting empty.
- **AC1** The step lets the owner add teammate email + role rows (persisted as `user_profiles` invites)
  and/or seed a few contacts; both are optional/skippable.

### US-3.5 — Finish onboarding
**As a** New Owner **I want** a clear completion step **so that** I know setup is done.
- **AC1** A finish/Done step marks onboarding complete on the profile and routes to the dashboard.
- **AC2** Resolve whether finishing triggers an approval/"submitted for review" workflow (v1 implied one
  in copy but none existed) — see Open Questions.

---

## Cross-cutting acceptance criteria
- **Token security:** access JWTs are 15 min and never persisted server-side; only refresh-token **hashes**
  live in `auth_sessions`. Rotation + reuse-detection on every refresh.
- **Auditing:** login, refresh-reuse revocation, password reset, logout, and (later) impersonation write
  an audit trail (fix-on-rebuild: v1 logged none of these).
- **Impersonation (staff):** `POST /auth/impersonate/:id` is RBAC-gated (caller role strictly higher than
  target), issues a full token pair for the target, and is audit-logged.
- **Rate limiting:** login, forgot-password, and register are throttled per email/IP.
- **State change is never a GET:** unsubscribe becomes `POST /unsubscribe/:trackerId` (fix-on-rebuild: v1
  unsubscribe was a state-mutating GET vulnerable to prefetch/scanners).

---

## Fix-on-rebuild notes (carry into the build)
1. **`/auth/refresh` is authenticated + rotates.** v1 `/refresh` was unauthenticated (`apiAuth` commented
   out) and reissued tokens with no session/revocation check. v2 looks the refresh token's **hash** up in
   `auth_sessions`, rotates it on every use, and detects reuse of a revoked token (revoke the family).
2. **Short-lived access JWT (15 min).** v1 access TTL defaulted to 24 h; v2 uses 15 min + silent refresh.
3. **Real logout/revocation** via `auth_sessions` (v1 logout was a no-op).
4. **Modern hashing** (argon2/bcrypt) replacing dual SHA256+salt, with upgrade-on-login.
5. **Enforced RBAC** via guards (v1 used ad-hoc `AccountType` integer comparisons + flat permission bools).
6. **Enumeration-safe** forgot-password/register responses (v1 leaked email existence).
7. **Encrypted integrations vault** for OAuth tokens captured during onboarding (v1 stored plaintext).
8. **Onboarding actually persists** (v1 wizard was a static mockup).

---

## Open questions / parity risks
- **Immediate login vs verify-first** on signup — does `POST /auth/register` return tokens immediately
  (account flagged unverified) or only after `GET /auth/activation/:token`? (US-2.1 AC5.)
- **Onboarding draft/resume semantics** — v1 gives no guidance on partial-wizard persistence; confirm the
  per-step save contract and a `profiles.onboarding_state` (or similar) field.
- **Schema gaps for wizard steps** — questionnaire answers, automation toggles, and team invites have **no
  v1 table**; v2 must add the owning tables (e.g. `profiles` for business/hours/branding, an onboarding/
  questionnaire table for free-form answers, `user_profiles`/invites for team).
- **"Submitted for review" workflow** — the finish screen implied staff approval that never existed;
  decide if onboarding gates portal access. (US-3.5 AC2.)
- **Token-in-URL TTLs** — keep 1 d reset; consider shortening the 90 d activation/verification window.
- **Vestigial columns** — confirm `users.AccessToken`/`RefreshToken` can be dropped in favour of
  `auth_sessions`.

---

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-1.1 | `POST /auth/login` |
| US-1.2 | `POST /auth/refresh` (rotation + reuse-detection) |
| US-1.3 | `POST /auth/logout` |
| US-1.4 | `POST /auth/password/forgot` |
| US-1.5 | `POST /auth/password/reset` |
| US-2.1 | `POST /auth/register` |
| US-2.2 | `GET /auth/activation/:token`, `POST /auth/activate` (or `…/password/reset?type=activate`) |
| US-3.1–3.5 | `PATCH /profiles/me` · `POST /profiles/save-settings` · OAuth connect · `user_profiles` invites |
| US-1.6 | `POST /auth/forgot` |
| US-1.7 | `POST /auth/reset` |
| US-2.3 | `GET /auth/activation/:token`, `POST /auth/activate` |
| US-3.6 | `PATCH /profiles/me` (questionnaire setup fields) |
| US-3.7 | `PATCH /profiles/me` (automation setup fields) |
| Impersonation | `POST /auth/impersonate/:id` |
| Unsubscribe | `POST /unsubscribe/:trackerId` |

---

## Addendum — public credential & onboarding-step screens (mockup batch)

> These stories back the standalone **public** screens (no portal shell) added in the
> `docs/design-system/mockups/auth/` batch: `auth-forgot.html`, `auth-reset.html`,
> `auth-activate.html`, `setup-questionnaire.html`, `setup-automation.html`. They refine the
> screen-level UX of the request/reset/activate flows (US-1.4 / US-1.5 / US-2.2) and split the two
> onboarding sub-steps out of US-3.1–3.5. Endpoint shorthand used on the mockups: `POST /auth/forgot`,
> `POST /auth/reset`, `POST /auth/activate`, `PATCH /profiles/me` (setup fields).

### US-1.6 — Request a reset link ("Forgot password" screen)
**As a** Visitor **I want** a simple "forgot password" screen **so that** I can ask for a reset link and
know what happens next.
- **AC1** The screen shows a single **email** field; `POST /auth/forgot` is fired on submit after a
  client-side email-format check (invalid format is flagged inline before any request).
- **AC2** On submit the UI swaps to a **"Check your email"** success state that echoes the entered
  address and states the link expires in **24 h** (password token · 1 d TTL) — regardless of whether the
  email exists (enumeration-safe; matches US-1.4 AC1).
- **AC3** The success state offers a **resend** action that is **rate-limited** (disabled with a
  visible cooldown countdown; re-enables when the cooldown elapses) and a **"use a different email"**
  path back to the request form.
- **AC4** A **"Back to sign in"** link returns to `auth-login.html`. The page is public and mounts **no
  portal shell**.

### US-1.7 — Choose a new password ("Reset password" screen, BF-030)
**As a** Visitor **I want** to set a new password from the emailed link with clear rules **so that** I
know my choice will be accepted before I submit.
- **AC1** The screen reads the `token` from the URL and posts `{ token, password, passwordConfirmation }`
  to `POST /auth/reset`; an invalid/used/expired token surfaces a **top-level** banner (not a per-field
  error) with a link to request a new link (matches US-1.5 AC3).
- **AC2 (BF-030 — requirements shown + special chars allowed)** A **live requirements checklist** updates
  as the user types — **≥ 8 characters**, **contains a letter**, **contains a number** — each flipping
  from grey to a green check when met, with an explicit note that **letters, numbers, and special
  characters (`! @ # $ %` …) are all allowed** (fix-on-rebuild: special characters must never be
  rejected, and the rules are shown up front rather than failing on submit).
- **AC3** The two password fields must match (inline "passwords don't match" error) and a show/hide toggle
  reveals the entry; submit is blocked until the checklist passes and the confirmation matches.
- **AC4** On success the UI shows a confirmation panel noting **all other sessions were signed out**
  (matches US-1.5 AC2) with a **Continue to sign in** button. Public page, no portal shell.

### US-2.3 — Activate from an invite ("Activate account" screen, BF-030)
**As a** New Owner (invited) **I want** to set my initial password from the invite link **so that** my
account becomes active and I land in onboarding.
- **AC1** `GET /auth/activation/:token` resolves the invitee **name** to greet them ("Welcome, {name}!");
  an unknown/expired token routes to a not-found/expired state (matches US-2.2 AC1).
- **AC2 (BF-030)** The set-password step uses the **same live requirements checklist + "special
  characters allowed" note** as US-1.7 AC2 (one shared rule set across reset and activation).
- **AC3** On submit `POST /auth/activate` sets the initial password, marks the user active, and (per
  US-2.2 AC2–AC3) issues the full token pair; the UI then routes into the **onboarding wizard**
  (`auth-onboarding.html`). Confirm + show/hide behave as in US-1.7 AC3. Public page, no portal shell.

### US-3.6 — Onboarding: Questionnaire step
**As a** New Owner **I want** an optional questionnaire step **so that** OGGVO can tailor campaigns and
prioritise my local presence.
- **AC1** The step (rendered inside the onboarding stepper, consistent with `auth-onboarding.html`)
  captures **client-base / tools** (a repeatable "add another" list of the CRMs/tools where client lists
  live) and **top cities** (up to 5) — every field marked **Optional**.
- **AC2** The step persists on **Continue** via `PATCH /profiles/me` (setup fields) so the wizard is
  resumable, and is fully **skippable** (Skip advances without writing optional answers) — matches
  US-3.1 AC2–AC3. **Back** returns to the previous step without losing data.
- **AC3** Writes are scoped to the New Owner's `profileId` via the `TenantGuard` (US-3.1 AC4).
- **Note:** questionnaire answers have **no v1 table** (v1 setup wizard was an unwired static mockup) —
  v2 must add an owning column/table before wiring this step (see Open Questions / schema gaps).

### US-3.7 — Onboarding: Automation preferences step
**As a** New Owner **I want** to choose which things OGGVO does automatically **so that** the platform
starts working for me without manual setup.
- **AC1** The step presents labelled toggles — **social media posting on public holidays**, **newsletters
  (review requests & reminders)**, plus SMS keyword triggers and birthday greetings — each with a clear
  on/off switch and sensible defaults.
- **AC2** Any scheduled automation (e.g. holiday auto-posting) runs in the **profile timezone**, never a
  hardcoded Pacific default (global timezone rule; auto-share also respects the platform whitelist).
- **AC3** The step persists on **Continue/Finish** via `PATCH /profiles/me` (setup fields) and is
  **skippable** (keeps defaults); it is the terminal setup step before Done. Public onboarding surface,
  no portal shell.
- **Note:** automation toggles have **no v1 table** — add the owning profile fields / table first (schema
  gap; see Open Questions).
