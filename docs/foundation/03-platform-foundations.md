# Platform foundations — standards every module inherits

These are cross-cutting rules, each earned by a specific v1 failure (cited). A feature PR that
violates one of these is wrong even if it works. Referenced from stories as **PF-#**.

## PF-1 Tenancy
Every tenant table has `profile_id` (FK, indexed). Repositories take tenant scope from request
context (TenantGuard) or job payload — never from client input. Stage B: RLS policies double-check
(AD-05). *v1 failure: implicit scoping, cross-tenant token sharing (Google/LinkedIn tokens reused
across profiles).* Tests: every repository has a "wrong tenant returns nothing" test.

## PF-2 Soft delete & cascade sets
Every user-data table has `deleted_at`. A parent disconnect/delete soft-deletes its children **as a
set** in one transaction; restore reverses it; hard-delete happens only after the grace window via
a purge job. *v1 failure: only `social_stream` had DeleteDate — children were hidden by fragile
join-filters, and manually-added reviews escaped the filter entirely.*

## PF-3 Timezone & scheduling
Store UTC (`timestamptz`) everywhere. Scheduling (send windows, drips, business hours 8am–5pm,
weekend skip) evaluates in the **profile's IANA timezone** at execution time. One timezone resolver
in `tenancy` (address → IANA), no duplicates. *v1 failure: Pacific hardcoded in container TZ + a
MySQL wall-clock trick; two redundant resolvers; 5 legacy numeric tz ids.*

## PF-4 Outbox & idempotency
- State-change → job: same-transaction `outbox` row, relayed to BullMQ (AD-07).
- Every consumer is idempotent via a natural key (`(campaign_id, contact_id, step, date)` for
  sends; `social_post_id` for publishes; provider `event_id` for webhooks) checked against a
  processed-keys table.
- Mark-sent **after** provider acknowledgment, never at dispatch. Failed jobs land in a DLQ with
  alerting. *v1 failures: newsletter marked sent at dispatch; sender chunk double-send window;
  `-2` in-progress sentinels with 10-minute claim heuristics.*

## PF-5 Provider error taxonomy
All provider calls go through gateways (AD-13) mapping errors to
`terminal | rate_limited | transient | auth_revoked`. Only `auth_revoked` may deactivate a
connection. Publishing is non-idempotent → `terminal` on error + manual retry affordance.
*v1 failure: the May-16 Zillow mass-deactivation (any error → Deactivate); Google JSON-decode
errors killing connections.*

## PF-6 Delivery ledger
Every outbound email/SMS/push writes a `notification_deliveries` row: channel, provider, template,
target, correlation (campaign/review/survey id), and **application-level** result parsed from the
provider response body. "Why didn't X get it?" is one query. *v1 failure: the review-notification
outage — Lambda body `{"statusCode":500}` counted as success, multi-day forensic handoff.*

## PF-7 Resilient side-effects
User-facing writes never fail because a notification failed. Persist first; notify async
(fire-and-forget through the ledger). *Source: Issues.txt hardening rule — survey answers must save
and count exactly-once even when email is broken.*

## PF-8 Webhooks
Every inbound webhook: (1) signature verified — no exceptions, correct algorithm per provider;
(2) responds 2xx fast, processing enqueued; (3) idempotent by provider event id; (4) registered
URLs tracked in DB with expiry-refresh jobs where providers expire them (Clio 30-day). *v1
failures: Square/Twilio-SMS/Shopify verification commented out; PAM TLS verification disabled;
synchronous in-request processing; Clio webhooks silently expiring.*

## PF-9 Secrets & tokens
OAuth tokens/creds in the AES-GCM vault (KMS key), decrypted only inside gateways. Never in logs,
never plaintext columns, never returned by APIs (v1 admin endpoint returned the raw FCM server key).

## PF-10 Media
S3 via SDK only; keys in DB; one CDN host; `media_references` in the same transaction as any
attach; delete via reference count only (AD-11). Uploads presigned; processing via `media-process`.

## PF-11 Validation & contracts
zod DTOs in `@oggvo/shared` (ZodValidationPipe — no class-validator); every endpoint in Swagger;
web consumes only the generated client. Enums are pgEnums re-exported through shared — no
stringly-typed status codes, no bit-sum status filters (v1 social), no magic numbers (`-2` claims).

## PF-12 Public surfaces
State-mutating actions are POST (v1 unsubscribe was a GET — prefetchers unsubscribed people).
Captcha via a provider interface that is mockable in non-prod (v1's recaptcha only bypassed in
`testing`, blocking local dev). Rate-limit unauthenticated endpoints; uniform not-found/forbidden
responses (no account enumeration).

## PF-13 Read models over N+1
List endpoints denormalize hot aggregates (contact `last_activity_at`, campaign stat rollups)
maintained by the event write-path, instead of per-row correlated subqueries or per-row stat
fan-out calls. *v1 failures: contacts LastActivity subquery; one stats call per campaign row;
dashboard per-tab fan-out.*

## PF-14 Observability
pino structured logs (correlation id per request/job), OTel traces API→queue→gateway, Sentry.
Every queue: depth/lag/DLQ alarms. Every gateway: error-taxonomy counters per provider (a
mass-`auth_revoked` spike pages someone — that's the Zillow alarm).

## PF-15 Testing & definition of done
Per slice: Vitest unit (services), repository tests incl. tenant-scoping, Playwright e2e for the
primary flow, contract snapshot (OpenAPI diff check). Fixtures seed via `@oggvo/db` seeds. A story
is done when its ACs are covered by at least one automated test and the feature passed a real run
(`/verify`-style: exercised end-to-end, not just typechecked).

## PF-16 Feature flags & kill switches
`feature_flags` table (global + per-profile overrides) gates staged rollouts; every outbound
channel (email, SMS, social publish) has a kill switch checked by workers. Maintenance mode is
server-enforced (v1's was a client-side build flag).

## PF-17 Messaging compliance & suppression *(added 2026-07-06 gap pass)*
The legal layer for outbound, enforced **at the gateway/send-pipeline** so no feature can bypass it:
- **TCPA quiet hours:** SMS only 8am–9pm **recipient-local** time (best-known tz from area
  code/contact), independent of the profile's business-hours send window (PF-3). Blocked sends
  reschedule, with a ledger row saying why.
- **`STOP`/`HELP`/`START` keywords** handled globally on every inbound SMS before any
  auto-responder logic; `STOP` sets a channel-level opt-out honoured by *every* send path
  (campaigns, broadcasts, keywords, survey invites, test sends).
- **Global suppression list** (per profile + platform-wide): hard bounces, spam complaints, and
  unsubscribes from the SendGrid event webhook feed it automatically. *v1 failure: the
  `webhookEmail` suppression logic was commented out — complaints kept getting mail.*
- **Email deliverability:** SPF/DKIM/DMARC-authenticated sending domain(s); per-profile from-
  addresses only via verified identities; List-Unsubscribe headers on all bulk mail.
- Eligibility (the campaigns engine) consumes suppression/opt-out as an input — it never
  reimplements it.

## PF-18 Privacy, consent & retention *(added 2026-07-06 gap pass)*
We hold *other businesses'* customer PII, so data-subject duties are a platform feature:
- **Export & delete by contact:** one service that, given a contact/phone/email, exports or
  purges across contacts, messages, call recordings/transcripts, campaign events, ledger — the
  Meta data-deletion callback (compliance stories) is one caller of this, not a special case.
- **Call recording consent:** recording/transcription is off by default and gated per profile
  behind a consent-notice acknowledgment (two-party-consent states); recordings get a retention
  window (default 90 days) and auto-purge. Transcription providers (OpenAI) receive audio only
  under this gate — v1 sent recordings with no policy at all.
- **Retention windows** (configurable, enforced by a purge job): recordings, raw webhook payloads,
  delivery-ledger detail, soft-deleted rows past grace. Aggregates survive; raw PII doesn't.
- Logs/traces never contain message bodies, tokens, or contact PII (structured redaction).
