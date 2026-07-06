# Tutorials — User Stories & Acceptance Criteria

> Source of truth: v1 route [`tutorials/[[id]]`](../../../oggvo/apps/portal-frontend/pages/tutorials/[[id]]/index.vue)
> and its components ([`Tutorials/Playlist.vue`](../../../oggvo/apps/portal-frontend/components/Tutorials/Playlist.vue),
> [`Tutorials/Player.vue`](../../../oggvo/apps/portal-frontend/components/Tutorials/Player.vue),
> [`store/tutorial.js`](../../../oggvo/apps/portal-frontend/store/tutorial.js),
> [`utils/tutorials.mjs`](../../../oggvo/apps/portal-frontend/utils/tutorials.mjs)).
> v2 target: module `apps/api/src/modules/tutorials` · a curated video catalog served from
> **`GET /tutorials`** (playlists + video metadata **grouped by product area**) and
> **`GET /tutorials/:id`** (resolve one video for a deep link). Storage is a curated catalog —
> config or `tutorial_playlists` / `tutorial_videos` tables (**known schema gap**: no v2 table yet) ·
> queue `—` (read-only, no worker) · build phase: help / support surface.
>
> Companion docs: [../design-system/README.md](../design-system/README.md) (UI) · mockup in
> [../design-system/mockups/](../design-system/mockups/) —
> **[tutorials/tutorials.html](../design-system/mockups/tutorials/tutorials.html)** (video player +
> searchable, category-tabbed playlist).

> **How to read this doc** — one section per page block. Each story cites the real v2 endpoint;
> **Copy** lines quote v1 verbatim (grounding the mockup); **Fix-on-rebuild** / **Open** lines carry
> parity risks. This screen directly satisfies sprint item **BF-001** ("categorize tutorials + add a
> search bar") and hosts the **TU-001..TU-021** tutorial content items surfaced across the app's guided
> prompts.

**Personas**
- **Operator** — authenticated portal user (business owner / staff) watching walkthroughs to learn a
  part of Oggvo. All stories are this persona unless noted.
- **System** — the API serving the curated catalog (`GET /tutorials`) and the embedded video player.

**Global rules**
- The catalog is **read-only** for the Operator; there is no per-profile authoring. `GET /tutorials`
  is scoped to the caller's session (auth) but returns the same product-wide catalog for every profile.
- Videos are **grouped by product area** (Dashboard, Design, Reviews, Campaigns, Surveys, Widgets,
  Contacts, Social). One playlist == one product-area category (BF-001).
- **Search is global** across every category and matches on the video **title** (v1 also matched the
  description); an active search overrides the category filter.
- Selecting a video always **re-anchors** the category context to the playlist that owns it, so the
  badge and "next video" stay correct even when the video was picked from a cross-category search result.
- Empty catalog renders the **"Tutorials are unavailable"** state, not an error; a fetch failure toasts
  "Something went wrong!" and shows the loading→empty fallback.

---

## Epic T1 — Browse & discover tutorials

### US-T1.1 — Browse tutorials grouped by product-area category (BF-001)
**As an** Operator **I want** every tutorial listed in a playlist grouped by product area **so that** I
can find the walkthrough for the feature I'm working on.
- **AC1** `GET /tutorials` returns `{ playlists: [{ id, title, videos: [{ id, title, description, duration, thumbnail }] }] }`;
  the right-hand **Playlist** card renders every video, each row showing thumbnail, a **duration** badge,
  the **product-area** (playlist) label, and the title (two-line clamp).
- **AC2** The playlist header shows a live **count** ("N tutorials", singular "1 tutorial"); the count
  reflects the active category + search filter, not the catalog total.
- **AC3** When browsing **All** (or a search result), each row is tagged with its owning product-area so
  cross-category rows stay identifiable; within a single category the tag is redundant and may be omitted.
- **AC4** Loading = five skeleton rows; empty catalog = the **"Tutorials are unavailable"** state (star/search
  icon + heading), never a hard error.
- **Copy (v1):** "No tutorials available." · list badge = `playlistTitle` (product area).
- **Open:** confirm whether the catalog is DB-backed (`tutorial_playlists`/`tutorial_videos`) or static
  config — there is no v2 table yet (schema gap).

### US-T1.2 — Filter to one product area via the category tabs
**As an** Operator **I want** category tabs (All + one per product area) **so that** I can narrow the list
to just the area I care about.
- **AC1** Tabs render **All** (default, total count) plus one chip per product-area playlist, each with its
  own count; v1 prepends the **All** tab only when there is more than one category.
- **AC2** Selecting a tab filters the playlist to that product area and highlights the active chip
  (primary fill); **All** shows every video.
- **AC3** Starting a search **suspends** the tab filter (search is global); clearing the search restores
  the previously active tab.
- **AC4** Selecting a video re-anchors the active tab to that video's owning playlist (US-T2.1 AC3).
- **Copy (v1):** tab label = `{{ tab.title }} ({{ tab.count }})`.

### US-T1.3 — Search tutorials by title
**As an** Operator **I want** a search box **so that** I can jump straight to a tutorial by name.
- **AC1** The search input filters the playlist **client-side** across **all** categories, matching the
  video title (v1 also matches description), case-insensitive, on every keystroke.
- **AC2** While a query is present the category tabs are bypassed and results span every product area;
  a clear (✕) resets the query and returns to the active category.
- **AC3** No matches renders the empty state **"No tutorials match your search."** (v1: `No tutorials match "{query}".`).
- **AC4** The header count updates to the number of matches.

---

## Epic T2 — Watch a tutorial

### US-T2.1 — Select a video into the player
**As an** Operator **I want** to click a playlist row and watch it in the main player **so that** I can
follow the walkthrough with its title and description in view.
- **AC1** Selecting a row loads the left **player card**: a 16:9 video embed (v1: YouTube via Plyr,
  autoplay), the video **title**, **description**, and a **duration** badge.
- **AC2** The card shows a **product-area badge** (the owning playlist title) above the title.
- **AC3** Selection **re-anchors** the category context to the playlist owning the video (even when picked
  from a cross-category search), clears the search, and highlights the selected row.
- **AC4** With no explicit selection the player defaults to the **first video of the first non-empty
  playlist** (`selectTutorialState`).
- **Copy (v1):** badge = `selectedPlaylist.title`; heading = `selectedVideo.title`; body = `selectedVideo.description`.

### US-T2.2 — Copy a shareable link to a video
**As an** Operator **I want** a "Copy link" button on the player **so that** I can share a tutorial with a
teammate.
- **AC1** The player card has a **Copy link** action that copies a canonical deep link to the current
  video and toasts confirmation.
- **AC2** The link resolves back to this video via US-T2.3 (v1 copied `https://www.youtube.com/watch?v={video.id}`;
  v2 should prefer the in-app deep link `/tutorials/:id`).
- **Copy (v1):** button label "Copy Video Link".

### US-T2.3 — Deep-link to a specific video
**As an** Operator **I want** `/tutorials/:id` to open straight to that video **so that** links from
guided prompts and shared URLs land on the right walkthrough.
- **AC1** The route id is optional (`tutorials/[[id]]`); with an id, `GET /tutorials/:id` (or the
  `GET /tutorials` catalog) resolves the video, selects it into the player, and anchors its category tab.
- **AC2** If the id is not in any fetched playlist, fall back to a **synthetic single-video playlist**
  from the video registry so the deep link still plays (v1 `getTutorialVideoById`); if it resolves to
  nothing, browse **All**.
- **AC3** These deep links back the app's **TU-001..TU-021** guided tutorial prompts (e.g. dashboard /
  social / contacts-import / design-review-page / connect / campaigns walkthroughs).

### US-T2.4 — Auto-advance to the next video
**As an** Operator **I want** the next tutorial to queue up when one ends **so that** I can watch a
category straight through.
- **AC1** On playback end the player advances to the **next video within the same playlist**, if any;
  the last video in a playlist has no next (no wrap).
- **AC2** On mobile the player exposes an explicit **"Next Video: {title}"** control and a **"Back to
  Playlist"** link (the split player/playlist layout collapses to one column).

---

## Epic T3 — Get help beyond tutorials

### US-T3.1 — Cross-link to the Help Center
**As an** Operator **I want** a Help Center link on the tutorials page **so that** I can reach written
docs / support when a video isn't enough.
- **AC1** The page header has a **Help Center** action linking to the support surface
  (mockup: `support/support.html`).
- **AC2** The link is a plain outbound cross-link — it does not alter tutorial state or selection.

---

## Cross-cutting acceptance criteria
- **Read-only + tenant-safe:** `GET /tutorials` / `GET /tutorials/:id` require auth but expose no
  per-profile data; no write endpoints exist for the catalog.
- **Grouping is the model:** product-area == playlist; the UI never hardcodes categories — it renders
  whatever playlists the catalog returns (BF-001).
- **Graceful degradation:** empty catalog → "Tutorials are unavailable"; fetch error → toast +
  loading/empty fallback; a missing deep-link id → synthetic playlist or "All".
- **Resilient assets:** a broken thumbnail/avatar must never blank the row or the player (fix-on-rebuild:
  v1 image renders elsewhere failed the whole render on one 404 asset).

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-T1.1 | `GET /tutorials` |
| US-T1.2 | `GET /tutorials` (client-side tab filter) |
| US-T1.3 | `GET /tutorials` (client-side search) |
| US-T2.1 | `GET /tutorials` (select) |
| US-T2.2 | `GET /tutorials/:id` (link target) |
| US-T2.3 | `GET /tutorials/:id` |
| US-T2.4 | `GET /tutorials` (next-in-playlist) |
| US-T3.1 | — (Help Center cross-link) |
