# OGGVO v2 — Foundation

This folder is the **top-level product & engineering foundation** for building OGGVO v2 as a
**new product** (v1 is a feature reference, not a codebase to port). It sits *above* the existing
documentation and resolves the questions those docs leave open.

## How this relates to the other docs

| Layer | Where | What it answers |
| --- | --- | --- |
| **Foundation (this folder)** | `docs/foundation/` | What are we building, in what order, on what architecture, and why. Epics, ownership, staged scaling, conventions. |
| Functional spec (v1 reference) | `docs/feature-spec/` | What every v1 page/field/endpoint did, and known v1 bugs to *not* reproduce. |
| Detailed user stories | `docs/<domain>/user-stories.md` | Story-level acceptance criteria per domain (~280 stories, 17 domains). |
| Activity diagrams | `docs/<domain>/activity-diagrams.md` | Flow-level behaviour per domain. |
| Schema | `packages/db/src/schema/` + `docs/SCHEMA-REDESIGN.md` | The data model (65 tables) and its v1 mapping. |
| Dependency rationale | `docs/dependency-audit.md` | Why v1's stack was unsalvageable (EOL inventory). |

**Precedence:** where this folder contradicts an older doc (e.g. `docs/BUILD-PLAN.md` phases, a
domain file's "Open question"), **this folder wins** — it was written later and resolves those
questions deliberately.

## Reading order

1. [`01-architecture-decisions.md`](01-architecture-decisions.md) — every stack choice re-evaluated
   from scratch, with alternatives considered and a **staged scaling path** (what changes at 10× and 100×).
2. [`02-domain-map.md`](02-domain-map.md) — bounded contexts, module ownership (including every
   contested "who owns this?" from the domain docs), cross-domain contracts, personas & the target
   RBAC/entitlements model.
3. [`03-platform-foundations.md`](03-platform-foundations.md) — non-negotiable engineering
   standards every module inherits: tenancy, soft delete, events ledger, idempotency/outbox,
   scheduling, provider error taxonomy, media references, webhooks, testing.
4. [`04-epics-and-stories.md`](04-epics-and-stories.md) — the **epic register**: normalized story
   IDs, every existing story mapped, every sprint-issue (BF-###/TU-###) folded in, and full new
   stories for the gaps (billing/plans, teams, onboarding backend, TFV, AI templates, new review
   platforms, notifications hub).
5. [`05-roadmap.md`](05-roadmap.md) — the staged delivery plan (releases R0–R5) with launch criteria.
6. [`06-team-plan-90d.md`](06-team-plan-90d.md) — the concrete 90-working-day execution plan
   (Aug 3 → Dec 4, 2026): 2 devs + 2 testers, two milestones — M1 staging-complete demo Nov 2,
   M2 everything-production-ready Dec 4 — with capacity math and pre-agreed shed rules.
7. [`07-flow-diagrams.md`](07-flow-diagrams.md) — mermaid diagrams for the cross-cutting flows no
   domain file owns: send pipeline, error taxonomy, entitlement sync, team invites, TFV and
   disconnect state machines, media delete, migration cutover.
8. [`08-v1-migration-plan.md`](08-v1-migration-plan.md) — the detailed MIGR design:
   freeze-and-cutover strategy, URL/identity preservation, entity-by-entity edge cases
   (passwords, tokens, blobs, in-flight schedules), webhook re-registration, cutover runbook,
   validation gate, customer comms.

## Inputs consumed

- `docs/feature-spec/*` (16 domains) and `docs/*/user-stories.md` (17 domains).
- `~/Downloads/Oggvo/sprint-issues.md` — the 9-sprint plan (51 items: BF-001–BF-050, TU-001–TU-021).
- `~/Downloads/Oggvo/dustin-feature-questions-report.md` — confirms Teams/Invites permission,
  Support permission, Gold/Platinum plans, and Contact Advisor are **placeholders in v1** (net-new here).
- `~/Downloads/Oggvo/twillio-tollfree/*` — the TFV approach ADR + both user-story variants.
- `~/Downloads/Oggvo/Bot Lambda Parity.txt` + `Bot Lambda equivalance.txt` — operational lessons
  (error classification, idempotent sends, DLQ monitoring, mark-sent timing).
- `~/Downloads/Oggvo/review-notification-handoff-2026-06-24.md` + `Issues.txt` — notification
  observability and resilience rules.

## Status

Written 2026-07-06. What exists in the repo: the monorepo shell (turborepo/pnpm/configs,
docker-compose) and **`packages/db` — the 70-table Drizzle schema** (kept as the data-model
source of truth). The earlier Phase-0 app code (auth/tenancy modules, web/worker skeletons) was
**deliberately removed on 2026-07-06** per the fresh-start decision — R0 rebuilds the app
skeletons on the foundation's standards from day one. Everything else is described here before
it is built.

**Gap pass 2 (same day):** a completeness audit against the live schema (70 tables verified)
added AD-20 (keep Unlayer as the visual editor — load-bearing vendor choice nobody had
re-decided), AD-21 (Postgres FTS, no search engine), the MIGR epic (v1 data migration: defined
and storied but unscheduled — the "do v1 customers migrate?" business decision is explicitly
owed before M2), PF-17/18 tables added to the R0 schema list (`suppressions`,
`deletion_requests`; reuse existing `audit_log`/`blacklisted_emails`), and `07-flow-diagrams.md`.

**Gap pass 1 (same day):** an adversarial self-review added AD-18 (real-time via SSE), AD-19
(environments / expand-migrate-contract deploys / backup-DR), PF-17 (TCPA quiet hours, STOP/HELP,
global suppression, DKIM/DMARC — enforced at the send pipeline) and PF-18 (data-subject
export/delete, call-recording consent, retention windows). Reason: the product's core loop is
outbound SMS/email holding third-party PII — the legal/ops layer has to be a platform standard,
not a per-feature afterthought (v1's bounce-suppression was commented out; recordings went to
OpenAI with no policy).
