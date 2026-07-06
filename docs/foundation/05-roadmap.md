# Roadmap — releases R0–R5

Greenfield build (v1 is reference only). Each release is shippable: code + tests + module README.
Ordering rationale: **revenue-shaped dependencies first** (identity → contacts/reviews → the send
pipeline → growth surfaces → monetized integrations), and every cross-cutting standard (PF-#)
lands with the *first* feature that needs it — never retrofitted.

This supersedes `docs/BUILD-PLAN.md` phases 1–5 (kept for scaffold history). Differences from the
old plan and why:

1. **Billing/entitlements moved up (R2, was implicitly phase 4).** Every guard, worker and UI gate
   reads entitlements; retrofitting after 18 modules means touching everything twice (AD-14).
2. **Notifications became a module (R2).** Was scattered across settings/global/analytics; the
   delivery ledger (PF-6) must exist before campaigns send at volume, not after the first outage.
3. **Teams (R2) precedes onboarding (R3).** The wizard's team step reuses real invites (ONBD-1.4).
4. **Data-migration/cutover phase dropped.** New-project assumption. If v1 customers are later
   imported, that's a bounded ETL epic (schema mapping already exists in `SCHEMA-REDESIGN.md`) —
   decide when commercially needed.

## R0 — Foundation hardening

> Note (2026-07-06): the earlier Phase-0 app code was deliberately deleted for the fresh start;
> `packages/db` (schema) and the monorepo shell were kept. R0 therefore also recreates the three
> app skeletons (`apps/api`, `apps/web`, `apps/workers`) — cheap with the specs in hand, and they
> get the boundary lint rule (AD-03) and zod pipe from their first commit.

- App skeletons: NestJS api + workers, Next.js web, wired to `@oggvo/db` and CI.
- CI (lint, typecheck, test, migrate-check) — open item from Phase 0.
- Platform primitives, each with a reference implementation + tests: outbox+relay (PF-4),
  provider-gateway base + error taxonomy (PF-5), delivery ledger (PF-6), media reference model
  (PF-10), soft-delete helpers (PF-2), timezone resolver (PF-3), feature flags (PF-16),
  module-boundary lint rule (AD-03).
- **Schema additions** (gaps identified across docs, verified against `packages/db/src/schema/`
  on 2026-07-06 — 70 tables exist, these don't): `contact_import_rows`, `outbox`,
  `notification_deliveries`, `media_references`, `plans` / `subscriptions` / `entitlements`,
  `user_profiles.role`, `profile_onboarding`, four `twilio_tollfree_*` tables +
  `profiles.tollfree_*`, tutorials catalog (`tutorial_playlists`/`tutorial_videos`),
  `suppressions` (PF-17 — extend the existing `blacklisted_emails` into a channel-generic
  suppression table), `deletion_requests` + retention-window columns (PF-18).
  **Reuse, don't duplicate:** `campaign_events`, `audit_log` (home for impersonation +
  staff-action audit), `feature_flags`, `platform_whitelist` already exist in the schema.
- Exit: `pnpm dev` runs api+web+workers; a demo outbox→queue→gateway→ledger job passes e2e.

## R1 — Core value loop (get a review, look good doing it)

Epics: **AUTH · TEN · CONT · REV (feed/manual/share-image) · FUN · MEDIA**
- The loop: sign in → contacts exist → funnel collects reviews → feed shows/replies/shares one.
- Google is the only pull integration in R1 (highest-value provider; proves the gateway).
- Exit criteria: e2e — activate account, import CSV, publish funnel, pull Google reviews, render a
  branded review image. Wrong-tenant tests green on every repository.

## R2 — The send pipeline & monetization rails

Epics: **CAMP (eligibility engine first) · MSG · NOTIF · BILL · TEAM · CMPL (A2P/TFV) · ADMIN (users/profiles) · INT (vault + Twilio/Meta/Google/Stripe)**
- Campaign email+SMS invites end-to-end: eligibility → outbox → sender → ledger; per-profile
  timezone + business hours (the v1 Pacific bug is a launch-blocking test here).
- Connect inbox (two-way SMS), number provisioning, A2P/TFV gating before any real SMS traffic.
- Plans live; entitlements gate Connect/widgets/etc.; teams/roles enforced.
- Exit criteria: a paying profile sends a timezone-correct drip campaign, replies land in the
  inbox, every send visible in the ledger, over-limit behaviour correct.

## R3 — Growth surfaces

Epics: **SOC · SUR · WID · ANLY · ONBD · HELP (app surface)**
- Social publish/planner (FB/IG/LinkedIn/X/GBP), surveys build→take→results, widgets (iframe SSR),
  dashboard tabs on read models (PF-13), onboarding wizard with real persistence.
- Exit criteria: schedule a post + retry a failed one (BF-044); survey completes with exactly-once
  counts even with email broken (PF-7 test); widgets render on a third-party origin; dashboard
  correct against seeded fixtures (incl. the v1 inverted-date-range regression test).

## R4 — Integration breadth & differentiation

Epics: **PLAT (feasibility-gated waves) · AI · REF · ADMIN (rest) · INT (long tail: QuickBooks/Clio/FUB/Shopify/Square/Clover — keep-list only) · HELP (TU-001–021 content)**
- PLAT wave 1: WeddingWire, The Knot, Houzz — *after* PLAT-0.1 feasibility spikes; wave 2:
  RateMyAgent, Avvo, Homes/Angie, Redfin. Spike results may re-scope waves (some platforms may
  have no compliant API — that's a finding, not a failure).
- Drop-candidate v1 providers (Zillow-lender, LionDesk, PAM, Clover) get a keep/kill decision from
  usage data before any port work.
- Exit criteria: ≥1 new platform pulling reviews in production; AI copy generation quota-gated.

## R5 — Scale & polish (Stage B triggers, not a date)

- RLS policies on tenant tables; read replica for analytics; partition `campaign_events` /
  `messages` / ledger; per-provider worker pools; pgbouncer.
- Production packaging item from Phase 0 (lib builds / conditional exports) lands with the first
  real deploy pipeline in R1–R2 — listed here only as the umbrella for infra maturity (multi-AZ,
  soak, load tests at 10× seed data).

## Standing rules

- A release ships when its exit criteria pass as **automated tests**, not when features "look done".
- Sprint-sheet items marked *Dev Completed (v1)* are regression ACs in their epic — verify-by-test
  in v2, never assumed.
- Anything not in the register (`04-epics-and-stories.md`) doesn't get built — new asks enter as
  epics/stories there first.
