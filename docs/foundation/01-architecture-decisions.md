# Architecture decisions (re-evaluated from scratch)

Every choice below was re-derived from requirements — not inherited from the scaffold. Where the
existing choice survived, that's stated with the alternatives it beat. Where this doc **amends**
the scaffold, the change is called out with a ⚠ and a reason. Format: lightweight ADRs (AD-##).

## The product, restated as architectural requirements

A multi-tenant SMB SaaS (reviews, SMS/messaging, social publishing, campaigns, surveys, widgets)
whose defining loads are:

1. **Integration-heavy, not compute-heavy.** ~15 external providers (Twilio, Meta, Google, Stripe,
   SendGrid, …). Most failures are *their* failures. The architecture must make provider errors
   classifiable, retryable, and non-contagious (v1's May-16 incident: one bad error branch
   mass-deactivated every Zillow connection).
2. **Scheduled fan-out.** Campaign sends, drips, social publishing, review pulls — thousands of
   small jobs on per-profile timetables and timezones. Correctness = exactly-once-ish delivery +
   honouring per-profile timezone (v1 hardcoded Pacific).
3. **Small team.** One codebase, one language, boring technology, few moving parts. Complexity
   must be *staged in*, never bought up-front.
4. **Public SEO surfaces** (review funnels `/r/:shortname`, surveys `/s/:slug`, widgets) plus an
   authenticated dashboard.
5. **Tenant isolation is a hard requirement** — cross-tenant reads are the worst possible bug.

## Scale stages (design target: "both", staged)

Every decision documents what changes per stage. Nothing in Stage B/C is built during Stage A.

| Stage | Tenants (profiles) | Shape | Trigger to move up |
| --- | --- | --- | --- |
| **A — Launch** | ≤ ~2 000 | 1 region, 1 Postgres, 2× API, 1× worker pool, 1 Redis | p95 API > 300 ms sustained, queue lag > 5 min, DB CPU > 60 % |
| **B — Growth** | ~2k – 20k | + read replica, hot-table partitioning, per-provider worker pools, pgbouncer, RLS enforced | replica lag pain, single-queue head-of-line blocking |
| **C — Scale** | > 20k | + extract 1–2 services (messaging-ingest, media-render), queue sharding by tenant band, consider Citus/partition-by-tenant only if data proves it | measured, not speculative |

---

## AD-01 — Language & runtime: **TypeScript on Node.js** ✅ confirmed

- **Alternatives considered:** Go for workers (v1 heritage; great for daemons), Python for lambdas,
  polyglot "right tool per tier".
- **Why TS everywhere wins here:** v1's core disease was *three* languages sharing one DB with
  struct copies that drifted (the parity audits spent weeks proving Go bots ≡ Lambdas). One
  language + one schema package (`@oggvo/db`) makes drift structurally impossible. The workload is
  I/O-bound API orchestration — Node's sweet spot; Go's advantages (CPU, concurrency primitives)
  aren't the bottleneck. Hiring and context-switching cost dominate for a small team.
- **Stage C note:** if a single worker type ever needs Go-level throughput (unlikely — providers
  rate-limit us long before), extract that one queue consumer; the queue contract makes this cheap.

## AD-02 — Repository: **Turborepo + pnpm monorepo** ✅ confirmed

- Alternatives: polyrepo (rejected: reintroduces contract drift), Nx (heavier, more magic than needed).
- `apps/web` · `apps/api` · `apps/workers` · `packages/{db,shared,ui,api-client,config}`.

## AD-03 — Backend: **NestJS 11 modular monolith** ✅ confirmed, with an enforced boundary rule ⚠

- **Alternatives considered:**
  - *Microservices per domain* — rejected outright at this scale: 18 domains × network boundaries
    = distributed-systems tax with zero payoff at ≤ 20k tenants.
  - *Fastify/Hono + tRPC* — attractive DX, but tRPC couples the contract to TS clients only; we
    need OpenAPI anyway for widgets/public embeds/third parties, and NestJS gives guards
    (`TenantGuard`, `@RequirePermission`), DI, and module structure we'd otherwise hand-roll.
  - *Next.js API routes only* — collapses at the worker/queue boundary; no good story for the 9
    background processors.
- **The amendment (⚠ new):** modular monolith **with enforced module boundaries** — a module may
  import another module's *service interface* only (never its repository), checked by an ESLint
  boundary rule (`import/no-restricted-paths`). **Why:** the v1 codebase died by cross-domain
  reach-ins (campaigns controller computing affiliate blocks, settings mutating widget config).
  Enforced boundaries are what keep "extract a service later" a real option instead of a slogan.
- Layering stays: controller → service → repository; only repositories touch Drizzle.

## AD-04 — Frontend: **Next.js 15 App Router** ✅ confirmed

- Alternatives: Nuxt 4 (v1 heritage — rejected: team is moving to React/TS ecosystem; Nuxt 3 EOL
  pain is exactly what we're escaping), Vite SPA + separate SSR service (rejected: two frontends).
- Public SSR surfaces (`(public)`: funnel, surveys, widgets, unsubscribe) need SEO + fast first
  paint; the portal (`(portal)`) is a client-driven dashboard on the generated API client.
- **Widget embeds are iframes served by Next SSR** (not script-injected DOM) — kills v1's
  jQuery-conflict class of bugs and makes CSP sane. (Also in AD-13/foundations.)

## AD-05 — Database: **PostgreSQL 16, single shared-schema cluster** ✅ confirmed, staged hardening ⚠

- Alternatives: MySQL (v1 parity — no advantage), schema-per-tenant (operational explosion at 10k
  tenants), DynamoDB for events (rejected: v1's DynamoDB/OpenSearch/S3 sprawl is a documented cost
  and cognitive failure — consolidate first, specialize later).
- **Tenancy model:** every tenant-owned table carries `profile_id` FK + index; repositories are
  tenant-scoped by construction (`TenantGuard`).
- **⚠ Stage B adds Postgres RLS** as defense-in-depth: policies on tenant tables keyed to a
  `SET LOCAL app.profile_id` set per request/job transaction. **Why staged:** RLS costs planning
  overhead and migration discipline; at Stage A the guard + repository pattern + tests suffice,
  but past a few thousand tenants the blast radius of one missed `where` justifies the belt-and-braces.
- **⚠ Partitioning plan (Stage B):** `campaign_events`, `messages`, `notification_deliveries`
  (append-heavy, time-queried) become monthly range partitions. Designed for now (BIGINT PKs,
  time-first composite indexes), executed when row counts demand it.
- Read replica at Stage B for analytics/dashboard reads (the read-only reporting module is already
  isolated, so pointing it at a replica is a config change).

## AD-06 — ORM: **Drizzle** ✅ confirmed

- Alternatives: Prisma (rejected: heavier runtime, weaker raw-SQL ergonomics for the reporting
  module's aggregate queries, migration engine less transparent), Kysely (close second; Drizzle's
  schema-as-source-of-truth + pgEnum story fits the "one schema" doctrine better).
- Known local quirk: drizzle-kit needs the compile-to-dist workaround (see memory/README) — a
  tooling annoyance, not an architecture problem.

## AD-07 — Async: **BullMQ on Redis + `QueueService` abstraction + transactional outbox** ⚠ amended

- Alternatives: SQS+Lambda everywhere (rejected for Stage A: local dev friction, per-queue infra,
  v1's lambda sprawl is the cautionary tale), pg-boss (single-store transactional queueing — clean
  but weaker tooling/observability than BullMQ; revisit if Redis ops become a burden).
- **The amendment (⚠ new): a transactional outbox for state-changing enqueues.** Redis is not
  durable relative to Postgres; v1's newsletter bot marked "sent" at *dispatch* time and lost
  recipients when workers died post-mark (documented in the equivalence audit). Rule: any job that
  *must* happen because a DB write happened (campaign scheduled → send; post scheduled → publish)
  is written to an `outbox` table **in the same transaction** as the state change; a relay drains
  outbox → BullMQ. Fire-and-forget jobs (badge refresh, thumbnail) may enqueue directly.
- **Why keep BullMQ at all then:** retries/backoff/rate-limiting/concurrency/UI tooling per queue —
  the outbox only guarantees *handoff*, BullMQ still runs the work.
- Queue topology (9 queues) stays as in `ARCHITECTURE.md`; Stage B splits worker *pools* per
  provider so a Twilio slowdown can't starve Google pulls (head-of-line isolation).
- `QueueService` remains the seam to swap a hot queue (e.g. `email-send`) to SQS+Lambda at Stage C.

## AD-08 — API contract: **REST + OpenAPI → generated `@oggvo/api-client`** ✅ confirmed

- Alternatives: tRPC (TS-only consumers — fails the widget/public/third-party test), GraphQL
  (rejected: no aggregation-across-services need in a monolith; adds resolver/N+1/caching
  complexity the dashboard doesn't justify).
- Validation via **zod** (`@oggvo/shared` DTOs) — *not* class-validator (see project memory:
  ZodValidationPipe is the established pattern). zod schemas → OpenAPI via the pipe's metadata.

## AD-09 — AuthN/AuthZ: confirmed core, **upgraded permission model** ⚠

- Confirmed: 15-min access JWT + 30-day rotating refresh hashed in `auth_sessions`; argon2id;
  impersonation with audit + revert; uniform forgot-password responses. (All are v1
  fix-on-rebuild items.)
- **⚠ Amendment — per-profile roles + plan entitlements replace v1's 7 global booleans:**
  - `user_profiles.role` enum: `owner | admin | member` (role is **per membership**, fixing the
    "account_type is global to the user" defect flagged in 00-global).
  - Staff ladder (`sales < manager < supervisor < admin`) stays on `users` for the back office.
  - **Entitlements** (can this *profile* use Connect? how many SMS?) come from the billing plan
    (AD-14), not user flags. v1 conflated "may this user see messaging" with "has this business
    bought SMS" in one boolean — Dustin's report shows Gold/Platinum was pure UI fiction.
  - Guards: `@Roles(...)` (staff ladder) · `@RequireRole('admin')` (profile role) ·
    `@RequireEntitlement('connect')` (plan) — all enforced server-side, every route.
  - **Why:** this is the single decision that unblocks Teams (BF-023, placeholder Teams tab),
    billing, and "reps can activate Connect" without another rewrite.

## AD-10 — Multi-tenancy: **shared schema, `profile_id` scoping, staged RLS** ✅ (see AD-05)

One tenant concept: the **profile**. Users ↔ profiles is m:n with per-membership role (AD-09).
No org/agency layer at Stage A — but `user_profiles` role-per-membership means adding an
`organizations` grouping later is additive, not a migration of the auth model.

## AD-11 — Media: **S3 presigned upload + CloudFront + first-class reference model** ✅ confirmed

- Keys in DB, one CDN host, no mounts, no `file_exists()` (kills the v1 "directory not writable"
  and two-host-rewrite classes of bugs).
- `media_references` join (media_id, feature, entity_id) — "is this file used anywhere?" is one
  query. Physical deletion only via reference count, never from one feature's view (the FB
  data-deletion near-miss in CLAUDE.md is the reason this is a *standard*, not a feature).

## AD-12 — Image generation: **headless-Chromium render worker** ⚠ replaces wkhtmltoimage

- Playwright (already a dev dep) in the `media-process` worker renders review/testimonial/
  newsletter images from an internal HTML route; missing sub-assets (a 404ing avatar) degrade
  gracefully instead of failing the render (v1: one dead avatar → whole image fails).
- Alternative considered: external render API (extra vendor, PII egress) — rejected while
  self-hosting is one container.

## AD-13 — Provider integration layer: **one gateway per provider + shared error taxonomy** ⚠ new

This is the biggest *new* structural decision, earned by the bot-parity postmortems:

- Each provider (Twilio, Meta, Google, Stripe, …) gets one **gateway class** owning: SDK calls,
  token refresh from the **AES-GCM vault**, rate-limit awareness, and mapping every failure into
  the shared taxonomy: `terminal | rate_limited | transient | auth_revoked`.
- **Rules enforced by the taxonomy:** only `auth_revoked` may deactivate a connection (never a
  JSON-decode error — the Zillow incident); `rate_limited` requeues with provider-specific
  backoff; publishing operations are **non-idempotent → terminal on error** (never auto-retry a
  possibly-published post; offer manual "Retry post" instead — which is exactly BF-044).
- Disconnect is a **lifecycle state machine** (active → grace-period soft-delete of children →
  purge), with provider token revocation and the Meta data-deletion callback built in from day one.
- No SDK import outside its gateway; no raw curl in controllers (v1's test-SMS-in-controller).

## AD-14 — Billing & plans: **Stripe Billing + local entitlements table** ⚠ net-new module

- v1 has *no* plan system (hardcoded "Gold Plan" strings; upgrades = email a human). v2 makes
  plans first-class: `plans`, `subscriptions`, `entitlements` (materialized per profile).
- Stripe Billing (current SDK) as merchant of record for subscriptions; webhook-driven entitlement
  sync; guards read the local entitlements table (never call Stripe on the request path).
- **Why now:** retrofitting entitlements after 18 modules ship means touching every guard twice.

## AD-15 — Toll-free verification: **Twilio Compliance Embeddable** ⚠ decision (ADR was open)

- The `twillio-tollfree/side-by-side-comparison.md` ADR left Embeddable vs Custom-API open.
  **Decision: Embeddable for launch.** Rationale: compliance-form correctness stays Twilio's
  liability, weeks less work, resume/edit for free; our side is the thin state machine
  (`submitted / needs_correction / approved / rejected`), number assignment, webhook + poll sync —
  which both variants need anyway. The custom UI is a Stage-B option *behind the same internal
  status model*, so switching later touches only the form surface.

## AD-16 — Observability: **pino + OpenTelemetry + Sentry + delivery ledger** ✅ confirmed + ⚠ ledger

- The ⚠ addition — a `notification_deliveries` / send-attempt ledger: every outbound email/SMS/push
  records provider, template, target, and **application-level result** (not just transport success).
  **Why:** the review-notification outage took a multi-day forensic handoff because sendEmail's
  in-body `{"statusCode":500}` failures were counted as success and nothing recorded *why* a
  notification didn't go out. "Why didn't X get the email?" must be one query.

## AD-17 — Infra: **AWS — ECS Fargate, RDS Postgres, ElastiCache, S3/CloudFront, CDK** ✅ confirmed

- CDK is the only healthy part of v1's stack (per the dependency audit) — keep the competence.
- Stage A: 1 region, api + workers as two Fargate services, RDS single-AZ→multi-AZ at first paying
  cohort, Secrets Manager for secrets (incl. vault KMS key), Mailpit/MinIO/Redis via
  docker-compose locally.
- Web: Vercel *or* Fargate behind CloudFront — decide on ops preference at deploy time; nothing
  upstream depends on it.

## AD-18 — Real-time updates: **SSE now, WebSocket only if bidirectional need appears** ⚠ new (gap pass)

- The Connect inbox needs live message arrival; nothing had decided how. **Decision:** Server-Sent
  Events from the API (per-profile event stream fed by the same domain events NOTIF consumes),
  with polling fallback. Why SSE over WebSocket: our traffic is one-directional (server→client
  pushes; client actions are normal REST calls), SSE survives proxies/load-balancers with zero
  extra infra, and BullMQ events bridge to it trivially. Why not polling alone: the inbox is the
  one surface where 60-second staleness is a product defect. WebSockets become worth it only if
  we ship typing indicators / collaborative editing — neither is on the register.

## AD-19 — Environments, deploys, backup/DR ⚠ new (gap pass)

- **Environments:** local (docker-compose) → staging (full stack, seeded fixtures, provider
  sandbox creds) → prod. Staging is where TFV/A2P/webhook flows run against real provider test
  modes before any release.
- **Deploys:** zero-downtime rolling on Fargate; DB changes follow **expand → migrate → contract**
  (a migration may never break the currently-deployed code; contract ships one release later).
  Workers drain gracefully on deploy (BullMQ `close()` waits for in-flight jobs — no half-sent
  chunks; PF-4 covers the crash case).
- **Backup/DR targets:** RDS PITR enabled, RPO ≤ 5 min, RTO ≤ 4 h, nightly snapshot restore-tested
  monthly; S3 versioning + lifecycle on media; Redis is *rebuildable* by design (outbox is the
  durable record — losing Redis loses no committed work, per AD-07).

## AD-20 — Visual content editor: **keep Unlayer (React embed)** ⚠ decision (gap pass 2)

- v1 builds email campaigns, newsletters, *and* the funnel designer on Unlayer (project 138792) —
  a load-bearing vendor choice no doc had re-decided. **Decision: keep Unlayer** via its
  maintained React component: users' mental model carries over, design-JSON content can be
  reseeded as v2 defaults, and building a comparable editor is a multi-quarter project we're not
  funding. Alternatives: GrapesJS (self-hosted, weaker email-HTML output), react-email/MJML
  (developer-authored templates only — fine for transactional mail, wrong for user-built
  campaigns; we *do* use typed code templates for transactional sends).
- Boundary: Unlayer produces `design_json` + rendered HTML stored in **our** DB (funnel/campaign
  tables) — the editor is swappable UI, never the storage-format owner.

## AD-21 — Search: **Postgres FTS, no search engine** ⚠ decision (gap pass 2)

- Contacts/reviews/messages search uses Postgres full-text (`tsvector` + GIN, `pg_trgm` for fuzzy
  name/phone). At ≤20k-tenant scale with per-profile scoping, every search hits a small slice of
  rows — an external engine (OpenSearch was part of v1's sprawl) is cost without cause. Revisit
  only on Stage-C evidence (a measured query class failing).

---

## What deliberately does NOT exist (anti-requirements)

Named so nobody "helpfully" adds them early:

- **No microservices, no event bus (Kafka/EventBridge-as-backbone), no CQRS framework** before
  Stage C evidence. The outbox + queues give the async guarantees needed.
- **No DynamoDB / OpenSearch** for product data. Postgres (jsonb, partitions, replica) until a
  measured query class fails there. (v1's import-row detail in DynamoDB becomes
  `contact_import_rows` in PG.)
- **No schema-per-tenant, no multi-region** at any currently priced stage.
- **No hand-written fetch clients, no class-validator, no local-disk media, no per-controller
  provider SDK calls** — ever (standards, see 03).

## Topology (Stage A)

```
            ┌─────────────┐   HTTPS    ┌──────────────────────────┐
 Browser ──►│  apps/web    │──────────►│  apps/api  (NestJS)       │
 (portal +  │  Next.js 15  │  typed    │  guards → services → repos│
  public)   └─────────────┘  client    └──────┬───────────┬───────┘
                                              │ Drizzle    │ outbox tx
      widgets (iframe SSR) ──────────────►    ▼            ▼
                                        ┌──────────┐  ┌─────────┐  relay   ┌────────────┐
                                        │ Postgres │  │ outbox  │ ───────► │ Redis/Bull │
                                        └──────────┘  └─────────┘          └─────┬──────┘
                                                                                 ▼
                                                                     ┌───────────────────────┐
                                                                     │ apps/workers (9 queues)│
                                                                     │ provider gateways      │
                                                                     └──────────┬────────────┘
                                                            Twilio · Meta · Google · Stripe · SendGrid …
```
