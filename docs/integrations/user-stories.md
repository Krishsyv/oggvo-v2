# Integrations & OAuth Vault — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/integrations-oauth.md`](../feature-spec/integrations-oauth.md).
> v2 target: module `apps/api/src/modules/integrations` (controller = OAuth callbacks + webhook
> receivers · service = per-provider connect/refresh/teardown · repository = token vault +
> `social_accounts`) · tables `social_accounts` + an **AES-GCM-encrypted OAuth token vault** (`@oggvo/db`) ·
> queues `media-process` (avatar download), `sender` / `email-send` (auto-reply), webhook-ingest · build phase 4.
>
> Companion docs: [activity-diagrams.md](./activity-diagrams.md) (flow diagrams) ·
> [../design-system/README.md](../design-system/README.md) (UI) · mockup
> [`../design-system/mockups/settings/integrations.html`](../design-system/mockups/settings/integrations.html).

**Personas**
- **Operator** — the everyday authenticated user of a profile (business owner / staff) who connects,
  re-authorizes, and disconnects third-party accounts from **Settings → Integrations**. All UI stories
  are this persona unless noted.
- **Provider** — the external service (Google, Meta, Square, Stripe, Shopify, Clio, FUB, …) that issues
  authorization codes, returns tokens, and later pushes webhook events back.
- **System** — the platform (API + workers + scheduler) acting on the Operator's behalf: it exchanges
  codes, encrypts and stores tokens, registers/tears down provider webhooks, refreshes tokens, and
  ingests inbound events.

**Global rules that apply to every story**
- Every connect/list/disconnect is scoped to the caller's active `profileId` (TenantGuard). No
  cross-tenant reads — no Operator can ever see or revoke another profile's connection.
- All OAuth endpoints require a valid access JWT (`apiAuth` equivalent). **Webhook receivers are public**
  and authenticate per-provider by signature/HMAC (see Epic E5); they must verify, enqueue, and return
  200 fast (thin receivers, no inline provider calls).
- **Token vault is encrypted at rest.** `access_token` / `refresh_token` / provider secrets are stored
  AES-GCM-encrypted (key from env/KMS), never in plaintext, never logged, never returned to the client.
  The list endpoint returns only non-secret connection metadata (`platform`, `page`, `pageId`,
  `status`, `lastSyncedAt`).
- **One connection per provider + page/merchant/realm.** Reconnecting deletes/upserts the prior row(s)
  for the same `profileId` + provider + external id before inserting.
- **Connect/disconnect have provider side effects.** Connecting may register external webhooks
  (PAM, Clio ×3, FUB ×12, Facebook per-page subscribe); disconnecting must tear them down
  (PAM unsubscribe, Clio delete, FUB delete-all, Stripe deauthorize, Google revoke).
- Timestamps stored UTC, rendered in the **profile timezone** (fix-on-rebuild: v1 hardcoded Pacific).

---

## Epic E1 — Browse & understand my integrations

### US-1.1 — View all integrations grouped by category
**As an** Operator **I want** to see every available integration grouped by purpose **so that** I can tell
at a glance what's connected and what I could add.
- **AC1** `GET /integrations/connections` returns my profile's connections (non-secret metadata only):
  `id, platform, page, pageId, status, lastSyncedAt`.
- **AC2** The page renders a category-grouped grid — **Reviews & Social** (Google Business, Meta/Facebook,
  Instagram, Twitter/X, LinkedIn), **Payments & Commerce** (Square, Stripe, Shopify), **CRM & Lending**
  (Clio, Follow Up Boss, LionDesk, Pre-Approve Me, QuickBooks), **Listings** (Zillow) — merging the
  catalog of available providers with my connected rows.
- **AC3** Each card shows a brand/letter logo, the provider name, a one-line description, a **status DOT
  badge**, and a primary action button (Connect / Manage / Reconnect).
- **AC4** Status tones: **Connected** = success (green), **Needs re-auth** = warning (amber),
  **Error** = error (red), **Not connected** = gray.
- **AC5** Empty/loading state shows skeleton cards; a banner explains the AES-GCM-encrypted token vault.

### US-1.2 — See connection health for a connected provider
**As an** Operator **I want** each connected card to show when it last synced **so that** I trust the data is fresh.
- **AC1** Connected cards show "Last synced {relative time}" derived from `lastSyncedAt`.
- **AC2** When a token has expired or its refresh failed, the card flips to **Needs re-auth** (warning)
  with a **Reconnect** button instead of **Manage**.
- **AC3** A connection whose webhook handshake or signature is failing surfaces as **Error** (red) with a
  short reason on hover/expand.
- **AC4** LinkedIn connections auto-mark **Needs re-auth** after 60 days or refresh-token expiry
  (parity with v1 `getSocials` deactivation rule), without silently disappearing.

---

## Epic E2 — Connect an account (OAuth flow)

### US-2.1 — Start an OAuth connect
**As an** Operator **I want** to click **Connect** and be redirected to the provider **so that** I can
authorize OGGVO to act on my behalf.
- **AC1** Clicking Connect requests the provider authorize URL (built server-side with the correct
  scopes + a signed `state`) and redirects the browser to the Provider.
- **AC2** Requested scopes match the provider's required set (e.g. Google `business.manage` +
  `userinfo.profile`; Meta the 7 page scopes + IG scopes; Square the CUSTOMERS/ORDERS/PAYMENTS set).
- **AC3** The `state` parameter binds the flow to my `profileId` and is verified on callback (CSRF guard).

### US-2.2 — Complete the callback and store an encrypted connection
**As the** System **I want** to exchange the returned code for tokens and persist them encrypted **so that**
the connection is usable without ever storing plaintext secrets.
- **AC1** The Provider redirects back to the v2 callback `GET /integrations/:provider/callback`
  (replacing v1 `GET /api/v2/oauth/<provider>`), carrying `code` (+ `merchant_id` for Clover, `realmId`
  for QuickBooks, `hmac`/`shop` for Shopify, `oauth_token`/`oauth_verifier` for Twitter, `token` for PAM).
- **AC2** The service exchanges the code for tokens, fetches the connected account's display name, and
  writes one `social_accounts` row + one **vault** row with `access_token`/`refresh_token`/`expiresAt`
  **AES-GCM-encrypted at rest**; typed columns replace v1's overloaded
  `AuthorizationSecret`/`AuthorizationID`/`SignatureKey` reuse.
- **AC3** Prior rows for the same `profileId` + provider + external id are deleted/upserted first
  (one connection per provider/page).
- **AC4** Shopify additionally verifies the `hmac` query param (SHA-256 of sorted params) before exchange;
  an invalid HMAC rejects the connect (fix-on-rebuild: v1 Shopify hard-coded a single shop — v2 stores the
  shop per connection).
- **AC5** Meta connect must have **all** required page scopes granted, else it fails with
  "Missing required permissions" and stores nothing.
- **AC6** On success the redirect page POSTs back / polls and the Integrations grid shows the card as
  **Connected** with a fresh `lastSyncedAt`.

### US-2.3 — Provider sub-selection (pages / locations / accounts)
**As an** Operator **I want** to pick which page/location/org to use **when** a provider exposes several
**so that** the right entity is connected.
- **AC1** Meta connect lists managed pages (`/me/accounts`) and, per page, discovers the linked
  `instagram_business_account`; each selected page → one `social_accounts` row (`platform=facebook`) and,
  if IG-scoped, a separate `platform=instagram` row sharing the page token.
- **AC2** LinkedIn lists member + admin'd organizations and saves one row per chosen account
  (`POST /integrations/linkedin/accounts`), then deletes the temporary token row.
- **AC3** Google lists accounts + locations and writes the chosen location's `pageId`
  (`accounts/<id>/locations/<id>`), review URI, and `place_id` onto the profile
  (`POST /integrations/google/location`).

### US-2.4 — Connect a non-OAuth provider (API key / lookup)
**As an** Operator **I want** to connect providers that don't use OAuth **so that** I can still harvest their contacts.
- **AC1** **Follow Up Boss**: I paste an API key (`POST /integrations/followupboss`); the System validates it
  (`GET /identity`), stores the key **encrypted** in the vault, and registers 12 webhooks
  (people/relationship/email/text/call/deal × Created/Updated) at the v2 webhook URL, skipping
  already-registered events.
- **AC2** **Zillow**: I provide a screen-name or NMLS id (`POST /integrations/zillow`); the System looks up
  the agent/lender (no token stored) and creates the connection + a review link.
- **AC3** A failed validation (bad API key, no matching Zillow profile) returns a field error and stores nothing.

### US-2.5 — Connect a payment processor on a current SDK
**As an** Operator **I want** to connect Square / Stripe / Clover **so that** their payment & order webhooks
harvest my customers as contacts.
- **AC1** Square/Stripe/Clover connect via OAuth and store merchant/account id as `pageId`
  + encrypted access/refresh tokens.
- **AC2** **Fix-on-rebuild:** v2 uses **current** payment SDKs (Stripe ≥ current major, Square ≥ current
  major) — not v1's `stripe/stripe-php ^10` / `square/square 17.1.0.20220120` pins.
- **AC3** Stripe disconnect deauthorizes via `OAuth::deauthorize`; the customer-name split must handle
  single-word and multi-word names without an undefined-index error (fix-on-rebuild).

---

## Epic E3 — Keep a connection alive (token refresh)

### US-3.1 — Refresh tokens before they expire
**As the** System **I want** a scheduled job to refresh tokens ahead of expiry **so that** connections don't
silently stop.
- **AC1** A scheduled refresh job (replaces v1's opportunistic inline refresh) finds vault rows whose
  `expiresAt` is within a lead window and calls the provider's refresh grant, re-encrypting the new tokens.
- **AC2** Google reuses/shares a refresh token across active connections with the same `user_id`; if none
  and no refresh token is returned, it revokes and marks the connection **Needs re-auth**.
- **AC3** Clio webhooks (30-day expiry) are renewed before they lapse (fix-on-rebuild: v1 had no visible
  renewal job — open question, see below).
- **AC4** A refresh failure (revoked/expired refresh token) flips the connection to **Needs re-auth**
  (warning) and surfaces a **Reconnect** CTA on the card — it does not delete the connection.

### US-3.2 — Re-authorize a degraded connection
**As an** Operator **I want** to click **Reconnect** on a warning/error card **so that** I can restore a
broken connection in one flow.
- **AC1** Reconnect re-runs the Epic E2 connect flow for that provider and overwrites the existing
  connection's vault row in place (same `id`, no duplicate).
- **AC2** On success the card returns to **Connected** and re-registers any provider webhooks that lapsed.

---

## Epic E4 — Disconnect & revoke

### US-4.1 — Disconnect a provider with full teardown
**As an** Operator **I want** to disconnect a provider **so that** OGGVO stops accessing it and external
webhooks are torn down.
- **AC1** `DELETE /integrations/connections/:id` (replaces v1 `DELETE /socials/:id`) re-checks ownership,
  then runs provider-specific teardown **before/while** soft-deleting the row.
- **AC2** Teardown per provider: Stripe → `OAuth::deauthorize`; Google → token revoke (only if no sibling
  connection shares the `user_id`); PAM → `Feed/Unsubscribe`; Clio → delete all registered webhooks;
  FUB → delete all 12 webhooks; Facebook → unsubscribe the page.
- **AC3** The vault row's encrypted secrets are removed; the connection no longer appears as connected and
  its card reverts to **Not connected** (gray).
- **AC4** Teardown is best-effort: a provider-side failure (e.g. token already revoked) is logged and the
  local disconnect still completes, so the Operator is never stuck with a zombie connection.

---

## Epic E5 — Inbound webhooks (signature-verified ingest)

### US-5.1 — Verify every inbound webhook signature
**As the** System **I want** to authenticate each webhook by its provider's signature scheme **so that** only
genuine provider events are processed.
- **AC1** `POST /webhooks/:provider` (replaces v1 `/webhook/<provider>/trigger`) verifies the provider
  signature before doing any work and rejects unsigned/invalid requests.
- **AC2** Scheme per provider: Stripe `constructEvent` w/ endpoint secret; QuickBooks `Intuit-Signature`
  HMAC-SHA256; FUB `FUB-Signature` HMAC-SHA256 over base64(body); Clio `X-Hook-Signature` per-webhook
  shared secret (first request handshake echoes `X-Hook-Secret`); Meta `x-hub-signature-256` HMAC-SHA256;
  Clover `X-Clover-Auth` equality; Twilio toll-free `X-Twilio-Signature`.
- **AC3** **Fix-on-rebuild:** Square, Twilio inbound-SMS, and Shopify signatures — disabled/absent in v1 —
  are **enforced** in v2 (Square uses current HMAC-SHA256 over the new webhook URL + body, not v1's SHA-1).

### US-5.2 — Ingest fast and asynchronously
**As the** System **I want** webhook receivers to enqueue rather than process inline **so that** I return 200
quickly and retries are safe.
- **AC1** After signature verification, the receiver enqueues the event (webhook-ingest / `media-process` /
  `sender`) and returns 200 immediately (fix-on-rebuild: v1 processed multiple provider calls inside the request).
- **AC2** Harvesting webhooks (Square, Stripe, Clover, Shopify, Clio, QuickBooks, PAM, FUB) resolve the
  customer and import it into the **contacts** table (`source` = provider), deduping phone/email per profile.
- **AC3** Meta (FB/IG) message webhooks write inbound chat to the **messaging** inbox and enqueue avatar
  download (`media-process`) + keyword auto-response (`sender`).
- **AC4** **Fix-on-rebuild:** add an event-id idempotency table so replayed events are rejected, not merely
  absorbed by recipient dedup (only v1's toll-free webhook was idempotent).

---

## Cross-cutting acceptance criteria

- **Tenancy:** ownership re-checked before connect, reconnect, and disconnect; webhook events resolve the
  owning profile from the external id (merchant/page/realm/account) and write only to that profile.
- **Secrets:** tokens/secrets are AES-GCM-encrypted at rest, never returned by `GET /integrations/connections`,
  never written to logs.
- **TLS:** all provider HTTP calls verify TLS (fix-on-rebuild: PAM Subscribe/Unsubscribe had
  `CURLOPT_SSL_VERIFYPEER=0` in v1).
- **Webhook registration is a connect side effect** and is torn down on disconnect (Epic E4).

## Fix-on-rebuild & open questions

**Fix-on-rebuild (do NOT reproduce v1):**
- Plaintext token storage in `social_stream` → AES-GCM-encrypted vault with typed columns.
- Disabled signature checks (Square, Twilio inbound SMS, Shopify) → enforce all; use current Square HMAC-SHA256.
- TLS verification disabled for PAM → re-enable.
- Stale payment SDKs (Stripe v10, Square 2022) → current majors.
- Stripe customer-name `explode(' ', …)` undefined-index → safe name parse.
- No event-id idempotency on harvesting webhooks → add a processed-key table.
- Synchronous in-request webhook processing → enqueue, return 200 fast.
- Shopify single hard-coded shop (`oggvoportal`) → per-connection shop.
- Twilio brand/campaign status webhook is a stub → implement (model after the toll-free handler).
- QuickBooks empty `catch` swallowing errors → log + surface.
- Heavy column overloading in `social_stream` → typed schema.
- No central token-refresh job → scheduled refresh (Epic E3).

**Open questions / parity risks:**
- **Token-vault migration:** mapping each provider's v1 field reuse (Twitter oauth secret, Clio per-hook
  secret map, PAM ref number) onto typed encrypted columns — some values have no clean home yet (schema gap).
- **Webhook re-registration on cutover:** PAM/Clio/FUB/Facebook webhooks point at v1 URLs; every active
  connection must be re-registered at v2 URLs (or run both during transition).
- **Clio 30-day expiry:** no visible v1 renewal job — confirm whether a cron renews webhooks before they lapse.
- **Provider availability:** Zillow Bridge, LionDesk, PAM, Clover may be dead/low-use — confirm before
  investing in full v2 parity (drop candidates).
- **Instagram coupling:** IG has no standalone connect; it depends entirely on the Facebook connect — decide
  whether v2 keeps the coupling.
- **Meta scope set:** connect enforces 7 page scopes but login requests a superset (messaging/IG) — confirm
  which set v2 requests to support both publishing and Messenger.
- **Calls (voice) webhooks** live in this route group but belong to a Calls feature — confirm spec ownership.

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-1.1 / US-1.2 | `GET /integrations/connections` |
| US-2.1 | `GET /integrations/:provider/authorize` |
| US-2.2 | `GET /integrations/:provider/callback` |
| US-2.3 | `POST /integrations/linkedin/accounts`, `POST /integrations/google/location` |
| US-2.4 | `POST /integrations/followupboss`, `POST /integrations/zillow` |
| US-2.5 | `GET /integrations/:provider/callback` (square/stripe/clover) |
| US-3.1 | scheduled refresh job (vault) |
| US-3.2 | `GET /integrations/:provider/authorize` (reconnect) |
| US-4.1 | `DELETE /integrations/connections/:id` |
| US-5.1 / US-5.2 | `POST /webhooks/:provider` |
