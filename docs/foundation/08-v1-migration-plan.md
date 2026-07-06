# v1 → v2 customer migration plan (MIGR epic — detailed design)

Detail layer for the MIGR epic (GO, 2026-07-06). `SCHEMA-REDESIGN.md` gives the column mapping;
this doc gives everything else: strategy, edge cases, in-flight state, cutover runbook, and
comms. Executed Phase 3 (pilot Dec 7–19) → January waves.

## 1. Strategy: per-profile freeze-and-cutover (no dual-write)

- Migration unit = **one profile** (tenant). Each profile is independently: frozen (v1
  read-only) → delta-synced → validated → cut over → observed → (rolled back if needed).
- **No dual-write period.** Dual-write across two schemas with different semantics (statuses,
  timezones, blobs) is where migrations die. Instead: short read-only window per profile
  (target < 30 min, off-hours in the profile's timezone), full stop of v1 bots for that profile.
- ETL is **idempotent and re-runnable** (upsert by `legacy_id`): a failed run is re-run, never
  hand-patched.
- Waves: **pilot** (2–3 internal/friendly profiles) → wave 1 (low-activity profiles) →
  waves 2+ (by activity band) → stragglers/suspended last.

## 2. Identity & URL preservation (the things that break silently)

| Thing | Rule |
| --- | --- |
| Primary keys | New v2 bigint identities. Every migrated table gets `legacy_id` (indexed, nullable) — provenance + idempotent upsert key + support forensics. |
| Profile `shortname` | **Preserve exactly.** Public funnel URLs (`/review/:shortname` → v2 `/r/:shortname`) are printed on QR codes, email signatures, and Google profiles in the wild. |
| Survey slugs | Preserve (`/s/:slug`). Same reason. |
| Widget embed snippets | v1 embeds point at v1 hosts with relative paths. v2 embeds are new (iframe). **v1 embed endpoints must keep serving** via redirect/shim until customers re-paste (tracked per profile in the cutover checklist). |
| Old email links | Already-sent campaign emails contain v1 tracker/unsubscribe/funnel URLs. Keep an **edge redirect map** on the v1 domain (portal.oggvo.com): `/review/:shortname` → v2 funnel, `/unsubscribe?id=` → v2 (GET shows confirm page, POST performs — PF-12), tracker pixels → 200 no-op after cutover. Run it ≥ 12 months. |
| Media URLs | v1 stored absolute `portal.oggvo.com/assets/media/...` URLs in DB rows and rendered HTML. ETL rewrites DB references to v2 CDN keys; the redirect map covers URLs baked into already-rendered content. |
| UUIDs | v1 rows with UUIDs (profiles, verifications) keep them as `public_id` where the type matches; otherwise minted fresh (nothing external references them). |

## 3. Entity-by-entity: edge cases the mapping table doesn't show

Ordered by migration dependency (parents first). All timestamps: v1 stored **Pacific wall-clock**
— convert `America/Los_Angeles` → UTC during ETL, honouring DST at the original instant.
`0000-00-00` and `1899`/`2022` template-default dates → `NULL`.

1. **Users** — SHA-256+salt (and legacy UTF-16LE variant) hashes **cannot convert** to argon2.
   Migrate the hash + salt + scheme flag into `users.legacy_password`; v2 login verifies legacy
   scheme once, then re-hashes to argon2id and clears it (upgrade-on-login — no forced resets,
   no mass password-reset email storm). Sessions are NOT migrated — everyone logs in fresh.
   The 7 permission booleans → per-profile role (owner for the profile creator, admin for
   others with full flags, member otherwise) + entitlements from the profile's plan (see #12).
2. **Profiles + satellites** — god-table split per SCHEMA-REDESIGN. Timezone: run the v2
   resolver on the address, but **keep v1's stored IANA value if valid** (customers may have
   corrected it). Legacy numeric SMS tz ids (5/9/11/15/30) → IANA.
3. **Contacts** (`invite_recipient`) — `Tags` CSV → `contact_tags` + assignments (preserve
   system tags `invalid`/`Bounced`/`LionDesk` as system-flagged). `CustomField` → jsonb.
   Status map: `Active→activated`, `Pending→pending`, `Deleted→soft-deleted`,
   **`Inactive` → `unsubscribed` if an opt-out/unsubscribe event exists, else `suppressed`**
   (the enum-mismatch flagged in the contacts spec — this is the decision). Bounced tag →
   suppression list entry (PF-17) as well as the tag.
4. **Campaigns** — bodies live in S3 (`email.html`/`design.json`): copy into v2 storage
   (DB-canonical jsonb + rendered HTML). Unlayer design JSON carries over as-is (AD-20).
   Normalize the zero/1899 dates. `IsTest` rows: migrate flagged (BF-010 exclusion depends on it).
5. **Campaign schedules (in-flight!)** — do **NOT** row-copy `invite_scheduler`. After contacts
   + campaigns land, **recompute schedules with the v2 eligibility engine**, then reconcile:
   drip steps already sent in v1 (from tracker/history) are marked consumed so nobody gets
   step 1 twice. This also *heals* v1's known blind spot (contacts activated before a campaign
   existed were never scheduled) — expect and document a small "newly eligible" cohort per
   profile; surface it in the validation report, don't silently send (grace flag: new-eligible
   start at the next step window, and the profile owner is notified).
6. **Reviews** — preserve `SocialID` (provider review id) for dedupe against the first v2 pull.
   `SocialThreshold` star values are stored **off-by-one** (star−1) — normalize. Manually-added
   reviews have `LinkID` pointing at linkmaster (not a stream) — map to source platform, not to
   a connection. `PermanentDelete=1` → soft-deleted.
7. **Social accounts + OAuth tokens** — plaintext token columns → AES-GCM vault. **Expect
   partial token survival:** Google refresh tokens survive; Facebook long-lived page tokens
   usually survive; LinkedIn (60-day) and Twitter oauth1 pairs may not. Post-migration job runs
   a health check per connection (PF-5 taxonomy) and flags `reconnect required` — the owner gets
   one consolidated "reconnect these accounts" notification, not a silent failure. Soft-deleted
   streams (`DeleteDate`) migrate as disconnected-in-grace with children soft-deleted (PF-2).
8. **Conversations** (`messaging.conversation` serialized blob) — parse into `messages` rows.
   Known landmines: v1's `utf8_encode` emoji mangling (best-effort repair: double-encoded UTF-8
   detected and fixed, unrecoverable bytes kept verbatim + row flagged), inconsistent
   direction/timestamp fields across blob generations. Keep the raw blob in
   `conversations.legacy_blob` for one year — support will need it.
9. **Twilio numbers/subaccounts** — numbers **stay on their existing Twilio subaccounts**
   (no porting). Migrate SID/creds into the vault; repoint each number's inbound webhook URLs
   to v2 (per-subaccount signature validation — PF-8). Dead subaccount refs (the v1
   already-closed deadlock) are detected and cleared, freeing those profiles to re-provision.
10. **Media files** — copy S3-Files mount objects → v2 S3 bucket (new key scheme), write `media`
    rows + `media_references` discovered from usage (social_post_media, campaign ImageID, funnel
    assets). Missing objects (the known prod/dev data gap) → row flagged `file_missing`, listed
    in validation report; references kept so nothing else breaks.
11. **Surveys** — questions' TitleCase types → v2 lowercase enum. `Options.Flow` (branching)
    migrates into the jsonb but is inert (linear rendering — register decision). Tracking
    counters copied as-is; the double-ViewsCount inflation is historical fact, not repairable —
    note in the analytics migration caveats.
12. **Plans/entitlements (net-new in v2)** — v1 has no plans. Each migrated profile gets a
    **grandfathered plan** assembled from its permission flags + SMS limit, `legacy_grandfathered`
    marker, no Stripe subscription. Sales converts them to real plans commercially later; the
    entitlement guards work from day one either way.
13. **Not migrated** (decision, not oversight): request logs/OpenSearch, `login_history`,
    `review_backup`, CI migration bookkeeping, DynamoDB import-row history (summary counts only
    → `contact_imports`; per-row detail expires with v1), push device registrations (re-register
    on next portal login — tokens are stale anyway), v1 sessions/JWTs.

## 4. Webhook & provider re-registration checklist (per profile at cutover)

| Provider | Action |
| --- | --- |
| Twilio | Repoint number inbound SMS/voice + status callbacks to v2 (per subaccount) |
| Meta (FB/IG) | Update app webhook subscriptions (messenger, data-deletion callback) — app-level, once per wave |
| Stripe/Square/Shopify/Clover | Recreate endpoint registrations at v2 URLs; verify signatures live (they were disabled in v1!) |
| Clio | Re-subscribe (30-day expiry) + schedule the refresh job |
| FUB / PAM / LionDesk | Re-register if the keep/kill decision kept them; else disconnect cleanly |
| SendGrid | Event webhook → v2 (feeds PF-17 suppression); domain auth already done at M2 |

## 5. Cutover runbook (per profile)

1. **T-7d:** customer notice (see §7). Pre-migrate dry run against latest snapshot; validation
   report reviewed; reconnect-required list previewed.
2. **T-0:** stop v1 bots for the profile; set v1 profile read-only (maintenance flag).
3. Delta ETL (changes since dry run) → full validation gate (§6). Fail → unfreeze v1, reschedule.
4. Repoint webhooks (§4); enable v2 sends for the profile; portal access switched (v1 login for
   this profile shows "moved" + link).
5. **T+0 to T+7d observation:** v2 sends on, v1 kept read-only (rollback = re-enable v1 writes +
   disable v2 sends + repoint webhooks back — decision within the window, not after).
6. **T+7d:** rollback window closes; v1 profile data enters the retention schedule.

## 6. Validation gate (blocks cutover, per profile)

- Row-count parity per entity (with expected-delta explanations, e.g. dropped dead rows).
- Aggregate spot-checks: review count/avg rating, contact status distribution, campaign send
  totals, conversation/message counts, media object count vs S3 listing.
- **Ten-record deep diff** per major entity (randomized, field-level).
- Functional smoke on staging clone: login as owner (legacy password), open funnel URL by
  shortname, send test campaign to a seed contact, reply in inbox.
- Newly-eligible schedule cohort (§3.5) reviewed and acknowledged by a human.
- Report persisted per profile (`migration_reports`) — the MIGR-1.4 dashboard reads these.

## 7. Customer communications

- **T-7d email:** what's changing, the read-only window (date/time in *their* timezone), what
  carries over (everything), what they must do (usually: nothing; possibly: reconnect listed
  social accounts), password unchanged.
- **T+0 email:** you're on v2 — new portal URL, the reconnect list if any, support contact.
- Support macro + FAQ page; the delivery ledger (PF-6) means "did my campaign send during
  migration?" is answerable in one query.

## 8. Build plan & ownership (fits the Phase-3 schedule in 06)

| When | What |
| --- | --- |
| Sprints 5–6 (slack) | ETL skeleton per entity from SCHEMA-REDESIGN (Claude generates mapping code; humans review edge cases in §3) |
| Release week (Dec 1–4) | Dry run against v1 prod snapshot on staging; validation diffs demoed at M2 |
| Phase 3 (Dec 7–19) | Pilot cohort end-to-end incl. rollback drill on one profile (deliberately roll one back to prove the path) |
| January | Waves by activity band; v1 decommission plan after last profile + redirect-map handover |

**Prerequisite decisions owed before pilot:** final keep/kill list for legacy providers (§4);
v1 domain redirect ownership (who hosts portal.oggvo.com after decommission); retention length
for `legacy_blob`/v1 snapshot (default proposal: 12 months).
