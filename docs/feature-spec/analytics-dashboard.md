# Analytics & Dashboard

> **v2 target:** module `apps/api/src/modules/analytics` (read-only aggregation/reporting service across domain tables) · tables `monthly_targets`, `social_insight`, `keyword_insight` + reads from `review`, `social_post`, `invite_scheduler`, `invite_campaign`, `invite_recipient`, `chat`/messaging, `campaign`, `activity` (`@oggvo/db`) · queue `—` (synchronous reads; OpenSearch indexing handled by separate request-log pipeline) · build phase 3
> **v1 sources:** frontend `apps/portal-frontend/pages/dashboard/*`, `pages/analytics/*`, `pages/activity/index.vue`; stores `store/dashboard.js` *(absent — see note)*, `store/connectDashboard.js`, `store/campaignsDashboard.js`, `store/display.js`; API `apps/portal-api/app/Controllers/API/V2/{Insight,Reviews,Posts,Messaging,Campaigns,Activity,NavBadges}.php`, `Settings/Targets.php`; models `app/Models/{InsightModel,MonthlyTargetModel,KeywordModel}.php`

## 1. Overview
The Analytics & Dashboard domain is the cross-feature reporting surface of OGGVO. It comprises (a) the main **Dashboard** ("Your Overview") with a tabbed shell — Review Funnel, Social Media, Oggvo Connect, Activity — each rendering KPI cards, goal/target progress, and time-series charts sourced from the reviews, posts, messaging, and campaigns domains; (b) the **Activity** history log of outbound review-request interactions per recipient; and (c) the **Analytics** section with Google Business Profile insight charts and a Keywords ranking table. It also owns **monthly targets** (per-profile goals editable inline) and the **nav badges** counter that drives unread/attention indicators in navigation.

Business value: gives the business owner a single glance at request→review conversion, posting cadence, messaging volume, and discoverability (Google impressions/keywords) versus self-set monthly goals. Access is authenticated per active `ProfileID`; the **Oggvo Connect** tab and its stats are gated behind the `sms` permission (`useAuth().user.permissions.sms`) and otherwise show an Upgrade Plan prompt. All data is scoped to the authenticated profile.

> **Note — `store/dashboard.js`:** does not exist in v1. The dashboard overview and tab pages call endpoints directly via `useLazyAsyncData`/`$http`. Pinia stores exist only for the Connect (`connectDashboard.js`) and Campaigns (`campaignsDashboard.js`) tabs. `store/display.js` is an unrelated lightbox/media-display store (not analytics).

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/dashboard` | `pages/dashboard/index.vue` (shell) + `dashboard/index/index.vue` | default; PageHeader "Your Overview" + tab nav (mobile `<select>`) | Review Funnel (`/dashboard`), Social Media (`/dashboard/social-media`), Oggvo Connect (`/dashboard/connect`), Activity (`/dashboard/activity`) | authed |
| `/dashboard` (Review Funnel) | `pages/dashboard/index/index.vue` | nested in shell | — | authed |
| `/dashboard/social-media` | `pages/dashboard/index/social-media.vue` | nested in shell | — | authed |
| `/dashboard/connect` | `pages/dashboard/index/connect.vue` | nested in shell | — | authed + **permission `sms`** (else Upgrade modal/prompt) |
| `/dashboard/activity` | `pages/dashboard/index/activity.vue` | nested in shell | — | authed |
| `/dashboard/profiles` *(disabled)* | `pages/dashboard/index/profiles.vue` | nested in shell | — | authed; **tab commented out** in shell — route exists but not linked |
| `/dashboard/campaigns` *(disabled)* | `pages/dashboard/index/campaigns.vue` | nested in shell | — | authed; **tab commented out** in shell |
| `/dashboard/activity-history` *(mobile detail)* | `pages/dashboard/activity-history.vue` | default | — | authed; mobile-only recipient activity detail (reads from `route.query`) |
| `/dashboard/settings/[platform]` | `pages/dashboard/settings/[platform].vue` | default | — | authed; OAuth callback handler — calls `/oauth/{platform}` then redirects to `/settings/accounts` (NOT an analytics page) |
| `/analytics` (Google) | `pages/analytics/index.vue` (shell) + `analytics/index/index.vue` | default; PageHeader "Analytics" + 2-tab nav | Google (`/analytics`), Keywords (`/analytics/keywords`) | authed |
| `/analytics/keywords` | `pages/analytics/index/keywords.vue` | nested in shell | — | authed |
| `/activity` | `pages/activity/index.vue` | default | — | authed; **stub** — only renders PageHeader "Activity", no data |

## 3. Screen-by-screen

### `/dashboard` — Dashboard shell ("Your Overview")
![dashboard-shell](_assets/screens/dashboard/shell.png) <!-- placeholder until captured -->
- **Purpose & layout** — Wrapper page (`dashboard/index.vue`) with a `<LazyTwilio />` banner at top, `PageHeader` showing title "Your Overview" and the profile `Name` as description, a `ContactAdvisorButton` action, and a horizontal tab nav. Below, `<TutorialsRoutePrompts />` and `<NuxtPage />` render the active tab.
- **Elements** — Tab list (desktop `<nav>` of `NuxtLink`s; mobile `<select>` that `$router.push`es on change): **Review Funnel** → `/dashboard`, **Social Media** → `/dashboard/social-media`, **Oggvo Connect** → `/dashboard/connect` (shows a lock icon when `!permissions.sms`), **Activity** → `/dashboard/activity`. Commented-out tabs in source: Campaigns, Profile Optimization.
- **States** — active tab styled with primary border; locked tab shows `LockClosedIcon` badge.

### `/dashboard` — Review Funnel tab
![review-funnel](_assets/screens/dashboard/review-funnel.png) <!-- placeholder until captured -->
- **Purpose & layout** — Goals header row + 3 KPI `MetricCard`s + a "Reviews Overview" section combining a funnel/overview chart, reviews-by-channel doughnut, and Google reviews stats.
- **Elements**
  - **Goals header**: label "Goals :", `<GoalDatePicker v-model="goalDate">` (selects a month), `<DashboardModifyGoalsModal>` button "Modify Goals".
  - **MetricCard "Requests"**: `count`=`stats.requests_count`, `goal`=`target.requests`, `percentage`=`requests*100/target`, `left`=remaining; actions "Learn More" (tutorial), "Send Request" → `/campaigns`.
  - **MetricCard "Reviews"**: `count`=`stats.reviews_count`, `goal`=`target.reviews`; actions "Learn More", "See Latest Reviews" → `/reviews`.
  - **MetricCard "Conversion"**: computed `reviews_count*100/requests_count` (int %); progress color tiers (<50 amber `#FDB022`, <100 blue `#1570EF`, else green `#16B364`); action "Reach Advisor" → `mailto:support@oggvo.com`.
  - **Reviews Overview** header: title + computed date-range label (`end - start`, MMM D, YYYY), `<InlineDateRange v-model="dateRange">` filter.
  - Charts: `<ReviewReviewsOverview :start :end>` (funnel/line), `<ReviewReviewsByChannelChart :start :end>` (doughnut), `<ReviewGoogleReviewsStats :start :end>` (rating distribution).
- **States** — goal date drives a watched refetch of `/reviews/stats`; date-range drives the chart children. Loading via `pending`. Empty when counts are 0 (cards show 0 / 0%).
- **Modals** — **Modify Goals modal** (`DashboardModifyGoalsModal`): trigger "Modify Goals"; fields are `QuantityInput`s per goal (`requests` step 25, `reviews` step 25); submits `POST /settings/monthly-targets` with `date` + each goal `name`/`value`; emits `updated` → re-runs `execute()` to refetch stats; toast on success/error.

### `/dashboard/social-media` — Social Media tab
![social-media](_assets/screens/dashboard/social-media.png) <!-- placeholder until captured -->
- **Purpose & layout** — Goals header + 2 progress cards + a "Social Media Posts Stats" panel with per-platform KPI tiles and a stacked bar chart.
- **Elements**
  - **Goals header**: "Goals :", `GoalDatePicker v-model="goalDate"`, `DashboardModifyGoalsModal` (goals: `reviews_posted`, `social_media_posts`).
  - **Card "Social Media Posts"**: `stats.posts_count / target.posts`, `ProgressBar` (postsPercentage), footer "{scheduled_posts} Scheduled" + "Schedule Now" → `/social`.
  - **Card "Reviews Posted"**: `stats.reviews_posted / target.reviews`, `ProgressBar`, footer "{available_reviews} Available Reviews" + "Schedule Now" → `/reviews`.
  - **Stats panel**: title + computed date-range label, `<ChartDateRange v-model="range">` (month range 1/3/6/12). Five per-platform tiles — Facebook, Instagram, LinkedIn, Google, Twitter — each shows `metrics[Platform].recent` and `.rate` %.
  - **Stacked Bar chart** (`vue-chartjs`): one dataset per platform (Facebook `#175CD3`, Instagram `#2E90FA`, LinkedIn `#53B1FD`, Google `#84CAFF`, Twitter `#C9EEFF`); labels from `timeline` keys formatted `MMM` (range>1) or `MMM DD`.
- **States** — `loading` from `/posts/overview-chart`; bar hidden while loading. Goal stats from `/posts/stats` (watched on `goalDate`, immediate:false).
- **Modals** — Modify Goals (same component).

### `/dashboard/connect` — Oggvo Connect tab
![connect](_assets/screens/dashboard/connect.png) <!-- placeholder until captured -->
- **Purpose & layout** — Permission-gated. If `!permissions.sms`: renders an Upgrade prompt block (lock icon + "Upgrade Plan" copy) and `DashboardUpgradePlanModal`. Otherwise: goals header + 2 cards (Connections / AI Used) + "Oggvo Connect Stats" panel with 5 KPI tiles and a stacked bar (SMS vs Web Chat).
- **Elements**
  - **Goals header**: "Goals :", `GoalDatePicker v-model="filter.date"`, `DashboardModifyGoalsModal` (goal `connections`).
  - **Card "Connections"**: `{monthlyTargets.current}/{monthlyTargets.target}`, rate %, `ProgressBar`; footer "Watch Tutorial" + "Check Messages" → `/connect`.
  - **Card "AI Used"**: hardcoded `0%` ProgressBar (color `#F79009`); footer "Watch Tutorial" + "Upgrade Plan" (opens `https://oggvo.com/pricing` new tab).
  - **Stats panel** header: title + computed date-range label, `<ChartDateRange v-model="filter.range" @update:model-value="onRangeUpdated">`.
  - **5 KPI tiles**: Connections (`data.connections.recent`/`.rate`), Chat Sessions (`data.messaging.chats.recent`/`.rate`), Messages Sent (`data.messaging.messages.sent.recent`/`.rate`), Messages Received (`data.messaging.messages.received.recent`/`.rate`), Scheduled (`data.messaging.scheduled.recent`/`.rate`).
  - **Stacked Bar**: SMS (`#175CD3`) + Web Chat (`#2E90FA`) from `data.messaging.messages.timeline[*].sms/.web`; legend tiles show totals `messages.sms`, `messages.web`.
- **States** — managed by `useConnectDashboardStore`: `loading`, `data`, `monthlyTargets`, `chartData`, `goals`, `filter{range,date}`. `fetchMonthlyGoals()` → `/messaging/stats/goals`; `fetchStats()` → `/messaging/stats`. Watched (throttled 1s) on range and date. Both only fetched `onMounted` when `!shouldUpgrade`.
- **Modals** — `DashboardUpgradePlanModal` (gate), Modify Goals.
- **Known issue** — "AI Used" is a static `0%` placeholder with no data source.

### `/dashboard/activity` — Activity tab (request log)
![activity-tab](_assets/screens/dashboard/activity-tab.png) <!-- placeholder until captured -->
- **Purpose & layout** — Searchable, filterable, paginated table of outbound review-request activity per recipient/day.
- **Elements**
  - **Search** input (`query`, throttled), clearable via `XMarkIcon`.
  - **Filters**: `<ActivityFilters v-model="campaignFilter">` (types `Email`/`SMS`; names `Initial Request`/`Follow-up Request`/`Final Request`), `<DateRangePicker v-model="dates">`.
  - **Table columns**: Recipient (`FullName` + `Contact`), Request Type (`Badge` colored by name — Initial=primary, Follow-up=green, Final=red), Activity (per-activity `Badge`s; if `InteractionCount > 1`, a "{n} interactions" pill), Schedule (`ActivityDate` formatted `MMMM DD, YYYY` + `hh:mm A` via `useTimezone().dbToUser`), Via (`CampaignType`).
- **States** — loading → `SkeletonsTableRowActivity`; empty → "No Activity Found"; paginated (`data.meta.pages`, prev/next + numbered). Filters/search/dates reset `page` to 1 and refresh (throttled 1s).
- **Interactions** — sort by request name/type via badge filter; server-side pagination.

### `/dashboard/profiles` — Profile Optimization tab (disabled/linked-off)
![profiles](_assets/screens/dashboard/profiles.png) <!-- placeholder until captured -->
- **Purpose** — Lists social profiles with optimization status. Tab is commented out in the shell (route reachable directly).
- **Elements** — table: Profiles (platform icon + `page` + `name`), Status badge (`Optimized` green / `In Progress` blue / `Error` red), action button (`Optimize More` / `Contact Us`). Mobile variant table.
- **Data** — `GET /socials/get`. Status/action fields appear to be placeholder (not populated by `/socials/get` shape — parity risk).

### `/dashboard/campaigns` — Campaigns tab (disabled/linked-off)
![campaigns](_assets/screens/dashboard/campaigns.png) <!-- placeholder until captured -->
- **Purpose** — Newsletter + Anniversary campaign engagement stats. Tab commented out in shell.
- **Elements** — Two panels (Newsletter, Anniversary), each: subscriber count + growth rate, "View" → `/campaigns?type=Newsletter|Anniversary`, sent/opened(+rate)/clicked(+rate)/unsubscribed(+rate) figures, and a `Line` chart (Open + Click series). Date label from `range` (months). `<ChartDateRange v-model="range">`.
- **States** — `useCampaignsDashboardStore`: `loading`, `data`, `range`, `newsletterChart`, `anniversaryChart`; `fetchStats()` → `/campaigns/stats`; watched (throttled) on `range`.

### `/dashboard/activity-history` — Mobile recipient activity detail
![activity-history](_assets/screens/dashboard/activity-history.png) <!-- placeholder until captured -->
- **Purpose & layout** — Mobile-only (`min-[480px]:hidden`) detail view for a single recipient's request, reading `route.query` (firstName, lastName, recipientDetail, source, date). Shows recipient header, status badges (Member / Final Request), Edit Contact / Send SMS buttons, a "Final Request Sent" event with formatted date, and a History section (mostly commented-out static markup) plus `<InputFeedback :messages="[]">`.
- **States** — largely static/placeholder; the historical timeline is commented out in source.

### `/analytics` — Analytics shell + Google tab
![analytics-google](_assets/screens/dashboard/analytics-google.png) <!-- placeholder until captured -->
- **Purpose & layout** — Shell (`analytics/index.vue`) with PageHeader "Analytics", profile name, `ContactAdvisorButton`, and a 2-tab nav (Google `/analytics`, Keywords `/analytics/keywords`). Google tab shows GBP performance metrics.
- **Elements**
  - Header: "Google Analytics" + computed date-range label, `<InlineDateRange v-model="dateRange">`.
  - **Metric selector** (desktop 5-col grid; mobile stacked cards): one button per metric showing `label` + `count`; selecting sets the active `Line` chart. Metrics from API: **Shown in Searches** (desktop+mobile search impressions), **Shown in Maps** (desktop+mobile maps), **Clicked Website**, **Clicked Phone**, **Got Directions**.
  - **Line chart** (`vue-chartjs`, time x-axis): datasets per metric (Desktop/Mobile where applicable); unit month/day based on range span.
- **States** — `pending` shows "Loading...". `immediate:false`, watched on `dateRange`. **Connect/Reconnect prompt**: when `has_google && !new_google` → "Reconnect", when `!has_google && !new_google` → "Connect" your Google My Business account, with link to `/settings/accounts`. Errors surfaced via `$notify`.

### `/analytics/keywords` — Keywords tab
![analytics-keywords](_assets/screens/dashboard/analytics-keywords.png) <!-- placeholder until captured -->
- **Purpose & layout** — Sortable, paginated ranking table of search keywords driving the profile's discoverability.
- **Elements**
  - Header: "Keywords ({total})" + computed date-range label, `<InlineDateRange v-model="dateRange" @update:model-value="params.page=1">`.
  - **Table columns**: Rank (computed `(page-1)*perPage + index + 1`), Keyword (sortable `Keyword`), Searches (sortable `Value`, numeric cast). Sort toggles asc/desc with arrow icons; changing sort resets page to 1.
- **States** — loading → 5 skeleton rows; empty → "No keywords." with Refresh button; paginated (prev/numbered/next, `keywords.pages`). `immediate:false`, watched on `params` + `dateRange`.

### `/activity` — Activity (top-level stub)
- **Purpose** — Renders only a `PageHeader` "Activity"; no data or table. Likely superseded by `/dashboard/activity`. Flag for removal or build-out in v2.

## 4. Data & API
Every endpoint this domain calls.

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v2/reviews/stats` | Review Funnel KPI counts + goals for a month | `date` (Y-m-01) | `{ stats:{reviews_count,requests_count}, target:{requests,reviews} }` | `Reviews.php::stats` |
| GET | `/api/v2/reviews/reviews-overview-chart` | Funnel overview series + metrics (requests, reviews, conversion, avg rating) | `start_at`, `end_at` (valid_date) | `{ data:{reviews:{date:n}, requests:{date:n}}, metrics:{...} }` | `Reviews.php::overviewChart` |
| GET | `/api/v2/reviews/reviews-by-channel` | Reviews grouped by `Site` (top 4 + Other) | `start_at`, `end_at` | `[{label,count}]` | `Reviews.php::reviewsByChannel` |
| GET | `/api/v2/reviews/google-reviews-statistics` | Google rating distribution + avg | `start_at`, `end_at` | `{ reviews_avg, reviews_count, counts_by_score:{score:n} }` | `Reviews.php::googleReviewsStatistics` |
| GET | `/api/v2/reviews/statistics` | Overall reviews avg/count + platforms (used by chart children) | — | `{ reviews_avg, reviews_count, reviews_count_last_month, platforms }` | `Reviews.php::statistics` |
| GET | `/api/v2/reviews/chart` | Reviews count by month (last year) | — | array | `Reviews.php::chart` |
| GET | `/api/v2/posts/stats` | Social Media KPI counts + goals | `date` | `{ stats:{posts_count,reviews_posted,available_reviews,scheduled_posts}, target:{posts,reviews} }` | `Posts.php::stats` |
| GET | `/api/v2/posts/overview-chart` | Per-platform post metrics + timeline | `months` (1\|3\|6\|12) | `{ metrics:{Facebook:{total,recent,rate},...}, timeline:{date:{Platform:n}} }` | `Posts.php::overviewChart` |
| GET | `/api/v2/messaging/stats` | Connect KPI tiles + messaging timeline | `range` (1\|3\|6\|12) | `{ connections:{recent,rate}, messaging:{chats:{recent,rate}, messages:{sent:{recent,rate},received:{...},sms,web,timeline:{k:{sms,web}}}, scheduled:{recent,rate}} }` | `Messaging.php::stats` |
| GET | `/api/v2/messaging/stats/goals` | Connections monthly target (current/target/rate) | `date` (Y-m-d) | `{ current, target, rate }` | `Messaging.php::goals` (via `MonthlyTargetModel::getMonthlyTarget`) |
| GET | `/api/v2/campaigns/stats` | Newsletter + Anniversary engagement stats | `range` (1\|3\|6\|12) | `{ newsletter:{subscribed,sent,opened,clicked,unsubscribed,timeline}, anniversary:{...} }` | `Campaigns.php::stats` (via `CampaignModel::getStats`) |
| GET | `/api/v2/campaigns/(:num)/stats` | Single-campaign subscribers/sent/opens/clicks | path id | `{ subscribers,sent,opens,clicks }` | `Campaigns.php::getCampaignStats` |
| GET | `/api/v2/activities` | Paginated request-activity log | `page`, `perpage`, `dates[]`, `types[]` (Email,SMS), `names[]` (Initial/Follow-up/Final), `search` | `{ activities:[{FullName,Contact,Name,Activity,InteractionCount,ActivityDate,CampaignType}], meta:{pages} }` | `Activity.php::index` (via `ActivityModel::getActivity`) |
| GET | `/api/v2/insight/google` | Google Business Profile insight metrics + series | `start_at`, `end_at` | `{ has_google, new_google, metrics:[{label,count,datasets:[{label,data,color}]}]\|null }` | `Insight.php::google` |
| GET | `/api/v2/insight/keywords` | Paginated/sortable keyword search counts | `sort` (Keyword\|Value), `dir` (asc\|desc), `page`, `start_at`, `end_at` | `{ data:[{ID,Keyword,Value}], pages, total, perPage }` | `Insight.php::keywords` |
| GET | `/api/v2/settings/monthly-targets/show` | Fetch a month's targets row | `date` | `MonthlyTarget` row or 404 | `Settings/Targets.php::show` |
| POST | `/api/v2/settings/monthly-targets` | Upsert a month's targets | `date` (Y-m-d), `requests`, `reviews`, `connections`, `social_media_posts`, `reviews_posted` (all permit_empty int) | updated | `Settings/Targets.php::update` |
| GET | `/api/v2/nav/badges` | Nav attention counters | — | `{ reviews, social, surveys, total }` | `NavBadges.php::index` |
| GET | `/api/v2/socials/get` | Profiles list (Profile Optimization tab) | — | socials array | `Socials.php::get` |
| GET | `/api/v2/oauth/{platform}` | OAuth callback (settings/[platform] page) | `route.query` | `{ message }` | `OAuth/*::redirect` |

- **v1 models / tables:** `monthly_targets` (`MonthlyTargetModel`), `social_insight` (`InsightModel`), `keyword_insight` (`KeywordModel`), `review` (`ReviewModel`), `social_post` (`PostModel`), `invite_scheduler` + `invite_campaign` (`ScheduleModel` — request counts), `invite_recipient` (`RecipientModel` — connections), messaging/chat (`MessagingModel`), `campaign` (`CampaignModel`), `activity` (`ActivityModel`), `social` (`SocialModel` — Google auth check), survey tables + `social_post` + `review` (NavBadges).
- **Pagination / filtering / sorting:** CodeIgniter `paginate()` for keywords (returns `pages`, `total`, `perPage`); `/activities` uses `page`+`perpage` (in_list[10,20,30,50,100]) with server-side filters. Date filters use `start_at`/`end_at` (`valid_date`) — **note the swapped semantics:** in funnel/insight queries the SQL uses `MetricDate <= start_at AND MetricDate >= end_at`, i.e. `start_at` is the *later* date and `end_at` the *earlier* date (frontend labels render `end - start`). Range filters use month counts `1|3|6|12`. Targets keyed by `DATE_FORMAT(date,'%Y-%m')` (month granularity).

## 5. Business rules
- **Profile scoping:** every query filters by `request->auth->profile_id`; switching active profile changes all dashboard/analytics data.
- **Monthly targets are month-granular:** `monthly_targets` rows are matched by `Y-m`; one row per profile per month. `Targets::update` upserts (update if a row for that month exists, else insert). Columns: `requests`, `reviews`, `social_media_posts`, `reviews_posted`, `connections`.
- **Default date:** stats endpoints default `date` to `date('Y-m-01')` (first of current month) when omitted.
- **Conversion %** = `reviews_count * 100 / requests_count` (integer; 0 when no requests). Goal percentages = `count * 100 / target` (0 when target unset).
- **Request counting (funnel):** counts `invite_scheduler` rows joined to `invite_campaign` where `CampaignType IN (Email,SMS)`, `Sent=1`, `IsTest=0`, scheduled within the month/range.
- **Review counting:** excludes `PermanentDelete=1`. "Available reviews" (Social Media tab) excludes reviews already referenced in `social_post` (with `Schedule`) or `scheduled_posts_automator`.
- **Reviews-by-channel cap:** returns top 4 sites by count; remainder bucketed as "Other".
- **Connect gating:** `/dashboard/connect` and `/messaging/stats[/goals]` are only fetched when `permissions.sms` is true; otherwise an upgrade prompt is shown. The `sms` permission must propagate to the tab lock icon and the gate.
- **Google insight gating:** `/insight/google` returns `has_google`/`new_google` flags derived from the profile's `social` rows where `Name='Google'`; `new_google` requires a non-empty `AuthorizationID`. Metrics are only computed when both are truthy; otherwise the page shows Connect/Reconnect prompts. Metric keys aggregated: `BUSINESS_IMPRESSIONS_{DESKTOP,MOBILE}_{SEARCH,MAPS}`, `WEBSITE_CLICKS`, `CALL_CLICKS`, `BUSINESS_DIRECTION_REQUESTS`.
- **Keyword sort:** `Value` sorts as `CAST(Value AS UNSIGNED)`; default sort `Value` desc; sort/range change resets to page 1.
- **NavBadges semantics:** `reviews` = reviews with null/empty `SocialReply`; `social` = `social_post` with `Status=-1` (failed); `surveys` = DISTINCT completed survey trackers in last 7 days (deduped to avoid pre-BF-011 duplicate `Completed` rows — BF-032). `total` is the sum.
- **Timezone:** Activity table renders `ActivityDate` via `useTimezone().dbToUser` (DB UTC → user tz). Server stats queries use raw DB dates without explicit tz conversion (parity risk — see §8).
- **Side effects:** Modify Goals POST emits an `updated` event that triggers a stats refetch; success/error `$notify` toasts. No async jobs/queues fired by this domain.
- **Idempotency:** target upsert is idempotent per `(ProfileID, month)`.

## 6. Integrations
- **Google Business Profile (GBP / "Google My Business"):** `social_insight` (`Name='Google'`) populated by GBP performance-metric ingestion; `keyword_insight` populated by GBP search-keywords ingestion. Connection state read from the `social` table (OAuth `AuthorizationID`). The `/analytics` Google tab consumes these.
- **OpenSearch (os-reporter lambda, `lambdas/os-reporter`):** SQS-triggered lambda that **bulk-indexes request-log documents into the `request-logs` OpenSearch index** (`@opensearch-project/opensearch`). This is request/audit logging, **not** the source of the dashboard charts — the v1 dashboard/analytics charts read from MySQL, not OpenSearch. (v2 should decide whether any analytics moves to OpenSearch; today none does.)
- **Twilio:** `<LazyTwilio />` banner appears atop the dashboard shell (toll-free/number provisioning notice) — adjacent, not an analytics data source.
- **Messaging/SMS (Twilio + Facebook Messenger):** Connect-tab message volumes are derived from the messaging domain; SMS vs Web Chat split.
- **Email (campaigns):** Newsletter/Anniversary open/click/unsubscribe rates come from the campaigns domain (email tracking).
- No Stripe/Square/FCM/SendGrid calls originate from this domain directly.

## 7. v1 → v2 mapping
- **Module:** `apps/api/src/modules/analytics` — a read-oriented reporting module (controller + service + repository + DTOs). Recommend sub-resources: `dashboard` (funnel/social/connect/campaigns aggregates), `insights` (google), `keywords`, `activity`, `monthly-targets`, `nav-badges`. Aggregation logic should live in repositories that join across domain tables (reviews, posts, messaging, campaigns) rather than duplicating SQL in controllers.
- **Drizzle tables:** `monthly_targets`, `social_insight`, `keyword_insight` (own); reads across `review`, `social_post`, `invite_scheduler`, `invite_campaign`, `invite_recipient`, `campaign`, `activity`, `social`, messaging/chat tables (`@oggvo/db`). Field shapes match v1 (PascalCase legacy columns: `Keyword`, `Value`, `Metric`, `MetricDate`, `ReviewScore`, `Site`, etc.). Consider renaming `social_insight`→`social_insights` / `keyword_insight`→`keyword_insights` per the v2 plural convention noted in the task (confirm against `@oggvo/db` schema in `packages/db/src/schema/{social,misc}.ts`).
- **Queue:** `—` (synchronous reads). OpenSearch request-log indexing stays a separate ingestion pipeline, not part of this module.
- **Frontend:** v2 routes under `apps/web/app/(portal)/dashboard` (tabbed: funnel, social-media, connect, activity) and `apps/web/app/(portal)/analytics` (google, keywords). Reuse `@oggvo/ui` `MetricCard`/`ProgressBar`/`Badge`/`DateRangePicker`/`Modal`/`Button`/`Table` + a shared chart wrapper (replace `vue-chartjs` with the v2 chart lib). Port `DashboardModifyGoalsModal`, `Chart/DateRange`, `Funnel/*`, `Dashboard/Filter/*`.
- **Endpoint mapping (RESTful, typed via OpenAPI):**
  - `GET /reviews/stats` → `GET /analytics/dashboard/funnel?month=`
  - `GET /reviews/reviews-overview-chart` → `GET /analytics/dashboard/funnel/chart?from=&to=`
  - `GET /reviews/reviews-by-channel` → `GET /analytics/reviews/by-channel?from=&to=`
  - `GET /reviews/google-reviews-statistics` → `GET /analytics/reviews/rating-distribution?from=&to=`
  - `GET /posts/stats` + `/posts/overview-chart` → `GET /analytics/dashboard/social?month=` / `.../social/chart?range=`
  - `GET /messaging/stats` + `/messaging/stats/goals` → `GET /analytics/dashboard/connect?range=` / `.../connect/goals?date=`
  - `GET /campaigns/stats` → `GET /analytics/dashboard/campaigns?range=`
  - `GET /activities` → `GET /analytics/activity?page=&from=&to=&types=&names=&search=`
  - `GET /insight/google` → `GET /analytics/insights/google?from=&to=`
  - `GET /insight/keywords` → `GET /analytics/keywords?sort=&dir=&page=&from=&to=`
  - `GET/POST /settings/monthly-targets[/show]` → `GET/PUT /analytics/monthly-targets?month=`
  - `GET /nav/badges` → `GET /nav-badges`
- **Known v1 bugs to fix:**
  - **Inverted date params:** `start_at`/`end_at` are used with reversed comparison (`<= start_at`, `>= end_at`) and the UI labels render `end - start`. Normalize to conventional `from <= date <= to` in v2 and migrate the frontend accordingly.
  - **SQL injection / raw interpolation:** date strings are concatenated directly into `where("Date(...) <= '$startAt'")` clauses across Insight/Reviews controllers. Use parameterized queries / Drizzle bindings in v2.
  - **Timezone inconsistency:** server aggregations use raw DB dates while the activity table converts via `dbToUser`. Standardize on a single tz boundary.
  - **"AI Used" placeholder:** Connect tab shows a hardcoded `0%` with no backing metric — either wire it up or remove.
  - **Profile Optimization tab:** status/action columns appear unbacked by `/socials/get` data — decide whether to implement or drop.
  - **N+1 / per-tab fanout:** each dashboard tab issues independent calls (stats + chart + goals). Consider a consolidated endpoint per tab.
  - **Dead/duplicate routes:** top-level `/activity` stub and `/dashboard/activity-history` mobile-only static page should be consolidated into the v2 activity view.

## 8. Open questions / parity risks
- **`store/dashboard.js` does not exist** in v1 (task references it) — the overview/tabs call endpoints directly; confirm no other dashboard store is expected.
- **Profile Optimization & Campaigns tabs are disabled** (commented out in the shell). Are they intended for v2, or deprecated? Their pages exist but the `status`/`action` data for Profile Optimization has no clear backing query.
- **Inverted `start_at`/`end_at` semantics** — must be carefully migrated; getting it backwards silently returns empty/wrong ranges. Verify the exact direction with sample data before porting.
- **`social_insight` / `keyword_insight` ingestion source unknown here** — these tables are read-only in this domain; the writer (GBP sync job) is owned elsewhere. Confirm the v2 ingestion path and column shapes so the analytics module reads the right fields (`Metric`, `MetricDate`, `Value`, `Keyword`, `CreateDate`).
- **Google metric date column** uses `MetricDate` with `Date()` truncation and `Name='Google'` — confirm the v2 schema stores these per-day per-metric rows.
- **Keyword date filter** uses `CreateDate` (when the keyword row was ingested), not a search date — verify this is the intended "date range" semantic for keywords.
- **NavBadges 7-day survey window & BF-032 dedupe** must be preserved exactly to avoid badge inflation; carry the DISTINCT-tracker logic into v2.
- **OpenSearch role:** the task notes "v1 used OpenSearch (os-reporter lambda) for some analytics" — in the read code, os-reporter only indexes `request-logs` (audit/request logging), and the dashboard charts read MySQL. Flag whether any v2 analytics should be migrated to OpenSearch or whether OpenSearch stays purely for request logs.
- **`/dashboard/settings/[platform]`** is an OAuth callback (redirects to `/settings/accounts`), not analytics — it likely belongs to the Settings/Accounts domain, not this module.
- **Campaigns/Connect timeline shapes** (`timeline` maps keyed by date) are loosely typed in v1; define strict DTOs in v2 OpenAPI to avoid the `Object.keys(timeline)` ad-hoc parsing currently done in the stores.
