# Widgets — User Stories & Acceptance Criteria

> Source of truth: [`docs/feature-spec/widgets.md`](../feature-spec/widgets.md).
> v2 target: module `apps/api/src/modules/widgets` · tables `widgets`, `funnel_designs`
> (`@oggvo/db`) · queue `—` (config is sync; chat inquiry enqueues the messaging/SMS queue) ·
> build phase 3.
>
> Companion docs: [activity-diagrams.md](./activity-diagrams.md) (flow diagrams) ·
> [../design-system/README.md](../design-system/README.md) (UI) · mockups in
> [../design-system/mockups/](../design-system/mockups/) — `widgets-list.html`, `widget-editor.html`.

**Personas**
- **Operator** — the everyday authenticated portal user of a profile (business owner / staff) who
  picks a widget type, configures it, and copies the embed snippet. All stories are this persona
  unless noted.
- **Visitor** — an anonymous end-user on the Operator's own third-party website where the embed is
  installed. Renders the widget and (for the Chat widget) submits a lead. Never authenticated.
- **System** — the platform (API SSR embed route + loader script + messaging worker) acting on the
  Operator's / Visitor's behalf.

**Global rules that apply to every story**
- Every authed read/write is scoped to the caller's active `profileId` (TenantGuard). No cross-tenant
  reads. Public render/inquiry routes are **unauthenticated** and keyed by **profile UUID** only.
- A profile has **at most one row per `widgetType`** in `widgets` (unique `(profileId, widgetType)`);
  `properties` is a typed discriminated-union JSONB, not a loose blob (fix-on-rebuild vs v1).
- Widget config persistence lives in `widgets.properties` — a config save must **not** mutate the
  whole profile record (fix-on-rebuild: v1 `save-settings` coupled widgets to the profile).
- Every embed snippet emits an **absolute** CDN/SSR URL (`https://widgets.oggvo.com/…`), never a
  relative `/widget/…` path that breaks on a third-party host (fix-on-rebuild).
- The public embed is an **iframe + `postMessage` resize**, origin-checked, for every widget type — no
  jQuery DOM injection into the host page (fix-on-rebuild: v1 `widget.js` clashed with host jQuery).
- Dates/times render in the **profile timezone**, never a hardcoded zone.

---

## Epic E1 — Pick & manage widgets

### US-1.1 — Browse the widget gallery
**As an** Operator **I want** a gallery of the available widget types **so that** I can choose what to
embed on my site.
- **AC1** `GET /widgets` returns the authed config bundle for my profile: every supported widget type,
  its configured/unconfigured state, and the values needed to build each embed (profile UUID, colors,
  stream prefs, chat props, Google aggregate).
- **AC2** The gallery shows one card per type — **Review Stream, Review Button, Carousel/Grid Wall,
  Review Splash, Chat Widget, Email Signature, Google Review Schema** — each with a thumbnail/preview,
  name, one-line description, and a **Create** (unconfigured) or **Edit** (configured) button.
- **AC3** A **status DOT badge** per card: `Live` (success) when configured/installed, `Draft`
  (warning) when saved but not yet copied/installed, `Not set up` (gray) when never configured.
- **AC4** Empty/first-run shows every card in the `Not set up` state with a **Create** CTA; no error.
- **AC5** Loading shows skeleton cards.

### US-1.2 — Search the gallery
**As an** Operator **I want** to search widget types **so that** I can find one fast.
- **AC1** The header search filters cards client-side over name + description, lowercased,
  placeholder "Search widgets…".
- **AC2** No-match shows a "No widgets match …" empty state, not a blank grid.

### US-1.3 — See my already-created widgets
**As an** Operator **I want** a list of the widgets I have already configured **so that** I can jump
back to edit or grab the embed again.
- **AC1** A "Your widgets" section lists configured widget rows (`GET /widgets`) with name, type,
  status badge, last-updated (profile timezone), and an **Edit** action.
- **AC2** Each row links to the editor at `/widgets/:id` for that widget type's row.

---

## Epic E2 — Configure a widget

### US-2.1 — Open the split editor
**As an** Operator **I want** a config panel beside a live preview **so that** I can see changes as I
make them.
- **AC1** `/widgets/:id` loads the editor: left = config panel for the widget type; right = a live
  preview that re-renders on every config change; below the preview = the **Embed code** block.
- **AC2** The widget **type** is selectable at the top of the config panel (switching type swaps the
  available controls and the preview).
- **AC3** The editor hydrates from `GET /widgets/:id` (the saved `properties` for that row).

### US-2.2 — Tune Review Stream layout & content
**As an** Operator **I want** to control how many reviews show, the minimum rating, and which fields
appear **so that** the stream matches my site.
- **AC1** Controls: **Max reviews** (select 1/2/3/5/10/25/50/100, default 25), **Minimum rating**
  (1–5 ★, default any), **Layout** (Stream / Carousel / Grid Wall), **Theme color**, switches:
  **Show aggregate** (count + average), **Include reviews with no text**, **Use reviewer's last
  initial**, **Show avatar**, **Show date**, **Autoplay** (Carousel only).
- **AC2** Each change is persisted to `widgets.properties` via `PUT /widgets/:id` and re-renders the
  preview (auto-save; no separate Save button needed, mirroring v1's stream auto-save).
- **AC3** `Show aggregate` adds a header line "X reviews · Y★ average"; excludes Oggvo reviews when
  the profile sets `HideOggvoReviews`.

### US-2.3 — Tune Review Button colors
**As an** Operator **I want** to set the button's text and background colors **so that** it matches my
brand.
- **AC1** Controls: **Text color** (default `#D1E9FF`) and **Background color** (default `#175CD3`)
  via color inputs (swatch + hex field).
- **AC2** Saving persists to `widgets.properties` via `PUT /widgets/:id`; the preview re-renders with
  the new colors.

### US-2.4 — Configure the Chat (lead-capture) widget — SMS-gated
**As an** Operator **I want** to brand the chat pop-up that captures leads **so that** visitors can
contact me from my site.
- **AC1** The Chat editor is reachable only when `auth.user.permissions.sms` is truthy; without it the
  gallery card shows an **"Upgrade to customize"** CTA (mailto support) instead of **Create/Edit**.
- **AC2** Controls: **Welcome text** (max 26), **Header text** (max 26), **Opening text** (textarea,
  max 85), **Primary color** (default `#175CD3`), **Secondary color** (default `#3C3C3C`), **Avatar
  image** upload (PNG/JPG, max 800×800). Char-remaining counters on text fields.
- **AC3** Each change persists via `PUT /widgets/chat` (JSON); the image is uploaded separately via a
  signed upload (fix-on-rebuild: media module / S3, not local disk).
- **AC4** The upsert is **unconditional** — saving never no-ops just because a field still equals a
  default (fix-on-rebuild: v1 silently skipped first edits).
- **AC5** Colors are stored without a leading `#` and re-prefixed on read (parity with v1).

### US-2.5 — Configure the Review Splash toast
**As an** Operator **I want** a rotating bottom-corner review toast **so that** fresh reviews show
without taking page space.
- **AC1** Controls: theme color, minimum rating, show avatar/date switches; a **Show / hide live
  demo** toggle renders the toast in the preview.
- **AC2** Saving persists to `widgets.properties` via `PUT /widgets/:id`; the embed rotates one review
  ~every 20s at render time.

### US-2.6 — Generate the Email Signature (client-only)
**As an** Operator **I want** an HTML star-rating block for my email signature **so that** every email
links recipients to my review funnel.
- **AC1** Controls: **Header** (default "How would you rate your purchase?"), **Body** (default "Click
  to rate your experience with {Name}"), **Color** (10 swatches), **Size** (Medium 32px / Large 48px).
- **AC2** The signature HTML is generated **entirely client-side** from profile `Name`/`Shortname` —
  no API persistence (parity with v1). The Embed block shows the inline-styled HTML.

### US-2.7 — Generate the Google Review Schema (client-only)
**As an** Operator **I want** a JSON-LD `aggregateRating` snippet **so that** my Google listing shows
a rich-snippet star rating.
- **AC1** The snippet is a `<script type="application/ld+json">` `Product` with
  `aggregateRating { ratingValue, reviewCount }` sourced from the profile (`AverageScore`,
  `TotalReviews`); generated client-side, no persistence.
- **AC2** Helper notes warn: place on a sub-page (not the root domain) and re-paste when review counts
  change (static snapshot), linking Google's structured-data docs.

---

## Epic E3 — Embed & install

### US-3.1 — Copy the embed snippet
**As an** Operator **I want** a one-click copy of the embed code **so that** I can paste it into my
site.
- **AC1** The editor shows an **Embed code** block: a `<script src="https://widgets.oggvo.com/embed.js"
  data-widget="{id}"></script>` snippet (iframe loader) with a **Copy** button.
- **AC2** Copy writes to clipboard and confirms with a toast ("Embed code copied").
- **AC3** The snippet always uses an **absolute** CDN URL (fix-on-rebuild vs v1 relative paths).
- **AC4** For client-only widgets (Email Signature, Google Schema) the block contains the generated
  HTML / JSON-LD itself, not a loader `<script>`.

---

## Epic E4 — Public render & lead capture (Visitor)

### US-4.1 — Render a widget on a third-party site
**As a** Visitor **I want** the embedded widget to render on the host page **so that** I see the
business's reviews / chat prompt.
- **AC1** `embed.js` injects an origin-checked **iframe** pointing at
  `GET /public/widgets/:profileId/:type` (SSR HTML); the iframe posts its height via `postMessage` and
  the loader resizes it.
- **AC2** The SSR route is unauthenticated, keyed by profile UUID + widget type, and reads the saved
  `widgets.properties` (and reviews for stream/splash) — no auth token, no cross-profile leakage.
- **AC3** Review Stream supports a `?page=` param for lazy-loading more reviews; aggregate recompute is
  skipped when `page > 1`.

### US-4.2 — Submit a chat-widget inquiry
**As a** Visitor **I want** to send my name, phone, and a message through the chat widget **so that**
the business can reply.
- **AC1** `POST /public/widgets/:profileId/inquiries` accepts `name`, `phone`, `message` (min 10),
  `gToken` (reCAPTCHA v3); validates profile UUID, name min 1, phone (normalized via libphonenumber,
  fix-on-rebuild vs v1 US-only regex), message length.
- **AC2** reCAPTCHA v3 is **verified server-side** (action "Chat") before the inquiry is accepted.
- **AC3** A valid inquiry is **enqueued** onto the messaging queue (not handled inline) and creates or
  appends to a messaging thread of source `inquiry`, deduped by profile + phone.
- **AC4** Success returns `{ status: true }` and the widget shows its thank-you slide; validation/
  reCAPTCHA failure returns field errors without creating a thread.

---

## Cross-cutting acceptance criteria
- **Tenancy:** authed config reads/writes scoped to `profileId`; public routes scoped to the path
  `profileId` UUID only, no token.
- **Single-row-per-type:** writes upsert on `(profileId, widgetType)`; no duplicate rows.
- **Webhook/secret hygiene:** the public inquiry path always verifies reCAPTCHA; never accept on a
  missing/invalid token (fix-on-rebuild: v1 had verification toggles disabled in places).
- **Loader safety:** the embed iframe origin is validated against an allowlist
  (`*.oggvo.com` + the host configured per profile) before `postMessage` is trusted.

## Fix-on-rebuild (carried from spec §7)
- Emit **absolute** embed URLs everywhere (standardize on the `iframeSrcdoc` absolute variant).
- Drop the legacy `_index.vue` list and dead/commented pages (`firstreview`/`secondreview` missing,
  landing orphaned) — do not port.
- Make the chat `PUT /widgets/chat` upsert **unconditional** (no no-op-on-defaults branch).
- Centralize phone normalization (libphonenumber), reuse messaging's parser.
- Use **iframe SSR for all widget types**; retire the jQuery `widget.js` loader.
- Move widget config off the profile into `widgets.properties` (no profile-wide mutation on save).

## Open questions / parity risks (carried from spec §8)
- **Settings home:** Stream / Button / Splash / Google-schema source values live on the **profile** in
  v1. Migrate into `widgets.properties` per `widgetType`, or keep reading from profile? Determines
  whether `widgets` is the single source of truth. **Schema decision before phase 3.**
- **Multi-instance widgets:** `_index.vue` implied multiple named signatures the live app never
  supported. Confirm whether named/multi-instance widgets are in scope (would need a per-instance row,
  not one-per-type).
- **Landing Page widget (widgetID 1):** orphaned in v1; owned here or by a funnels/campaigns domain?
- **`widgetType` enum:** settle the canonical mapping (v1 ints 1/3/4/5/6/7/8). `reviewMe` (4) and
  `newsletter` (6) have server views but no live config page — carry forward or drop?
- **Newsletter widget:** fully commented out in v1 — drop or revive under a newsletters domain?
- **`starsStyle` base64 param** on the public render is set by no config UI — confirm origin (likely
  the funnel/design builder).
- **reCAPTCHA in the embed iframe:** confirm v2 site keys/secret and that the cross-origin iframe can
  still execute reCAPTCHA v3.

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-1.1 / US-1.2 / US-1.3 | `GET /widgets` |
| US-2.1 / US-2.2 / US-2.3 / US-2.5 | `GET /widgets/:id`, `PUT /widgets/:id` |
| US-2.4 | `PUT /widgets/chat` (+ signed image upload) |
| US-2.6 / US-2.7 | _(client-only — no endpoint)_ |
| US-3.1 | `GET /widgets/:id` (embed string in bundle) |
| US-4.1 | `GET /public/widgets/:profileId/:type` (SSR) |
| US-4.2 | `POST /public/widgets/:profileId/inquiries` → messaging queue |

---

## Epic E5 — Build the Landing Page (full-page builder)

> Mockup: [`../design-system/mockups/widgets/widget-landing.html`](../design-system/mockups/widgets/widget-landing.html).
> The Landing Page is a **full-page** builder (not the split gallery editor): a hosted, brandable
> "you're invited to review" page that a contact can be sent to, optionally backed by a live review
> stream. It is a first-class `widgetType` (`landing`) in v2. **Fix-on-rebuild:** v1's Landing Page
> (`widgetID 1`, `pages/widgets/landing.vue`) was **orphaned** — a relative
> `/widget/widget.js?widgetID=1` loader with its live builder commented out and no config surface;
> v2 owns it with an absolute hosted URL and a real editor (resolves the §8 open question "Landing
> Page widget (widgetID 1): orphaned in v1; owned here…").

### US-5.1 — Open the Landing Page builder
**As an** Operator **I want** a full-page builder for my hosted review Landing Page **so that** I can
send contacts to a branded page that invites them to review.
- **AC1** `/widgets/landing` loads a **full-page** builder: left = config panel (background, hero copy,
  review-stream embed, CTA, theme colors); right = a **large live preview** of the landing page (hero
  + optional reviews); below the preview = a **Copy page URL / embed** block.
- **AC2** The builder hydrates from `GET /widgets/landing` (the saved `properties` for the `landing`
  row); profile `Name` / logo / funnel `Shortname` prefill the hero copy and the CTA destination.
- **AC3** fix-on-rebuild: the page is a first-class `widgetType` with an **absolute** hosted URL, not
  v1's orphaned relative `/widget/widget.js?widgetID=1` loader.

### US-5.2 — Set the hero background and copy
**As an** Operator **I want** to set the page background image, headline, and subtext **so that** the
page matches my brand and message.
- **AC1** Controls: **Background image** (upload PNG/JPG or pick a preset) with a recommended-size
  hint; **Headline** (text, default "You're invited to review"); **Subtext** (textarea).
- **AC2** Each change persists to `widgets.properties` via `PUT /widgets/landing` and re-renders the
  preview (auto-save; no separate Save button).
- **AC3** fix-on-rebuild: the background upload goes through the **media module / S3 signed upload**,
  keyed in DB — never a local-disk `assets/media/...` path.

### US-5.3 — Toggle the embedded review stream
**As an** Operator **I want** to optionally show a stream of my latest reviews under the hero **so
that** visitors see social proof on the page.
- **AC1** A **Show review stream** switch; when on, the preview renders the latest reviews below the
  hero (reusing the Review Stream renderer) with a **Minimum rating** control.
- **AC2** When off, only the hero + CTA render — no stream section.
- **AC3** The stream reads the same public reviews as the Review Stream widget (min-rating filtered),
  scoped to `profileId`.

### US-5.4 — Configure the CTA and theme colors
**As an** Operator **I want** a call-to-action button and theme colors **so that** visitors are driven
to my review funnel in my brand color.
- **AC1** Controls: **CTA label** (default "Rate Your Experience"), **CTA destination** (the profile's
  review funnel by default), **Theme color** (swatches + hex) driving the header/footer gradient and
  the CTA button, and a **Star color** (rating row active/inactive pair, parity with v1
  `activeColor` / `inactiveColor`).
- **AC2** Changes persist via `PUT /widgets/landing` and re-render the preview.

### US-5.5 — Copy the page URL or embed
**As an** Operator **I want** to copy the hosted page URL and an embed snippet **so that** I can share
the page directly or drop it into my own site.
- **AC1** A **Copy page URL / embed** block shows the hosted **page URL** (absolute
  `https://widgets.oggvo.com/p/:profileId`) and an **iframe embed** `<script>` snippet, each with a
  **Copy** button.
- **AC2** Copy writes to clipboard and confirms with a toast; both are **absolute** URLs
  (fix-on-rebuild vs v1's relative `/widget/…` path).
- **AC3** The public page is SSR at `GET /public/widgets/:profileId/landing`, **unauthenticated**,
  keyed by profile UUID only — no auth token, no cross-profile leakage.

---

## Epic E6 — Type-specific editor surfaces (v2 parity gap)

> The generic split editor ([`widget-editor.html`](../design-system/mockups/widgets/widget-editor.html))
> only fully drives the **Review Stream family** (Stream / Carousel / Grid Wall / Review Splash /
> Review Button). **Chat, Email Signature, and Google Schema** each have a gallery card and config
> ACs (US-2.4 / US-2.6 / US-2.7) but are **PARTIAL in v2** — the generic editor cannot render their
> type-specific controls or previews, so each still needs its **own dedicated editor surface** (as v1
> shipped them on separate pages `chat.vue`, `email-signature.vue`, `google/defaultreview.vue`).
> These stories track that build gap; they reuse the persistence/behaviour already specified in
> Epic E2.

### US-6.1 — Dedicated Chat editor surface
**As an** Operator **I want** the Chat widget's **own** editor (branding fields beside a live chat
pop-up preview) **so that** I can configure it — the generic Stream editor can't render its controls.
- **AC1** A dedicated surface implements US-2.4's controls (Welcome / Header / Opening text with
  char-remaining counters, Primary / Secondary color, avatar upload) with a **stepped preview**
  (embed → input form → success) mirroring v1 `chat.vue`.
- **AC2** SMS-gated exactly as **US-2.4 AC1** (reachable only when `permissions.sms`); persistence and
  the unconditional upsert follow US-2.4 AC3–AC5.

### US-6.2 — Dedicated Email Signature generator surface
**As an** Operator **I want** the Email Signature generator (Header / Body / Color / Size beside an
inline-HTML preview) **so that** I can produce the signature — the generic editor has no HTML-output
mode.
- **AC1** A dedicated surface implements US-2.6's controls and renders the signature preview from an
  `<iframe srcdoc>`; the **client-only, no-persistence** rule from US-2.6 AC2 holds.
- **AC2** The Embed block shows the generated **inline-styled HTML** (US-3.1 AC4), not a loader
  `<script>`.

### US-6.3 — Dedicated Google Schema generator surface
**As an** Operator **I want** the Google Review Schema generator (a SERP rich-snippet preview beside
the JSON-LD output with placement warnings) **so that** I can copy the `aggregateRating` snippet — the
generic editor has no JSON-LD mode.
- **AC1** A dedicated surface implements US-2.7's controls and shows a **SERP preview** + the generated
  `<script type="application/ld+json">` `Product` / `aggregateRating` block; **client-only, no
  persistence** (US-2.7 AC1).
- **AC2** Carries the US-2.7 AC2 guidance callouts (place on a sub-page not the root domain; re-paste
  when review counts change) linking Google's structured-data docs.

## Traceability (E5–E6 → primary v2 surface)

| Story | Endpoint / surface |
| --- | --- |
| US-5.1 / US-5.2 / US-5.3 / US-5.4 | `GET /widgets/landing`, `PUT /widgets/landing` |
| US-5.5 | `GET /widgets/landing` (URL + embed in bundle); public `GET /public/widgets/:profileId/landing` (SSR) |
| US-6.1 | dedicated Chat editor → `PUT /widgets/chat` (+ signed image upload) |
| US-6.2 / US-6.3 | dedicated generator surfaces _(client-only — no endpoint)_ |
