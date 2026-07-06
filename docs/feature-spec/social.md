# Social

> **v2 target:** module `apps/api/src/modules/social` · tables `social_accounts`, `social_posts`, `social_post_media`, `social_campaigns`, `social_campaign_posts`, `social_insights`, `scheduled_posts_automator`, `platform_whitelist` (`@oggvo/db`) · queues `social-publish` + `post-automator` (BullMQ) · build phase 3
> **v1 sources:** frontend `apps/portal-frontend/pages/social/*`, stores `store/{posts,scheduledPosts,contentPlanner,dachboardSocial}.js` + `components/Social/*`, API `apps/portal-api/app/Controllers/API/V2/{Posts,Socials,SocialCampaigns}.php` + `OAuth/{Facebook,Google,Linkedin,Twitter}.php`, models `app/Models/{SocialModel,PostModel,PostMediaModel,SocialCampaignModel,CampaignPostModel,PostAutomatorModel,PlatformWhitelistModel}.php`, services `app/Services/SocialPublisher.php` + `app/Services/Providers/{Facebook,Google,LinkedIn,Twitter,Instagram}Provider.php`, helper `app/Helpers/post_helper.php`, async `lambdas/social-bot/*`, `lambdas/post-automator-bot/*`

## 1. Overview
The Social domain lets a business publish to its connected social networks (Facebook, Instagram, LinkedIn, Twitter/X, Google Business Profile) from one place. A user composes a post (text + media), picks one or more connected accounts, sees a per-platform preview, and either publishes immediately or schedules it for later. From reviews, the user can also generate a branded **testimonial** image and share it. The **Content Planner** turns the review backlog into an automated drip campaign: pick a posting-time preset, a date range, platforms, a testimonial style and a minimum rating, and the system schedules one branded review post per selected slot. A **Statistics** screen shows post counts per platform plus review/posted/available counts. Connected-account management and the OAuth connect flows live partly here and partly under Settings → Accounts.

Access: any authenticated profile with at least one connected, postable social account (`Facebook`, `Twitter`, `Google`, `LinkedIn`, `Instagram`). All endpoints are profile-scoped via `request.auth.profile_id`; there is no extra role gate in v1.

Publishing is **asynchronous**: the API only writes rows to `social_post` (status `0` = queued); a separate Go worker (`social-bot`, EventBridge cron) claims `Status=0` rows with `SELECT … FOR UPDATE SKIP LOCKED`, calls the per-platform provider, and stamps `Status`, `URL`, `SocialID`, `FailureReason`, `Attempts`, `ClaimedAt`, `NextAttemptAt`. The Content Planner / automator rows (`campaign_posts`, `scheduled_posts_automator`) are picked up by `post-automator-bot` on schedule. In v2 these map to BullMQ `social-publish` and `post-automator` queues.

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/social` | `pages/social/index.vue` | default | list/grid timeline of posts | authed |
| `/social/create/post` | `pages/social/create/post.vue` | default | — | authed (composer) |
| `/social/create/testimonial` | `pages/social/create/testimonial.vue` | default | — | authed; entered with `?review=<reviewID>` |
| `/social/create/story` | `pages/social/create/story.vue` | default | — | authed (**UI stub — not wired to API**) |
| `/social/edit/[id]` | `pages/social/edit/[id].vue` | default | — | authed; only `Status ∈ {0,-1}` (pending/scheduled/failed) editable |
| `/social/statistics` | `pages/social/statistics.vue` | default | — | authed |
| `/social/content-planner` | `pages/social/content-planner/index.vue` | default | TabBar status filter (Cancelled/Generating/Running/Completed/all) | authed |
| `/social/content-planner/create` | `pages/social/content-planner/create.vue` | default | — | authed; needs reviews available + postable accounts |
| `/social/content-planner/[id]` | `pages/social/content-planner/[id].vue` | default | list/grid of campaign posts | authed; `[id]` = campaign UUID (16 hex) |

Connected accounts management lives under **Settings → Accounts** (`/settings/accounts`); this domain links to it ("Add New Platform" buttons) and owns the underlying `/socials` + `/oauth` endpoints.

## 3. Screen-by-screen

### `/social` — Timeline
![index](_assets/screens/social/index.png) <!-- placeholder until captured -->
- **Purpose & layout** — Paginated feed of all this profile's social posts (any platform/status). Header has Statistics, Content Planner, and an "Add New" dropdown (New Post; New Testimonial/New Story are commented out in v1).
- **Elements / fields**
  - Search input — free-text over `Message` (`filter.query`); placeholder shows total count.
  - `DateRangePicker` (`filter.dates`) — two dates, formatted `YYYY-MM-DD` for the query.
  - `SocialFilterStatus` — multi-select status: Failed (`-1`), Pending (`0`), Published (`1`), Scheduled (`2`). Sent to API as named statuses (`Published`,`Pending`,`Scheduled`,`Failed`) and bit-summed server-side (see §5).
  - `SocialFilterPlatform` — multi-select of `Facebook, Google, Instagram, Linkedin, Twitter`.
  - View toggle List ↔ Grid (persisted in cookie `view.posts.type`, default `grid`).
  - List: `SocialPostCard` per post. Grid: posts grouped by `MMMM YYYY` (from `CreateDate`) in collapsible `Disclosure` sections with `SocialPostTile`.
  - Each card/tile shows platform icon, message, media thumbnails, status badge, schedule/created date, and per-post actions (edit, delete, **retry** for failed).
- **States** — loading skeletons (`SkeletonsSocialPostCard`/`Tile`); empty: megaphone icon + "No posts"; infinite scroll via `v3-infinite-loading` (`loadMore` increments `filter.page` while `< meta.pages`).
- **Modals** — `SocialDeleteModal` (delete confirm); delete returns a warning if the post was published and could not be removed upstream (Instagram never removed — provider is a stub).
- **Interactions** — filters are `throttledWatch`-debounced (1s) and reset to page 1; retry POSTs `/posts/{id}/retry`.

### `/social/create/post` — New Post (composer)
![create-post](_assets/screens/social/create-post.png) <!-- placeholder until captured -->
- **Purpose & layout** — Two-column: left = form, right = sticky `SocialPreviewer` rendering a live per-platform preview of text + media.
- **Elements / fields**
  - `PlatformsCombobox` (`form.platforms`, required) — multi-select of connected postable accounts (from `GET /socials/get?postableOnly=1`). Each item `{ id, name, page, pageID, active }`.
  - Message — `TextInput` textarea (`form.text`), char counter, no client max (server enforces per-platform via `text_limit`).
  - Media — `MediaPicker` (Media Library tab + Upload tab, `source="Social"`) → `form.media` array of `{ id, type: 'image'|'video', name }`. Drag-reorder via `useSortable` (`.grip` handle); per-file `MultiUploadFile` with delete.
  - Inline tips: Instagram ≤10 photos; Twitter ≤4 photos (shown when those platforms selected).
  - `DateTimePicker` (`form.schedule`, `future-only`) — optional schedule; button label switches "Post Now" ↔ "Schedule".
  - Reset button clears the form.
- **States** — submit loading spinner; per-platform error messages surfaced from API `messages` map (keyed by platform name) into a notify toast + inline `errors.socials/Schedule/Message`.
- **Submit** — `POST /posts` `{ socials:[id], photos:[imageId], videos:[videoId], Schedule:"Y-m-d H:i", Message }`. `Schedule` is converted user-TZ → DB-TZ (`userToDb`). On success → redirect `/social` + success toast.

### `/social/create/testimonial` — New Testimonial
![create-testimonial](_assets/screens/social/create-testimonial.png) <!-- placeholder until captured -->
- **Purpose & layout** — Generate a branded testimonial image from a review (`?review=<ID>`, loaded via `GET /reviews/show/{id}`), then share. Right side = `SocialPreviewer` rendering the testimonial via an iframe (`{baseURL}review/single?ID=&profile_id=&params=<base64 json>`).
- **Elements / fields**
  - `PlatformsCombobox` (`form.socials`, `postableOnly`).
  - Description textarea (`form.reviewMessage`, default `"New Review! Go check it out! [[link]]"`) — supports `[[link]]`, `[[rating]]` tokens, char counter.
  - Read-only review fields: testimonial text, reviewer first name, rating (`RatingStar`), reviewer image.
  - Style controls (`params`): Color (`ColorInput` + 6 presets), Testimonial Style (`type-1`…`type-5`), and conditional toggles by style: Brand Logo, Source Logo, Reviewer Name, Reviewer Image, Action Button, Person (`guy1..3/girl1..3`, type-2 only). `force_generate:true`.
  - `DateTimePicker` (`form.ScheduledDate`, future-only) — "Post Now" ↔ "Schedule".
- **Submit** — two-step: `GET /reviews/{ID}/image?<params>` (render/cache the image) then `POST /reviews/{ID}/share` `{ socials:[id], reviewMessage, ScheduledDate, params }`. Response returns `{ published:[names], failed:{name:msg} }` → per-platform success/error toasts.

### `/social/create/story` — New Story
![create-story](_assets/screens/social/create-story.png) <!-- placeholder until captured -->
- **Purpose & layout** — UI scaffold only: platform text input, Category/Template/Version listboxes, drag-and-drop media area, three mock progress rows, datepicker, "Post Now". `onSubmit` is empty; **no API call wired**. Flag as not-implemented; decide in v2 whether to build or drop.

### `/social/edit/[id]` — Edit Post
![edit](_assets/screens/social/edit.png) <!-- placeholder until captured -->
- **Purpose & layout** — Edit a single un-published post. Platform is fixed (a post belongs to one account) and shown as a read-only chip. `GET /posts/{id}` loads `{ SocialName, textLimit, Message, Schedule, media[] }`.
- **Elements / fields** — Message textarea with char counter vs `textLimit` (0 = no limit); Media picker + drag-reorder; `DateTimePicker` schedule. Validation banners: over text limit; Google >1 image; Instagram requires ≥1 media.
- **Submit** — `POST /posts/{id}` `{ photos, videos, Schedule, Message }`. Save disabled while over-limit / Google-multi-image / Instagram-no-media. On success → `/social`. Backend re-queues the row atomically (transaction + `FOR UPDATE`, resets `Status=0`, clears `SocialID/URL/FailureReason/Attempts/ClaimedAt/NextAttemptAt`); rejects if the bot has it claimed within the last 10 min.

### `/social/statistics` — Statistics
![statistics](_assets/screens/social/statistics.png) <!-- placeholder until captured -->
- **Purpose & layout** — Three stat cards (Total Review Count, Total Reviews Posted, Reviews Available To Post) + a per-platform post-count table (30 days / 90 days / total + Active/Inactive status). Mobile = stacked card-tables; desktop = one table. "Add New Platform" → `/settings/accounts`.
- **Data** — `GET /posts/statistics` → `{ reviews_count, posted_reviews_count, available_reviews_count, platforms:[{ SocialName, username, active, posts_count, posts_count_30, posts_count_90 }] }`.

### `/social/content-planner` — Content Planner History
![content-planner](_assets/screens/social/content-planner.png) <!-- placeholder until captured -->
- **Purpose & layout** — Table of campaigns. Columns: ID (`#`+UUID[0:7], links to detail), Date (`CreatedOn`), Status badge, Posts (`Processed/Total`), Progress (`ProgressBar` of `Rate`%), row actions (Browse Posts, Delete).
- **Elements** — `TabBar` status filter (Cancelled `-1`, Generating `0`, Running `1`, Completed `2`, all). Manual numbered pagination (`paginationPageNumbers`). "Add Campaign" → create.
- **Modals** — `ContentPlannerDeleteModal` / `SocialCampaignDeleteModal` (cancel campaign, hidden when Status `-1`).
- **Data** — `GET /socials/campaigns?status=&page=` → `{ campaigns:[{ ID, UUID, ProfileID, Status, CreatedOn, InProgress, Total, Processed, Pending, Rate }], total, pages }`.

### `/social/content-planner/create` — New Campaign
![content-planner-create](_assets/screens/social/content-planner-create.png) <!-- placeholder until captured -->
- **Purpose & layout** — Configure an automated testimonial drip. Right side = `SocialPreviewer` of a random sample review (`GET /reviews/random`).
- **Elements / fields**
  - Posting-time **Preset** listbox (from `GET /presets`; private vs recommended; inline edit/delete via `SocialCampaignPresetModal`; CRUD on `/presets`). Each preset = day→times map.
  - Campaign Duration — date range picker with shortcuts (1wk…1yr); `range` sent as humanized duration.
  - `PlatformsCombobox` (`selectedPlatforms`, postableOnly).
  - Description (`[[link]]`,`[[rating]]`,`[[platform]]`,`[[page]]` tokens).
  - Minimum Rating (`RatingStar`, default 4) with warning that lower-rated reviews are excluded.
  - Style params: Version (color), Testimonial Style (`type-1..5`), Person (type-2), toggles (Brand/Source Logo, Reviewer Name/Image, Action Button) — same `params` shape as testimonial.
  - Computed `postsToSchedule = dates.length × platforms.length`. "Change Review" reloads a random review.
- **Submit** — `POST /socials/campaigns` `{ socials:[id], description, dates:[…], preset:{day:[times]}, range, min_rating, type, version, person, brand_logo, source_logo, reviewer_name, reviewer_image, action_button }`. Server picks N un-posted reviews (≥ min_rating, not already in a pending campaign), creates a `social_campaigns` row + one `campaign_posts` row per (review × social). Per-platform text-length errors returned in `messages`. On success → `/social/content-planner/history`.

### `/social/content-planner/[id]` — Campaign timeline
![content-planner-detail](_assets/screens/social/content-planner-detail.png) <!-- placeholder until captured -->
- **Purpose & layout** — Like `/social` but scoped to one campaign's posts; info tags show Total Posts, frequency, period, days, posted-on platforms.
- **Elements** — Search, DateRangePicker, `SocialCampaignStatus`, `SocialCampaignPlatform`, list/grid toggle, infinite scroll. Posts are read-only (`can-delete=false`).
- **Data** — `GET /socials/campaigns/posts?ID=<uuid>&page=&query=&status=&socials=&dates[]=` → `{ total, pages, groups:{year:{month:[posts]}}, group_counts, campaignInfo:{ platforms, days, preset, duration, range[] } }`.

## 4. Data & API

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v2/posts` | List/paginate posts | `page, perpage(10/20/50/100), query, platforms[], statuses[], dates[]` | `{ page, perpage, total, pages, data:[post] }` | `Posts.php::index` |
| POST | `/api/v2/posts` | Create post(s) → queue | `socials[], photos[], videos[], Schedule, Message` | `201` or `fail(messages)` | `Posts.php::create` |
| GET | `/api/v2/posts/(:num)` | Single post for edit | path id | `{ SocialName, textLimit, Message, Schedule, Type, media[] }` | `Posts.php::show` |
| POST | `/api/v2/posts/(:num)` | Update + re-queue post | `photos[], videos[], Schedule, Message` | `{ message }` or `fail` | `Posts.php::update` |
| DELETE | `/api/v2/posts/(:num)` | Delete (+ attempt upstream removal) | path id | `{ message, platform, removed_from_platform, warning }` | `Posts.php::delete` |
| POST | `/api/v2/posts/(:num)/retry` | Re-queue a failed post | path id | `{ message }` | `Posts.php::retry` |
| GET | `/api/v2/posts/count` | Per-platform counts (dashboard chart) | `dates(months), platforms[]` | `{ total, target, socials, scheduled, posted, newReviews, platformCount, platforms }` *(v1 body largely stubbed)* | `Posts.php::count` |
| GET | `/api/v2/posts/statistics` | Stats page data | — | `{ reviews_count, posted_reviews_count, available_reviews_count, platforms[] }` | `Posts.php::statistics` |
| GET | `/api/v2/posts/stats` | Monthly KPIs vs target | `date` | `{ stats{posts_count,reviews_posted,available_reviews,scheduled_posts}, target{posts,reviews} }` | `Posts.php::stats` |
| GET | `/api/v2/posts/overview-chart` | Per-platform timeline | `months(1/3/6/12)` | `{ metrics{platform:{total,recent,rate}}, timeline{date:{platform:n}} }` | `Posts.php::overviewChart` |
| GET | `/api/v2/socials` | Index (campaign post info + post-date limits) | — | `{ campaign_post, post_dates_limits }` | `Socials.php::index` |
| GET | `/api/v2/socials/get` | Connected accounts | `active(bool), postableOnly(bool)` | `[{ id, name, page, pageID, active }]` | `Socials.php::get` |
| GET | `/api/v2/socials/getpostable` | Active+postable accounts | — | `[{ id, name, page, pageID, active }]` | `Socials.php::getpostable` |
| POST | `/api/v2/socials/getgoogleaccounts` | List Google GBP accounts | `ID(socialID)` | `{ accounts }` | `Socials.php::getgoogleaccounts` |
| POST | `/api/v2/socials/getgooglelocations` | List GBP locations | `ID, Name, filterSearch` | `{ locations }` | `Socials.php::getgooglelocations` |
| POST | `/api/v2/socials/savegooglelocation` | Save chosen GBP location(s) | `ID, location[]` | `{ message }` | `Socials.php::savegooglelocation` |
| POST | `/api/v2/socials/getlinkedinaccounts` | List LinkedIn pages/profile | `ID` | `{ accounts }` | `Socials.php::getlinkedinaccounts` |
| POST | `/api/v2/socials/savelinkedinaccounts` | Save selected LinkedIn pages | `ID, accounts[]` | `{ message }` | `Socials.php::savelinkedinaccounts` |
| POST | `/api/v2/socials/save` | Save non-OAuth source (Zillow/FUB) | `name, type, profile, url…` | `{ description }` / FUB message | `Socials.php::save` |
| POST | `/api/v2/socials/updateQbScope` | QuickBooks scope URL | `permissions[]` | `{ url }` | `Socials.php::updateQbScope` |
| DELETE | `/api/v2/socials/(:num)` | Disconnect account (revoke + cleanup) | path id | `respondDeleted` | `Socials.php::delete` |
| GET | `/api/v2/socials/campaigns` | List content-planner campaigns | `status, page` | `{ campaigns[], total, pages }` | `SocialCampaigns.php::index` (also `Socials.php::campaigns`) |
| POST | `/api/v2/socials/campaigns` | Create campaign | see §3 create | `201` or `fail(messages)` | `SocialCampaigns.php::create` |
| GET | `/api/v2/socials/campaigns/posts` | Campaign posts (grouped) | `ID(uuid), page, query, status, socials, dates[]` | `{ total, pages, groups, group_counts, campaignInfo }` | `SocialCampaigns.php::posts` |
| DELETE | `/api/v2/socials/campaigns/(:segment)` | Cancel campaign + its posts | path id | `respondDeleted` | `SocialCampaigns.php::delete` |
| GET/POST/DELETE | `/api/v2/presets…` | Posting-time presets CRUD | — | preset list | `Presets.php` |
| GET | `/api/v2/oauth/{facebook,twitter,linkedin,google}` | OAuth callback handler (exchanges code, saves accounts) | provider code/state query | `respond('… connected successfully')` / `fail` | `OAuth/{Facebook,Twitter,Linkedin,Google}.php::redirect` |
| GET/POST | `/api/v2/reviews/{id}/{image,share}` | Render + share testimonial | see §3 | `{ published[], failed{} }` | `Reviews.php::image/share` |

- **v1 models / tables (note the rename surprises):**
  - `social_stream` ← `SocialModel` (connected accounts). **v2 = `social_accounts`.** Columns: `Name, Page, PageID, AuthorizationID, AuthorizationToken, AuthorizationSecret, AuthorizationExpiry, SignatureKey, ProfileID, Active, CreateDate, LastUpdated, DeleteDate` (soft-delete).
  - `social_post` ← `PostModel`. **v2 = `social_posts`.** Columns: `ProfileID, SocialID, SocialName, URL, LinkID(→social_stream.ID), ReviewID, Message, Type(text/photo/video/review), StyleParams, Schedule, Status, FailureReason, Likes, CreateDate, LastUpdated` + race/retry cols `Attempts, NextAttemptAt, ClaimedAt`.
  - `social_post_media` ← `PostMediaModel`. **v2 = `social_post_media`.** `ProfileID, LinkID, PostID, MediaID`(→image/video).
  - `social_campaigns` ← `SocialCampaignModel`. `UUID, ProfileID, StyleParams, Time, PostOn(days CSV), Preset(json), Type, Status`.
  - `campaign_posts` ← `CampaignPostModel`. **v2 = `social_campaign_posts`.** `CampaignID, ReviewID, LinkID, Description, ScheduleDate, Status, Processed`.
  - `scheduled_posts_automator` (+ `cancelled_posts_automator`) ← `PostAutomatorModel` — legacy auto-share campaigns. `CampaignID, ProfileID, ReviewID, Description, ScheduleDate, Status, StyleParams, SocialID`.
  - `platform_whitelist` ← `PlatformWhitelistModel` — per-profile list of **deactivated** auto-share platforms (`ProfileID, SocialName`), used by `AutoSharing` controller (`/reviews/auto-share`).
  - `social_insights` — **no v1 table**; new in v2 (see §8).
  - Joined for media/preview: `image`, `video`, `review`.
- **Pagination / filtering / sorting:** `/posts` page-based (`page` + `perpage` in `[10,20,50,100]`), ordered by `IFNULL(Schedule, CreateDate) DESC`; status filter uses a bit-sum map (§5); platform/date/search filters all server-side. Campaign lists fixed `limit=10`. Campaign posts grouped by year→month with a separate group-count query.

## 5. Business rules
- **Async publishing.** `POST /posts` only writes rows with `Status=0` (queued). The Go `social-bot` (EventBridge cron) claims rows via `SELECT … WHERE Status=0 FOR UPDATE SKIP LOCKED`, stamps `ClaimedAt`, publishes per-platform, then sets `Status=1`(published, with `URL`/`SocialID`) or `Status=-1`(failed, `FailureReason`). `-2` is a transient sentinel used during multi-row image inserts. → v2 `social-publish` BullMQ queue.
- **Status semantics:** `-1` Failed · `0` Pending(if `Schedule` null) / Scheduled(if `Schedule>now`) · `1` Published · `-2` in-progress sentinel. Timeline status filter bit-sums chosen statuses (`Published=1,Pending=2,Scheduled=5,Failed=9`) and branches on the sum (1–16) — replace with explicit enum filters in v2.
- **Per-platform formatting & limits** (`post_helper.php`, single source of truth): text limits Facebook 63200, LinkedIn 3000, Google 1500, Twitter 280, Instagram 0(none here). Image size: FB 30MB, Google 10MB, Twitter/LinkedIn 5MB. Video 50MB. **Google = one image per post** (each image becomes its own post row). **Instagram requires ≥1 media** (no text-only) and ≤10 photos; **Twitter ≤4 photos**. Each (platform × media) creates its own `social_post` row; validation errors are returned keyed by platform name.
- **Editing:** only `Status ∈ {0,-1}` posts; platform is immutable. Update re-validates text/media, rewrites media, resets to `Status=0` and clears publish bookkeeping inside a transaction with `FOR UPDATE`; rejects if claimed within last 10 minutes ("currently being published").
- **Retry:** only `Status=-1`; resets `Status=0`, `FailureReason=null`, `Attempts=0`, `NextAttemptAt=null`.
- **Delete:** removes from Oggvo regardless of upstream; attempts upstream removal only for FB/Twitter/LinkedIn/Google when account still connected and post was published (`SocialID` set). **Instagram delete is a no-op stub** → warning returned. `removed_from_platform` ∈ {null,true,false}; `warning` text built accordingly. Campaign posts have their status mirrored back into `campaign_posts` on delete.
- **Scheduling / timezone:** schedule sent as `Y-m-d H:i`, converted user→DB TZ client-side (`userToDb`); edit converts DB→user (`dbToUser`). Validation parses with `DateTime::createFromFormat("Y-m-d H:i")`. Composer enforces future-only.
- **Content Planner:** picks reviews not already posted/in a pending campaign, `ReviewScore ≥ min_rating` (default 4, clamped 1–5), one slot per date from the preset×range expansion. Days CSV is Sunday=0…Saturday=6. Campaign delete = cancel (`Status=-1`) + delete its `social_post` rows, mirroring statuses to `campaign_posts`. Campaign UUID = `substr(md5(profileId.time()),0,16)`, must match `/^[a-f0-9]{16}$/`.
- **Testimonial generation:** style params base64-JSON-encoded into an iframe/render URL; share is two-step (render image, then share). Description tokens `[[link]] [[rating]] [[platform]] [[page]]` replaced server-side.
- **Side effects:** post create/edit enqueues publish (cron worker); campaign create enqueues automator processing; FB connect subscribes the page to webhook events; Google/LinkedIn share tokens across profiles with the same underlying account.

## 6. Integrations
- **Meta (Facebook + Instagram)** — Graph API. FB OAuth via `JanuSoftware\Facebook`: exchange code → long-lived token → `/me/accounts` (pages) → derive `instagram_business_account`; subscribe pages to webhooks. Publishing via `FacebookProvider`/`InstagramProvider` (IG = create container → poll status → publish, Reels deferred re-check). Webhooks: `trigger`/`verify` routes for Facebook & Instagram.
- **Twitter/X** — `TwitterProvider` using `dghubble/oauth1` + go-twitter (bot) / abraham-twitteroauth-style flow (API). Delete by parsing post id from `status/<id>` URL.
- **LinkedIn** — `LinkedInProvider`; member + organization pages; 60-day token + refresh-expiry check auto-deactivates expired accounts on list.
- **Google Business Profile** — `GoogleProvider` (OAuth2 refresh-token). Account → location selection (`getLocations`/`getLocationsInfo`), saves `accounts/{loc}` PageID, writes review link + place/maps info; shares token across profiles with same Google user; revokes only when no sibling connection remains.
- **Zillow / FollowUpBoss / Clio / Stripe / Square / Clover / Liondesk / Pre-Approve Me / QuickBooks** — also flow through `Socials.php::save`/`delete` and `/oauth/*` (review-source & CRM connections), not posting targets — out of core scope but share the `social_stream`/`social_accounts` table.
- **Async workers:** `lambdas/social-bot` (publish + delete), `lambdas/post-automator-bot` (drip campaigns), `lambdas/activator-bot`. AWS EventBridge cron + SQS in v1 → BullMQ in v2.

## 7. v1 → v2 mapping
- **Module:** `apps/api/src/modules/social` with controllers (posts, accounts, campaigns, oauth), services (`SocialPublisherService` + per-provider strategy classes mirroring `Providers/*`), repositories per table, DTOs typed via OpenAPI.
- **Drizzle tables (`@oggvo/db`):**
  - `social_accounts` ← `social_stream` (rename; keep soft-delete; consider encrypting `AuthorizationToken/Secret`).
  - `social_posts` ← `social_post` (keep `Attempts/NextAttemptAt/ClaimedAt` for queue claiming).
  - `social_post_media` ← same (FK to media tables).
  - `social_campaigns` ← same; `social_campaign_posts` ← `campaign_posts` (rename).
  - `social_insights` — **new**: per-post engagement (likes/impressions/clicks) since v1 only has a `Likes` counter; design as a home for analytics on the Statistics screen.
  - `scheduled_posts_automator` ← legacy automator (+ decide whether to keep `cancelled_posts_automator` or fold into a status column).
  - `platform_whitelist` ← same (auto-share opt-out).
- **Queues:** `social-publish` (immediate + scheduled post publishing, delete-upstream, retry with backoff via `Attempts/NextAttemptAt`); `post-automator` (drip-campaign + auto-share generation).
- **Frontend:** v2 routes under `apps/web/app/(portal)/social/*` mirroring §2; reuse `@oggvo/ui` components for the post card/tile, platform combobox, date/time pickers, preview, and confirm modal (use themed `ConfirmModal`, never native confirm — per project memory).
- **Endpoint mapping (RESTful):** `GET /posts` → `GET /social/posts`; `POST /posts` → `POST /social/posts`; `GET/PUT/DELETE /posts/{id}` → `/social/posts/{id}`; `POST /posts/{id}/retry` → `POST /social/posts/{id}/retry`; `/posts/statistics|stats|overview-chart` → `/social/analytics/*`; `/socials/get|getpostable` → `GET /social/accounts`; google/linkedin sub-account endpoints → `/social/accounts/{id}/google-locations` etc.; `/socials/campaigns*` → `/social/campaigns*`; testimonial share stays under reviews module but reuses the publisher.
- **Known v1 bugs / debts to fix:**
  - **Story page is a non-functional stub** — build or remove.
  - `Posts::count` / `getTotalAndChange` is almost entirely commented out (returns `[]`) yet the dashboard store consumes its shape — rebuild the endpoint properly.
  - `utf8_encode()` on messages is deprecated/lossy — use proper UTF-8 handling.
  - Status filter bit-sum logic is fragile — replace with explicit enum/array filters.
  - Raw string interpolation of `$dates[0]/$dates[1]` and `$profileId` into SQL `where()` — parameterize.
  - `getReadableSize` loop bug (`$i++ < $units` compares int to array).
  - Token storage in plaintext columns — encrypt at rest in v2.
  - `-2` in-progress sentinel + 10-min claim heuristic — replace with proper BullMQ job locking.

## 8. Open questions / parity risks
- **`social_insights` has no v1 source.** v1 tracks only a `Likes` integer on `social_post`; per-platform impressions/engagement aren't fetched. Need to define what insights are pulled, from which APIs, and on what schedule — schema is greenfield.
- **Story creation** — no backend, no DB shape. Confirm product intent before allocating a v2 home.
- **`scheduled_posts_automator` vs `social_campaigns`** — two parallel campaign systems exist in v1 (legacy auto-share automator + the newer content-planner). Confirm whether both migrate or the automator is retired/merged; the Statistics "available reviews" query unions both tables.
- **`platform_whitelist` naming** — it stores *deactivated* (opted-out) platforms for auto-share, not an allow-list; rename/clarify in v2 to avoid confusion.
- **Token sharing across profiles** (Google/LinkedIn) — v1 rewrites sibling rows' tokens; verify multi-tenant isolation expectations before replicating.
- **Instagram delete** is a silent stub; v2 should either implement real deletion or keep the explicit warning. Same for IG text-only posts.
- **Timezone source of truth** — schedule conversion is client-side (`userToDb/dbToUser`); confirm the profile timezone is authoritative server-side in v2 to avoid drift.
- **`SocialName` ↔ account join** uses a `BINARY … COLLATE` string match between `social_post.SocialName` and `social_stream.Name` (no FK on name) — model a proper FK in v2.
- Mixed casing `Linkedin` vs `LinkedIn` appears across frontend filters, `whereIn` lists, and provider switch — normalize platform enum in v2.
