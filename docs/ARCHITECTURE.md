# Architecture

> **Extended (2026-07-06):** the re-evaluated, decision-by-decision architecture now lives in
> [`foundation/01-architecture-decisions.md`](foundation/01-architecture-decisions.md) (ADRs
> AD-01–19, staged scaling, anti-requirements) and
> [`foundation/03-platform-foundations.md`](foundation/03-platform-foundations.md) (standards
> PF-1–18). This file remains a correct overview, but the foundation adds decisions not reflected
> here — notably the **transactional outbox** (AD-07), **provider gateways + error taxonomy**
> (AD-13), **billing/entitlements module** (AD-14), **notifications module + delivery ledger**
> (AD-16/PF-6), **SSE real-time** (AD-18), and **messaging-compliance/suppression** (PF-17).
> Where they differ, the foundation wins.

## Goals

Rebuild Oggvo as a single, fully-typed TypeScript system that fixes the structural problems of v1:

| v1 problem                                                        | v2 resolution                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| 3 languages (PHP API, Go bots, Python lambdas), DB structs copied twice | One language (TS). One schema in `@oggvo/db`, imported everywhere |
| Schema managed as a hand-edited SQL dump; migrations died in 2021 | Drizzle migrations, versioned, generated from schema     |
| Sender bot hardcodes Pacific business hours                       | Per-profile timezone honoured by schedulers              |
| Unauthenticated `/refresh`, no real RBAC                          | Refresh-token rotation + role/permission guards          |
| No OpenAPI; frontend guesses endpoints                            | NestJS Swagger → generated typed client (`@oggvo/api-client`) |
| Almost no tests                                                   | Vitest unit + Playwright e2e per slice                   |
| `god` profile table (100+ cols), typo tables, dead `review_backup`| Split tables, snake_case, dead tables dropped            |

## Topology

```
                ┌──────────────┐      ┌───────────────────────────┐
   Browser ───► │  apps/web    │ ───► │  apps/api (NestJS REST)    │
                │  Next.js 15  │      │  auth · guards · modules   │
                └──────────────┘      └─────────────┬─────────────┘
                                                    │ Drizzle (@oggvo/db)
                       enqueue jobs (BullMQ)        ▼
                ┌──────────────┐  Redis   ┌───────────────────────────┐
                │ apps/workers │ ◄──────► │     PostgreSQL 16          │
                │ BullMQ procs │          └───────────────────────────┘
                └──────┬───────┘
                       │ external APIs (Google, Meta, Twilio, SendGrid, …)
                       ▼
              third-party platforms
```

## Packages & ownership

- **`@oggvo/db`** — the single source of truth for the data model. Drizzle table definitions,
  pgEnums, relations, migrations, and seeds. No business logic. Both `api` and `workers` import it.
- **`@oggvo/shared`** — framework-agnostic enums, domain types, and zod validation schemas shared
  between web, api, and workers. DTOs are derived from zod so validation and types never drift.
- **`@oggvo/ui`** — the design system: Tailwind preset + design tokens + headless primitives
  (Button, Modal, TabBar, …) reused across web. Replaces v1's ad-hoc component sprawl.
- **`@oggvo/config`** — shared tsconfig / eslint / tailwind presets.

## API design (NestJS)

- **Module per domain** — `auth`, `tenancy`, `reviews`, `funnel`, `contacts`, `campaigns`,
  `messaging`, `social`, `surveys`, `widgets`, `analytics`, `newsletters`, `notifications`,
  `integrations`, `billing`, `media`, `admin`. Each = controller + service + repository + DTOs + tests.
- **Layering** — controllers do HTTP only; services hold business logic; repositories own all
  Drizzle queries. Nothing outside a repository touches the DB.
- **Multi-tenancy** — every request resolves an active `profile` (tenant). A `TenantGuard` injects
  `profileId` and every repository query is scoped to it. No cross-tenant reads by construction.
- **Auth** — short-lived access JWT (15 min) + rotating refresh token (30 d) stored hashed in
  `auth_sessions`. Roles + granular permissions enforced by guards (`@Roles`, `@RequirePermission`).
- **Contracts** — every endpoint is documented with `@nestjs/swagger`; the OpenAPI doc generates
  `@oggvo/api-client`, which `apps/web` consumes. No hand-written fetch calls.

## Background jobs (workers)

The six v1 bots become BullMQ queues in `apps/workers`:

| Queue              | Replaces v1                  | Trigger                              |
| ------------------ | ---------------------------- | ------------------------------------ |
| `review-puller`    | review-puller-bot            | repeatable (per-profile cadence)     |
| `sender`           | sender-bot                   | repeatable; honours profile timezone |
| `newsletter`       | newsletter-bot               | repeatable + on-demand               |
| `social-publish`   | social-bot                   | scheduled posts due                  |
| `post-automator`   | post-automator-bot           | repeatable                           |
| `activator`        | activator-bot                | repeatable                           |
| `birthday`         | birthday-bot                 | daily                                |
| `media-process`    | resize-assets lambda         | on-demand                            |
| `email-send`       | send-email lambda            | on-demand (fan-out from sender/newsletter) |

Business logic never imports BullMQ directly — it goes through a thin `QueueService` interface, so a
specific high-volume queue (e.g. `email-send`) can be swapped to SQS+Lambda later without touching
domain code.

## Frontend (Next.js)

- **App Router + RSC.** Public, SEO-sensitive surfaces are server-rendered: review-share pages
  (`/r/[shortname]`), embeddable widgets, survey pages (`/s/[slug]`), unsubscribe.
- The authenticated portal is a client-driven dashboard hitting the typed API client.
- Styling via the shared `@oggvo/ui` Tailwind preset and design tokens.

## Cross-cutting

- **Observability** — structured logging (pino), OpenTelemetry traces, Sentry error capture.
- **Config** — validated env (zod) at boot; secrets from AWS Secrets Manager in prod.
- **Integrations vault** — third-party OAuth tokens encrypted at rest (AES-GCM, key from env/KMS).
- **Feature flags** — a `feature_flags` table + guard for staged rollout.
- **Idempotency** — workers use a processed-key table to make retries safe.
- **Media/file storage** — all user uploads (images, videos, logos, generated assets) go to **S3
  directly via the AWS SDK**: presigned PUT for upload, CloudFront for serving, S3 keys (not local
  paths) stored in the DB. The `media-process` worker handles resize/thumbnail generation. No local
  filesystem and **no NFS/S3-Files mount** — see the v1 anti-pattern in CLAUDE.md "Fix-on-rebuild".

## Conventions

- snake_case in the database, camelCase in TypeScript (Drizzle maps between them).
- Every table has `created_at` / `updated_at` (timestamptz). Soft-deletable entities add `deleted_at`.
- Enums are Postgres `pgEnum`s defined once in `@oggvo/db` and re-exported via `@oggvo/shared`.
- Money as integer minor units; all timestamps stored UTC, rendered in the profile/user timezone.
