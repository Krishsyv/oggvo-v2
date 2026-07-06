# OGGVO Feature Specification (v1 → v2 build reference)

This is the **functional source of truth** for rebuilding OGGVO. It documents what every page, tab,
feature, field, and business rule of the **v1** product does, and maps each to its **v2** target
(NestJS module + Drizzle tables + BullMQ queue + build phase).

It complements — does not duplicate — the architecture docs:

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — stack, topology, conventions, layering.
- [`../BUILD-PLAN.md`](../BUILD-PLAN.md) — phase order (0–5).
- [`../SCHEMA-REDESIGN.md`](../SCHEMA-REDESIGN.md) — v1 MySQL → v2 Postgres table mapping.
- [`../../packages/db/src/schema/`](../../packages/db/src/schema/) — the 65-table Drizzle schema.
- Dependency/upgrade risk: [`../dependency-audit.md`](../dependency-audit.md).

## Why we are migrating (summary)

| v1 problem | v2 resolution |
| --- | --- |
| 3 languages (PHP API, Go bots, Python/JS lambdas); DB structs copied twice | One language (TypeScript); one schema in `@oggvo/db` imported everywhere |
| Schema is a hand-edited SQL dump; migrations died in 2021 | Versioned Drizzle migrations generated from schema |
| Sender bot hardcodes Pacific business hours | Per-profile timezone honoured by schedulers |
| Unauthenticated `/refresh`, no real RBAC | Refresh-token rotation + role/permission guards |
| No OpenAPI; frontend guesses endpoints | NestJS Swagger → generated typed `@oggvo/api-client` |
| Almost no tests | Vitest unit + Playwright e2e per slice |
| `god` profile table (100+ cols), typo/dead tables | Split tables, snake_case, dead tables dropped |
| EOL deps (Nuxt 3, Stripe v10, Square 2022, Go 1.24, AWS JS SDK v2, Firebase 8, PHP 8.2) | Current, supported stack across the board |

**Cost saving:** one skill set & toolchain instead of three; managed Postgres replaces the MySQL-dump +
DynamoDB + OpenSearch sprawl; BullMQ now, swappable to SQS+Lambda only where volume needs it.
**Scalability:** typed end-to-end contracts, per-tenant query scoping by construction, a queue
abstraction, and IaC-managed infra.

## How this spec is organised

One file per feature domain. Every file follows [`_template.md`](_template.md) — all 8 sections filled,
no empty headings, before a domain is marked **Done** below.

Status legend: **Done (text)** = full written spec complete; screenshots pending app capture.

| # | Domain | File | v2 module(s) | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| 0 | Global (auth, tenancy, RBAC, layouts, shared UI) | [00-global.md](00-global.md) | `auth`, `tenancy` | 0–1 | Done (text) |
| 1 | Auth & Onboarding | [auth-onboarding.md](auth-onboarding.md) | `auth`, `tenancy` | 0–1 | Done (text) |
| 2 | Reviews & Auto-share | [reviews.md](reviews.md) | `reviews`, `funnel` | 1 | Done (text) |
| 3 | Contacts (recipients, imports) | [contacts.md](contacts.md) | `contacts` | 1 | Done (text) |
| 4 | Connect — Messaging & Calls | [connect-messaging.md](connect-messaging.md) | `messaging` | 2 | Done (text) |
| 5 | Campaigns (email/SMS) | [campaigns.md](campaigns.md) | `campaigns` | 2 | Done (text) |
| 6 | Social | [social.md](social.md) | `social` | 3 | Done (text) |
| 7 | Surveys | [surveys.md](surveys.md) | `surveys` | 3 | Done (text) |
| 8 | Design & Funnel | [design-funnel.md](design-funnel.md) | `funnel`, `reviews` | 1–3 | Done (text) |
| 9 | Widgets | [widgets.md](widgets.md) | `widgets` | 3 | Done (text) |
| 10 | Analytics & Dashboard | [analytics-dashboard.md](analytics-dashboard.md) | `analytics` | 3 | Done (text) |
| 11 | Twilio A2P / Compliance | [twilio-a2p-compliance.md](twilio-a2p-compliance.md) | `messaging`, `integrations` | 4 | Done (text) |
| 12 | Settings | [settings.md](settings.md) | `tenancy`, `settings` | 1–4 | Done (text) |
| 13 | Manage / Admin | [manage-admin.md](manage-admin.md) | `admin` | 4 | Done (text) |
| 14 | Integrations & OAuth & Webhooks | [integrations-oauth.md](integrations-oauth.md) | `integrations` | 4 | Done (text) |
| 15 | Async workers (bots/lambdas) | [async-workers.md](async-workers.md) | `apps/workers` | 2–4 | Done (text) |

## Screens / images

Each domain file has a **Screens** section embedding images from `_assets/screens/<domain>/`.
Capturing real screenshots requires the v1 app running (`oggvo/local-dev/`) + a test login. Until then,
entries are placeholders (`![...](_assets/screens/<domain>/<page>.png)`). Capture workflow when ready:

1. **Playwright** (already a v1 dep) logs in once, stores auth state, visits every route + clicks each
   tab/key modal, writes PNGs to `_assets/screens/<domain>/`.
2. **Chrome DevTools MCP** walks the same pages to capture the **live network calls**, so the API
   section of each file lists the exact endpoints/payloads each screen fires (not guesses).

## Conventions

- v1 paths are relative to the `oggvo` repo (e.g. `apps/portal-frontend/pages/reviews/index.vue`).
- v2 tables refer to `@oggvo/db` schema names; v2 modules to `apps/api/src/modules/<name>`.
- "Known v1 bug" callouts record defects to fix during the rebuild, not to reproduce.
