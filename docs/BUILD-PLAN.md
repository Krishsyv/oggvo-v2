# Build plan

> **Superseded (2026-07-06):** the delivery plan now lives in
> [`foundation/05-roadmap.md`](foundation/05-roadmap.md) (releases R0–R5), which reorders phases
> 1–5 below (billing/notifications pulled forward; data migration is now MIGR/Phase 3 — GO
> decision same day). Phase 0 below is a historical record: its app code (auth slice, app
> skeletons) was **deliberately deleted on 2026-07-06** for the fresh start; only the monorepo
> shell and `packages/db` remain from it.

A big-bang rewrite still needs an internal build order so each slice is shippable and testable.
Each phase lands: code + unit tests + e2e + a README for every new module/folder.

## Phase 0 — Foundation (this scaffold)

- [x] Turborepo + pnpm monorepo, shared tsconfig/eslint/tailwind presets
- [x] docker-compose: Postgres, Redis, MinIO, Mailpit
- [x] `@oggvo/db`: full redesigned Drizzle schema for all domains + migrate/seed harness
- [x] App skeletons: NestJS api, NestJS workers (BullMQ), Next.js web
- [ ] CI: lint + typecheck + test + migrate-check on PR
- [x] Auth slice (login, refresh rotation, RBAC guards) + tenancy guard
- [ ] Production packaging: `node dist/main.js` for api/workers does not yet run
      standalone because `@oggvo/db` / `@oggvo/shared` are consumed as TS source
      (`main` → `src/index.ts`). Needs lib builds + conditional `exports`
      (`development` → src, `default` → dist) or app bundling. Deferred to
      Phase 5 (IaC/cutover); `pnpm dev`, tests, and typecheck are unaffected.

## Phase 1 — Core domains

- `tenancy` (profiles, user↔profile membership, profile settings tables)
- `reviews` + `funnel` (review listing, funnel design, public review-share pages)
- `contacts` (recipients, tags, imports, custom fields)

## Phase 2 — Engagement

- `campaigns` (email/SMS invite campaigns, scheduler, tracking)
- `messaging` (Connect: two-way SMS, conversations, scheduled messages)
- workers: `sender`, `newsletter`, `email-send`

## Phase 3 — Growth

- `social` (accounts, posts, scheduled posts, content planner, insights)
- workers: `review-puller`, `social-publish`, `post-automator`, `activator`
- `surveys`, `widgets`, `analytics`

## Phase 4 — Integrations & compliance

- `integrations` (OAuth vault for Google/Meta/Twitter/LinkedIn/Square/Stripe/…)
- Twilio A2P 10DLC compliance flows
- `billing`, `notifications` (push), `newsletters`

## Phase 5 — Data migration & cutover

- MySQL → Postgres ETL honouring the redesign mapping (see `SCHEMA-REDESIGN.md`)
- Backfill + dual-write validation
- Observability (OTel + Sentry), IaC, staging soak, production cutover
