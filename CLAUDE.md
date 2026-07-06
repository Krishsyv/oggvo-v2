# OGGVO v2 — Claude Code context

This file is auto-loaded every session. It tells you what this project is and where the build
reference lives, so a one-line prompt is enough to start work.

## What this is

OGGVO v2 is a **ground-up TypeScript rewrite** of the OGGVO product (a multi-tenant reviews / SMS /
social / campaigns / surveys platform). v1 is a 3-language stack (PHP CodeIgniter API, Go bots,
Python/JS lambdas) with EOL dependencies, a hand-edited SQL-dump schema, and almost no tests. v2
replaces all of it with one language and one schema.

**Stack:** Next.js 15 (App Router) · NestJS 11 (REST + OpenAPI) · PostgreSQL 16 · Drizzle ORM ·
BullMQ workers (Redis) · Turborepo + pnpm monorepo · AWS.

## Where the v1 source lives

The old app is the **sibling repo at `../oggvo`** (relative to this repo root). The feature spec
constantly references v1 files there (`apps/portal-frontend/pages/...`, `apps/portal-api/app/...`).
To read them, start the session with the v1 repo added:

```
claude --add-dir ../oggvo          # or run /add-dir ../oggvo inside the session
```

## Read these first (the build reference)

Read in this order before writing code:

0. [`docs/foundation/README.md`](docs/foundation/README.md) — the **product & engineering
   foundation** (2026-07-06): re-evaluated architecture decisions (ADRs + staged scaling), domain
   ownership map, platform standards (PF-1…18), the epic register (all sprint-issue items folded
   in), and the release roadmap (R0–R5). **Where it conflicts with older docs below (incl.
   BUILD-PLAN phases), the foundation wins.**
1. [`docs/feature-spec/README.md`](docs/feature-spec/README.md) — master index of the **functional
   spec**: one file per domain (reviews, contacts, messaging, campaigns, social, surveys, …), each
   with every page/tab/field, the real v1 API endpoints, business rules, and the v1→v2 mapping
   (target NestJS module + Drizzle tables + BullMQ queue + build phase). **This is the source of
   truth for what to build** (functional detail; build order/architecture come from `foundation/`).
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — topology, packages, layering, conventions.
3. [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) — phase order (0 done; 1–5 ahead).
4. [`docs/SCHEMA-REDESIGN.md`](docs/SCHEMA-REDESIGN.md) — v1 MySQL → v2 Postgres mapping.
5. [`docs/dependency-audit.md`](docs/dependency-audit.md) — why we migrated (EOL/risk inventory of v1 deps).
6. [`packages/db/src/schema/`](packages/db/src/schema/) — the 65-table Drizzle schema (single source of truth).

## Repo layout

- `apps/web` — Next.js 15 frontend (App Router; `(public)` SSR surfaces + `(portal)` dashboard).
- `apps/api` — NestJS REST API; module per domain (`auth`, `tenancy`, `reviews`, …).
- `apps/workers` — NestJS standalone + BullMQ; replaces the v1 Go bots / lambdas.
- `packages/db` — Drizzle schema + migrations + seeds (no business logic).
- `packages/shared` — enums, zod DTOs, domain types shared across web/api/workers.
- `packages/ui` — Tailwind preset + headless primitives (Button, Modal, TabBar, …).
- `packages/config` — shared tsconfig / eslint / tailwind presets.

## Conventions (non-negotiable)

- **Layering:** controller (HTTP only) → service (business logic) → repository (all Drizzle queries).
  Nothing outside a repository touches the DB.
- **Multi-tenancy:** every request resolves an active `profile`; a `TenantGuard` injects `profileId`
  and every repository query is scoped to it. No cross-tenant reads.
- **Auth:** short-lived access JWT (15 min) + rotating refresh token (30 d) hashed in `auth_sessions`.
  Roles + granular permissions via `@Roles` / `@RequirePermission` guards.
- **Contracts:** every endpoint documented with `@nestjs/swagger`; OpenAPI generates `@oggvo/api-client`,
  which `apps/web` consumes. No hand-written fetch calls.
- **DB:** snake_case columns, camelCase in TS (Drizzle maps). `created_at`/`updated_at` (timestamptz)
  on every table; soft-deletable tables add `deleted_at`. Enums are `pgEnum`s in `@oggvo/db`. Money as
  integer minor units. Timestamps stored UTC, rendered in profile/user timezone.
- **Tests:** Vitest unit + Playwright e2e per slice.

## Fix-on-rebuild (known v1 bugs — do NOT reproduce)

The spec flags these per domain; the recurring ones:

- Sender/activator hardcode **Pacific** business hours — v2 must honour **per-profile timezone**.
- v1 `/refresh` is **unauthenticated** and never rotates; v2 uses rotation in `auth_sessions`.
- v1 RBAC is mostly unenforced (flat permission bools); v2 enforces via guards.
- Several webhook signature checks (Square, Twilio SMS, Shopify) and PAM TLS verification are disabled
  in v1 — enable them in v2.
- v1 stores OAuth tokens in plaintext; v2 uses an AES-GCM-encrypted integrations vault.
- v1 media storage is **local-disk semantics over an S3-Files NFS mount** (`AwsS3` SDK only for some
  doc/JSON paths). The CI4 code assumes dirs always exist and uses `file_exists()`/`->move()`/GD
  `->save()` against `public/assets/media/...`; because S3 has no empty directories, missing prefixes
  (`uploads/`, `uploads/thumbs/`, `uploads/video/`) make uploads fail with "directory not writable".
  v2 must talk to **S3 via the SDK** (presigned upload + CloudFront serving, keys in DB) — no mount,
  no local-path assumptions, no per-`file_exists` S3 HEAD latency.
- v1 campaign→recipient scheduling has **two disjoint, easy-to-miss entry points** and a create/update
  asymmetry. A campaign "subscriber" is just a row in `invite_scheduler` (Sent=0); those rows are created
  ONLY by (a) the **activator bot** when it flips a `Pending` recipient to `Active` (it schedules all
  matching active campaigns in the same pass — so an already-`Active` contact is never revisited), or
  (b) the PHP **reconcile** added late in v1 (`CampaignModel::reconcileActiveRecipientSchedules` on
  campaign save, `RecipientModel::reconcileSchedulesForRecipients` on contact edit), which only ever
  schedules `Status='Active'` recipients. Net effect: a contact that was activated *before* a matching
  campaign existed gets scheduled by neither path until something re-saves the campaign/contact, and the
  reconcile only lived on the overridden `update()` — `insert()` (the create path) was NOT overridden, so
  a campaign created already-active scheduled nobody. v2: model "who receives campaign X" as a single
  derived/queried eligibility (active + opted-in + tag-match + reachable), recomputed idempotently on
  every campaign create AND update AND contact change — one code path, no activator-vs-reconcile split,
  no Pending-only/Active-only blind spots.
- Payment SDKs are years stale (Stripe v10, Square 2022) — use current SDKs.
- v1 media is a **shared per-profile gallery** (`image`/`video` rows) reused by reference across
  unrelated features — the same `image.ID` can back a social post (`social_post_media.MediaID`) AND a
  review-request campaign (`invite_campaign.ImageID`) — but nothing models this. The FB data-deletion
  purge originally decided a file was orphaned from `social_post_media` alone and would have deleted a
  file still used by a campaign; the fix hand-audits `usedElsewhere` (only `invite_campaign.ImageID`
  today) and is fragile — a new feature referencing a media row silently reintroduces the data-loss bug.
  v2: give media a real ownership/reference model (reference-counted or an explicit join per usage) so
  "is this file still referenced anywhere?" is one query, not a hand-maintained table list; never key a
  physical delete off one feature's references.
- v1 SMS **test-campaign** send (`Campaigns::test`) inlines a raw Twilio `Messages.json` curl in the
  controller and reads creds **only** from the profile row (`SMSNumberSID`/`SMSNumberToken`/`SMSNumber`)
  — no env override and no test-mode abstraction, so verifying locally means DB-seeding Twilio **test**
  credentials onto a profile (test creds require From=`+15005550006`). v2 should send through an SMS
  service with an injectable test/sandbox mode (env-driven), not per-controller curl. Note also the
  recaptcha gate only bypasses when `ENVIRONMENT==='testing'`, so it still fires under local
  `development` — make the captcha provider mockable in non-prod.
- v1 SMS-number **delete** (`SmsNumber::delete`) closes the Twilio subaccount but does **not** catch the
  RestException when the subaccount is *already closed* (`[HTTP 400] subaccount is closed and can not be
  re-opened`). The DB reset (`resetSMSInfo`) is gated behind the successful close, so a dead subaccount
  ref stays on the profile forever — and `setup()` short-circuits while a SID is set, making delete the
  only reset path → the profile can never re-provision (permanent deadlock). v2: clearing a profile's SMS
  number must always reset local state regardless of the provider-side close result (provider cleanup is
  best-effort, idempotent, and tolerant of already-gone subaccounts).
- v1 **image generation** (review/testimonial + newsletter thumbnails) shells out to `wkhtmltoimage`
  with **no `--load-error-handling ignore`**, so a *single* unreachable asset (e.g. a reviewer avatar
  that 404/502s) makes the binary exit non-zero and the whole image fails with a generic "Error creating
  review image". v2: render images via a headless-browser/service that tolerates missing assets (or
  pre-validate/skip them), and never let one optional sub-asset fail the whole render.
- v1 has **no single source of truth for the media host**. The same stored URL
  (`https://portal.oggvo.com/assets/media/...`) is rewritten differently per caller: the frontend uses
  the API base host (`useMediaUrl`/`baseURL` → dev-api, correct) while server-side render views use
  `env('app.frontURL')` (→ dev-portal, which **502s for `/assets/media/*`** because that host doesn't
  serve uploads). Result: avatars/logos render in some places and break in others depending on which
  rewrite ran. Compounded by a **data gap** — prod-originated files (reviewer-logos pulled by the bot)
  exist only on prod storage, never copied to dev, so dev DB rows point at files that 404 on the dev
  mount. v2: serve all media from one CDN domain with keys in DB (see the media-storage note above),
  so there is exactly one host and no per-caller rewriting.
- v1 **disconnecting a social account does not cascade**. `DELETE /api/v2/socials/{id}` only soft-deletes
  the `social_stream` row (`DeleteDate`); it never revokes the provider token (FB had *no* revoke at all —
  only Google/Stripe did) and leaves all child rows (reviews, posts, insights, messaging, links) orphaned.
  There was also **no Facebook Data Deletion Callback**, so Meta kept emailing manual-deletion requests.
  A v1 retrofit (`docs/fb-data-deletion-feature.md`, `deletion_request` table + 30-day grace + a
  `data-deletion` purge bot) bolts this on. v2: model account disconnection as a first-class lifecycle
  with provider token revocation, a deletion-request/grace-period state machine, an FK cascade (or
  explicit purge set) for *every* provider, and the Meta data-deletion callback built in from day one.
- v1 has **no soft-delete columns on the data tables** — only `social_stream` has `DeleteDate`. `review`
  has a `PermanentDelete` bool, `social_post`/`social_post_media` have a `Status` bool (post lifecycle,
  NOT a delete flag), and `social_insight`/`keyword_insight`/`messaging` have nothing. So when a
  connection is soft-deleted (e.g. FB disconnect grace period), its child data can't be hidden as a set —
  v1 has to hack it by filtering listing queries against the soft-deleted parent stream (join
  `social_stream` on `LinkID`, exclude rows whose stream has `DeleteDate`), which is fragile because
  manually-added reviews store `LinkID` = a linkmaster id, not a `social_stream.ID`. v2: give every
  user-data table a proper `deleted_at` (soft delete) column — at minimum `reviews`, `social_posts`,
  `social_post_media`, `social_insights`, `keyword_insights`, `messaging` — so a parent disconnect can
  soft-delete its children as a set (hidden immediately, hard-deleted after the grace window) without
  join-filter hacks, and reconnect restores them.
- v1 also **never captured the connecting FB user id at OAuth** (`OAuth/Facebook.php` left
  `validateUserId` commented out), so Meta's app-scoped callback `user_id` could not be mapped back to a
  stream without a retrofit column (`social_stream.FacebookUserID`). And because the FB stream is
  soft-deleted with `DeleteDate`, a naive reconnect created a *new* stream row and orphaned the old data —
  the retrofit had to restore the soft-deleted row instead. v2: capture the provider account/user id at
  connect time, and make reconnect restore (not duplicate) the integration so its data re-links.

## Known schema gaps (spec'd features with no v2 table yet)

When you reach these, add the Drizzle tables first: toll-free verification tables
(`twilio_tollfree_*` + `profiles.tollfree_*`), auto-share platform whitelist, `social_insights` source,
a unified `campaign_events` table, and a few profile fields (`BusinessLogo`, `CampaignsPaused`,
auto-review-share settings). See each domain file's "Open questions / parity risks" section.

## Pending: screenshots

The feature-spec files embed image placeholders (`docs/feature-spec/_assets/screens/...`) that are not
yet captured. Capturing them needs the **v1 app running** (`../oggvo/local-dev/`) **+ a test login**;
workflow is in the feature-spec README ("Screens / images").

## How to start a session

A simple prompt works because this file is loaded automatically. Examples:

> Read `docs/feature-spec/README.md` and the architecture docs, then start Phase 1: build the
> `reviews` module per `docs/feature-spec/reviews.md`.

> Implement the `contacts` module from `docs/feature-spec/contacts.md` — schema check first, then
> repository → service → controller → DTOs → tests.

Always cross-check the target Drizzle tables in `packages/db/src/schema/` before coding, and open the
referenced v1 files in `../oggvo` to confirm exact behaviour.
