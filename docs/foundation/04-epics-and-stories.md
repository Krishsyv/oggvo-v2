# Epic register & user stories

This is the **single backlog index**. It (a) normalizes story IDs, (b) maps every existing story
file, (c) folds in all 51 sprint-issue items (BF-###/TU-###), and (d) writes full stories for the
features that exist nowhere else (billing, teams, onboarding backend, TFV, notifications hub, AI
templates, new review platforms).

## Story ID convention (normalization)

**Problem being fixed:** 8 domains reuse bare `US-1.1` (collision acknowledged in the design-system
README); epic prefixes are inconsistent (`Epic E1` vs `A1/C1/M1…`); 4 files carry two ID schemes.

**Rule:** the global id of any story is **`<EPIC>-<n.m>`**, where `<EPIC>` is the epic key below.
Existing files stay as-is (they're the detail layer); referencing them from anywhere else uses the
qualified form, e.g. `CONT-1.1` = `docs/contacts/user-stories.md US-1.1`. New stories are written
with qualified IDs from the start. Mockup bindings use `data-story="CONT:US-1.1"` (existing
convention, kept).

Personas: only the canonical glossary in [`02-domain-map.md §4`](02-domain-map.md). Every story
inherits the PF standards in [`03-platform-foundations.md`](03-platform-foundations.md); ACs don't
restate them.

## Epic register

Phases refer to the roadmap releases (R1–R5) in [`05-roadmap.md`](05-roadmap.md).

| Epic | Name | Module | Story source | Sprint issues folded | Release |
| --- | --- | --- | --- | --- | --- |
| **AUTH** | Identity & sessions | auth | `docs/auth/user-stories.md` E1–E3 | BF-030 (password rules shown up-front + special chars) | R1 |
| **TEN** | Tenancy & profiles | tenancy | `docs/settings/user-stories.md` E1–E2, E8 | BF-045 (zipcode input bug) | R1 |
| **TEAM** | Teams & per-profile roles ⚠ new | tenancy | §TEAM below (+ settings E3 skeleton) | BF-023 (reps activate Connect) | R2 |
| **BILL** | Billing, plans & entitlements ⚠ new | billing | §BILL below | — (Dustin: Gold/Platinum placeholder) | R2 |
| **ONBD** | Onboarding wizard (real backend) ⚠ new | tenancy/auth | §ONBD below (+ auth addendum) | — | R3 |
| **CONT** | Contacts | contacts | `docs/contacts/user-stories.md` E1–E7 | BF-015 (preserve scroll/state on save), BF-024 (tag-save failure), BF-050 (activate from any status), BF-014 (page size), BF-012 (campaign history in activity), BF-037 (pause = real halt) | R1 |
| **REV** | Reviews feed & sharing | reviews | `docs/reviews/user-stories.md` R1–R6 | BF-026 (correct template selection), BF-025 (grammar), BF-035 (Schedule vs Post Now), BF-036 (editable default share message), BF-004 (color wheel), BF-049 (threshold in content planner), BF-048 (auto-share template round-robin), BF-006 (calendar view), BF-042 (GigSalad manual platform) | R1–R2 |
| **FUN** | Design & funnel | funnel | `docs/design-funnel/user-stories.md` D1–D3 (canonical; reviews F1/F2/P1 are summaries — don't double-build) | BF-002 (hide platforms), BF-003 (header/footer colors), BF-028 (native video upload) | R1 |
| **MEDIA** | Media library | media | `docs/media/user-stories.md` M1–M4 | — | R1 |
| **CAMP** | Campaigns & eligibility engine | campaigns | `docs/campaigns/user-stories.md` C1–C6 | BF-038 (template default dates), BF-027 (editable Review-Us button), BF-007 (prominent tab indicator), BF-010 (test-send exclusion from analytics) | R2 |
| **MSG** | Connect messaging & calls | messaging | `docs/messaging/user-stories.md` M1–M7 | BF-022 (test SMS via sandbox mode), BF-031 (QR with logo) | R2 |
| **CMPL** | Twilio A2P + TFV + consent pages | compliance | `docs/compliance/user-stories.md` E1–E6 + §TFV below | — | R2–R3 |
| **SOC** | Social publishing & planner | social | `docs/social/user-stories.md` | BF-044 (retry failed post), BF-043 (edit scheduled/pending post), BF-041 (delete with provider-side delete + honest messaging) | R3 |
| **SUR** | Surveys | surveys | `docs/surveys/user-stories.md` E1–E5 | BF-009 (descriptions optional), BF-008 (editable start button), BF-040 (thank-you URL cleanup), BF-011 (completion notification), BF-039 (prebuilt templates) | R3 |
| **WID** | Widgets | widgets | `docs/widgets/user-stories.md` E1–E6 | — | R3 |
| **ANLY** | Analytics & dashboard | analytics | `docs/analytics/user-stories.md` | BF-013 (capitalize Overview), BF-032 (tab badges), BF-029 (collapse repeated activity), BF-010 (test-send filtering) | R3 |
| **INT** | Integrations, OAuth vault & webhooks | integrations | `docs/integrations/user-stories.md` E1–E5 | BF-046 (Google first-connect always fails once — root-cause) | R2–R4 |
| **PLAT** | New review platforms ⚠ new | integrations/reviews | §PLAT below | BF-016 WeddingWire, BF-017 The Knot, BF-018 Houzz, BF-019 RateMyAgent, BF-020 Avvo, BF-021 Homes/Angie, BF-034 Redfin | R4 |
| **AI** | AI template & content generation ⚠ new | reviews/campaigns | §AI below | BF-005 (AI/custom templates), BF-047 (more templates) | R4 |
| **NOTIF** | Notifications hub ⚠ new | notifications | §NOTIF below (absorbs global nav-badges + settings E4) | BF-032 (badges), BF-011 (survey notify) | R2 |
| **ADMIN** | Back office | admin | `docs/admin/user-stories.md` A1–A12 | — | R2–R4 |
| **HELP** | Support & tutorials | support/tutorials | `docs/support/user-stories.md`, `docs/tutorials/user-stories.md` | BF-001 (categories + search), BF-033 (contextual prompts), TU-001–TU-021 (content production) | R3–R4 |
| **REF** | Referral program | tenancy/admin | `docs/referrals/user-stories.md` RF1–RF2 | — | R4 |
| **AUDIT** | Audit trail ⚠ new (PF-19) | platform/admin | §AUDIT below | — | R0 (capture) + R2 (viewer) |
| **MIGR** | v1 data migration ✅ GO (decided 2026-07-06) | (ETL) | §MIGR below | — | Phase 3 (Dec) |

**Deliberately dropped from v1** (greenfield decision — don't port): story composer stub, Buttons
editor, legacy sync CSV upload, `scheduled_posts_automator` fork, newsletter/reviewMe widget stubs,
survey Logic tab *unless* PMs re-commit (the builder persisted `Flow` that the renderer ignored —
ship linear, decide branching later), Contact-Advisor mailto (replaced by HELP contact flow).

---

## New-epic stories (features with no existing story file)

### §TEAM — Teams & per-profile roles

> Everything below is net-new: v1's Teams tab was commented-out markup and `PermissionInvites`
> enforced nothing (Dustin report). Depends on AD-09 role model.

- **TEAM-1.1 — Invite a teammate.** As an **Owner** I want to invite someone by email with a role
  (`admin | member`) so that my staff can work in the profile.
  AC1 invite creates a pending `user_profiles` row + emailed accept link (verification token, 7-day
  TTL); AC2 re-invite replaces the token; AC3 invitee with an existing account joins on accept,
  otherwise goes through account activation first; AC4 ledger row per invite email (PF-6).
- **TEAM-1.2 — Accept an invite.** As an invited **Visitor** I want the link to walk me to a
  working portal so joining is one sitting. AC1 expired/used tokens show a distinct state; AC2 on
  accept, the profile appears in my switcher.
- **TEAM-1.3 — Manage members.** As an **Owner** I want to list members, change roles, and remove
  members. AC1 cannot demote/remove the last owner; AC2 removal revokes that user's sessions for
  this profile; AC3 role changes take effect on next request (guard reads DB, not JWT claims).
- **TEAM-1.4 — Role enforcement.** As an **Operator** with `member` role I must not perform
  admin-only actions (billing, team management, deleting the profile, activating Connect).
  AC1 server-enforced via `@RequireRole`; AC2 UI hides what the API forbids (never the reverse).
- **TEAM-1.5 — Reps can activate Connect (BF-023).** As a profile **admin** (non-owner) I can
  complete Connect/SMS activation. AC1 gated by role + entitlement, not owner-ness.

### §BILL — Billing, plans & entitlements

> Net-new: v1 had hardcoded "Gold Plan" strings, manual email upgrades, no subscription tables.

- **BILL-1.1 — Plan catalog.** As **Staff-Admin** I define plans (name, price, entitlement set,
  limits e.g. SMS credits/mo) synced to Stripe Products/Prices. AC1 plans versioned; existing
  subscribers keep their version until migrated.
- **BILL-1.2 — Subscribe / upgrade / downgrade.** As an **Owner** I pick a plan and pay via Stripe
  Checkout/Billing portal. AC1 entitlements update within 1 min of the Stripe webhook; AC2
  downgrade schedules at period end; AC3 all transitions recorded (plan-change history — the audit
  Dustin asked for and v1 couldn't answer).
- **BILL-1.3 — Entitlement gating.** As the **System** I enforce entitlements on every gated
  route/worker. AC1 `@RequireEntitlement` guard + worker-side check before spending provider money;
  AC2 over-limit SMS sends are queued-not-dropped with an upgrade prompt (configurable).
- **BILL-1.4 — Dunning & suspension.** As the **System** I downgrade gracefully on payment failure
  (Stripe smart retries → grace state → feature suspension), never deleting data.
- **BILL-1.5 — Staff override.** As **Staff-Manager+** I can grant a comp/trial entitlement with
  reason + expiry, audited. (Replaces v1's "manually flip permission flags" workflow.)

### §ONBD — Onboarding wizard (real backend)

> v1's 6-step wizard was a static mockup: no API, no persistence. Auth stories cover the shell;
> these add the missing substance.

- **ONBD-1.1 — Resumable setup state.** As a **New Owner** my wizard progress persists
  (`profile_onboarding` row: step, answers jsonb) so I can leave and resume. AC1 partial answers
  saved per step; AC2 completing marks the profile onboarded and stops re-prompting.
- **ONBD-1.2 — Company details step** writes real `profiles` + satellite fields (address triggers
  timezone resolution, PF-3). **ONBD-1.3 — Questionnaire step** persists answers and (AC2) maps
  selected goals to recommended feature checklists on the dashboard. **ONBD-1.4 — Team step**
  reuses TEAM-1.1 invites. **ONBD-1.5 — Connect-accounts step** reuses INT OAuth flows, showing
  connect state inline. **ONBD-1.6 — Automation step** configures auto-activation (CONT E7) and
  default campaign activation with plain-language copy of what will send (the BF-037 confusion
  started here).
- **ONBD-1.7 — Default content seeding.** As the **System**, on profile creation I seed default
  campaigns (Initial/Follow-up/Final email + SMS), a funnel design, and messaging settings — in DB
  (not S3 copies), idempotently.

### §TFV — Toll-free verification (decision: Twilio Embeddable, AD-15)

> Adopted from `Downloads/Oggvo/twillio-tollfree/user-story.md` (embeddable variant) — moved here
> so the repo owns it. The four `twilio_tollfree_*` tables + `profiles.tollfree_*` columns are a
> **blocking schema gap** (compliance stories already flag it).

- **TFV-1.1 — Start verification.** As an **Owner** (eligible + feature-flagged) I start TFV and
  get Twilio's embedded form. AC1 API initializes inquiry → `inquiry_id` + session token; AC2
  ineligible profiles never see the entry point.
- **TFV-1.2 — Resume.** As an **Owner** I resume a started verification where I left off (session
  token re-issued).
- **TFV-1.3 — Status tracking.** As an **Operator** I see normalized status
  (`draft → submitted → needs_correction → approved | rejected`) with history timeline. AC1 status
  synced by webhook **and** reconciling poll job (`twilio-tollfree-sync`) — webhook is a hint, poll
  is truth (v1's event streams were broken; PF-8).
- **TFV-1.4 — Correct & resubmit.** As an **Owner** I see rejection reasons and re-enter the
  embedded form to fix them.
- **TFV-1.5 — Admin panel.** As **Staff-Manager+** I view any profile's TFV state, assign a
  toll-free number *before* verification, trigger manual sync, and see rejection/status history.
- **TFV-1.6 — Sender activation.** As the **System** I only enable toll-free sending when status =
  approved and a number is assigned; deactivation resets local state even if Twilio-side cleanup
  fails (the v1 subaccount-close deadlock, CLAUDE.md).

### §NOTIF — Notifications hub

> Consolidates: nav badges (global), review-alert emails + push devices (settings E4), survey
> completion (BF-011), tab badges (BF-032), and the delivery ledger (PF-6) behind one module.

- **NOTIF-1.1 — Preferences.** As an **Operator** I manage notification recipients/channels per
  event type (new review, negative review, survey completed, failed post, inbound SMS). AC1
  per-profile, multiple emails; AC2 push devices registered/revoked server-side (no browser-
  fingerprint cookie hack).
- **NOTIF-1.2 — Event fan-out.** As the **System**, domain events (review.created,
  survey.completed, post.failed…) fan out to subscribed channels through the send pipeline with a
  ledger row each. AC1 a failed channel never blocks the others (PF-7).
- **NOTIF-1.3 — Nav badges.** As an **Operator** I see per-tab attention counts (unanswered
  reviews, failed posts, recent completed surveys) totalled on my profile switcher. AC1 single
  polling interval, torn down on unmount (BF-032 regression test).
- **NOTIF-1.4 — Delivery visibility.** As **Staff-Support** I can answer "did profile X get their
  review notification and why not" from the admin ledger view in one lookup (the 2026-06-24
  handoff scenario, closed forever).

### §PLAT — New review platforms (sprints 6–7)

> Pattern epic: each platform is the same story set through the provider-gateway seam (AD-13).
> Platforms: WeddingWire, The Knot, Houzz (R4a) · RateMyAgent, Avvo, Homes.com/Angie, Redfin (R4b).
> ⚠ Reality check first: several have no public review API — the discovery story gates the rest.

- **PLAT-0.1 — API feasibility spike (per platform).** As **Staff-Admin** I need a written
  finding: official API / partner program / compliant scrape / not feasible — before committing UI.
  AC1 rate limits, auth model, and review-field coverage documented; AC2 go/no-go recorded here.
- **PLAT-1.1 — Connect account.** Operator connects/disconnects platform X (INT lifecycle,
  PF-5/PF-8). **PLAT-1.2 — Pull reviews.** System pulls on cadence into the unified feed (dedupe
  by provider review id). **PLAT-1.3 — Feed parity.** Reviews from X filter/search/share like any
  other source; manual-add lists X too (generalizes BF-042's GigSalad ask). **PLAT-1.4 — Funnel
  link.** X joins the funnel platform catalog (FUN links).

### §AI — AI template & content generation

- **AI-1.1 — Custom review templates (BF-005/BF-047).** As an **Operator** I create my own share
  templates (upload/design) alongside stock ones; auto-share round-robin (BF-048) draws from my
  selected set. AC1 templates versioned media assets (PF-10) rendered by the render worker (AD-12).
- **AI-1.2 — AI-generated share copy.** As an **Operator** I get generated post text per review
  (tone presets, edit-before-post always). AC1 provider behind a gateway (model swappable); AC2
  per-profile monthly generation quota (entitlement); AC3 nothing auto-publishes without the
  existing scheduling/approval path.
- **AI-1.3 — AI usage metric.** Dashboard "AI Used" reads a real counter (v1 hardcoded 0%).

### §AUDIT — Audit trail (PF-19; design informed by shopschool's audit module, adapted)

> "This user did this at this time." Capture ships in R0 (it must exist before the first feature
> writes data); the viewer UI ships with ADMIN in R2. Requested 2026-07-06.

- **AUDIT-1.1 — Automatic capture.** As the **System** I record an `audit_events` row for every
  mutating API action without per-feature code. AC1 interceptor derives profile, actor,
  **impersonator when staff act as a user**, IP, user-agent from request context; AC2 `changes`
  holds changed-fields-only before/after diffs; AC3 secrets/PII-bodies never captured (PF-18
  redaction); AC4 the audit row commits in the same transaction as the data change.
- **AUDIT-1.2 — Domain & worker events.** As the **System** I record events the interceptor can't
  see: login/logout, impersonate start/stop, exports/imports, bulk ops, campaign/broadcast sends,
  provider connect/disconnect — and worker actions as `actor_type=system` with the job id.
- **AUDIT-1.3 — Entity history.** As an **Owner** I see "who changed what" on a record (contact,
  campaign, settings) as a timeline. AC1 tenant-scoped (my profile only); AC2 field-level diffs
  rendered human-readably.
- **AUDIT-1.4 — Admin activity search.** As **Staff-Support** I filter events by profile, actor,
  action, entity, and date range to answer support forensics in one query. AC1 impersonated
  actions clearly attributed to the staff member; AC2 export of a filtered set.
- **AUDIT-1.5 — Retention & archival.** As the **System** I archive events past the retention
  window (default 24 months) to S3 and prune the hot table (Stage-B partition-ready).

### §MIGR — v1 data migration (**GO — decided 2026-07-06**, scheduled Phase 3)

> **Decision: v1 customers WILL migrate to v2.** ETL build starts in Sprint 8 slack / release
> week, pilot cohort migrates in Phase 3 (Dec 7–19), remaining waves through January. See
> `06-team-plan-90d.md` Phase 3. **Detailed design: [`08-v1-migration-plan.md`](08-v1-migration-plan.md)**
> (strategy, edge cases, runbook); column mapping: `docs/SCHEMA-REDESIGN.md`.

- **MIGR-1.1 — ETL per profile.** As **Staff-Admin** I migrate a selected v1 profile into v2
  (idempotent, re-runnable): profile + satellites, users/memberships, contacts (+tags CSV→m:n),
  reviews, campaigns (+S3 bodies→DB), conversations (blob→rows), social accounts (+tokens →
  encrypted vault), surveys, media (files→S3 keys + references). AC1 per-entity counts reported;
  AC2 v1 timezone-encoded datetimes (Pacific wall-clock) converted to true UTC; AC3 legacy
  statuses/enums mapped per SCHEMA-REDESIGN with an exceptions report, nothing silently dropped.
- **MIGR-1.2 — Validation gate.** As the **System** I diff v1-vs-v2 aggregates per migrated
  profile (contact/review/campaign counts, latest activity) and block go-live on mismatch.
- **MIGR-1.3 — Cutover switches.** As **Staff-Admin** I freeze the v1 profile (read-only),
  re-point provider webhooks/OAuth (re-registration list from the integrations spec), and
  activate v2 sends — per profile, reversible for the first N days.
- **MIGR-1.4 — Wave tooling.** Migration runs in cohorts (pilot → waves) with a dashboard of
  per-profile state (`pending / migrated / validated / cut-over / rolled-back`).

---

## Traceability — sprint-issues → epics

All 30 BF bugs/features and 21 TU tutorials are mapped in the register above; the
"Dev Completed - need testing" items from the sprint sheet (BF-038, BF-044, BF-049, BF-050, BF-022,
BF-023, BF-003, BF-008, BF-027, BF-040, BF-002, BF-004, BF-011, BF-012, BF-014, BF-028, BF-032,
BF-035, BF-037, BF-033) are **v1-branch work**; in v2 each becomes an acceptance criterion of its
epic (built correct from the start), not a patch. TU-001–021 are content production tracked under
HELP, unblocked once each feature's UI is stable (R3+).
