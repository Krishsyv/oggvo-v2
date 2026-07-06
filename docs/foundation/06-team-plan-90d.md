# 90-working-day team plan — Aug 3 → Dec 4, 2026

**Team:** 2 developers (Dev A, Dev B) + 2 testers (QA A, QA B), all Claude-assisted
(Opus, Max $100 plan). **Horizon:** 90 **working** days = 18 weeks, in two milestones:

| Milestone | Date | Bar |
| --- | --- | --- |
| **M1 — staging-complete demo** | **Mon Nov 2** (end of working day 65) | Full core product (R0–R3 + BILL/TEAM/NOTIF) working end-to-end on staging with sandbox provider creds; R4 stretch items included as built |
| **M2 — everything, production-ready** | **Fri Dec 4** (working day 90) | R4 complete (feasibility-gated), production cutover done, real provider approvals in flight/landed, pilot profiles live |

**Cadence:** six 2-week sprints (Aug 3 – Oct 23) + hardening week (Oct 26–30) → **M1**; then
sprints 7–8 (Nov 2 – Nov 27) + release week (Nov 30 – Dec 4) → **M2**.

## Capacity math (read this before believing the plan)

- Dev capacity to M1: 2 devs × 13 wks = **130 dev-days** for the R0–R3 core ≈ 6.5 dev-days/epic
  across 20 epics. Plausible because (a) the specs are already written — ~315 stories with ACs, a
  65-table schema, and platform standards mean near-zero discovery time; (b) Claude-assisted
  development on well-specified CRUD/UI slices realistically runs 2–3× hand speed.
- Phase 2 adds **50 dev-days + 50 QA-days** (5 wks × 4 people) — this is what makes
  "everything incl. R4" honest instead of hopeful: new-platform integrations and production
  cutover get their own dedicated capacity instead of riding as sprint-6 stretch.
- QA: automation-first throughout — every sprint's slices get Playwright e2e + API tests *in the
  same sprint* (PF-15). The hardening week is burn-down, not first-testing.
- **M1 staging bar (per decision):** provider *test/sandbox* creds only (Twilio test creds, Meta
  dev app, Stripe test mode, MinIO/SES sandbox). Real approvals (A2P/TFV, Meta app review) have
  multi-week external lead times — they're submitted early but land in Phase 2 by design.

## Working model

- **Tracks:** Dev A owns the *send/communications* track (contacts → campaigns → messaging →
  compliance → social); Dev B owns the *platform/product* track (auth/tenancy → reviews/funnel →
  billing/teams → surveys/widgets → analytics/admin). Weekly track-swap code review so neither
  track is single-owner (bus factor).
- **QA pairing:** QA A shadows Dev A's track, QA B shadows Dev B's. Each story is "done" only
  when its ACs have automated coverage (PF-15) — same sprint, no lag. Fridays: joint exploratory
  session on that sprint's build.
- **Claude usage ($100 Max):** enough for steady daily work; the risk is *burst* weeks (S1
  scaffolding, S6 crunch) hitting weekly caps. Mitigations: keep prompts scoped per module,
  lean on the written specs instead of long exploratory sessions, and budget an upgrade to the
  $200 tier for any dev who hits caps two weeks running — cap-throttled dev-days are the most
  expensive thing on this plan.
- **Definition of done per sprint:** demoable on staging + tests green in CI + module README.

## Sprint plan

### Sprint 1 (Aug 3–14) — R0: rails before features
| Who | Work |
| --- | --- |
| Dev A | CI pipeline (lint/typecheck/test/migrate-check); outbox + relay + idempotency helpers (PF-4); provider-gateway base + error taxonomy (PF-5); delivery ledger (PF-6) |
| Dev B | Schema additions (all R0 gaps: outbox, ledger, media_references, entitlements, roles, onboarding, tollfree_*, import rows); AUTH hardening (rotation, argon2, impersonation audit); TEN (profiles, switching, roles groundwork) |
| QA A | Playwright + Vitest harness wired into CI; seed-fixture system; tenant-isolation test template |
| QA B | Test plan per epic from the ACs (traceability matrix: story → test id); auth/tenancy e2e |
**Exit:** demo job runs outbox → queue → gateway → ledger e2e; login/refresh/switch fully tested.
Also this sprint: **PLAT-0.1 feasibility spikes** (Claude-driven API research for all 7 platforms,
~½ day each, Dev B supervises) — R4 go/no-go facts land in week 2, not October.

### Sprint 2 (Aug 17–28) — R1: the core loop, part 1
| Who | Work |
| --- | --- |
| Dev A | CONT: list/CRUD/tags/lifecycle/activity; CSV import (async, per-row outcomes); auto-activation config |
| Dev B | REV: feed/filters/manual add; Google gateway + review-puller worker; MEDIA: presigned upload + reference model |
| QA A | Contacts e2e (import edge cases: dupes, bad rows, big files); wrong-tenant suite over new repos |
| QA B | Reviews e2e incl. puller idempotency (re-pull ≠ duplicates); media reference/delete tests |
**Exit:** import 5k contacts; Google reviews flowing into the feed on staging.

### Sprint 3 (Aug 31–Sep 11) — R1 finish + campaigns core
| Who | Work |
| --- | --- |
| Dev A | CAMP: **eligibility engine first** (one code path, idempotent), campaign CRUD/editor, sender worker (per-profile tz + quiet hours, PF-3/PF-17), test-send sandbox |
| Dev B | FUN: funnel editors + public SSR page + platform links; review-image render worker (headless Chromium); review share/schedule |
| QA A | The timezone matrix test (profiles in 4 tzs × quiet hours × weekend skip) — v1's worst bug class |
| QA B | Funnel public-page e2e (positive/negative paths, feedback submission); render-worker degraded-asset test |
**Exit:** a drip campaign sends timezone-correctly on staging; funnel collects a review end-to-end.

### Sprint 4 (Sep 14–25) — R2: money + messaging
| Who | Work |
| --- | --- |
| Dev A | MSG: inbox (SSE), thread view, broadcast, scheduled, keywords, number provisioning (Twilio test creds); CMPL: A2P wizard + TFV embeddable against Twilio test mode |
| Dev B | BILL: Stripe test-mode plans/checkout/webhooks/entitlement guards; TEAM: invites/roles/enforcement; NOTIF: prefs + fan-out + badges on the ledger |
| QA A | Inbound webhook suite (signatures, idempotency, STOP/HELP); inbox e2e |
| QA B | Billing lifecycle e2e (subscribe/upgrade/dunning in Stripe test clock); role-matrix authorization tests |
**Exit:** paying (test-mode) profile with a teammate sends SMS through compliance-gated pipeline;
every send in the ledger.

### Sprint 5 (Sep 28–Oct 9) — R3: growth surfaces
| Who | Work |
| --- | --- |
| Dev A | SOC: composer, timeline, retry/edit/delete, testimonial share, content planner; publish gateways (Meta dev app, LinkedIn, X sandbox where available) |
| Dev B | SUR: builder/public page/results/export/templates; WID: widget types as iframe SSR + chat inquiry → inbox |
| QA A | Social e2e: publish/fail/retry taxonomy (mock provider harness for deterministic failures) |
| QA B | Surveys resilience suite (PF-7: broken email ≠ lost answers, exactly-once counts); widget embed on a foreign origin |
**Exit:** schedule + retry a social post; take a survey publicly; widget renders on a third-party page.

### Sprint 6 (Oct 12–23) — R3 finish + R4 stretch
| Who | Work |
| --- | --- |
| Dev A | ANLY: dashboard tabs on read models, targets, GBP insights; ADMIN: users/profiles/templates/queue. **Stretch:** PLAT wave-1 (top 1–2 *feasible* platforms from the S1 spikes) |
| Dev B | ONBD: resumable wizard + seeding; HELP: help center + tutorial catalog (BF-001 search). **Stretch:** AI-1.1/1.2 (custom templates + AI share copy behind a gateway, quota-gated) |
| QA A | Full-regression assembly (all suites, one nightly run); dashboard correctness vs seeded fixtures (incl. v1 inverted-date-range regression) |
| QA B | Exploratory blitz weeks: whole product, persona-based scripts; defect triage with severity gates |
**Exit:** full regression green nightly; demo path rehearsed once.

### Hardening week (Oct 26–30) → M1
- Mon–Wed: defect burn-down (only ship-blockers; everything else → Phase-2 backlog).
- Thu: staging soak (workers running 24 h under seeded load: 10k contacts, 50 campaigns, all queues), demo data pass.
- Fri: demo dry-run + freeze. **M1 delivery: Monday Nov 2.**
- Also this week: **submit all production approvals** (Twilio A2P brand/campaign + TFV with real
  business identity, Meta production app review, SES/SendGrid domain auth) so the external clocks
  run during Phase 2, not after it.

## Phase 2 — working days 66–90 (Nov 2 → Dec 4) → M2

### Sprint 7 (Nov 2–13) — R4 build wave
| Who | Work |
| --- | --- |
| Dev A | PLAT wave 1: the 2–3 platforms whose Sprint-1 spikes came back *feasible* — gateway, puller, feed parity, funnel link each |
| Dev B | AI epic complete (custom template designer, copy generation with tone presets, usage metric + quota); ONBD/HELP polish from M1 demo feedback |
| QA A | Per-platform integration suites on the mock harness + live sandbox where platforms offer one |
| QA B | M1 demo-feedback defect verification; regression guard on core while R4 lands |

### Sprint 8 (Nov 16–27) — R4 finish + production cutover
| Who | Work |
| --- | --- |
| Dev A | PLAT wave 2 (remaining feasible platforms; infeasible ones get documented findings + roadmap entries, per PLAT-0.1); provider keep/kill decisions executed |
| Dev B | Production infra via CDK (Fargate services, RDS multi-AZ, ElastiCache, CloudFront, Secrets Manager); deploy pipeline; observability dashboards + queue alarms (PF-14) |
| QA A | Full regression on the *production* environment with real creds as approvals land |
| QA B | Load test at 10× seed data; backup/restore drill (AD-19 targets); security pass (authz matrix, webhook signatures, rate limits) |
- **US Thanksgiving (Nov 26–27):** if the team observes it, this sprint runs 8 days — pull load
  testing forward, it's the only float consumed.

### Release week (Nov 30 – Dec 4) → M2
- Mon–Tue: production soak with pilot profiles (real Twilio number on approved A2P/TFV, real
  Google/Meta connections on the production app).
- Wed: go/no-go on pilot readiness; defect gate = zero ship-blockers.
- Thu: pilot onboarding; **Fri Dec 4 (working day 90): M2 delivered** — everything in the
  register live or, for infeasible PLAT platforms, closed with a written finding.

## Phase 3 — v1 customer migration (GO decision 2026-07-06; post-M2)

The business confirmed existing v1 customers migrate to v2 (MIGR epic). It does **not** fit
inside the 90 working days — Phase 2 capacity is fully committed — so it's scheduled immediately
after, with prep pulled forward where it's cheap:

- **Sprint 5–6 (cheap prep):** MIGR-1.1 ETL skeleton generated against `SCHEMA-REDESIGN.md`
  while the mapping knowledge is fresh; Claude does the column-mapping grunt work.
- **Release week (Dec 1–4):** dry-run the ETL against a v1 prod snapshot on staging — validation
  diffs (MIGR-1.2) become part of the M2 demo.
- **Phase 3 (Dec 7–19):** pilot cohort migrates (MIGR-1.3 cutover, reversible); Dev A on ETL
  fixes, Dev B on cutover tooling, QA on per-profile validation.
- **January:** remaining waves, then v1 decommission plan.

## What "everything incl. R4" honestly means

- **PLAT:** spikes complete in Sprint 1 (cheap, parallel); builds get dedicated Phase-2 capacity.
  Expected outcome: **every platform with a workable API is live by Dec 4**; platforms with no
  public/partner API (likely among Avvo/Redfin/Homes.com) close as documented findings — that's
  the register's own definition of done for PLAT-0.1, not a miss.
- **AI:** minimal-viable ships at M1 (stretch); the full epic (template designer, quotas, metric)
  completes in Sprint 7.
- **External approvals** (A2P, TFV, Meta review) are the one clock we don't own. Submitted at M1;
  if an approval hasn't landed by release week, its surface ships behind a feature flag (PF-16)
  and pilots use the approved channels — the code side is still done.

If Sprint 4 or 5 slips by more than 3 days, the M1 stretch items (PLAT wave-1 start, AI minimal)
shed into Phase 2 — pre-agreed now so nobody debates it in October. M2 scope sheds nothing;
Phase 2's float is the Thanksgiving margin and release-week Wednesday.

## Standing risks

1. **Meta permissions** — dev-app scopes for staging demos need app review too. Apply in
   Sprint 1; fallback is mock-gateway demo mode for social (QA A's Sprint-5 harness doubles as
   this). Production review submitted at M1.
2. **Claude caps** — burst weeks may hit Max-plan weekly limits; see Working model (budget the
   $200 tier before letting a dev idle).
3. **Two-dev bus factor** — weekly cross-track review + everything speced in `docs/` mitigates;
   no work exists only in someone's head.
4. **Scope gravity** — the register is closed (04-epics): new asks go to the post-M2 backlog
   unless they visibly displace something.
5. **Approval latency** — A2P brand/campaign vetting and Meta production review can exceed
   Phase 2. Feature-flag strategy above keeps M2 deliverable regardless; real-channel activation
   may trail Dec 4 by days-to-weeks. Say this plainly at both demos.
