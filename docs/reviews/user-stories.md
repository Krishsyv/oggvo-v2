# Reviews & Funnel — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/reviews.md`](../feature-spec/reviews.md) and
> [`docs/feature-spec/design-funnel.md`](../feature-spec/design-funnel.md).
> v2 targets: modules `apps/api/src/modules/reviews` + `apps/api/src/modules/funnel` ·
> tables `reviews`, `funnel_designs`, `links`, `link_masters`, `crawler_history` (`@oggvo/db`) ·
> queue `review-puller` (BullMQ) · build phase 1.
>
> Companion docs: [activity-diagrams.md](./activity-diagrams.md) ·
> [../design-system/README.md](../design-system/README.md) · mockups in
> [../design-system/mockups/](../design-system/mockups/):
> [reviews-list.html](../design-system/mockups/reviews/reviews-list.html) (feed + list/grid + Reply/Delete/Contact modals),
> [reviews-create.html](../design-system/mockups/reviews/reviews-create.html),
> [reviews-calendar.html](../design-system/mockups/reviews/reviews-calendar.html),
> [reviews-statistics.html](../design-system/mockups/reviews/reviews-statistics.html),
> [reviews-autoshare.html](../design-system/mockups/reviews/reviews-autoshare.html),
> **[reviews-share.html](../design-system/mockups/reviews/reviews-share.html)** (share / review-image composer),
> [design-funnel.html](../design-system/mockups/funnel/design-funnel.html), [funnel-public.html](../design-system/mockups/funnel/funnel-public.html).

> **How to read this doc** — one section per page / sub-page / modal. Each story cites the real v2
> endpoint; **Copy** lines quote v1 verbatim (grounding the mockups); **Fix-on-rebuild** and
> **Open** lines carry the parity risks from the feature spec. Modals and the share/review-image
> screen are documented to the same depth as full pages.

**Personas**
- **Operator** — authenticated portal user managing reviews + funnel for their active profile.
- **Visitor** — anonymous customer landing on the public funnel page (`/r/:shortname`).
- **System** — API + `review-puller` worker + social posting bot.

**Global rules**
- Every portal read/write is scoped to the caller's `profileId` (TenantGuard); ownership re-checked before mutate.
- Reviews are **soft-deleted** (`permanent_delete = 1`); read queries always exclude them.
- When `profile.HideOggvoReviews` is set, `site = 'Oggvo'` rows are excluded from lists/counts/calendar/stats.
- Scheduling/sharing renders timestamps in the **profile timezone** (fix-on-rebuild: v1 assumed US/Pacific).

---

## Epic R1 — Browse the review feed

### US-R1.1 — View all reviews
**As an** Operator **I want** a unified feed of every review **so that** I can monitor reputation in one place.
- **AC1** `GET /reviews` returns non-deleted reviews for my profile, default order `review_date DESC`, paginated (limit ∈ 4/10/20/40/50/80/100).
- **AC2** Each card shows: reviewer avatar, star rating, reviewer name, date (`MMM D, YYYY`), site logo, review body, and a footer row of publish-platform icons (dimmed unless already posted; tooltip shows posted/scheduled time).
- **AC3** Empty state = star icon + "No reviews" + **Add Review Manually** CTA. Loading = 3 skeleton cards.
- **AC4** Infinite scroll loads the next page while `page < pages`.

### US-R1.2 — Switch list / grid view
- **AC1** A List⇄Grid toggle re-lays the feed (grid = masonry columns); the choice persists (cookie).

### US-R1.3 — Search reviews
- **AC1** Search box placeholder shows the total ("Search over N reviews…"); matches review body, reviewer name, and site (LIKE). Changing it resets to page 1.

### US-R1.4 — Filter by source, rating, and date
- **AC1** **Source** filter is populated from `GET /reviews/platforms` (top 10 + "Others" bucket).
- **AC2** **Rating** filter is a 1–5 star multi-select.
- **AC3** **Date range** picker sends `[start,end]` as `YYYY-MM-DD`; a single date expands to a full day server-side.
- **AC4** Filters are throttled (~1s); any change resets to page 1 and refetches.

### US-R1.5 — Act on a review from the card
- **AC1** **Reply** is available only when `site == 'Google'` and there's no existing reply.
- **AC2** **Share** links to the social composer (`/social/create/testimonial?review=:id`).
- **AC3** The row dropdown offers Reply, Share, **View** (original `url`), **Contact** (only if email/phone present), **Delete**.

---

## Epic R2 — Add a review manually

### US-R2.1 — Record an off-platform review
**As an** Operator **I want** to add a review received on an unlisted platform **so that** my feed and stats are complete.
- **AC1** Fields: Date (default today, `Y/m/d`, required), Name (required), Photo (image, optional, default avatar), Review (textarea + char counter, required), Platform (searchable Listbox grouped by category from `GET /links/categories`, required, must be a valid `link_masters.id`), Rating (1–5 stars, default 5).
- **AC2** Submit `POST /reviews` (multipart) → on success redirect to `/reviews` + success toast; field errors inline.

---

## Epic R3 — Card modals: Reply, Delete, Contact

> All three are opened from a review card (the **Reply** button, or the ⋯ row menu items Reply / Contact /
> Delete). Mocked as visible open states in [reviews-list.html](../design-system/mockups/reviews/reviews-list.html).
> Standard modal behaviour: backdrop scrim, close on ✕ / Cancel / backdrop-click / Escape.

### US-R3.1 — Reply to a Google review (`Review/ReplyModal.vue`)
**As an** Operator **I want** to reply to a review from the feed **so that** I respond publicly without leaving the page.
- **AC1** Title **"Reply to {reviewer name}"**; subtitle **"This reply will be visible publicly."** Body shows a
  **mini review preview** (avatar, stars, name, `Google · MMM D, YYYY` chip, review body) above a required
  **Reply** textarea (v1 = 9 rows).
- **AC2** Footer: **Cancel** + primary **Reply** (shows a loading state). On success toast **"Reply submitted successfully!"**.
- **AC3** `POST /reviews/:id/reply` pushes the reply to Google (`GoogleProvider::replyToReview`) then stores `social_reply`;
  validation/error message surfaces from the API response.
- **AC4** The Reply affordance only renders when `site == 'Google'` **and** there's no existing `social_reply`.
- **Fix-on-rebuild:** v1 only implements Google (other platforms silently return 201). v2 either gates the UI to Google
  or extends providers — do not show Reply where it no-ops.

### US-R3.2 — Delete a review (`Review/DeleteModal.vue`)
**As an** Operator **I want** to remove a review from my portal feed **so that** it stops appearing in widgets.
- **AC1** Title **"Delete Review"**, danger (red trash) icon. Warning copy, verbatim from v1:
  > Deleting reviews from the Oggvo software does **not** remove them from the platform! \*
  > \* If you want to attempt to remove a review from that platform, you can report the review from the specific platform.
  > \*\* Removing a review from the portal also removes it from the stream/splash widgets.
- **AC2** Footer: **Cancel** + danger **"Delete \*\*"**. `DELETE /reviews/:id` soft-deletes (`permanent_delete = 1`);
  the row is never hard-deleted and is excluded from all subsequent reads/counts/calendar/stats.

### US-R3.3 — Contact a reviewer (`Review/ContactModal.vue`)
**As an** Operator **I want** the reviewer's phone/email **so that** I can follow up directly.
- **AC1** Title = reviewer name. Shows up to two read-only fields: **Mobile** (phone) and **Email**, each with a **Copy**
  button + a primary action (**Text** → `tel:`, **Email** → `mailto:`). A field is rendered only when that contact value exists.
- **AC2** The Contact affordance (button + ⋯ item) appears only when the review carries an email or phone — typically
  Oggvo-funnel feedback reviews, which capture contact details on the negative path (see US-P1.3).

---

## Epic R4 — Share / review-image screen

> The card **Share** button and ⋯ → Share open the share/review-image composer. In v1 this lives in the
> social composer (`/social/create/testimonial?review=:id`); v2 documents it as a first-class screen,
> mocked at [reviews-share.html](../design-system/mockups/reviews/reviews-share.html). Layout = composer form
> (left) + sticky **1080×1080 live preview** (right). The preview elements correspond 1:1 to the style toggles.

### US-R4.1 — Configure the branded review image (ReviewStyleParams)
**As an** Operator **I want** to style a 1080×1080 review graphic **so that** it matches my brand before posting.
- **AC1** `GET /reviews/:id/image` returns a 1080×1080 JPG URL driven by ReviewStyleParams:
  `type` · `version`/`custom_color` · `person` · and the booleans `brand_logo` · `source_logo` ·
  `reviewer_name` · `reviewer_image` · `action_button` (all default **on**; `version` default **`blue`**, `person` default **`guy1`**).
- **AC2 — Testimonial Style** = one of **`type-1` … `type-5`** (default `type-1`). The style controls available depend on the type:

  | Control | type-1 | type-2 | type-3 | type-4 | type-5 |
  | --- | :--: | :--: | :--: | :--: | :--: |
  | Brand Logo | ✓ | ✓ | — | — | — |
  | Source Logo | ✓ | ✓ | — | — | — |
  | Reviewer Name | ✓ | ✓ | ✓ | ✓ | ✓ |
  | Reviewer Image | ✓ | — | ✓ | ✓ | ✓ |
  | Action Button ("Learn More") | — | — | — | ✓ | ✓ |
  | Person (avatar illustration) | — | ✓ | — | — | — |
  | Reviewer-name truncation (chars) | 25 | 20 | 35 | 30 | 25 |

  Controls not available for the selected type render disabled/greyed (UI must reflect the matrix, not just send ignored params).
- **AC3 — Version (color theme)** = a named preset or Custom: **Viridian Green** (`blue`, default), **Deep Aquamarine** (`aquamarine`),
  **Turkish Rose** (`rose`), **Royal Orange** (`yellow`), **Green Yellow** (`green`), **Infra Red** (`red`), or **Custom** → a hex `custom_color`.
- **AC4 — Person** (type-2 only) = `guy1` / `guy2` / `guy3` / `girl1` / `girl2` / `girl3`.
- **AC5** The review text is truncated server-side to the per-type char limit (type-1 240 · type-2 230 · type-3 225 · type-4/5 250;
  reduced to 200 when CJK characters are present), and the reviewer name to the AC2 limit.
- **Fix-on-rebuild (BF-004):** `custom_color` must be normalized **once** server-side so `/image`, `/single` and the `/share`
  lookup compute one identical cache hash (v1 hashed it differently per route, so `/share` missed the generated image).
  Render via a headless worker (Playwright/Puppeteer) + S3 keys in the DB — **not** `wkhtmltoimage` over an NFS mount.
- **Open:** image generation likely becomes an async render job; confirm queue + S3 storage + the cache key (`{reviewId}{profileId}{site}_{hash}`).

### US-R4.2 — Write the post message
- **AC1** A message textarea (default **"New Review!"**; the share API default when blank is "Please check the newest review! [[link]]")
  with an **Insert placeholder** dropdown: `[[platform]]` (Google/Facebook/…), `[[page]]` (connected account name),
  `[[rating]]` (e.g. 5), `[[link]]` (review link, else platform link). A char counter is shown.

### US-R4.3 — Pick platforms, then publish or schedule
- **AC1** Platform multi-select across **Facebook, Instagram, Google, LinkedIn, Twitter**; **LinkedIn requires a completed
  page setup** (`PageID`) or it is disabled.
- **AC2** `POST /reviews/:id/share` accepts `socials[]`, optional `reviewMessage`, and optional `ScheduledDate` (`Y-m-d H:i`).
- **AC3 — Post now:** publishes per-provider using the pre-generated image, templating the message, and records a `social_post`
  per platform. Per-platform failures collect in `failed{}` with **no rollback**; response = `{published[], failed{}}`.
- **AC4 — Schedule:** the post is saved unpublished (`Status = 0`, `Schedule` set) for the posting bot; **past dates
  (< now − 2 min) are rejected**. Times are stored UTC and rendered in the **profile timezone**
  (fix-on-rebuild: v1 assumed US/Pacific canonical DB time converted on the frontend).
- **AC5** The feed card footer reflects post state: a platform icon lights up once posted, with a tooltip showing
  **Quick Post / Created On / Scheduled For** timestamps.

---

## Epic R5 — Statistics & calendar

### US-R5.1 — See review KPIs and per-platform breakdown
- **AC1** `GET /reviews/statistics` drives Total Reviews, Average Rating, Platform count, plus a per-platform table (logo, avg stars, total, 30/60/90-day counts, Active/Inactive status).
- **AC2** A reviews-per-month line chart comes from `GET /reviews/chart` (last 12 months).
- **AC3** Responsive: KPI cards + per-platform cards on mobile, table on desktop.

### US-R5.2 — See the monthly calendar heatmap
- **AC1** `GET /reviews/calendar?month=YYYY-MM` renders a 7-col month grid; each day cell is shaded by review count and shows count + avg.
- **AC2** Month Prev/Next (Next disabled on the current month); a "Today" shortcut appears when off-current. Header shows month Total + Average.
- **AC3** Clicking a day with reviews sets the feed date filter to that day and navigates to `/reviews`.

---

## Epic R6 — Auto-share configuration (Settings → Review)

### US-R6.1 — Auto-publish incoming reviews above a rating
**As an** Operator **I want** good reviews auto-posted to my social pages **so that** I don't post each one by hand.
- **AC1** An "Auto publish reviews" switch toggles the feature (off = `SocialThreshold = -1`); when on, a star control sets the minimum rating (UI star = stored `threshold + 1`).
- **AC2** Reviews under 4★ (not published/rejected) are auto-published 14 days after submission (owned by the puller/posting worker — confirm v2 home).

### US-R6.2 — Choose share templates (Shuffle / Fixed)
- **AC1** A mode toggle Shuffle (`rotate`) vs Fixed; a grid of `type-1…type-5` template cards (Fixed = exactly one; Shuffle = ≥2 or empty = all). Each card has a **Preview** modal. Saved via `POST /profiles/save-settings` (`AutoReviewShareMode`, `AutoReviewShareTemplates`).

### US-R6.3 — Enable/disable per platform
- **AC1** Per-platform switches (Facebook, Instagram, Google, LinkedIn, Twitter). State from `GET /reviews/auto-share`.
- **Fix-on-rebuild:** v1 `platform_whitelist` is **opt-OUT** (a row = disabled) and has no v2 table. v2 should invert to opt-IN — a single `PUT /reviews/auto-share` with the enabled set, backed by a `review_auto_share` table or a `profiles` column.

### US-R6.4 — Set the share message
- **AC1** A message textarea with an insert-placeholder dropdown (`[[platform]]`, `[[page]]`, `[[rating]]`, `[[link]]`); default "New Review!"; saved as `SocialReviewMessage`.

---

> **Funnel editors & link manager have a dedicated, deeper doc:**
> [`docs/design-funnel/user-stories.md`](../design-funnel/user-stories.md) +
> [`activity-diagrams.md`](../design-funnel/activity-diagrams.md). Epics F1/F2/P1 below are a summary; the
> design-funnel docs are canonical for the Main/Positive/Negative/Thank-You tabs, the Add/Edit/Delete-platform
> modals, and the review-instructions interstitial.

## Epic F1 — Funnel content editors (Positive / Negative / Thank You)

### US-F1.1 — Set the funnel routing threshold
**As an** Operator **I want** to choose which ratings count as "happy" **so that** good raters go to review platforms and unhappy ones to private feedback.
- **AC1** On the Positive tab, "Select an option" (`HappyMinimum`) sets the split: `5/4/3/2`★ & above → positive path; `1` = Review to All; `0` = Feedback to All.
- **AC2** Saved via `POST /design/savecontent` (v2 `PATCH /funnel/content`); allowlist the posted fields (fix-on-rebuild: v1 mass-assigns arbitrary profile keys).

### US-F1.2 — Edit the positive screen
- **AC1** Split view: live preview (left) + form (right). Form: Header Color, Footer Color, Header heading, Body copy, embedded link manager. **Apply** saves; success toast.
- **AC2** Preview shows read-only stars + count, the heading/body, and "Connect with {platform}" buttons from active links; empty state "No Platforms!".

### US-F1.3 — Edit the negative (private feedback) screen
- **AC1** Form: Header/Footer Color, Header, Body, link manager. Preview shows the private feedback form (First/Last name, Email, Phone, message, "Leave Feedback").

### US-F1.4 — Edit the thank-you screen
- **AC1** Form: Header, Body. Preview shows a centered success icon + heading + body. No platform links.

### US-F1.5 — Visual designer (Main tab)
- **AC1** The Main tab embeds a drag-and-drop designer; **Save** exports `{json, html:{fonts,css,body}}`.
- **Fix-on-rebuild / open:** v1 stores this on S3 (`html.json`); v2 stores inline in `funnel_designs.exported_json/exported_html` and the public page reads the DB. Decide whether Unlayer stays or a typed builder replaces it.

---

## Epic F2 — Platform-link manager (shared by positive & negative editors)

### US-F2.1 — List the funnel platform links
- **AC1** `GET /links` lists links ordered by `rank`; each row shows logo, name, and Show/Hide, Edit, Remove, and a reorder drag handle. Inactive rows render dimmed; empty state "No links."

### US-F2.2 — Add a platform link
- **AC1** Add modal supports **catalog** mode (searchable platform Listbox from `GET /links/categories`, copies name/logo) or **custom** mode (Platform Name + image ≤5 MB). Required CTA URL. Switches: Open in New Window, Skip Instructions, Show on Mobile (on), Show on Desktop (on). `POST /links`.
- **AC2** Custom platform name must be unique vs the catalog (duplicate → "Platform already exists").

### US-F2.3 — Edit / delete a link
- **AC1** Edit pre-fills from the row (`PATCH /links/:id`); image hint "leave blank to not update". Delete confirms ("can't revert") then `DELETE /links/:id`.

### US-F2.4 — Reorder links
- **AC1** Drag-reordering persists rank = array index via `PATCH /links/order`.
- **Fix-on-rebuild:** v1 `changeOrder` swallows failures (sets success in catch) — propagate errors and revert optimistic order on failure.

### US-F2.5 — Show / hide a link on the funnel
- **AC1** The eye toggle optimistically flips `isActive` (`PATCH /links/:id/active`); reverts on error; toast "Platform visible/hidden on funnel."

---

## Epic P1 — Public funnel (anonymous visitor)

### US-P1.1 — Rate the business
**As a** Visitor **I want** to leave a star rating **so that** I can share my experience.
- **AC1** `GET /funnel/:shortname` (public) returns profile name, `happyMinimum`, positive/negative/thankyou copy, rating count+avg, the design, and active platform links (rank-ordered). Fetch failure → 404.
- **AC2** Selecting a rating routes: **≥ happyMinimum** → positive screen (review-platform links); **below** → negative feedback capture. Both end at the thank-you screen.

### US-P1.2 — Happy path → review platforms
- **AC1** The positive screen lists "Connect with {platform}" buttons; for google/facebook/zillow/realtor.com (when `SkipInstructions != 1`) a "How to leave a review" interstitial opens before the outbound link (respects Open-in-New-Window).
- **Parity gap:** Yelp has server-side instructions but no modal branch — add it in v2.

### US-P1.3 — Unhappy path → private feedback
- **AC1** The negative screen collects First/Last name, Email, Phone, message; submitting creates a `review` + `recipient` server-side, tags the recipient "Left Oggvo Feedback", sets them Inactive, and deletes that recipient's prior reviews.
- **Open question:** locate/spec the public submission endpoint (v1 `ReviewModel::addReview`, likely under `/common`).

---

## Cross-cutting acceptance criteria
- **Tenancy:** every portal link/review/design op re-checks `profileId` ownership before mutating.
- **Soft delete only** for reviews; auto-share inversion to opt-IN; booleans real (not `'0'/'1'` strings).
- **SQL safety (fix-on-rebuild):** `overviewChart`/`reviewsByChannel`/`googleReviewsStatistics` interpolate dates into raw SQL — use parameterized queries in v2.
- **Funnel storage:** S3 `html.json` → `funnel_designs.exported_json/html`; public render reads DB, sanitized HTML injection (no runtime Vue compile).

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-R1.* | `GET /reviews` (+ `/reviews/platforms`) |
| US-R2.1 | `POST /reviews` |
| US-R3.1 | `POST /reviews/:id/reply` |
| US-R3.2 | `DELETE /reviews/:id` |
| US-R4.1 | `GET /reviews/:id/image` |
| US-R4.2–4.3 | `POST /reviews/:id/share` |
| US-R5.1 | `GET /reviews/statistics`, `GET /reviews/chart` |
| US-R5.2 | `GET /reviews/calendar` |
| US-R6.* | `GET/PUT /reviews/auto-share`, `POST /profiles/save-settings` |
| US-F1.* | `GET /design`, `POST /design/savecontent`, `GET/POST /design/savedesign` |
| US-F2.* | `GET /links`, `POST/PATCH/DELETE /links*`, `PATCH /links/order`, `PATCH /links/:id/active` |
| US-P1.* | `GET /funnel/:shortname` (public) + public feedback submission |
