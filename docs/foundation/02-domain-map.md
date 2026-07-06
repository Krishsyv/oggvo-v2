# Domain map — bounded contexts, ownership, personas & RBAC

This resolves every "who owns this?" ambiguity flagged across `docs/feature-spec/*` and
`docs/*/user-stories.md`, so two modules never both believe they own a table or a flow.

## 1. Bounded contexts (API modules)

| Module | Owns (data) | Public surface | Queues it feeds |
| --- | --- | --- | --- |
| `auth` | users, auth_sessions, verifications, impersonation audit | login/reset/activate | email-send |
| `tenancy` | profiles + satellites, user_profiles (roles), teams/invites, manage_requests | — | email-send (invites) |
| `billing` ⚠ new | plans, subscriptions, entitlements | Stripe webhooks | — |
| `contacts` | contacts, tags, imports, contact_import_rows ⚠ | — | contacts-import, activator |
| `reviews` | reviews, review auto-share settings, review_insights/keywords | `/r/:shortname` funnel | review-puller |
| `funnel` | funnel_designs (jsonb, DB-canonical ⚠), links, link_masters | public funnel render | — |
| `campaigns` | campaigns, campaign_schedules, campaign_events, presets, **eligibility engine** | unsubscribe (POST ⚠) | sender, newsletter, email-send |
| `messaging` | conversations, messages, keywords, call_*, twilio numbers/creds | Twilio webhooks | sender |
| `compliance` | twilio_verifications, tollfree_* tables ⚠, consent/data-rights pages | TFV callbacks, FB data-deletion | twilio-tollfree-sync |
| `social` | social_accounts, social_posts (+media refs), social_campaigns, social_insights | Meta webhooks | social-publish, post-automator |
| `surveys` | surveys, questions, answers, tracking | `/s/:slug` | — (notify via notifications) |
| `widgets` | widgets (typed jsonb properties ⚠ — moved off profile) | iframe embeds, inquiry POST | — |
| `analytics` | monthly_targets; **read-only** over other domains (replica-ready) | — | — |
| `media` | media, media_references | presigned upload | media-process |
| `integrations` | oauth vault (encrypted), webhook endpoints, provider connections | all OAuth callbacks/webhooks | media-process, sender |
| `notifications` ⚠ new | notification prefs, push_channels, notification_deliveries ledger, nav badges | — | email-send, push |
| `admin` | newsletters (templates), push_campaigns, referrals directory | — | push, email-send |
| `support`/`tutorials` | help articles, tutorial catalog ⚠ | public help center | — |

⚠ = deviation from the older docs, justified below.

## 2. Ownership resolutions (the contested items)

Every row here was flagged as an open question or duplicate in ≥1 domain doc. Decision + why:

| Contested thing | Owner | Why |
| --- | --- | --- |
| Funnel editors + platform links (duplicated in `reviews` and `design-funnel` stories) | **`funnel`** | design-funnel already self-declares canonical; reviews keeps only the *feed/share* stories. Reviews' F1/F2/P1 epics are summaries — do not implement twice. |
| Funnel content fields (colors/copy/HappyMinimum on profile) + 3 overlapping design stores | **`funnel`**, single `funnel_designs` jsonb in DB (S3 only for rendered artifacts) | v1's three stores (legacy panel, S3 json, profile columns) is the bug. One canonical store, DB-first, versioned. |
| Auto-share settings (appears in reviews, settings, social) | **`reviews`** (it's a review-sharing policy); settings only *links* to it | Settings in v1 was a god-surface; v2 settings pages edit other modules' data through those modules' endpoints. |
| Campaign pause/resume + auto-activation config (contacts / settings / campaigns) | **`campaigns`** (pause), **`contacts`** (activation rules) | Pause acts on schedules (campaigns' data); activation acts on contact lifecycle. Settings/contacts UIs call these APIs. |
| Monthly targets (settings edits, dashboard reads) | **`analytics`** | Only consumer is reporting; settings page calls analytics' endpoint. |
| Toll-free admin flows (in `admin` and `compliance` stories) | **`compliance`** owns tables + state machine; `admin` consumes its service | Matches manage-admin doc's own note ("import, not redefine"). |
| Widget settings living on `profile` (stream/button/splash/schema) | **`widgets.properties` jsonb** | Profile god-table split is doctrine; widget config is widget data. Migration cost is nil greenfield. |
| Chat-widget config written via settings, rendered by widgets | **`widgets`** | Same rule. |
| Social-DM threads (FB/IG messenger) — no home in v2 `message_platform` enum | **`messaging`**; extend enum (`connect, sms, facebook, instagram, inquiry`) | Inbox is the product surface; provider ingest stays in `integrations` → hands to messaging service. |
| `scheduled_posts_automator` vs `social_campaigns` (two v1 systems) | **`social_campaigns` only** | One campaign engine; the automator's behaviour becomes a campaign type. Greenfield = don't port the fork. |
| Survey invites (EmailSurvey/SmsSurvey campaign types) | **`campaigns`** executes; `surveys` composes via campaigns' service API | One send pipeline (eligibility, tracking, unsubscribe) — never two. |
| Nav badges (global doc puts under notifications) | **`notifications`** | It's an attention feed over other domains — same read model as tab badges (BF-032). |
| Google link generation / place info | **`integrations`** (Google gateway) | It's a provider call; settings/tenancy store the result. |
| Voice/call webhooks in the integrations route group | **`messaging`** | Calls are a messaging feature; integrations only routes verified payloads. |
| Referral program (operator settings vs admin directory) | **`tenancy`** (profile_affiliate) + `admin` read view | It's profile config + a staff report, not its own engine yet. |
| Scheduled-invites count (admin stat with no page) | **`campaigns`** exposes stats endpoint; admin renders | Data belongs to schedules. |

## 3. Cross-domain contracts

Modules interact **only** via: (a) service interfaces (sync, in-process), (b) queues/outbox
(async), (c) the `campaign_events`/ledger tables (append-only facts). Direct repository imports
across modules are lint-blocked (AD-03).

Key contracts:

- **Eligibility engine (campaigns)** — *the* fix for v1's activator-vs-reconcile split-brain:
  `eligibleRecipients(campaignId)` = active ∧ opted-in ∧ tag-match ∧ reachable, recomputed
  idempotently on campaign create/update, contact change, and activation. One code path; both the
  activator worker and the API call it. (See CLAUDE.md fix-on-rebuild; this is a named engine so
  nobody reimplements it per entry point.)
- **Media references** — any module attaching media writes a `media_references` row in the same
  transaction; deletion goes through media's service only.
- **Provider connect/disconnect lifecycle (integrations)** — connect captures provider account/user
  id (v1 never did → Meta callback couldn't be mapped); reconnect **restores** the soft-deleted
  connection + children; disconnect = token revoke → grace-period soft-delete cascade → purge.
- **Send pipeline** — anything outbound (campaign, survey invite, review notification, broadcast)
  flows: eligibility/target → outbox → queue → provider gateway → `notification_deliveries` ledger.

## 4. Personas (canonical glossary)

Deduped from the 17 story files — these names are now the only ones stories may use:

| Persona | Means | v1 equivalent |
| --- | --- | --- |
| **Owner** | profile member with role `owner` | the account holder |
| **Operator** | any authenticated member acting in a profile (owner/admin/member) | "user" |
| **Member** | profile role below admin | — (Teams was a stub) |
| **Staff — Sales / Manager / Supervisor / Admin** | internal back-office ladder | account_type 1–4 |
| **Visitor** | anonymous public-page user | — |
| **Respondent** | anonymous survey taker | — |
| **Contact** | external person in the address book / texting the profile number | "recipient" |
| **Recipient** | unsubscribe-page visitor (email context) | — |
| **Data Subject** | FB data-deletion requester | — |
| **System** | workers/schedulers acting on behalf of a profile | bots |
| **Provider** | external OAuth/webhook service | — |

## 5. Target RBAC & entitlements model (replaces v1's 7 booleans)

```
users.staff_tier:  none | sales | manager | supervisor | admin      (back office)
user_profiles.role: owner | admin | member                          (per membership)
entitlements(profile): connect_sms, widgets, campaigns, reviews,
                       social, surveys, analytics, sms_credits/mo…  (from billing plan)
```

- Route guard order: JWT → TenantGuard (resolve profile) → staff/role guard → entitlement guard.
- v1 parity mapping: each old boolean becomes an entitlement (business capability), not a user
  flag; per-user restriction *within* a profile is the role. "Reps activate Connect" (BF-023) =
  role `admin` on the profile + profile entitled.
- Impersonation: staff-only, audited (`impersonation_events`), revertable, banner in UI.
- Suspension: enforced for **all** account types at request time (v1 only checked type 0).
