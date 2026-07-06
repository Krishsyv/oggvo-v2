# Oggvo v2

A ground-up rebuild of the Oggvo platform — an all-in-one reputation, review, social, messaging
and campaign platform for small/mid-size businesses — on a modern, fully-typed stack.

> **Status:** Skeleton + full database schema, plus the auth + tenancy slice (login, refresh-token
> rotation, RBAC/permission guards, tenant-membership guard). Domain modules are being built
> phase-by-phase (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md)).

## Stack

| Layer            | Technology                                           |
| ---------------- | ---------------------------------------------------- |
| Web / frontend   | **Next.js 15** (App Router, RSC) + Tailwind          |
| API              | **NestJS 11** (REST + OpenAPI)                        |
| Background jobs  | **NestJS workers** + **BullMQ** (Redis)              |
| Data access      | **Drizzle ORM** + **PostgreSQL 16**                  |
| Monorepo         | **Turborepo** + **pnpm** workspaces                  |
| Object storage   | **S3** (MinIO locally)                               |
| Email / SMS      | SendGrid / Twilio (Mailpit locally)                  |
| Tests            | **Vitest** (unit) + **Playwright** (e2e)             |

## Layout

```
oggvo-v2/
├── apps/
│   ├── web/          Next.js 15 portal + public pages (review/widget/survey are SSR)
│   ├── api/          NestJS REST API, auth, guards, all domain modules
│   └── workers/      NestJS standalone — BullMQ queue processors (review-puller, sender, …)
├── packages/
│   ├── db/           Drizzle schema (single source of truth) + migrations + seed
│   ├── shared/       Shared enums, DTO/zod schemas, domain types
│   ├── ui/           Design system: Tailwind preset, tokens, primitives
│   └── config/       Shared tsconfig / eslint / tailwind presets
├── docs/             Architecture, build plan, decisions
├── docker-compose.yml  Postgres + Redis + MinIO + Mailpit
└── turbo.json
```

Every app and package carries its own `README.md` documenting its folders, routes, and modules.

## Quick start

```bash
# 1. Prerequisites: Node 22, pnpm 9, Docker
corepack enable

# 2. Install
pnpm install

# 3. Bring up local infra (Postgres, Redis, MinIO, Mailpit)
cp .env.example .env
pnpm stack:up

# 4. Create the database schema
pnpm db:migrate     # apply migrations
pnpm db:seed        # load reference + demo data

# 5. Run everything
pnpm dev            # web :3000, api :3001, workers
```

Local service UIs: MinIO console `:9001`, Mailpit `:8025`, Drizzle Studio via `pnpm db:studio`.

## Scripts

| Command            | What it does                                |
| ------------------ | ------------------------------------------- |
| `pnpm dev`         | Run web + api + workers in watch mode       |
| `pnpm build`       | Build all apps/packages (Turborepo)         |
| `pnpm test`        | Run unit tests (Vitest)                      |
| `pnpm test:e2e`    | Run Playwright e2e                           |
| `pnpm db:generate` | Generate a migration from schema changes    |
| `pnpm db:migrate`  | Apply migrations                            |
| `pnpm db:studio`   | Open Drizzle Studio                         |
| `pnpm lint`        | Lint all packages                            |
| `pnpm typecheck`   | Type-check all packages                      |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design & conventions
- [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) — phased build order
- [`docs/SCHEMA-REDESIGN.md`](docs/SCHEMA-REDESIGN.md) — how the v1 MySQL schema maps to v2 Postgres
- [`packages/db/README.md`](packages/db/README.md) — data model reference
