# Social — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/social.md`](../feature-spec/social.md).
> v2 target: module `apps/api/src/modules/social` · tables `social_accounts`, `social_posts`,
> `social_post_media`, `social_campaigns`, `social_campaign_posts`, `social_insights`,
> `scheduled_posts_automator`, `platform_whitelist` · queues `social-publish` + `post-automator`
> (BullMQ) · build phase 3.
>
> Companion docs: [activity-diagrams.md](./activity-diagrams.md) (flow diagrams) ·
> [../design-system/README.md](../design-system/README.md) (UI) · mockups in
> [../design-system/mockups/](../design-system/mockups/):
> [social-accounts.html](../design-system/mockups/social/social-accounts.html) (accounts + Connect/Disconnect modals),
> [social-timeline.html](../design-system/mockups/social/social-timeline.html) (posts feed + Edit/Delete modals),
> [social-composer.html](../design-system/mockups/social/social-composer.html) (post composer + media-picker modal),
> [social-testimonial.html](../design-system/mockups/social/social-testimonial.html) (testimonial composer — the reviews "Share" target),
> [social-planner.html](../design-system/mockups/social/social-planner.html) (calendar),
> [social-campaigns.html](../design-system/mockups/social/social-campaigns.html) (content-planner history + New-Campaign & Cancel modals),
> [social-statistics.html](../design-system/mockups/social/social-statistics.html) (stats + insights + automator).

> **Screen / sub-page / modal coverage.** The multi-tab social surface shares an in-page tab nav
> (**Accounts · Timeline · Composer · Planner · Campaigns · Statistics**). Pages from the spec §2 and
> their stories:
>
> | Route | Mockup | Stories |
> | --- | --- | --- |
> | `/social` (timeline) | social-timeline.html | US-3.1 |
> | `/social/create/post` | social-composer.html | US-2.1, US-2.2 |
> | `/social/create/testimonial` | social-testimonial.html | US-2.6 |
> | `/social/create/story` | — (v1 stub, §"Story") | — |
> | `/social/edit/[id]` | social-timeline.html (Edit modal) | US-2.3 |
> | `/social/statistics` | social-statistics.html | US-5.1, US-5.2 |
> | `/social/content-planner` | social-campaigns.html | US-4.2, US-4.4 |
> | `/social/content-planner/create` | social-campaigns.html (New-Campaign modal) | US-4.1 |
> | `/social/content-planner/[id]` | social-campaigns.html (detail note) | US-4.3 |
> | Settings → Accounts (OAuth) | social-accounts.html | US-1.1–1.3 |
>
> **Modals:** Connect/OAuth + Disconnect (accounts) · Media picker (composer) · Edit post + Delete post
> (timeline) · New Campaign + Cancel campaign + Posting-time Preset (campaigns). Documented in §"Modals & sub-screens".

**Personas**
- **Operator** — the everyday authenticated user of a profile (business owner / staff) who connects
  social pages, composes posts, and runs the content planner. All stories below are this persona
  unless noted. Access requires at least one connected, postable account (Facebook, Instagram,
  Google Business, LinkedIn, Twitter/X).
- **System** — the platform (API + BullMQ workers + scheduler) publishing, retrying, and pulling
  insights on the Operator's behalf.

**Global rules that apply to every story**
- Every read/write is scoped to the caller's active `profileId` (TenantGuard). No cross-tenant reads.
- **Publishing is asynchronous.** `POST /social/posts` only writes rows with status `queued`; the
  `social-publish` BullMQ worker claims them (job locking, not the v1 `-2` sentinel + 10-min
  heuristic), publishes per-platform, and stamps the result.
- **Status enum (v2):** `failed · queued · scheduled · published`. Replaces v1's fragile bit-sum
  filter — filtering is by explicit enum/array.
- **Per-platform limits** (single source of truth, fix-on-rebuild from `post_helper.php`): text
  Facebook 63 200, LinkedIn 3 000, Google 1 500, Twitter 280, Instagram none. **Google = one image
  per post** (each image becomes its own post row); **Instagram requires ≥1 media** and ≤10 photos;
  **Twitter ≤4 photos.** Image size FB 30 MB / Google 10 MB / Twitter+LinkedIn 5 MB; video 50 MB.
- **Timezone:** schedules render and validate in the **profile timezone**, authoritative server-side
  (fix-on-rebuild: v1 converts client-side via `userToDb`/`dbToUser` and risks drift). Composer
  enforces future-only.
- **Platform enum normalized** — one canonical casing (`linkedin`/`LinkedIn` mismatch removed); the
  `social_post.SocialName ↔ social_accounts.Name` string match becomes a real FK.
- **OAuth tokens encrypted at rest** (AES-GCM vault) — never the v1 plaintext columns.

---

## Epic E1 — Connect & manage social accounts

### US-1.1 — See connected accounts at a glance
**As an** Operator **I want** a grid of my social platforms with connection status **so that** I know
where I can publish.
- **AC1** `GET /social/accounts` returns this profile's accounts; each card shows platform logo,
  account/page name, a **Connected** (success dot) or **Not connected** (gray dot) badge, and a
  last-sync line.
- **AC2** Postable platforms covered: Facebook, Instagram, Google Business, LinkedIn, Twitter/X.
- **AC3** A header insights strip summarizes followers + engagement across connected accounts (from
  `social_insights`).
- **AC4** Each card offers **Connect** (when not connected) or **Disconnect** (when connected).

### US-1.2 — Connect an account via OAuth
**As an** Operator **I want** to connect a platform through its OAuth flow **so that** the system can
post on my behalf.
- **AC1** **Connect** opens the provider's OAuth consent; the callback hits
  `GET /social/oauth/{facebook|twitter|linkedin|google}` (code + state), which exchanges the code,
  stores an **encrypted** token, and creates the `social_accounts` row.
- **AC2** Facebook connect derives the page list (`/me/accounts`) + `instagram_business_account` and
  subscribes the page to webhook events.
- **AC3** Google connect leads to account → location selection
  (`GET /social/accounts/{id}/google-accounts`, `…/google-locations`,
  `POST …/google-locations`); LinkedIn leads to page/profile selection
  (`GET …/linkedin-accounts`, `POST …/linkedin-accounts`).
- **AC4** LinkedIn/Google accounts whose token has expired are auto-deactivated and shown as
  Not connected on list.

### US-1.3 — Disconnect an account
**As an** Operator **I want** to disconnect a platform **so that** it stops being a publish target.
- **AC1** `DELETE /social/accounts/{id}` revokes upstream where possible and soft-deletes the row.
- **AC2** A confirm modal is required.
- **AC3** Token sharing: for Google/LinkedIn the underlying token is shared across sibling profiles;
  revoke upstream **only when no sibling connection remains** (parity risk — verify tenancy).

---

## Epic E2 — Compose & publish a post

### US-2.1 — Compose a post with text and media
**As an** Operator **I want** to write a post and attach media **so that** I can share content to my
pages.
- **AC1** The composer offers a platform multi-select of connected postable accounts
  (`GET /social/accounts?postableOnly=1`), a message textarea with a live char counter, and a media
  picker (library + upload) with drag-reorder thumbnails.
- **AC2** Inline tips appear by selected platform: Instagram ≤10 photos / requires ≥1 media; Twitter
  ≤4 photos; Google one image per post.
- **AC3** A right-side live preview renders a per-platform mock post card for each selected platform.

### US-2.2 — Publish now or schedule
**As an** Operator **I want** to publish immediately or pick a future time **so that** I can post
on my own cadence.
- **AC1** A datetime control (future-only, profile timezone) toggles the action button between
  **Publish now** and **Schedule**.
- **AC2** `POST /social/posts` `{ socials[], photos[], videos[], schedule, message }` writes one row
  per (platform × media) with status `queued` (or `scheduled` when a future time is set).
- **AC3** Per-platform validation errors (text over limit, IG no-media, Google multi-image) return
  keyed by platform name and surface inline + as toasts.
- **AC4** On success the Operator is redirected to the timeline with a success toast; the
  `social-publish` worker does the actual upstream publish asynchronously.

### US-2.3 — Edit a queued/failed post
**As an** Operator **I want** to edit a post that hasn't published **so that** I can fix it before it
goes out.
- **AC1** Only posts with status `queued` / `scheduled` / `failed` are editable; the platform is
  immutable and shown as a read-only chip. `GET /social/posts/{id}`.
- **AC2** `PUT /social/posts/{id}` re-validates text/media, rewrites media, and re-queues the row
  (status → `queued`, publish bookkeeping cleared) inside a transaction.
- **AC3** Save is rejected if the worker is actively publishing the row (job lock held).

### US-2.4 — Retry a failed post
- **AC1** A **Retry** action appears only on `failed` posts; `POST /social/posts/{id}/retry` resets
  status to `queued` and clears `failureReason` / `attempts` / `nextAttemptAt`.

### US-2.5 — Delete a post
- **AC1** `DELETE /social/posts/{id}` removes the post from Oggvo regardless of upstream state; for
  FB/Twitter/LinkedIn/Google it attempts upstream removal when the post was published and the account
  is still connected. **Instagram delete is a no-op** and returns an explicit warning (parity risk).
- **AC2** A confirm modal is required; the response carries `removed_from_platform ∈ {null,true,false}`
  and a warning string.

### US-2.6 — Share a review as a branded testimonial
**As an** Operator **I want** to turn a review into a branded image and share it **so that** I can
promote social proof.
- **AC1** Entered with `?review=<id>`; a style panel sets color, testimonial style (`type-1..5`),
  person (type-2), and toggles (brand/source logo, reviewer name/image, action button); description
  supports `[[link]] [[rating]] [[platform]] [[page]]` tokens.
- **AC2** Two-step share: render image (`GET /reviews/{id}/image?<params>`) then
  `POST /reviews/{id}/share` `{ socials[], reviewMessage, scheduledDate, params }`; the publisher
  service is reused. Response = `{ published[], failed{} }`.

---

## Epic E3 — Timeline, edit & retry

### US-3.1 — Browse the post timeline
**As an** Operator **I want** a feed of all my posts with filters **so that** I can track what's gone
out and what's pending.
- **AC1** `GET /social/posts` paginates this profile's posts ordered by `schedule ?? createdAt` desc,
  `perpage ∈ {10,20,50,100}`.
- **AC2** Filters: free-text search over message, date range, multi-select status
  (`failed/queued/scheduled/published`), multi-select platform — all server-side, explicit (no
  bit-sum).
- **AC3** List ↔ Grid toggle (grid groups by `MMMM YYYY`); each card shows platform icon, message,
  media thumbnails, status badge, schedule/created date, and per-post actions (edit, delete, retry).
- **AC4** Loading shows skeleton cards; empty shows a megaphone icon + "No posts"; infinite scroll.

### US-3.2 — Content planner: schedule posts on a calendar
**As an** Operator **I want** a week/month calendar of scheduled posts **so that** I can see and plan
my posting cadence.
- **AC1** A calendar grid shows scheduled-post chips colored by platform, plus a side list of
  upcoming posts and a small insights chart.
- **AC2** Chips read from the scheduled subset of `GET /social/posts?status=scheduled`.

---

## Epic E4 — Content planner drip campaigns

### US-4.1 — Create an automated testimonial campaign
**As an** Operator **I want** to drip branded review posts over a date range **so that** my pipeline
of social proof runs automatically.
- **AC1** The form sets a posting-time **preset** (`GET /social/presets`, CRUD on `/social/presets`),
  a campaign duration (date range with shortcuts), a platform multi-select, a description (tokens), a
  minimum rating (default 4, clamped 1–5), and testimonial style params.
- **AC2** Computed `postsToSchedule = dates.length × platforms.length`; a sample preview review loads
  from `GET /reviews/random` and "Change Review" reloads it.
- **AC3** `POST /social/campaigns` picks N un-posted reviews (`score ≥ min_rating`, not already in a
  pending campaign), creates a `social_campaigns` row + one `social_campaign_posts` row per
  (review × social); per-platform text-length errors return in `messages`.
- **AC4** Campaign UUID is validated against `/^[a-f0-9]{16}$/`; `post-automator` enqueues processing.

### US-4.2 — Track campaign history
- **AC1** `GET /social/campaigns?status=&page=` lists campaigns with ID, created date, status badge,
  Posts (`processed/total`), and a progress bar of `rate`%.
- **AC2** A status TabBar filters Cancelled / Generating / Running / Completed / all (explicit enum,
  not v1's `-1/0/1/2`).

### US-4.3 — Browse a campaign's posts
- **AC1** `GET /social/campaigns/{uuid}/posts` returns the campaign's posts grouped year→month with
  info tags (total posts, frequency, period, days, platforms); posts are read-only.

### US-4.4 — Cancel a campaign
- **AC1** `DELETE /social/campaigns/{uuid}` cancels the campaign (status → cancelled) and deletes its
  queued post rows, mirroring statuses back to `social_campaign_posts`. A confirm modal is required.

---

## Epic E5 — Statistics & insights

### US-5.1 — See social statistics
**As an** Operator **I want** post counts per platform and a review-supply summary **so that** I can
gauge my social output.
- **AC1** `GET /social/analytics/statistics` returns `reviews_count`, `posted_reviews_count`,
  `available_reviews_count`, and a per-platform table (`posts_count`, `…_30`, `…_90`, active flag).
- **AC2** Three KPI cards (Total Reviews / Reviews Posted / Available To Post) + the per-platform
  table render in the profile timezone.

### US-5.2 — Pull per-post engagement insights
**As an** Operator **I want** impressions/engagement on my posts **so that** I can see what resonates.
- **AC1** `social_insights` (new in v2 — **no v1 source**) stores per-post likes/impressions/clicks;
  a scheduled `post-automator`/insights job pulls them from each platform API.
- **AC2** The accounts insights strip + statistics screen read from `social_insights`
  (`GET /social/analytics/overview-chart`).
- **Schema gap:** `social_insights` is greenfield — define which metrics, which APIs, and the pull
  cadence before this ships.

---

## Epic E7 — Story composer

> v2 target: route `/social/create/story` · mockup
> [social-story.html](../design-system/mockups/social/social-story.html) · reuses `POST /social/posts`
> with `type = 'story'` (no new table) · queue `social-publish` (BullMQ) · build phase 3.
>
> **Context / fix-on-rebuild.** v1's `/social/create/story` (`pages/social/create/story.vue`) is a
> **non-functional UI scaffold** — empty `onSubmit`, hardcoded mock lists, three dropdowns all
> mislabeled **"Select Category"**, a plain text platform input, and an inert **"Post Now"**. v2 makes
> it a real composer sharing the feed-post publish pipeline (the sibling of
> [social-composer.html](../design-system/mockups/social/social-composer.html)). Stories are **vertical
> 9:16** (1080×1920) and **ephemeral** (expire after 24h). Only **Facebook** and **Instagram** expose a
> Stories API — Google, LinkedIn and Twitter/X have no story surface.

### US-7.1 — Compose a story from a category template
**As an** Operator **I want** to pick a story template by category and drop in my media and text **so
that** I can publish a branded vertical story.
- **AC1** Platform multi-select is limited to **Stories-capable** connected accounts — **Facebook** and
  **Instagram** only; Google/LinkedIn/Twitter chips are disabled with a "no Stories API" explainer, and
  at least one platform is required. (fix-on-rebuild: v1's plain text input accepted any string.)
- **AC2** A three-step **Category → Template → Version** generator drives the design; templates load
  category-grouped (`GET /social/story-templates`) and Version switches the layout accent.
  Fix-on-rebuild: v1 mislabeled all three dropdowns **"Select Category"** — v2 labels them distinctly.
- **AC3** A media pick (library + upload) sets the story's background/foreground **image or video**,
  reusing the composer `MediaPicker`; a story carries **exactly one** media rendered at the 9:16 safe
  frame (1080×1920).
- **AC4** A **text overlay** field with a **position** control (top / middle / bottom) overlays on the
  preview; overlay text is display-only — stories carry no clickable link or in-frame hashtags.
- **AC5** A right-side live **9:16 preview** renders the chosen template + media + overlay with
  per-platform story chrome (Instagram gradient ring + segment bar vs Facebook), switchable by a
  platform preview tab; footer notes the 24h expiry.

### US-7.2 — Publish or schedule a story
**As an** Operator **I want** to publish a story now or at a future time **so that** it goes out on my
cadence.
- **AC1** A datetime control (future-only, **profile timezone**) toggles the action button between
  **Post now** and **Schedule** (mirrors the feed-post composer; fix-on-rebuild: authoritative
  server-side, no v1 `userToDb`/`dbToUser` client-side drift).
- **AC2** `POST /social/posts` `{ type:'story', socials[], photos[]/videos[], overlay:{ text, position },
  template:{ category, template, version }, schedule }` writes **one `social_posts` row per platform**
  with `type = story` and status `queued` (or `scheduled` when a future time is set); the row records a
  24h expiry.
- **AC3** Per-platform validation is keyed by platform name: a story requires **exactly one** media, and
  unsupported platforms are rejected; errors surface inline + as toasts.
- **AC4** On success the Operator is redirected to the timeline with a success toast **"Story created
  successfully!"**; the `social-publish` worker does the actual upstream publish asynchronously.

### US-7.3 — Story parity & constraints (fix-on-rebuild)
**As the** System **I want** a story to be a first-class post type on the shared pipeline **so that** the
v1 dead-end scaffold becomes a real, countable, single-code-path feature.
- **AC1** Story is a first-class `social_posts.type` value (`post | story | testimonial`) — **not** a
  separate table; the story composer reuses the feed-post publish + validation code path.
- **AC2** Timeline and Statistics count stories under their platform alongside feed posts (no separate
  bit-sum bucket).
- **AC3** Only **Facebook + Instagram** are offered; unsupported platforms are disabled with an
  explainer, never silently accepted (parity fix for v1's free-text platform field).
- **AC4** Schedules render and validate in the profile timezone, authoritative server-side.

> **Traceability (Epic E7):** US-7.1/7.2 → `POST /social/posts` (`type=story`) · story templates →
> `GET /social/story-templates` · media → composer `MediaPicker` (`source=Social`). Story creation is
> promoted from the v1 "non-functional stub" note (§"Story creation") to a built v2 mockup.

---

## Modals & sub-screens (exact v1 copy)

> Grounding strings read from v1; **Copy** lines are verbatim. Standard modal behaviour: scrim, close on
> ✕ / Cancel / backdrop / Escape.

### US-6.1 — Connect / OAuth modal (accounts)
- **AC1** Connect opens an OAuth explainer → "Continue to {platform}" launches the provider consent;
  Facebook → page + Instagram selection, Google → location, LinkedIn → page. Token stored **encrypted**.
- **AC2** Disconnect requires a confirm modal; reconnect re-runs OAuth.

### US-6.2 — Composer media picker (`MediaPicker`)
- **AC1** Opened from **"Media Library"** / **"Upload Media"**. Tabs: **Images · Videos · Upload**
  (FilePond idle "Drop files here or Browse"); insert button **"Insert Media"** (**"Uploading"** while busy).
- **Copy (composer):** title **"New Post"** / **"Generate and schedule new social media post."**; field
  **"Select Platform(s)"**; **"Message"** with `{n} characters`; **"Add Media (Optional)"**; tips
  **"Instagram posts are limited to a maximum of 10 photos."** / **"Twitter posts are limited to a maximum of 4 photos."**
  (no Google tip in v1); submit label **"Post Now"** ↔ **"Schedule"**; success toast **"Post created successfully!"**.

### US-6.3 — Delete post modal (`SocialDeleteModal`)
- **Copy:** title **"Delete Post"**, body **"Are you sure? You won't be able to revert this!"**, buttons
  **Delete** / **Cancel**; success toast **"Post deleted successfully!"**.
- **AC1** Delete removes from Oggvo regardless of upstream; the **"Instagram can't be removed from the
  platform"** warning is a **v2 addition** surfaced from the API `warning`/`removed_from_platform` fields
  (no such warning copy exists in the v1 modal — net-new).

### US-6.4 — Edit post modal / page (`/social/edit/[id]`)
- **Copy/states:** read-only platform chip (platform immutable); Message counter vs `textLimit`; validation
  banners — over text limit, **Google >1 image**, **Instagram requires ≥1 media**; **Save & re-queue**.
- **Parity flag:** the v1 frontend **post card exposes only View + Delete** (no Edit/Retry buttons) and the
  edit screen/validation banners weren't found in the v1 frontend during the read, yet the spec §3–§5 and
  the API table document `/social/edit/[id]`, `POST /posts/{id}` (re-queue) and `POST /posts/{id}/retry`.
  v2 treats Edit + Retry as real (spec-authoritative); confirm the v1 surface before porting.

### US-6.5 — New Campaign + Cancel modals (content planner)
- **Copy (create):** page **"Content Planner"** / **"Generate testimonials from reviews & auto schedule
  social media post"**; **Posting Time** preset (placeholder **"Add a preset"**; option badges
  **"Recommended"**, **"Best time to post"**); **Campaign Duration** (shortcuts 1 Week … 1 Year);
  **Select Platform(s)**; **Description** (default v1 **"Please check the newest review! [[link]]"**);
  Version / Testimonial Style / Person + the 5 toggles; submit **"Schedule {N} Posts"**; success
  **"Campaign created successfully!"**.
- **Posting-time Preset modal:** title **"Posting time"** / **"Add up to 5 times per day to share posts"**;
  per-day Monday…Sunday switch + up to 5 time inputs; **Preset name** required; **Save Preset**; toast
  **"Preset has been saved!"**.
- **Cancel/Delete modal (`SocialCampaignDeleteModal`):** title **"Delete Post"** (mislabeled in v1 — it
  cancels a campaign), body **"Are you sure? You won't be able to revert this!"**; success toast
  **"campaigns deleted successfully!"**. Cancels the campaign (status → cancelled) + deletes its queued posts.
- **Parity flag:** the v1 `create.vue` has **no Minimum Rating control** even though the spec §3/§5 and the
  `POST /social/campaigns` body include `min_rating` (default 4, clamped 1–5). v2 surfaces it
  (spec-authoritative); confirm.

### Story creation (`/social/create/story`) — non-functional stub
- v1 is a UI scaffold only (`onSubmit` empty, hardcoded mock data): **"New Story"** /
  **"Generate and schedule new story for social media."**, a plain platform input, three dropdowns all
  mislabeled **"Select Category"**, a **"Click to upload / or drag and drop / PNG or JPG (max. 800x800px)"**
  dropzone, mock progress rows, and an inert **"Post Now"**. **Not built as a v2 mockup** — build or drop
  pending product confirmation (no API, no DB shape).

## Fix-on-rebuild notes

- **Story creation page** is a non-functional UI stub in v1 (no API, no DB shape) — build or drop;
  excluded from these stories until product confirms.
- **`Posts::count` / `getTotalAndChange`** is mostly commented out yet the dashboard consumes its
  shape — rebuild the count/overview-chart endpoints properly.
- **Bit-sum status filter** (`Published=1,Pending=2,Scheduled=5,Failed=9`) is fragile — replaced by
  explicit enum/array filters.
- **`-2` in-progress sentinel + 10-min claim heuristic** → proper BullMQ job locking.
- **Plaintext OAuth tokens** → AES-GCM encrypted integrations vault.
- **`utf8_encode()`** on messages is deprecated/lossy → proper UTF-8 handling.
- **Raw SQL interpolation** of `$dates[0]/$dates[1]`/`$profileId` and the `getReadableSize` loop bug
  → parameterize / fix.
- **Hardcoded Pacific business hours** in sender/activator → per-profile timezone.

## Open questions / parity risks

- **`social_insights` has no v1 source** — v1 only tracks a `Likes` integer; define metrics/APIs/cadence.
- **Story creation** — no backend or DB shape; confirm product intent before allocating a v2 home.
- **Two parallel campaign systems** — `scheduled_posts_automator` (legacy auto-share) vs
  `social_campaigns` (content planner). The Statistics "available reviews" query unions both; confirm
  whether both migrate or the automator is retired/merged.
- **`platform_whitelist` is mis-named** — it stores *deactivated* (opted-out) auto-share platforms,
  not an allow-list; rename/clarify in v2.
- **Token sharing across profiles** (Google/LinkedIn) — v1 rewrites sibling rows' tokens; verify
  multi-tenant isolation before replicating.
- **Instagram delete** is a silent stub; v2 should implement real deletion or keep the explicit
  warning. Same for IG text-only posts.
- **`SocialName` ↔ account join** uses a `BINARY … COLLATE` string match (no FK) — model a real FK.
- **Mixed casing `Linkedin`/`LinkedIn`** across filters/lists/provider switch — normalize the enum.

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-1.1 | `GET /social/accounts` |
| US-1.2 | `GET /social/oauth/{provider}`, `…/google-locations`, `…/linkedin-accounts` |
| US-1.3 | `DELETE /social/accounts/{id}` |
| US-2.1/2.2 | `POST /social/posts` (+ `GET /social/accounts?postableOnly=1`) |
| US-2.3 | `GET /social/posts/{id}`, `PUT /social/posts/{id}` |
| US-2.4 | `POST /social/posts/{id}/retry` |
| US-2.5 | `DELETE /social/posts/{id}` |
| US-2.6 | `GET /reviews/{id}/image`, `POST /reviews/{id}/share` |
| US-3.1 | `GET /social/posts` |
| US-3.2 | `GET /social/posts?status=scheduled` |
| US-4.1 | `POST /social/campaigns` (+ `GET /social/presets`, `GET /reviews/random`) |
| US-4.2 | `GET /social/campaigns` |
| US-4.3 | `GET /social/campaigns/{uuid}/posts` |
| US-4.4 | `DELETE /social/campaigns/{uuid}` |
| US-5.1 | `GET /social/analytics/statistics` |
| US-5.2 | `GET /social/analytics/overview-chart` |
| US-6.1 | `GET /social/oauth/{provider}`, `DELETE /social/accounts/{id}` |
| US-6.2 | media library/upload (`source=Social`) → `POST /social/posts` |
| US-6.3 | `DELETE /social/posts/{id}` |
| US-6.4 | `GET /social/posts/{id}`, `PUT /social/posts/{id}`, `POST /social/posts/{id}/retry` |
| US-6.5 | `POST /social/campaigns`, `DELETE /social/campaigns/{uuid}`, `GET/POST /social/presets` |

> Cross-reference: the testimonial composer (US-2.6) is the screen the **reviews** "Share" button targets —
> see [reviews user-stories Epic R4](../reviews/user-stories.md#epic-r4--share--review-image-screen)
> and [reviews-share.html](../design-system/mockups/reviews/reviews-share.html).
