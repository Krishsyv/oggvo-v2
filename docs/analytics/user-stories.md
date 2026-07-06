# Analytics & Dashboard — User Stories & Acceptance Criteria (per tab)

> Source of truth: [`docs/feature-spec/analytics-dashboard.md`](../feature-spec/analytics-dashboard.md)
> + v1 source `apps/portal-frontend/pages/{dashboard,analytics,activity}/*`.
> v2 target: module `apps/api/src/modules/analytics` (read-only reporting) · tables `monthly_targets`,
> `social_insight`, `keyword_insight` + cross-domain reads · queue `—` · build phase 3.
>
> Companion: [activity-diagrams.md](./activity-diagrams.md) · mockups (one screen per tab):
> `dashboard-funnel.html`, `dashboard-social.html`, `dashboard-connect.html`, `dashboard-activity.html`,
> `dashboard-campaigns.html`, `dashboard-profiles.html`, `analytics-google.html`, `analytics-keywords.html`
> in [../design-system/mockups/](../design-system/mockups/).

**Personas**
- **Operator** — authenticated profile user viewing their own analytics.
- **Connect Operator** — Operator with the `sms` permission (unlocks the Oggvo Connect tab).
- **System** — read-only aggregation service joining across reviews/posts/messaging/campaigns tables.

**Global rules**
- Every query is scoped to the active `profileId`; switching profile re-scopes all data.
- **Monthly targets are month-granular** — one `monthly_targets` row per profile per `YYYY-MM`; upsert is idempotent.
- **Conversion %** = `reviews_count*100/requests_count` (int, 0 when no requests). Goal % = `count*100/target` (0 when target unset).
- **Connect tab is gated** behind the `sms` permission — otherwise an Upgrade-Plan prompt + a lock icon on the tab.
- **Fix-on-rebuild:** v1 inverts `start_at`/`end_at` (uses `<= start_at`, `>= end_at`) and interpolates dates into raw SQL — v2 normalizes to `from <= date <= to` with parameterized queries, and standardizes one timezone boundary (UTC store, profile-tz render).

---

## Tab 0 — Dashboard shell ("Your Overview")

### US-D0.1 — Navigate between dashboard tabs
**As an** Operator **I want** a tabbed overview **so that** I can move between funnel, social, messaging, and activity views.
- **AC1** A horizontal tab nav lists **Review Funnel** (`/dashboard`), **Social Media** (`/dashboard/social-media`), **Oggvo Connect** (`/dashboard/connect`), **Activity** (`/dashboard/activity`); the active tab is underlined in primary.
- **AC2** On mobile the tabs collapse into a `<select>` that routes on change.
- **AC3** The **Oggvo Connect** tab shows a lock icon when the user lacks the `sms` permission.
- **AC4** The shell shows a PageHeader "Your Overview" + the profile name, a Contact-Advisor action, and a Twilio onboarding banner.
- **Note:** Campaigns and Profile-Optimization tabs exist in v1 but are commented out of the shell — see Tabs 5–6 (decide keep/drop in v2).

---

## Tab 1 — Review Funnel (`GET /analytics/dashboard/funnel`)

### US-D1.1 — See request → review conversion vs goals
**As an** Operator **I want** Requests, Reviews, and Conversion KPIs against my monthly goals **so that** I know if I'm on track.
- **AC1** A goals header shows a **month picker** (`goalDate`) and a **Modify Goals** button.
- **AC2** **Requests** card: `requests_count` / `target.requests`, % to goal, remaining count; actions "Learn More" + "Send Request" → `/campaigns`.
- **AC3** **Reviews** card: `reviews_count` / `target.reviews`; actions "Learn More" + "See Latest Reviews" → `/reviews`.
- **AC4** **Conversion** card: `reviews*100/requests` with tiered progress color (<50 amber, <100 blue, else green); action "Reach Advisor" (mailto support).
- **AC5** Changing the month refetches `GET /analytics/dashboard/funnel?month=`. Empty → cards show 0 / 0%.

### US-D1.2 — Explore the reviews overview charts
- **AC1** A "Reviews Overview" panel shows a date-range filter + a computed range label.
- **AC2** Three charts: a **funnel/overview** time-series (`…/funnel/chart?from=&to=`), a **reviews-by-channel** doughnut (top 4 sites + Other, `…/reviews/by-channel`), and a **Google rating distribution** (`…/reviews/rating-distribution`).

### US-D1.3 — Modify monthly goals
- **AC1** The Modify-Goals modal has number inputs per goal (requests step 25, reviews step 25); Save `PUT /analytics/monthly-targets?month=` then refetches stats + toasts. Idempotent per `(profile, month)`.

---

## Tab 2 — Social Media (`GET /analytics/dashboard/social`)

### US-D2.1 — Track posting cadence vs goals
**As an** Operator **I want** posts and reviews-posted progress **so that** I keep my social cadence on target.
- **AC1** Goals header (month picker + Modify Goals for `social_media_posts`, `reviews_posted`).
- **AC2** **Social Media Posts** card: `posts_count / target.posts` progress; footer "{scheduled_posts} Scheduled" + "Schedule Now" → `/social`.
- **AC3** **Reviews Posted** card: `reviews_posted / target.reviews` progress; footer "{available_reviews} Available Reviews" + "Schedule Now" → `/reviews`. (Available excludes reviews already in a scheduled `social_post`.)

### US-D2.2 — See per-platform post performance
- **AC1** A stats panel with a month-range picker (1/3/6/12) and a range label.
- **AC2** Five platform tiles (Facebook, Instagram, LinkedIn, Google, Twitter) each show `recent` count + `rate` %.
- **AC3** A **stacked bar chart** (one series per platform) over the timeline (`…/social/chart?range=`); labels `MMM` (range>1) or `MMM DD`.

---

## Tab 3 — Oggvo Connect (`GET /analytics/dashboard/connect`, gated)

### US-D3.1 — Gate behind the SMS permission
**As a** non-Connect Operator **I want** a clear upgrade path **so that** I know how to unlock messaging analytics.
- **AC1** Without `sms`, the tab shows an Upgrade-Plan prompt (lock icon + copy) and an Upgrade modal; no stats are fetched.

### US-D3.2 — See messaging volume & connections vs goals
**As a** Connect Operator **I want** connection and message KPIs **so that** I can gauge two-way engagement.
- **AC1** Goals header (month picker + Modify Goals for `connections`).
- **AC2** **Connections** card: `current/target` + rate progress; footer "Check Messages" → `/connect`.
- **AC3** **AI Used** card (currently a `0%` placeholder — fix-on-rebuild: wire a real metric or remove).
- **AC4** Five KPI tiles: Connections, Chat Sessions, Messages Sent, Messages Received, Scheduled (each `recent` + `rate`).
- **AC5** A **stacked bar** of SMS vs Web Chat over the timeline; legend totals for each. Range/date watched (throttled). Endpoints `…/connect?range=` + `…/connect/goals?date=`.

---

## Tab 4 — Activity (request log) (`GET /analytics/activity`)

### US-D4.1 — Browse outbound review-request activity
**As an** Operator **I want** a searchable log of review requests per recipient **so that** I can audit outreach.
- **AC1** Columns: Recipient (name + contact), Request Type badge (Initial=primary / Follow-up=green / Final=red), Activity badges (+ "{n} interactions" pill when `InteractionCount > 1`), Schedule (date + time in profile tz), Via (CampaignType).
- **AC2** Search (throttled, clearable) + filters: type (Email/SMS), request name (Initial/Follow-up/Final), date range; any change resets to page 1.
- **AC3** Server-side pagination (prev / numbered / next); loading = skeleton rows; empty = "No Activity Found".

---

## Tab 5 — Campaigns engagement *(disabled in v1 — keep/drop decision)*

### US-D5.1 — See newsletter & anniversary engagement
- **AC1** Two panels (Newsletter, Anniversary), each: subscriber count + growth rate, sent / opened (+rate) / clicked (+rate) / unsubscribed (+rate), a "View" link to `/campaigns?type=`, and an Open+Click line chart over a month range. `GET /analytics/dashboard/campaigns?range=`.
- **Note:** the tab is commented out of the v1 shell; built as a screen for parity review.

---

## Tab 6 — Profile Optimization *(disabled in v1 — keep/drop decision)*

### US-D6.1 — See social profile optimization status
- **AC1** A table of social profiles (platform + page + name), a Status badge (Optimized / In Progress / Error), and an action (Optimize More / Contact Us). `GET /socials/get`.
- **Open question:** the `status`/`action` fields are not backed by `/socials/get` in v1 — confirm a real source or drop.

---

## Analytics §A — Google Business Profile (`GET /analytics/insights/google`)

### US-A1.1 — View GBP performance metrics
**As an** Operator **I want** Google discoverability metrics **so that** I can see how customers find me.
- **AC1** A metric selector (Shown in Searches, Shown in Maps, Clicked Website, Clicked Phone, Got Directions) each showing label + count; selecting one drives a line chart (Desktop/Mobile datasets where applicable) over the date range.
- **AC2** Connection gate: `has_google && !new_google` → "Reconnect"; `!has_google` → "Connect your Google My Business" → `/settings/integrations`. Metrics only render when connected.
- **AC3** Metric keys aggregated: `BUSINESS_IMPRESSIONS_{DESKTOP,MOBILE}_{SEARCH,MAPS}`, `WEBSITE_CLICKS`, `CALL_CLICKS`, `BUSINESS_DIRECTION_REQUESTS`.

## Analytics §B — Keywords (`GET /analytics/keywords`)

### US-A2.1 — Rank search keywords
**As an** Operator **I want** a sortable keyword ranking **so that** I know which searches surface my business.
- **AC1** Table: Rank (computed `(page-1)*perPage+i+1`), Keyword (sortable), Searches (sortable, numeric `CAST`); default sort Searches desc; toggling sort resets to page 1.
- **AC2** Date-range filter + header count "Keywords (N)"; loading = 5 skeleton rows; empty = "No keywords." + Refresh; paginated.

---

## Cross-cutting

### US-X1 — Monthly targets (`GET/PUT /analytics/monthly-targets`)
- **AC1** Targets are upserted per `(profileId, month)` with fields `requests, reviews, social_media_posts, reviews_posted, connections`; idempotent; a Modify-Goals save triggers a stats refetch.

### US-X2 — Nav badges (`GET /nav-badges`)
- **AC1** Returns `{reviews, social, surveys, total}`: `reviews` = reviews with empty reply; `social` = failed posts (`Status=-1`); `surveys` = DISTINCT completed survey trackers in the last 7 days (deduped — preserve BF-032 logic); `total` = sum. These drive sidebar attention counters.

## Open questions / parity risks (from spec)
- Inverted `start_at`/`end_at` semantics must be migrated carefully (wrong direction silently returns empty ranges).
- `social_insight`/`keyword_insight` ingestion (GBP sync) is owned elsewhere — confirm v2 column shapes (`Metric`, `MetricDate`, `Value`, `Keyword`, `CreateDate`).
- Keyword date filter uses `CreateDate` (ingest date), not a search date — verify intended semantics.
- "AI Used" placeholder, Campaigns/Profile-Optimization disabled tabs, and the `/activity` stub + mobile `activity-history` page — decide keep/build/drop.
- Whether any analytics should move to OpenSearch (today the dashboard reads MySQL; OpenSearch only holds request logs).

## Traceability (story → primary v2 endpoint)

| Tab / story | Endpoint |
| --- | --- |
| Review Funnel (D1) | `GET /analytics/dashboard/funnel[/chart]`, `…/reviews/by-channel`, `…/reviews/rating-distribution` |
| Social Media (D2) | `GET /analytics/dashboard/social[/chart]` |
| Connect (D3) | `GET /analytics/dashboard/connect[/goals]` |
| Activity (D4) | `GET /analytics/activity` |
| Campaigns (D5) | `GET /analytics/dashboard/campaigns?range=` |
| Profile-Opt (D6) | `GET /socials/get` |
| Google (A1) | `GET /analytics/insights/google` |
| Keywords (A2) | `GET /analytics/keywords` |
| Targets (X1) | `GET/PUT /analytics/monthly-targets` |
| Nav badges (X2) | `GET /nav-badges` |
