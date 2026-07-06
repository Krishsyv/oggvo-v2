# Reviews & Auto-share

> **v2 target:** modules `apps/api/src/modules/reviews` + `apps/api/src/modules/funnel` · tables `reviews`, `funnel_designs` (`@oggvo/db`) · queue `review-puller` (BullMQ, replaces `review-puller-bot`) · build phase 1
> **v1 sources:** frontend `apps/portal-frontend/pages/reviews/{index,create,calendar,statistics}.vue`, `pages/review/[shortname].vue`, `pages/settings/index/review.vue`; store `store/reviews.js`; components `components/Review/*`, `components/Chart/DateRange.vue`, `components/Filters/{Rating,ReviewSource}.vue`; API `app/Controllers/API/V2/{Reviews,AutoSharing}.php`, `app/Controllers/API/V2/Common/Review.php`, `app/Controllers/Web/Review.php`; models `app/Models/{ReviewModel,PlatformWhitelistModel}.php`; lib `app/Libraries/ReviewStyleParams.php`

## 1. Overview
The Reviews domain lets a profile collect reviews from connected platforms (Google, Facebook, Yelp, Zillow, Realtor, Instagram and any platform present in `linkmaster`), manage them in a unified feed, reply (currently Google-only), generate branded review images, share them to social channels, configure auto-share rules, and monitor performance via statistics and a calendar. Reviews arrive automatically through the **review-puller** background job (v1 `review-puller-bot`) or are **added manually** for unlisted platforms. It also powers the **public review-share / feedback funnel page** (`/review/:shortname` in v1) — a profile's hosted landing page where customers leave feedback. Available to any authenticated portal user for their active profile (gated by `profile_id` on the JWT auth context); the public funnel page is unauthenticated. Reviews surface across the product (widgets, social-campaign testimonials, monthly targets), so this domain is foundational.

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/reviews` | `pages/reviews/index.vue` | default (portal) | List/Grid view toggle (cookie `view.reviews.type`) | authed, scoped to `profile_id` |
| `/reviews/create` | `pages/reviews/create.vue` | default | — | authed |
| `/reviews/calendar` | `pages/reviews/calendar.vue` | default | month nav | authed |
| `/reviews/statistics` | `pages/reviews/statistics.vue` | default | responsive: mobile cards / desktop table | authed |
| `/settings/accounts → /settings (Review tab)` | `pages/settings/index/review.vue` | settings | Auto-share config (rating threshold, share template, platforms, message) | authed |
| `/review/:shortname` (public) | `pages/review/[shortname].vue` | **none** (`layout: false`, `auth: false`) | dynamic funnel template (positive/negative/thank-you) | **public** |
| `/social/create/testimonial?review=:id` | (social composer, out-of-domain) | default | — | authed — where the per-review "Share" button lands |

> Note: the per-review "Share" button on the card links to the **social composer** (`/social/create/testimonial?review=ID`). The `POST /reviews/:id/share` endpoint is the backend share path (used for direct publish + scheduling); the social composer ultimately calls share/scheduling APIs. Auto-share rules live in the **Settings → Review** tab, not under `/reviews`.

## 3. Screen-by-screen

### `/reviews` — Reviews feed
![reviews-index](_assets/screens/reviews/index.png) <!-- placeholder until captured -->
- **Purpose & layout** — paginated/infinite-scroll feed of all reviews for the profile. Header has title + profile name and three actions (Calendar, Statistics, Add Review Manually); on mobile these collapse into a dropdown menu. A sticky filter bar sits above the list.
- **Elements / filters**
  - **Search** (`filter.query`, type=search) — placeholder shows total count ("Search over N reviews…"). Searches `Review`, `ReviewerName`, `Site` (LIKE).
  - **Date range** (`DateRangePicker`, `filter.dates` → `[start, end]`, formatted `YYYY-MM-DD`). Single date expands to a full day server-side.
  - **Review Source** filter (`components/Filters/ReviewSource.vue`, `filter.platforms[]`) — populated from `GET /reviews/platforms`; top 10 platforms, remainder bucketed as "Others" (comma-joined sites).
  - **Rating** filter (`components/Filters/Rating.vue`, `filter.ratings[]`) — 1–5 star multi-select.
  - **View toggle** — List vs Grid (cookie-persisted, `masonry` columns).
- **Review card** (`components/Review/Card.vue`): avatar (`ReviewerImage`, `portal.oggvo.com` host rewritten to runtime baseURL), star rating, reviewer name (Oggvo reviews expand a Disclosure showing Email/Phone), review date (`dbToUser`, "MMM D, YYYY"), site logo (`link-logos/{SiteLogo}-sm.png`), review body, optional `SocialReply` line. Footer: row of publish-platform icons (google/facebook/instagram/twitter/linkedin) — dimmed unless already posted, with a tooltip showing created/scheduled times. Footer actions: **Reply** (only `Site == 'Google'` && no existing `SocialReply`), **Share** (link to social composer), and a **Dropdown** menu (Reply, Share, **View** original `ReviewURL`, **Contact** if email/phone present, **Delete**).
- **States** — empty: star icon + "No reviews" + "Add Review Manually" CTA. Loading: 3 `SkeletonsReviewCard`. Infinite scroll: `loadMore` increments `filter.page` while `page < meta.pages`.
- **Modals** — `ReviewDeleteModal`, `ReviewReplyModal`, `ReviewContactModal` (refs opened from card events; see §3 modals below).
- **Interactions** — filters are throttled (1s, deep watch); changing any filter resets to page 1 and refetches; results append on scroll.

### `/reviews/create` — Add Review Manually
![reviews-create](_assets/screens/reviews/create.png)
- **Purpose** — manually record a review received on an unlisted platform.
- **Fields**
  - **Date** (`form.date`, datepicker, default today; submitted as `YYYY/MM/DD`; validated `valid_date[Y/m/d]`, required).
  - **Name** (`form.name`, text, required).
  - **Photo** (`form.image`, file `image/*`, optional; preview via blob URL; defaults to `assets/media/users/default.jpg`).
  - **Review** (`form.review`, textarea rows=5, required; char counter shown).
  - **Platform** (`form.platform`, Listbox sourced from `GET /links/categories` grouped by category, searchable; submits `platform.id` = `linkmaster.ID`). Validated `is_not_unique[linkmaster.ID]`.
  - **Rating** (`form.score`, RatingStar 1–5, default 5; `max_length[5]`, required).
- **Submission** — `POST /reviews` as `multipart/form-data`; on success redirect to `/reviews` + success toast. Field errors mapped from `data.messages`.

### `/reviews/calendar` — Calendar
![reviews-calendar](_assets/screens/reviews/calendar.png)
- **Purpose** — month-grid heatmap of review distribution. Back button to `/reviews`.
- **Elements** — month label + Prev/Next arrows (Next disabled on current month), "Today" button when off current month. Summary: **Total Reviews** and **Average Rating** for the month. Grid: 7-col weekday headers (Sun–Sat); each day cell shaded by review count (alpha 0.1–0.65 of `rgba(21,112,239,…)`), shows day number (today = filled circle), count ("N reviews") and avg ("X.X avg" with star). Loading: 35 pulsing cells.
- **Interactions** — `GET /reviews/calendar?month=YYYY-MM` (watch on month). Clicking a day with reviews sets `store.filter.dates = [date]` and navigates to `/reviews` (single date expands to that full day).

### `/reviews/statistics` — Statistics
![reviews-statistics](_assets/screens/reviews/statistics.png)
- **Purpose** — overview KPIs + per-platform breakdown. Back button to `/reviews`.
- **Desktop** — left KPI column (**Total Reviews**, **Average Rating**, **Review Platforms** count) + `ReviewStatisticsChart` (line chart of reviews/month last year, `GET /reviews/chart`). Below: **Review Platforms** table — columns: Platform (logo + `Site` + `username` from social_stream Page), Average Rating (stars + value), Total Reviews, 30/60/90 Days counts, Status (Active/Inactive badge from social_stream.Active), Actions (placeholder). "Add New Platform" → `/settings/accounts`.
- **Mobile** — KPI cards (Average Rating, Total Reviews, Review Count last 30 days) + per-platform cards with the same all-time / 30 / 60 / 90 day rows. Loading skeletons throughout.
- **Data** — `GET /reviews/statistics` (avg, count, count_last_month, platforms[]).
- **Additional stat components** (used elsewhere / by the social dashboard, also in this domain): `ReviewsOverview.vue` (bar chart of Requests vs Reviews + metrics — `GET /reviews/reviews-overview-chart`), `ReviewsByChannelChart.vue` (doughnut of top 4 sites + "Other" — `GET /reviews/reviews-by-channel`), `GoogleReviewsStats.vue` (Google-only avg + per-score breakdown — `GET /reviews/google-reviews-statistics`). All three accept a `start_at`/`end_at` date range (`Chart/DateRange.vue`).

### `/settings (Review tab)` — Auto-share configuration
![reviews-autoshare](_assets/screens/reviews/autoshare.png)
- **Purpose** — configure automatic publishing of incoming reviews to social pages.
- **Elements**
  - **Rating Threshold** — Switch "Auto publish reviews" toggles on/off (off = `SocialThreshold = -1`). When on, a `RatingStar` sets the minimum star (form value = stored `SocialThreshold + 1`; on submit `SocialThreshold = star - 1`). Warning: reviews under 4 stars not published/rejected are auto-published 14 days after submission.
  - **Share Template** (only when active) — mode toggle **Shuffle** (`rotate`) vs **Fixed**; a grid of templates `type-1…type-5` (radio in Fixed, multi-select round-robin in Shuffle; Shuffle requires ≥2 or none=all). Each card has a **Preview** opening a modal that renders `review/single` in the `SocialPreviewer` for enabled platforms. Saved via `POST /profiles/save-settings` (`AutoReviewShareMode`, `AutoReviewShareTemplates` CSV).
  - **Platforms** (only when active) — per-platform Switch rows (Facebook, Instagram, Google, LinkedIn, Twitter). Toggle on → `POST /reviews/auto-share/activate`; toggle off → `DELETE /reviews/auto-share/deactivate`. State loaded from `GET /reviews/auto-share` (returns `{Platform: bool}` where `true` = enabled = NOT in `platform_whitelist`).
  - **Review Message** — textarea with placeholder-insert dropdown (`[[platform]]`, `[[page]]`, `[[rating]]`, `[[link]]`); default "New Review!". Saved as `SocialReviewMessage`.

### `/review/:shortname` — Public review / feedback funnel (SSR)
![reviews-public](_assets/screens/reviews/public-funnel.png)
- **Purpose & layout** — unauthenticated hosted page rendered from a profile's exported funnel design. Loads `GET /common/review/:shortname` → profile name/UUID, `happyMinimum`, positive/negative/thankyou copy, rating count+avg, the **design** (HTML body + CSS + fonts pulled from S3 `{profileId}/funnels/{funnelId}/html.json`), and active `links` (platform deep-links with logos, rank-ordered). The page injects `<Style>` (design.css) and font `<Link>`s, then dynamically compiles `design.body` as a Vue template (`FunnelRatingStar`, `FunnelVideo` components in scope, `otherData` provided). On fetch failure redirects to `/404`. Spinner while pending.
- **Behaviour** — visitor rates; ratings ≥ `happyMinimum` see "positive"/links; below see "negative" feedback capture; both end at "thankyou". Submitting feedback creates a `review` + `recipient` server-side (v1 `ReviewModel::addReview`, tags recipient "Left Oggvo Feedback", deactivates them).

### Review image render — `GET /review/single` (Web controller, internal)
- Used by `GET /reviews/:id/image` (via `wkhtmltoimage`) and the share-template preview. Renders a 1080×1080 branded review card. Style is driven by `ReviewStyleParams`: `type` (type-1…type-5), `version` (color theme or `custom`), `custom_color` (hex), `person` (avatar illustration), and booleans `brand_logo`/`source_logo`/`reviewer_name`/`reviewer_image`/`action_button`. Reviewer name is truncated per-type to fit. **Known bug (BF-004):** `custom_color` must be passed to BOTH `/image` and `/single` or the cache hash diverges and `/share` misses the generated image.

### Modals
- **Reply** (`Review/ReplyModal.vue`) — trigger: card Reply (Google only). Shows a mini review preview + a `reply` textarea (required). `POST /reviews/:id/reply`. Posts the reply to Google via `GoogleProvider::replyToReview`, then stores `SocialReply`.
- **Delete** (`Review/DeleteModal.vue`) — trigger: card dropdown Delete. Warns deletion does not remove from the platform and removes it from stream/splash widgets. `DELETE /reviews/:id` (soft delete → `PermanentDelete = 1`).
- **Contact** (`Review/ContactModal.vue`) — trigger: card dropdown Contact (when email/phone present). Read-only phone/email with Copy + Text/Email buttons.

## 4. Data & API

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/reviews` | List/search reviews (paginated) | `page`, `limit`(in 4/10/20/40/50/80/100), `query`, `platforms[]`, `ratings[]`, `dates[]` | `{data[], total, page, per_page, pages}`; each review incl. `socials{}` posted-state | `Reviews.php::index` |
| GET | `/reviews/show/:id` | Single review (not permanently deleted) | `id` | review row or 404 | `Reviews.php::show` |
| POST | `/reviews` | Create manual review | multipart: `platform`(linkmaster.ID), `score`, `date`(Y/m/d), `review`, `name`, `image?` | created review (201) | `Reviews.php::create` |
| DELETE | `/reviews/:id` | Soft-delete review | `id` | 200 deleted / fail | `Reviews.php::delete` |
| GET | `/reviews/platforms` | Distinct sites for source filter | — | `[{name, site, sites_count?}]` (top 10 + "Others") | `Reviews.php::platforms` |
| POST | `/reviews/:id/share` | Publish or schedule a review image to socials | `socials[]`(IDs), `reviewMessage?`, `ScheduledDate?`(Y-m-d H:i, Pacific), `params`(style) | `{published[], failed{}}` | `Reviews.php::share` |
| GET | `/reviews/:id/image` | Generate/return branded review image URL | `type`,`version`,`custom_color`,`brand_logo`,`source_logo`,`reviewer_name`,`reviewer_image`,`action_button`,`person`,`force_generate?` | `{url}` (jpg) | `Reviews.php::image` |
| POST | `/reviews/:id/reply` | Reply to a review (Google) | `reply` | 201 / fail | `Reviews.php::reply` |
| GET | `/reviews/statistics` | KPI + per-platform stats | — | `{reviews_avg, reviews_count, reviews_count_last_month, platforms[]}` | `Reviews.php::statistics` |
| GET | `/reviews/chart` | Reviews/month last 12 months | — | `{ "YYYY-MM-01": count }` | `Reviews.php::chart` |
| GET | `/reviews/calendar` | Daily distribution for a month | `month`(YYYY-MM) | `{month, start_at, end_at, days{date:{count,avg}}, total, avg}` | `Reviews.php::calendar` |
| GET | `/reviews/stats` | Monthly reviews vs requests vs targets | `date?` | `{stats:{reviews_count,requests_count}, target:{requests,reviews}}` | `Reviews.php::stats` |
| GET | `/reviews/reviews-overview-chart` | Requests vs reviews time series + metrics | `start_at`,`end_at` | `{data:{reviews{},requests{}}, metrics{...}}` | `Reviews.php::overviewChart` |
| GET | `/reviews/reviews-by-channel` | Top-4 sites + Other | `start_at`,`end_at` | `[{label,count}]` | `Reviews.php::reviewsByChannel` |
| GET | `/reviews/google-reviews-statistics` | Google avg + per-score counts | `start_at`,`end_at` | `{reviews_avg, reviews_count, counts_by_score{}}` | `Reviews.php::googleReviewsStatistics` |
| GET | `/reviews/random` | Random review (widgets/demos) | — | `{review:{ID,ProfileID,ReviewerName,ReviewScore,ReviewURL}}` | `Reviews.php::random` |
| GET | `/reviews/auto-share` | Auto-share platform enablement map | — | `{Facebook:bool, Instagram:bool, Twitter:bool, LinkedIn:bool, Google:bool}` | `AutoSharing.php::index` |
| POST | `/reviews/auto-share/activate` | Enable auto-share for platform | `name`(enum) | message | `AutoSharing.php::activate` |
| DELETE | `/reviews/auto-share/deactivate` | Disable auto-share for platform | `name`(enum) | message | `AutoSharing.php::deactivate` |
| GET | `/common/review/:shortname` | Public funnel page data | path `shortname` | `{profile, happyMinimum, positive, negative, thankyou, rating, design, links[]}` | `Common/Review.php::index` |
| GET | `/review/single` | Internal: render review image HTML | `ID`,`profile_id`,`params`(b64 JSON) | HTML page | `Web/Review.php::single` |

Commented-out / disabled v1 routes (exist in controller, **not routed**): `get`, `count`, `range`, `dates`, `countbymonth`, `toggleoggvoreviews`. Decide per-need in v2.

- **v1 models / tables:** `review` (primary; `ReviewModel`), `platform_whitelist` (`PlatformWhitelistModel` — auto-share opt-OUT list), `linkmaster` (platform catalog + logos), `social_post`/`social_stream` (post status + connected accounts), `invite_recipient`/`invite_scheduler`/`invite_campaign` (requests for stats), `monthly_target`, `profile` (HideOggvoReviews, SocialThreshold, SocialReviewMessage, AutoReviewShareMode, AutoReviewShareTemplates, funnel copy), `funnel_designs` + S3 `html.json`.
- **Pagination / filtering / sorting:** `page`/`limit`; default order `ReviewDate DESC`; total computed via a parallel count query; `platforms[]` supports comma-joined "Others"; single `dates[0]` auto-expands +1 day; soft-deleted rows (`PermanentDelete=1`) always excluded; `Oggvo`-site reviews hidden when `profile.HideOggvoReviews`.

## 5. Business rules
- **Soft delete** — `DELETE` sets `PermanentDelete = 1`; rows are never hard-deleted via the API. All read queries filter `PermanentDelete = 0`.
- **Oggvo reviews visibility** — when `profile.HideOggvoReviews = 1`, `Site = 'Oggvo'` rows are excluded from lists/counts/calendar/stats.
- **Reply** — only Google is implemented (switch statement only handles `Google`). Requires `SocialID` + `LinkID` on the review and a connected social account; reply is pushed to Google then persisted to `SocialReply`. Other platforms silently no-op (return 201).
- **Manual create** — platform must be a valid `linkmaster.ID`; site name resolved from it; default reviewer image used if no upload; image stored under `/assets/media/reviewer-logos/`.
- **Share (publish)** — for each selected social, message templating replaces `[[platform]]/[[page]]/[[rating]]/[[link]]`; default message "New Review! Go check it out! [[link]]". Publishes via per-provider classes (Facebook/Twitter/LinkedIn/Google/Instagram) using the pre-generated review image; records a `social_post` (`createReviewPost`). Per-platform failures are collected in `failed{}` (no rollback). LinkedIn requires completed setup (`PageID`).
- **Scheduling** — if `ScheduledDate` present (format `Y-m-d H:i`, already converted to **US/Pacific canonical DB time** by the frontend), the post is saved with `Status = 0` and `Schedule` set (no immediate publish); the posting bot picks it up. Past-date guard: rejected if `< now - 2 minutes`. Validation `valid_date[Y-m-d H:i]`.
- **Auto-share** — `platform_whitelist` is an **opt-OUT** table: a row means the platform is DISABLED. `activate` deletes the row; `deactivate` inserts one. `auto-share` returns `true` for platforms NOT in the table.
- **Auto-publish threshold** — `profile.SocialThreshold = -1` disables; otherwise reviews with score > threshold are eligible. UI stores star = threshold+1. Reviews under 4 stars (not published/rejected) are auto-published 14 days after submission (handled by the puller/posting bot, not this API).
- **Share-template mode** — `AutoReviewShareMode` (`rotate`|`fixed`); `AutoReviewShareTemplates` CSV of `type-N`. Fixed = exactly one; Shuffle = ≥2 (or empty = all, round-robin).
- **Image cache** — image filename = `{reviewID}{profileID}{Site}_{hash}` where hash = first 8 chars of md5 of normalized `ReviewStyleParams`. Regenerated when missing, when height < 1080, or `force_generate=true`. **BF-004:** `custom_color` must be identical across `/image` and `/single` or the `/share` lookup misses.
- **Stats / requests** — "requests" counts `invite_scheduler` rows joined to `invite_campaign` (Email/SMS, Sent=1, IsTest=0). Conversion = reviews × 100 / requests.
- **Calendar** — `avg` is review-count-weighted across days; month must match `YYYY-MM`.
- **Public funnel** — feedback below `happyMinimum` routes to negative capture; submission tags recipient "Left Oggvo Feedback", sets recipient Inactive, deletes that recipient's prior reviews, and inserts a new review (source = funnel/site).

## 6. Integrations
- **Google Business Profile** (`GoogleProvider`) — pull reviews, reply to reviews, publish post. OAuth token with expiry.
- **Meta (Facebook / Instagram)** (`FacebookProvider`, `InstagramProvider`) — publish review image posts; page token.
- **Twitter/X** (`TwitterProvider`) — publish with local image (OAuth1 consumer key/secret + token/secret).
- **LinkedIn** (`LinkedInProvider`) — publish (requires completed page setup).
- **AWS S3** — funnel design `html.json` (body/css/fonts) for the public page.
- **wkhtmltoimage** — server-side render of 1080×1080 review images (`config('App')->wkhtmltoimageBinary`).
- **Review puller** (v1 `review-puller-bot`) — async ingestion of platform reviews → v2 BullMQ `review-puller` queue.
- **Posting bot** — consumes scheduled `social_post` rows (shared with social/campaign domains).
- No inbound webhooks specific to this domain in v1 (pull-based).

## 7. v1 → v2 mapping
- **Module:** `apps/api/src/modules/reviews` (controller/service/repository/DTO) for CRUD, reply, share/schedule, image, stats, calendar, auto-share; `apps/api/src/modules/funnel` for the public funnel page data (`/common/review/:shortname`) and `funnel_designs` management.
- **Drizzle tables:**
  - `reviews` (`@oggvo/db`, `packages/db/src/schema/reviews.ts`) — fields renamed snake_case: `Site→site`, `Review→body`, `ReviewScore→score`(numeric 3,1), `ReviewURL→url`, `ReviewDate→review_date`(timestamptz), `ReviewerName→reviewer_name`, `ReviewerImage→reviewer_image`, `SocialID→social_account_id`(fk), `SocialReply→social_reply`, `SocialReplyID→social_reply_id`, `LinkID→link_id`, `RecipientID→recipient_id`, `PermanentDelete→permanent_delete`(bool). Indexes on profile, profile+site, review_date. v1 `review_backup` dropped.
  - `funnel_designs` (`packages/db/src/schema/widgets.ts`) — `slug`, `active`, `exported_json` (jsonb, replaces S3 `html.json`), `exported_html`. **Shape change:** v2 stores design inline (jsonb/html) instead of S3 fetch — funnel page reads DB, not S3.
  - **Auto-share whitelist** (`platform_whitelist`) — no dedicated v2 table found; either re-add as `review_auto_share` or fold into a `profiles` JSON/columns. **Flag as schema gap.**
  - Auto-share settings (`SocialThreshold`, `SocialReviewMessage`, `AutoReviewShareMode`, `AutoReviewShareTemplates`) live on `profiles` in v1 — confirm v2 `profiles` carries them.
- **Queue:** `review-puller` (BullMQ) replaces `review-puller-bot` for ingestion; scheduled shares enqueue to the social posting queue (shared with social domain).
- **Frontend:** v2 routes under `apps/web/app/(portal)/reviews/{page,create,calendar,statistics}`; auto-share under settings. Public funnel = `apps/web/app/(public)/r/[shortname]/page.tsx` (already scaffolded) — **SSR**, fetching funnel design + links + copy. Reuse `@oggvo/ui` for cards, modals (themed ConfirmModal per memory), rating stars, charts.
- **Endpoint mapping (RESTful, OpenAPI-typed):**
  - `GET /reviews` → `GET /reviews` (query params + cursor/offset pagination)
  - `GET /reviews/show/:id` → `GET /reviews/:id`
  - `POST /reviews` → `POST /reviews`
  - `DELETE /reviews/:id` → `DELETE /reviews/:id` (soft)
  - `GET /reviews/platforms` → `GET /reviews/platforms`
  - `POST /reviews/:id/share` → `POST /reviews/:id/share`
  - `GET /reviews/:id/image` → `GET /reviews/:id/image` (or async render job)
  - `POST /reviews/:id/reply` → `POST /reviews/:id/reply`
  - `GET /reviews/statistics|chart|calendar|stats|reviews-overview-chart|reviews-by-channel|google-reviews-statistics|random` → consolidate under `GET /reviews/stats/*`
  - `GET /reviews/auto-share` + activate/deactivate → `GET/PUT /reviews/auto-share` (single PUT with enabled-set is cleaner than opt-out delete/insert)
  - `GET /common/review/:shortname` → `GET /funnel/:shortname` (public)
- **Known v1 bugs to fix:**
  - **BF-004** image/share/single `custom_color` cache-hash divergence — normalize once server-side.
  - `overviewChart`/`reviewsByChannel`/`googleReviewsStatistics` interpolate `$startAt`/`$endAt` straight into raw `where()` strings — **SQL injection risk**; use parameterized queries.
  - `overviewChart` swaps comparison operators (`<= $startAt`, `>= $endAt`) — start/end appear inverted; verify intended semantics.
  - `getReviews` builder mutates `$this` (shared model instance) for count + data — N+1 / state-bleed; use isolated queries.
  - Reply only supports Google despite generic UI — either extend providers or gate UI accordingly.
  - Auto-share opt-OUT semantics are unintuitive (row = disabled) — invert in v2.
  - `share` typo "valide", and `deactivate` returns "Platform activated successfully" message.

## 8. Open questions / parity risks
- **platform_whitelist has no v2 table** — where do auto-share enabled platforms live? (schema gap — needs `review_auto_share` table or `profiles` JSON column.)
- **Funnel storage moves S3 → DB jsonb** — migration must export each `{profileId}/funnels/{funnelId}/html.json` into `funnel_designs.exported_json`/`exported_html`. Confirm fonts/css handling and the dynamic-template compile approach in React/Next (v1 compiles a Vue template at runtime — needs a different rendering strategy in v2, e.g. sanitized HTML injection).
- **Review image generation** — v1 shells out to `wkhtmltoimage`. v2 needs a headless-render approach (Playwright/Puppeteer worker) likely as an async job; confirm queue + storage (S3) for generated images.
- **Auto-publish 14-day rule** — owned by the puller/posting bot, not the API. Confirm where this scheduling lives in v2 (`review-puller` worker vs social posting queue).
- **`SocialThreshold` star off-by-one** (stored = star−1) — confirm v2 keeps or normalizes to a plain 1–5 minimum.
- **Timezone** — share scheduling assumes US/Pacific canonical DB time converted on the frontend. v2 should store UTC + per-profile tz; confirm parity with the social/campaign scheduler contract.
- **Public feedback submission endpoint** — the `/review/:shortname` page renders the funnel, but the POST that creates a review/recipient from visitor feedback (`ReviewModel::addReview`) was not in the routed `/reviews` group; locate and spec the public submission endpoint (likely under `/common`).
- **`random`/`chart`/`overview` consumers** — confirm which widgets/dashboards depend on these before consolidating endpoints.
- **`reviews.score` numeric(3,1)** in v2 vs v1 integer-ish `ReviewScore` — confirm half-star support is intended.
