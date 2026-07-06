# Media Library — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/social.md`](../feature-spec/social.md) (§2 Compose · `MediaPicker`,
> `social_post_media`) and the **fix-on-rebuild media notes** in [`CLAUDE.md`](../../CLAUDE.md) —
> the S3/CDN media-storage note, the media-ownership / reference-count note, and the single-media-host note.
> v2 targets: module `apps/api/src/modules/media` ·
> tables `images`, `videos` (+ a `media_references` reference model) (`@oggvo/db`) ·
> no queue (synchronous presign + finalize; CloudFront serving) · build phase 3.
>
> Companion docs: [../design-system/README.md](../design-system/README.md) · mockups in
> [../design-system/mockups/](../design-system/mockups/):
> **[media-library.html](../design-system/mockups/media/media-library.html)** (standalone Media Library page) ·
> the compact **picker** variant lives inside the Social composer
> ([social-composer.html](../design-system/mockups/social/social-composer.html) — the "Add media" modal).
>
> **How to read this doc** — one section per page area / modal. Each story cites the real v2 endpoint;
> **Copy** lines quote the v1 UI; **Fix-on-rebuild** lines carry the parity risks (media storage, media
> ownership, single host) that this domain exists to correct.

**Personas**
- **Operator** — authenticated portal user managing the media gallery for their active profile.
- **System** — API + S3 (presigned upload, keys in DB) + CloudFront (single serving host).

**Global rules**
- Every read/write is scoped to the caller's `profileId` (TenantGuard); ownership is re-checked before mutate. No cross-tenant media.
- The gallery is a **shared per-profile pool**: one file (`images.id` / `videos.id`) can be referenced by many
  features at once (a social post *and* a review-request campaign *and* a funnel link). "Where is this used?"
  must be **one query**, not a hand-maintained list of feature tables (fix-on-rebuild: media-ownership note).
- **One media host.** Every stored file is addressed by a single CloudFront URL derived from its S3 `key` in the DB.
  There is exactly one host and no per-caller URL rewriting (fix-on-rebuild: single-media-host note; v1 rewrote the
  same `assets/media/...` URL differently for frontend vs SSR, so files rendered in some places and 502'd in others).
- Files live in **S3 via the SDK** — presigned upload + CloudFront serving, key in the DB. No NFS mount, no
  local-disk assumptions, no per-`file_exists` HEAD latency, no "directory not writable" on missing prefixes
  (fix-on-rebuild: media-storage note).
- Timestamps are stored UTC and rendered in the profile timezone.

---

## Epic M1 — Browse, search & filter the library

### US-M1.1 — Browse images and videos
**As an** Operator **I want** a gallery of every image and video I've uploaded **so that** I can reuse them across posts, campaigns, and funnels.
- **AC1** `GET /media?type=image` (and `?type=video`) returns the profile's non-deleted media, newest first, paginated. Two tabs — **Images** / **Videos** — switch `type`; the active tab count is shown.
- **AC2** Each tile shows: a thumbnail (served from the single CloudFront host via the file's DB `key`), the filename, the dimensions + size (e.g. `1080×1080 · 240 KB`; videos also show duration), and a **"used in N places"** reference badge (see US-M3.1).
- **AC3** The grid is responsive (auto-fill, min tile width) and each tile is theme/dark-safe.
- **AC4** Empty state = image icon + "No media yet" + an **Upload** CTA. Loading = a grid of skeleton tiles.
- **Fix-on-rebuild:** thumbnails come from CloudFront keyed by the DB `key`, not from `{baseURL}assets/media/uploads/thumbs/...` over a mount — no missing-prefix upload failures, no host-dependent 502s.

### US-M1.2 — Search and filter by type & date
**As an** Operator **I want** to search and filter the gallery **so that** I can find a file quickly in a large library.
- **AC1** A search box filters by filename (server-side `LIKE`, client-side within the loaded page for instant feedback); changing it resets to page 1.
- **AC2** A **type** filter (All / Images / Videos) and a **date** filter (`from`/`to`, `YYYY-MM-DD`) narrow the list; any change refetches and resets to page 1.
- **AC3** When filters match nothing, the empty state reads "No media matches your filters" with a **Clear filters** action.

### US-M1.3 — Preview a file and copy its CDN URL
**As an** Operator **I want** to preview a file and copy its link **so that** I can inspect it or paste the URL elsewhere.
- **AC1** Hovering a tile reveals actions: **Preview**, **Copy URL**, **Delete**.
- **AC2** **Preview** opens the full-size image (or a video player) plus its metadata (filename, dimensions, size, uploaded date in profile TZ, and the "used in N places" list).
- **AC3** **Copy URL** copies the single canonical CloudFront URL (one host for every caller) and toasts "Link copied".

---

## Epic M2 — Upload media (presigned S3)

### US-M2.1 — Upload via a presigned S3 upload
**As an** Operator **I want** to upload images and videos **so that** they're available in my gallery and pickers.
- **AC1** An **Upload** button (page header) and the Upload tab open a modal with a drag-and-drop area ("Drop files here or Browse") plus type/size hints (images up to 30 MB, video up to 50 MB).
- **AC2** Upload is **direct-to-S3 via a presigned URL** — the client requests a presigned upload (`POST /media` returns `{ key, uploadUrl }`), `PUT`s the bytes straight to S3, then finalizes the DB record. The API never proxies the file bytes.
- **AC3** Each queued file shows a progress bar; on success the new tile appears at the top of the grid with a "used in 0 places" badge and a success toast; on failure the row shows a **Retry**.
- **AC4** Server records the S3 `key`, `mimeType`, byte size, and (for images) width/height on the `images`/`videos` row; the browsing URL is derived from `key` + the single CloudFront host — never a local path.
- **Fix-on-rebuild:** no NFS mount and no `->move()`/`file_exists()` local-path logic; because S3 has no empty directories, v1 uploads failed with "directory not writable" when `uploads/`, `uploads/thumbs/`, or `uploads/video/` prefixes were missing. Presigned PUT with a key has no such prerequisite.

---

## Epic M3 — Reference-counted usage

### US-M3.1 — See where each file is used
**As an** Operator **I want** to see how many places a file is used **so that** I understand its impact before I touch it.
- **AC1** Every tile carries a **"used in N places"** badge; `N` is the file's reference count from a single query over the media reference model (`GET /media` includes `referenceCount`; the preview lists the actual usages).
- **AC2** A file used by a social post **and** a review-request campaign **and** a funnel link reports `N = 3` and lists all three — one query, not a per-feature audit. `N = 0` renders as a muted "Unused" badge.
- **AC3** The reference list names each usage (e.g. "Social post · Jun 22", "Campaign: Spring Review Drive", "Funnel link: Google") and links to it where possible.
- **Fix-on-rebuild (media-ownership):** v1 had **no ownership model** — the same `image.ID` backed a `social_post_media` row and an `invite_campaign.ImageID`, but nothing tracked it; the FB data-deletion purge checked `social_post_media` alone and would have deleted a file still used by a campaign, patched by a fragile hand-maintained `usedElsewhere` list. v2 makes "is this referenced anywhere?" a single reference-count query so a new feature that references a media row is counted automatically and never silently reintroduces the data-loss bug.

---

## Epic M4 — Safe, reference-aware delete

### US-M4.1 — Delete an unreferenced file
**As an** Operator **I want** to delete a file that isn't used anywhere **so that** I can keep my gallery tidy.
- **AC1** The tile **Delete** action opens a confirm modal naming the file.
- **AC2** When `referenceCount == 0` the modal confirms plainly ("This file isn't used anywhere. Delete it?"); confirming calls `DELETE /media/:id`, which removes the DB row **and** the S3 object (keyed off the DB `key`), then toasts "Media deleted" and removes the tile.

### US-M4.2 — Warn / block deletion of a referenced file
**As an** Operator **I want** to be warned when a file is still in use **so that** I don't break a live post, campaign, or funnel.
- **AC1** When `referenceCount > 0` the confirm modal shows a **warning** banner: "This file is used in N places" and lists the usages (from US-M3.1). Deleting it would break those references.
- **AC2** `DELETE /media/:id` performs the **reference check server-side** and returns **409 Conflict** with the reference list when the file is still used — the physical delete is **never** keyed off a single feature's table.
- **AC3** The modal's primary action is disabled (or requires an explicit "Delete anyway / detach everywhere" acknowledgement) while references exist; the safe path is to remove the file from those usages first.
- **Fix-on-rebuild:** v1 keyed the purge off one feature's references (`social_post_media`) and nearly deleted files still used elsewhere; v2 guards every delete behind the single reference-count query so a physical delete can never orphan a live usage.

---

## Cross-cutting acceptance criteria
- **Tenancy:** every media read/write re-checks `profileId` ownership before mutating.
- **One host:** all media URLs are derived from the DB `key` + one CloudFront domain — no per-caller rewriting, no SSR-vs-frontend host divergence.
- **Storage:** presigned S3 upload + CloudFront serving, key in DB; no NFS mount, no local-path assumptions, no per-file HEAD latency.
- **Reference integrity:** "is this file referenced anywhere?" is a single query; physical delete is guarded by it and never keyed off one feature's table.

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-M1.1 | `GET /media?type=image\|video` |
| US-M1.2 | `GET /media?q=&from=&to=` |
| US-M1.3 | `GET /media/:id` (preview + CDN URL) |
| US-M2.1 | `POST /media` (presigned upload) |
| US-M3.1 | `GET /media` (`referenceCount`) / `GET /media/:id/references` |
| US-M4.1–M4.2 | `DELETE /media/:id` (reference check → 409) |
