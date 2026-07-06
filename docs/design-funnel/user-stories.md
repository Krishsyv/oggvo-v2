# Design & Funnel — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/design-funnel.md`](../feature-spec/design-funnel.md)
> (the public render + rating stats are shared with [`docs/feature-spec/reviews.md`](../feature-spec/reviews.md)).
> v2 targets: module `apps/api/src/modules/funnel` (+ `apps/api/src/modules/reviews` for the public render) ·
> tables `funnel_designs`, `links`, `link_masters`, `designs`, `buttons`, `crawler_history` (`@oggvo/db`) ·
> queue `—` (design save is a synchronous S3/DB write; review-monitoring crawl uses the `review-puller` queue) ·
> build phase 1–3.
>
> Companion docs: [activity-diagrams.md](./activity-diagrams.md) ·
> [reviews user-stories](../reviews/user-stories.md) (Epics F1/F2/P1 are summarized there; **this doc is the
> canonical, deeper treatment of the funnel editors + link manager + instructions interstitial**) ·
> mockups in [../design-system/mockups/](../design-system/mockups/):
> [design-main.html](../design-system/mockups/funnel/design-main.html) (Unlayer visual designer),
> [design-funnel.html](../design-system/mockups/funnel/design-funnel.html) (Positive editor + interactive link manager + Add/Edit/Delete + instructions modals),
> [design-negative.html](../design-system/mockups/funnel/design-negative.html) (private-feedback editor),
> [design-thanks.html](../design-system/mockups/funnel/design-thanks.html) (thank-you editor),
> [funnel-public.html](../design-system/mockups/funnel/funnel-public.html) (the public `/r/:shortname` page — no portal shell).

> **How to read this doc** — one section per tab / sub-page / modal. Each story cites the real v2 endpoint;
> **Copy** lines quote v1 verbatim (grounding the mockups); **Fix-on-rebuild** / **Open** lines carry the
> parity risks from the feature spec and the v1 source read.

**Personas**
- **Operator** — authenticated portal user editing the funnel + links for their active profile.
- **Visitor** — anonymous customer on the public funnel page (`/r/:shortname`).
- **System** — API + S3/DB design store + the review-monitoring crawler (`review-puller`).

**Global rules**
- Every editor read/write is scoped to the caller's `profileId` (TenantGuard); link update/toggle/delete/reorder
  re-checks `profileId` ownership before mutating.
- **Funnel routing** is decided by `HappyMinimum` (set on the Positive tab): rating **≥ threshold** → positive /
  review-platform path; **below** → negative / private-feedback path. Special values **`1` = Review to All**,
  **`0` = Feedback to All** override the split.
- **Design storage moves S3 → DB:** v1 stores the Unlayer design as `funnel.json` + `html.json` on S3 (the
  `funnel_designs` row is only a pointer). v2 stores it inline in `funnel_designs.exported_json` /
  `exported_html`; the public page reads the DB and injects **sanitized HTML** (no runtime Vue template compile).
- **Content fields** (positive/negative/thanks copy, colors, `HappyMinimum`) live on the `profile` row in v1.
  Confirm v2 keeps them on the profile/tenancy table or extracts a `funnel_content` table.
- **Booleans are real** in v2 (`isActive`, `opensInNewWindow`, `skipInstructions`, `showOnMobile`,
  `showOnDesktop`) — v1 stored `'0'/'1'` strings and compared with a dead `== 'true' ?? true` idiom.
- **Tab order parity note:** v1's TabBar order is **Main → Negative Review → Positive Review → Thank You**.
  The v2 mockups present **Main → Positive → Negative → Thank You** (positive-before-negative reads more
  naturally); confirm the intended order before shipping.

---

## Epic D1 — Funnel content editors (tabs)

The `/design` parent renders a shared header — a **copyable public funnel link** (`{frontURL}review/{Shortname}`;
clicking the link text copies it, tooltip **"Click to copy"** → **"Copied!"**) — plus a TabBar over the four tabs.

### US-D1.1 — Visual designer (Main tab)
**As an** Operator **I want** a drag-and-drop builder **so that** I can brand the funnel without code.
- **AC1** The Main tab embeds the Unlayer **EmailEditor** (v1 `projectId 138792`, `displayMode "web"`,
  `contentWidth 1024px`); a floating **Save** exports `{ json, html:{ fonts, css, body } }`.
- **AC2** Initial design loads via `GET /design/getdesign`; on load failure toast **"We could not load your existing design!"**.
- **AC3** Save → `POST /design/savedesign`; success toast (server **"Data Saved Successfully!"**; v1 frontend
  fallback has a typo, **"Design Saved succesfully!"** — normalize in v2); failure toast **"We could not save your design!"**.
- **AC4** The image picker is a paginated library (`media/image?page&perPage=20`) + Upload (`media/upload`, `source=Funnel`,
  ≤5 MB). Deleting an uploaded image confirms first — v1 uses a native `confirm()` **"Are you sure you want to delete this file?"**
  (fix-on-rebuild: use a themed ConfirmModal, not `confirm()`); confirmed → `DELETE media/{id}/image`.
- **Fix-on-rebuild / Open:** v1 persists to S3 (`funnel.json` + `html.json`, CSS minified, body `utf8_encode`d —
  deprecated in PHP 8.2+). v2 stores inline in `funnel_designs.exported_json/exported_html`; decide whether Unlayer
  stays or a typed builder replaces it, and how the public page renders the artifact (sanitized HTML injection).

### US-D1.2 — Positive editor
**As an** Operator **I want** to edit the "happy" screen **so that** good raters are routed to review platforms.
- **AC1** Split view: live preview (left) + form (right). Form panel heading **"Positive Window"**, subtext
  **"This page will appear after selecting Stars"**.
- **AC2** Fields: **Select an option** (`HappyMinimum`, see US-D1.5), **Header** (`ThankYouMessage`), **Body**
  (`MessageHappy`) — both textareas, placeholder **"Write your thoughts here..."** — plus the embedded
  **platform-link manager** (Epic D2). Footer: **Cancel** / **Apply**.
- **AC3** Apply → `POST /design/savecontent` (v2 `PATCH /funnel/content`); success toast **"Data updated successfully!"**.
- **AC4** Preview shows read-only stars + count, the heading/body, and **"Connect with {platform}"** buttons from the
  active links; empty state **"No Platforms!"**.
- **Copy/Open:** the spec lists Header/Footer **Color** fields (`PositiveFunnelHeaderBgColor`/`FooterBgColor`,
  default `#1849A9`); the v1 `positive.vue` read does **not** expose color fields — **parity flag**: confirm whether
  colors are edited here, on the Main designer, or not at all.

### US-D1.3 — Negative (private-feedback) editor
**As an** Operator **I want** to edit the "unhappy" screen **so that** low raters reach me privately instead of posting publicly.
- **AC1** Split view. Form panel heading **"Negative Window"**, subtext **"This page will appear after selecting Stars"**.
- **AC2** Fields: **Header** (`NegativeFeedbackMessage`), **Body** (`MessageUnhappy`) — placeholder
  **"Write your thoughts here..."** — plus the link manager (Epic D2; section sub-heading
  **"Show Following Social Media For Feedback"**). Footer: **Cancel** / **Apply** → `POST /design/savecontent`,
  toast **"Data updated successfully!"**.
- **AC3** Preview shows the private feedback form the visitor fills, with these exact fields:
  **First name** (ph "John"), **Last name** (ph "Doe"), **Email address** (ph "john.doe@company.com"),
  **Phone number** (ph "123-45-678", `pattern="[0-9]{3}-[0-9]{2}-[0-9]{3}"`), **Your message**
  (ph "Write your thoughts here..."), submit **"Leave Feedback"**. When links exist, a row reads
  **"Do you want to leave a review online? Select a platform below."**
- **Open:** the negative form's public submission (create `review` + `recipient`, tag "Left Oggvo Feedback",
  set Inactive, delete prior reviews) is owned by the reviews domain — locate/spec the public endpoint
  (see [reviews US-P1.3](../reviews/user-stories.md)).

### US-D1.4 — Thank-You editor
- **AC1** Split view. Form panel heading **"ThankYou Window"**, subtext **"This page will appear after submitting review"**.
- **AC2** Fields: **Header** (`ThankYouHeading`), **Body** (`ThankYouBody`) — placeholder **"Write your thoughts here..."**;
  **Cancel** / **Apply** → `POST /design/savecontent`, toast **"Data updated successfully!"**. Preview = centered
  success icon + heading + body; **no platform links**.

### US-D1.5 — Funnel routing threshold (`HappyMinimum`)
**As an** Operator **I want** to choose which ratings count as "happy" **so that** the split routes correctly.
- **AC1** "Select an option" sets `HappyMinimum` with these exact options: **5 Stars and Above** (5),
  **4 Stars and Above** (4), **3 Stars and Above** (3), **2 Stars and Above** (2), **Review to All** (1),
  **Feedback to All** (0).
- **AC2** Saved via `savecontent`. Special-cased keys on save: `header → MessageHeader`, `body → MessageText`,
  `footer → CustomPoweredBy`; every save stamps `LastUpdatedBy`.
- **Fix-on-rebuild:** v1 `savecontent` mass-assigns arbitrary posted profile keys — **allowlist** the editable
  fields in v2.

---

## Epic D2 — Platform-link manager (shared by Positive & Negative)

> `components/Design/Links.vue` — section title **"Social Media"**, sub-heading
> **"Show Following Social Media For Feedback"**. Fully interactive in
> [design-funnel.html](../design-system/mockups/funnel/design-funnel.html).

### US-D2.1 — List the funnel links
- **AC1** `GET /links` lists links ordered by `rank`; each row = logo + name + per-row action buttons
  (tooltips **"Edit"**, **"Remove"**, **"Order"**/drag handle). Inactive rows render dimmed (`opacity-50`).
  Empty state **"No links."**

### US-D2.2 — Add a platform (`AddPlatformModal`)
- **AC1** Title **"Add Platform"** (trigger link **"Add New Platform"**). **Custom Link** switch (default **off**)
  toggles modes:
  - **Catalog** (off): **Platform** searchable Listbox (button placeholder **"Select a platform"**, search
    **"Search..."**) sourced from `GET /links/categories` (grouped by category).
  - **Custom** (on): **Platform Name** + image upload (**"Click to upload"** / **"or drag and drop"**, hint
    **"File size is limited to 5 MB"**).
- **AC2** **Call to Action (CTA) URL** (required). Switches: **Open in New Window** (off), **Skip Instructions** (off),
  **Show on Mobile** (on), **Show on Desktop** (on). **Confirm** / **Cancel**.
- **AC3** Submit → `POST /links` (catalog copies `name`/`imageUrl` from `link_masters`); success toast
  **"Platform added successfully!"**. Custom name must be unique vs the catalog → duplicate error **"Platform already exists"**.

### US-D2.3 — Edit a platform (`EditPlatformModal`)
- **AC1** Title **"Edit Platform"**; pre-fills all fields from the row; image hint **"leave it blank to not update the image"**.
  **Confirm** → `PATCH /links/:id`; toast **"Platform updated successfully!"**.

### US-D2.4 — Delete a platform (`DeletePlatformModal`)
- **AC1** Title **"Delete Link"** (noun inconsistency vs Add/Edit "Platform" — normalize in v2), warning
  **"Are you sure? You won't be able to revert this!"**, buttons **Delete** / **Cancel**.
- **AC2** Confirm → `DELETE /links/:id` (server **"Data Deleted successfully!"**); toast **"Link deleted successfully!"**.

### US-D2.5 — Reorder links
- **AC1** Drag-reorder persists `rank` = array index via `POST /links/save-order` (v2 `PATCH /links/order`);
  success toast **"Order updated successfully!"**.
- **Fix-on-rebuild:** v1 `changeOrder` sets success **inside its catch** (swallows failures) — propagate errors and
  revert the optimistic order on failure.

### US-D2.6 — Show / hide a link
- **AC1** An eye toggle optimistically flips `isActive` via `POST /links/toggle/:id` (v2 `PATCH /links/:id/active`);
  reverts on error.
- **Open:** v1 `Links.vue` selects `IsActive` but the read showed **no visibility-toggle UI** and **no
  "visible/hidden" toast** — confirm whether show/hide is surfaced here (the v2 mockup includes it).

### US-D2.7 — Review-instructions interstitial (`InstructionsModal`)
**As a** Visitor **I want** step-by-step help **so that** I can leave a review on an unfamiliar platform.
- **AC1** On the funnel previews and the public page, clicking a platform button for
  **google / facebook / zillow / realtor.com** (when **`skipInstructions != 1`**) opens an interstitial:
  heading **"How to leave a review on {platform}"**, platform-specific steps, disclaimer
  **"Note: This website is not affiliated with or endorsed by {platform}."**, CTA
  **"Click to review us on {platform}"** (opens the link, respecting Open-in-New-Window). Otherwise a plain link.
- **Parity gap:** **Yelp** has a server-side instruction view (`app/Views/review/instructions/yelp.php`) but **no Vue
  modal branch** — add it in v2. (The v2 mockup includes a Yelp interstitial.)

---

## Epic D3 — Public funnel (anonymous visitor)

> Rendered with **no portal shell** at `/r/:shortname` ([funnel-public.html](../design-system/mockups/funnel/funnel-public.html)).
> Full visitor flow is documented in [reviews Epic P1](../reviews/user-stories.md#epic-p1--public-funnel-anonymous-visitor);
> summarized here for completeness.

### US-D3.1 — Render + route
- **AC1** `GET /funnel/:shortname` (public) returns profile name, `happyMinimum`, positive/negative/thankyou copy,
  rating count+avg, the design, and active links (rank-ordered). Fetch failure → 404.
- **AC2** Selecting a rating routes per `happyMinimum` (US-D1.5): **≥** → positive (review-platform links, with the
  US-D2.7 interstitial); **below** → negative feedback capture (US-D1.3 fields). Both end at the thank-you screen.

---

## Cross-cutting acceptance criteria
- **Tenancy:** every link/design op re-checks `profileId` ownership before mutating.
- **Allowlist** the `savecontent` fields (no arbitrary profile-key mass-assignment).
- **Booleans real**, not `'0'/'1'` strings; reorder propagates failures (no swallowed catch).
- **Design store** S3 → DB jsonb/html; public render = sanitized HTML injection, not a runtime template compile.
- **Dormant Buttons feature** (`Buttons.php`, `buttons` table) — route group is commented out in v1; document as a
  migration consideration, not an active page.

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-D1.1 | `GET /design/getdesign`, `POST /design/savedesign` (v2 `GET/PUT /funnel/design`) |
| US-D1.2–1.5 | `GET /design`, `POST /design/savecontent` (v2 `GET /funnel/content`, `PATCH /funnel/content`) |
| US-D2.1 | `GET /links` |
| US-D2.2 | `POST /links/create` (v2 `POST /links`) + `GET /links/categories` |
| US-D2.3 | `POST /links/update/:id` (v2 `PATCH /links/:id`) |
| US-D2.4 | `DELETE /links/:id` |
| US-D2.5 | `POST /links/save-order` (v2 `PATCH /links/order`) |
| US-D2.6 | `POST /links/toggle/:id` (v2 `PATCH /links/:id/active`) |
| US-D2.7 | (client interstitial; links resolve to platform URLs) |
| US-D3.* | `GET /funnel/:shortname` (public) |
