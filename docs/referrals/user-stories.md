# Referrals — User Stories & Acceptance Criteria

> Source of truth: v1 [`apps/portal-frontend/pages/settings/index/referral.vue`](../../../oggvo/apps/portal-frontend/pages/settings/index/referral.vue)
> (per-profile Referral Program settings) and
> [`apps/portal-frontend/pages/manage/referrals.vue`](../../../oggvo/apps/portal-frontend/pages/manage/referrals.vue)
> (admin Referrals Management table).
> v2 targets: module `apps/api/src/modules/tenancy` (affiliate facade) + `apps/api/src/modules/admin`
> (referrals directory) · tables `profile_affiliate` (`active`, `code`, `footer_text`) + `referrals`
> (`referrer_profile_id`, `referee_profile_id`, `name`, `business_name`, `email`, `phone`, `status`) ·
> enum `referral_status` = `pending` / `accepted` / `declined` · queue `—` (synchronous) · build phase 1 (settings) + 4 (admin).
>
> Companion docs: [../design-system/README.md](../design-system/README.md) (UI) · mockups in
> [../design-system/mockups/](../design-system/mockups/):
> **[settings/referrals.html](../design-system/mockups/settings/referrals.html)** (per-profile Referral Program settings) ·
> **[admin/admin-referrals.html](../design-system/mockups/admin/admin-referrals.html)** (admin Referrals Management table).

> **How to read this doc** — one section per page / card / modal. Each story cites the real v2 endpoint;
> **Copy** lines quote v1 verbatim (grounding the mockups); **Fix-on-rebuild** and **Open** lines carry
> parity risks. Modals and the detail drawer are documented to the same depth as full pages.

**Personas**
- **Operator** — the authenticated portal user who owns the active profile; enables the referral
  program and shares their invite URL from Settings → Referral Program (`/settings/referral`).
- **Admin** — an OGGVO staff account (`OGGVO_ACCOUNT_MANAGER`+ / `OGGVO_ADMIN`) browsing every
  business's referrals from the admin surface (`/admin/referrals`).
- **System** — API + `tenancy`/`admin` modules resolving affiliate codes and referrer/referee profiles.

**Global rules**
- Every Operator read/write is scoped to the caller's active `profileId` (TenantGuard). The referral
  URL is **derived server-side** from `profile_affiliate.code` and is never accepted on a write.
- Program state is **typed** (`PUT /settings/referral` writes `active` + `footer_text` only). The v1
  mass-assignment god-endpoint `POST /profiles/save-settings` (`AffiliateActive`, `AffiliateFooterText`)
  is **not** reproduced (fix-on-rebuild).
- The admin directory is gated to `accountType >= ACCOUNT_MANAGER`, enforced server-side by
  `@Roles(ACCOUNT_MANAGER)` — never trusted from the frontend.
- Dates render in the **profile / user timezone** (fix-on-rebuild: never hardcode US/Pacific); the
  admin list filters by an inclusive `[from, to]` `YYYY-MM-DD` range.

---

## Epic RF1 — Referral Program settings (Operator)

### US-RF1.1 — Activate or deactivate the referral program
**As an** Operator **I want** to switch my referral program on or off **so that** I control whether my
public pages invite other businesses to Oggvo.
- **AC1** `GET /settings/referral` loads the current program state (`{ active, code, footer_text }`); the
  card header shows an **Activated** (success dot) / **Disabled** (gray dot) status pill mirroring `active`.
- **AC2** A `ds-switch` toggle flips `active`; the inline label reads **Activated** / **Disabled**. Saving
  persists via `PUT /settings/referral`.
- **Copy (v1 verbatim):** header **"Activate Referral Program"**, subtitle **"Introduce your clients to the
  domination of local search results."**, toggle label **"Activated"** / **"Disabled"**.
- **Fix-on-rebuild:** v1 saved through `POST /profiles/save-settings` (`AffiliateActive`) — a mass-assign
  endpoint. v2 writes only the two affiliate fields through a typed `PUT /settings/referral`.

### US-RF1.2 — Configure the referral footer text
**As an** Operator **I want** to set the copy shown next to my referral link **so that** the invite reads
in my own words.
- **AC1** A **Default footer text** input (`footer_text`, **max 150 characters**, required) with a live
  `n / 150` counter; default **"Do you want a review system like this? Click here"**. Persists via
  `PUT /settings/referral`.
- **AC2** A **Reset** button reverts unsaved edits to the last-loaded values; **Save** is a no-op when
  nothing changed (disabled). Success → toast **"Referral settings saved"**.
- **Copy (v1 verbatim):** label **"Default footer text"**, hint **"Maximum of 150 characters"**.

### US-RF1.3 — Copy the referral URL
**As an** Operator **I want** a one-click copy of my invite link **so that** I can share it anywhere.
- **AC1** A **read-only** Referral URL field shows `{frontURL}ref/{code}` (e.g. `https://app.oggvo.com/ref/ACME7K2`)
  with an adjacent **Copy** button that writes it to the clipboard and toasts **"Referral URL copied"**.
- **AC2** The URL is **empty until the program has a `code`** (first activation server-side assigns one);
  the field is never editable and never sent on a write (derived from `profile_affiliate.code`).

### US-RF1.4 — See a summary of your referrals
**As an** Operator **I want** to see who signed up through my link **so that** I know the program is working.
- **AC1** A **Your referrals** card shows count tiles — **Total**, **Accepted** (success), **Pending**
  (warning) — from `GET /settings/referral/summary`, scoped to my profile (`referrer_profile_id = me`).
- **AC2** Below the tiles, a compact list of recent referees: avatar, referee name, `business_name · date`
  (profile-tz), and a `referral_status` badge (Accepted→success, Pending→warning, Declined→error). The
  full audited directory is admin-only (see Epic RF2).

---

## Epic RF2 — Referrals Management (Admin)

### US-RF2.1 — Browse businesses and their referees
**As an** Admin **I want** a searchable, paginated directory of every referral **so that** I can audit the
program across all accounts.
- **AC1** KPI cards (**Total referrals**, **Accepted**, **Pending**, **This month**) summarise the program.
- **AC2** The whole surface is gated to `@Roles(ACCOUNT_MANAGER)`+ (server-enforced), reachable from the
  Admin Console.
- **AC3** `GET /admin/referrals?page&query&dates[]&status` (perPage 10) drives a table with columns **Name &
  Business**, **Contact** (phone + email), **Referred By**, **Status** badge, **Date** (profile-tz), and a
  row **Actions** menu.
- **AC4** A pagination footer shows `Showing x–y of N` with Prev / numbered / Next controls; row loading is
  skeleton rows.
- **Copy (v1 verbatim):** title **"Referrals Management"**, description **"Details of businesses and their
  referee"**, columns **"Name & Business" / "Contact" / "Referred By" / "Date"**, empty state **"No referral"**.

### US-RF2.2 — Search referrals
**As an** Admin **I want** to search by name, email or phone **so that** I can find a specific referral fast.
- **AC1** A search box (**"Search by name, email or phone…"**) filters the list; the change is **throttled
  (~1s)** and **resets to page 1** before refetching (v1 `watchThrottled`).
- **AC2** No matches → the empty state **"No referral matches your filters"**.

### US-RF2.3 — Filter by date range
**As an** Admin **I want** to bound the list to a date window **so that** I can review a specific period.
- **AC1** A **date-range** control sends `dates[] = [from, to]` as `YYYY-MM-DD`; the range is **inclusive**
  of the end day (server expands `to` to end-of-day). Changing it is throttled and resets to page 1.

### US-RF2.4 — View a referral's detail
**As an** Admin **I want** to open a single referral **so that** I can see the referee's full contact and its
referrer.
- **AC1** The row **View detail** action opens a read-only modal: referee avatar + name + `referral_status`
  badge, business name, phone, email, **Referred by** (referrer business), and date (profile-tz). Referrer /
  referee resolve to `profiles` rows via `referrer_profile_id` / `referee_profile_id`.
- **AC2** Standard modal behaviour: close on ✕ / Close / backdrop-click / Escape. Secondary row actions:
  **View referrer account**, **Email referee**.

---

## Cross-cutting acceptance criteria
- **Tenancy:** Operator referral reads/writes re-check the active `profileId`; the admin directory is the
  only cross-tenant surface and is `@Roles(ACCOUNT_MANAGER)`-gated.
- **Typed writes only:** `PUT /settings/referral` accepts `active` + `footer_text`; `code` and the derived
  URL are server-owned (no `save-settings` mass-assign).
- **Timezone:** all referral dates render in profile/user timezone; the admin range filter is inclusive
  `[from, to]`.
- **Booleans real:** `profile_affiliate.active` is a real boolean, not a `'0'/'1'` string.

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-RF1.1 | `GET /settings/referral` · `PUT /settings/referral` |
| US-RF1.2 | `PUT /settings/referral` |
| US-RF1.3 | `GET /settings/referral` (derived URL from `code`) |
| US-RF1.4 | `GET /settings/referral/summary` |
| US-RF2.1 | `GET /admin/referrals` |
| US-RF2.2 | `GET /admin/referrals?query=` |
| US-RF2.3 | `GET /admin/referrals?dates[]=` |
| US-RF2.4 | `GET /admin/referrals/:id` |
