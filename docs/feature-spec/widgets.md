# Widgets

> **v2 target:** module `apps/api/src/modules/widgets` · tables `widgets`, `funnel_designs` (`@oggvo/db`) · queue `—` (sync; inquiry submission enqueues messaging) · build phase `3`
> **v1 sources:** frontend `apps/portal-frontend/pages/widgets/*`, API `apps/portal-api/app/Controllers/API/V2/Widgets.php`, `app/Controllers/API/V2/Common/Widgets.php`, `app/Controllers/API/V2/Settings/Widget.php`, models `app/Models/WidgetModel.php`, server views `app/Views/widget/*`, public assets `apps/portal-api/public/widget/{widget.js,widget.v2.js,widget.php}`

## 1. Overview
Widgets are embeddable surfaces a client drops into their own website, emails, or Google listing to surface reviews and capture leads. There are seven public widget types: **Review Stream** (latest reviews list), **Review Button** ("Review Us" button to the funnel), **Google Review Schema** (JSON-LD aggregateRating snippet), **Email Signature** (star-rating HTML for Outlook/Gmail signatures), **Review Splash** (rotating bottom-corner review toast), **Chat Widget** (lead-capture pop-up that submits to messaging), and a **Landing Page** widget (widgetID 1, server-rendered funnel embed). All run from a single configurator area (`/widgets`) where the user picks a type, tweaks a few settings, and copies an embed snippet. Most config is read off the **profile** record (colors, review-stream prefs); only the Chat Widget persists its own row in the `widgets` table. All authed portal users can reach the pages, but the Chat Widget customize action is gated behind the **SMS permission** (`auth.user.permissions.sms`) — without it the page shows an "Upgrade To Customize Widget" CTA mailing support. The public render + inquiry endpoints are unauthenticated and keyed by profile UUID.

## 2. Pages & tabs

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/widgets` | `pages/widgets/index.vue` | default | none (6-card picker + live preview pane) | authed |
| `/widgets/stream` | `pages/widgets/stream.vue` | default | breadcrumb child | authed |
| `/widgets/review-button` | `pages/widgets/review-button.vue` | default | breadcrumb child | authed |
| `/widgets/splash` | `pages/widgets/splash.vue` | default | breadcrumb child | authed |
| `/widgets/chat` | `pages/widgets/chat.vue` | default | breadcrumb child | authed; **customize gated on `permissions.sms`** |
| `/widgets/email-signature` | `pages/widgets/email-signature.vue` | default | breadcrumb child | authed |
| `/widgets/google/defaultreview` | `pages/widgets/google/defaultreview.vue` | default | breadcrumb child | authed |
| `/widgets/landing` | `pages/widgets/landing.vue` | default | breadcrumb child | authed (orphan; not linked from picker) |
| _(legacy)_ `/widgets/_index` | `pages/widgets/_index.vue` | default | per-page list with kebab menu | authed (dead/legacy mock page) |
| _(referenced, missing)_ `google/firstreview.vue`, `google/secondreview.vue`, `google/defaultreview` siblings | — | — | — | not present in repo — only `google/defaultreview.vue` exists |

> **Note:** the v1 picker (`index.vue`) hardcodes 6 cards mapped by array index `active` (0=Stream, 1=Review Button, 2=Google Review Schema, 3=Email Signature, 4=Review Splash, 5=Chat). `_index.vue` is a separate legacy mock listing 9 "pages" with copy/preview/delete and is not wired to the live picker. The prompt's `chat.vue`/`landing.vue`/`stream.vue`/etc. were all read; `google/firstreview.vue` and `google/secondreview.vue` do **not** exist in v1 — flag as removed.

## 3. Screen-by-screen

### `/widgets` — Widget picker + live preview
![index](_assets/screens/widgets/index.png) <!-- placeholder until captured -->
- **Purpose & layout** — Left: search box + scrollable list of 6 widget cards (icon, name, "Widget" subtitle, description). Right: contextual live preview that swaps by selected card index. Header has a primary CTA: **"Customize Widget"** (`$router.push('/widgets/{link}')`) or, when `active===5 && !permissions.sms`, **"Upgrade To Customize Widget"** (`mailto:support@oggvo.com`).
- **Elements / fields** —
  - Search input (text) — client-side filter over `widgetName`/`description`, lowercased.
  - 6 cards: Review Stream→`stream`, Review Button→`review-button`, Google Review Schema→`google/defaultreview`, Email Signature→`email-signature`, Review Splash Widget→`splash`, Chat Widget→`chat`. Each card has an SVG icon from `/images/pages/{icon}.svg`.
  - Preview pane renders per `active`: 0 = `<iframe srcdoc>` review-stream embed; 1 = mocked page skeleton with review-button iframe; 2 = static Google SERP mock with `RatingStar`; 3 = email-signature iframe (`emailSignatureWidgetCode`); 4 = static splash toast mock; 5 = 3-slide carousel (embed / form / thank-you) for the chat widget, plus an injected `#oggvo-iframe`.
  - `descriptions` map drives the helper text per index.
- **States** — On mount, `GET /profiles/me` resolves `profile.UUID`; if it fails, error toast "Could not update data!". Chat card injects `<iframe id="oggvo-iframe" src=".../widget/widget.php?profileID=&widgetID=8">` on select and hides/clears it on unselect and `onUnmounted`.
- **Modals / drawers** — none.
- **Interactions** — `selectCard(index)` swaps preview and toggles the chat iframe; `onBeforeUpdate` recomputes `widget_script` embed string per `active` (widgetIDs 5/3/—/—/7/8).

### `/widgets/stream` — Review Stream config
![stream](_assets/screens/widgets/stream.png) <!-- placeholder until captured -->
- **Purpose & layout** — Left: live `<iframe srcdoc>` of the review-stream embed (widgetID 5). Right: config form. Header: read-only **Embedded code** input + `CopyButton` (copies the absolute-URL variant `iframeSrcdoc`).
- **Elements / fields** — `NumberOfReviews` (select: 1,2,3,5,10,25,50,100; default 25), `Minimum Stars` (select 1–5 Stars → `StreamThreshold` index 0–4), toggles: `ShowAggregate` (total + avg), `IncludeEmpty` (reviews with no text), `UseReviewersLastInitial` (shorten last name to initial). Commented-out max-width control.
- **States** — `GET /profiles/me` hydrates toggles from `showAggregate`/`useReviewersLastInitial`/`includeEmpty`/`numberOfReviews`/`streamThreshold`. Every change → `POST /profiles/save-settings` → success/error toast, then re-srcdocs the iframe.
- **Modals / drawers** — none.
- **Interactions** — Auto-saves on each select/toggle change (no explicit save button).

### `/widgets/review-button` — "Review Us" button config
![review-button](_assets/screens/widgets/review-button.png) <!-- placeholder until captured -->
- **Purpose & layout** — Left: mock page skeleton with an `<iframe srcdoc>` button (widgetID 3, hover effect). Right: minimal form (most controls commented out in v1). Header: embed code + copy.
- **Elements / fields** — `ColorInput` **Text Default Color** (`text_default`, default `#D1E9FF`) and `ColorInput` **Background Default Color** (`background_default`, default `#175CD3`). Both watched; on change → `onChange()`. Many fields (font, size, line-height, padding, border, hover colors, radius) exist only as commented dead code.
- **States** — `useLazyAsyncData` `GET /profiles/me` → seeds `background_default = #{ReviewWidgetButtonBgColor}`, `text_default = #{ReviewWidgetButtonTextColor}`, builds embed code (widgetID 3).
- **Interactions** — `onSubmit()` posts `{ '#ReviewWidgetButtonBgColor', '#ReviewWidgetButtonTextColor' }` to `POST /profiles/save-settings`; on success re-srcdocs the preview iframe.

### `/widgets/splash` — Review Splash config
![splash](_assets/screens/widgets/splash.png) <!-- placeholder until captured -->
- **Purpose & layout** — Left: static styled preview of a single review toast (Google logo, 5-star, reviewer, date). Right: "Click to show / Hide live demo" button toggling an absolutely-positioned bottom `<iframe>` (widgetID 7). Header: embed code + copy.
- **Elements / fields** — Almost all controls (platforms list, minimum rating, show user image/date/rating/username radios, theme color, interval) are **commented out** in v1. Live: `preview()` toggle only. `embedded_code` built from `auth.user.profile.UUID` widgetID 7.
- **States** — `preview()` runs once on setup so demo shows by default; toggles `previewShown`.
- **Interactions** — Reviews rotate one every 20s (server/JS-driven in the embed).

### `/widgets/chat` — Chat Widget config
![chat](_assets/screens/widgets/chat.png) <!-- placeholder until captured -->
- **Purpose & layout** — Left: 3-slide carousel preview (slide 1 "How to Embed" card, slide 2 open form, slide 3 success state), live-styled by `form.primaryColor`. Right: settings form. Header: embed code + copy (`<script src="widget/widget.v2.js?widgetID=8&profileID={uuid}" defer>`).
- **Elements / fields** — `welcomeText` (max 26, default "Want a free house cost evaluation? Click here."), `userImage` (file upload; PNG/JPG, max 800×800px), `primaryColor` (color + hex text, default `#175CD3`), `secondaryColor` (color + hex, default `#3C3C3C`), `headerText` (max 26, default "Free House Cost Evaluation"), `openingText` (textarea, max 85). Char-remaining counters on text fields.
- **States** — On mount `GET /widgets` hydrates `chatWidget` props (colors prefixed `#`); `profile.UUID` builds embed. Each `@change` and image upload → `POST /settings/chat` (multipart FormData) → success/error toast.
- **Modals / drawers** — none.
- **Interactions** — Auto-save on every field change. Image upload triggers immediate submit. Carousel prev/next buttons.

### `/widgets/email-signature` — Email Signature config
![email-signature](_assets/screens/widgets/email-signature.png) <!-- placeholder until captured -->
- **Purpose & layout** — Left: `<iframe srcdoc>` of generated inline-HTML signature (5 clickable star images linking to the funnel). Right: form. Header: embed code (the generated HTML) + copy. **Fully client-side — no API persistence.**
- **Elements / fields** — `header` (text, default "How would you rate your purchase?"), `body` (text, default "Click to rate your experience with {profile.Name}"), `color` (10 swatches: violet/fuchsia/red/orange/yellow/lime/green/turquoise/cyan/navy; default violet), `size` (Medium `32px` / Large `48px`).
- **Generated code** — Inline-styled `<div>` with `<h4>` header, anchor wrapping 5 `<img src="{frontURL}assets/media/signature/star-big-{color}-{1..5}.png">` to `{frontURL}review/{profile.Shortname}`, then a body anchor. Star images preloaded via `useHead` link tags.
- **States** — Pure computed; relies on `auth.user.profile.Shortname` / `Name`.

### `/widgets/google/defaultreview` — Google Review Schema (JSON-LD)
![google-defaultreview](_assets/screens/widgets/google-defaultreview.png) <!-- placeholder until captured -->
- **Purpose & layout** — Left: static Google SERP mock + `RatingStar` showing `averageRating`/`reviewCount`. Right: three info/note/warning cards (how-it-works, placement note, "update on new review" warning) linking to Google docs. Header: embed code (formatted JSON-LD) + copy. **Client-side only.**
- **Elements / fields** — `embedded_code` is a `<script type="application/ld+json">` `Product` with `aggregateRating { ratingValue, reviewCount }`.
- **States** — `useLazyAsyncData` `GET /profiles/me` → `Name`, `TotalReviews`→`reviewCount`, `AverageScore`→`averageRating`.

### `/widgets/landing` — Landing Page widget (orphan)
![landing](_assets/screens/widgets/landing.png) <!-- placeholder until captured -->
- **Purpose & layout** — `<iframe srcdoc>` of the landing-page funnel embed (widgetID 1). Header: embed code + copy. Most of the page (the inline preview markup) is commented out.
- **States** — `GET /profiles/me` → builds embed `widget.js?profileID={uuid}&widgetID=1`. Not linked from the live picker; surfaced only via the legacy `_index.vue` list.

## 4. Data & API

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v2/widgets` | Authed config bundle for the configurator (chat widget props, button preview, star text, design, Google snippet) | auth (profile from token) | `{ profile, newsletterbutton, StarText, design, chatWidget, googleSnippetCode }` | `API/V2/Widgets.php::index` |
| POST | `/api/v2/settings/chat` | Save/update chat widget settings + optional user image | multipart: `welcomeText`,`headerText`,`openingText`,`primaryColor`,`secondaryColor`,`userImage` (file) | `Saved successfully!` + saved `Properties` JSON | `API/V2/Settings/Widget.php::chat` |
| POST | `/api/v2/profiles/save-settings` | Persist stream/button prefs on the profile | stream: `ShowAggregate`,`IncludeEmpty`,`UseReviewersLastInitial`,`NumberOfReviews`,`StreamThreshold`; button: `#ReviewWidgetButtonBgColor`,`#ReviewWidgetButtonTextColor` | ok/fail | `Profile::saveSettings` (reviews/profile domain) |
| GET | `/api/v2/profiles/me` | Profile read for embed UUID + seed values | auth | profile (`UUID`,`Shortname`,`Name`,`ReviewWidgetButton*`,stream prefs,`TotalReviews`,`AverageScore`) | `Profile::me` |
| GET | `/api/v2/common/widgets` | **Public** server-rendered widget HTML+script by `widgetID` | `ProfileID` (UUID), `widgetID` (1,3,4,5,6,7,8), optional `Page`, `starsStyle` (base64 JSON) | `{ html, script }` | `API/V2/Common/Widgets.php::index` |
| POST | `/api/v2/common/inquiries/submit` | **Public** chat-widget lead submission → messaging thread | `ProfileID` (UUID), `name`, `phone`, `message` (min 10), `gToken` (reCAPTCHA v3) | `{ status: true }` / validation errors | `API/V2/Common/Widgets.php::inquiry` |
| _(disabled)_ POST | `/api/v2/common/newsletters/subscribe` | Newsletter signup (route commented out) | `ProfileID`,`firstName`,`lastName`,`emailAddress`,`g-recaptcha-response` | ok/fail | `API/V2/Common/Widgets.php::subscribe` |
| GET (static) | `/widget/widget.php?profileID=&widgetID=` | HTML shell that injects the loader `<script>` (used as iframe `src`) | `profileID`, `widgetID` | full HTML page | `public/widget/widget.php` |
| GET (static) | `/widget/widget.js?profileID=&widgetID=` | jQuery-based loader for widgetIDs 1/3/4/5/6/7 (inline embed) | query string | JS | `public/widget/widget.js` |
| GET (static) | `/widget/widget.v2.js?profileID=&widgetID=` | iframe-based loader for widgetIDs 7/8 (splash/chat) — posts size via `postMessage` | query string | JS | `public/widget/widget.v2.js` |

- **v1 models / tables:** `widgets` (`WidgetModel` — only chat widget, `WidgetID='8'`, `Properties` JSON blob); `profile` (stream/button/newsletter/splash settings, colors, `AverageScore`, `TotalReviews`); `buttons` (`ButtonsModel` — review/newsletter button styles); `design` (`DesignModel` — landing funnel); `reviews` (`ReviewModel::getWidgetReviews`, rating value/count); `links`/`linkmaster` (landing instructions, site images); `images` (`ImageModel` — chat user image); `messaging` (`MessagingModel::saveInquiry`/`getThread`/`updateThread` — chat inquiries); `recipients` (newsletter, disabled).
- **Server-rendered views:** `app/Views/widget/{landingPage, reviewUs, reviewMe, reviewStream, newsletter, reviewSplash, chatWidget}/{index,footer}.php` + `reviewStars`. Each `index` returns HTML, each `footer` returns the script. widgetID→container map: 1=`oggvo-landing-page-widget`, 3=`oggvo-review-us-widget`, 4=`oggvo-review-me-widget`, 5=`oggvo-review-stream-widget`, 6=`oggvo-newsletter-widget`, 7=`oggvo-review-splash-widget`, 8=`oggvo-chat-widget`.
- **Pagination / filtering / sorting:** `common/widgets?widgetID=5` accepts `Page` for stream lazy-load (skips aggregate recompute when `Page>1`). Stream/splash fetch 5/10 reviews respectively. Min-rating filter via `StreamThreshold` (profile). Picker/list search is client-side only.

## 5. Business rules
- **Chat widget gate:** `/widgets/chat` customize is allowed only when `auth.user.permissions.sms` is truthy; otherwise picker shows the upgrade mailto CTA. Public render/inquiry are not gated.
- **Chat persistence:** Only the chat widget writes a DB row (`widgets`, `WidgetID='8'`, one per profile). `settings/chat` upserts: if no existing row and all values still equal defaults, it no-ops ("Saved successfully."); otherwise insert or update `Properties` JSON.
- **Color normalization:** chat `primaryColor`/`secondaryColor` are stored without `#` (trimmed); frontend re-prefixes `#` on read.
- **Image upload:** validated `mime_in jpg/png`, `max_dims 800×800`; stored under `/assets/media/uploads` + a thumb copy; recorded in `images` (`Source='ChatWidget'`); default `default.jpg`.
- **Inquiry validation (public):** `ProfileID` regex (hex UUID), `name` min 1, `phone` matches US 10-digit/+1 patterns (stripped to 10-digit CC-less), `message` min 10, `gToken` required → **reCAPTCHA v3 verified** (`checkReCaptcha(..., "Chat", true)`). Creates or appends to a messaging thread of source `inquiry` (dedupes existing conversations by profile + phone). Body re-encoded ISO-8859-1→UTF-8.
- **Newsletter subscribe (disabled):** requires name/email + reCAPTCHA, rejects duplicate emails, adds `recipients` with `Source='Newsletter'`, `Status='Pending'`, `OptIn=true`. Route is commented out in v1.
- **Review stream rules:** server fetches reviews via `getWidgetReviews`; `UseReviewersLastInitial` shortens last name to initial; `ShowAggregate` adds count+avg (excludes Oggvo reviews when `HideOggvoReviews=1`); aggregate skipped on paginated loads.
- **Splash:** rotates reviews one every ~20s in the embed; optional affiliate footer when `profile.AffiliateActive`.
- **Google schema:** JSON-LD must NOT go on the root domain (only sub-pages); must be re-pasted when reviews change (static snapshot, not live).
- **Email signature / Google schema:** entirely client-generated; no save endpoint, no DB.
- **Embed loaders:** `widget.js` (jQuery) for inline widgets (1/3/4/5/6); `widget.v2.js` (iframe + `postMessage` resize) for splash (7) and chat (8). `widget.php` shells the loader and is used as the configurator's preview iframe `src`. Origin check in v2: `https://(local|portal|api).oggvo.com`.

## 6. Integrations
- **Google reCAPTCHA v3** — required to verify chat inquiry (and newsletter) submissions (`checkReCaptcha`, `misc` helper). Footer view loads the reCAPTCHA badge and hides it.
- **Messaging / Twilio (downstream)** — chat inquiries become messaging threads (`MessagingModel::saveInquiry`); the SMS notification/reply path is owned by the connect-messaging domain (`docs/feature-spec/connect-messaging.md`). The SMS permission gates chat customization.
- **Google Search** — Google Review Schema produces JSON-LD `aggregateRating` for SERP rich snippets (links to Google webmaster/structured-data docs).
- **CDN / static hosting** — embed loaders served from `https://portal.oggvo.com/widget/widget.js` and `https://api.oggvo.com/` (v2 loader `baseUrl`); signature star images from `{frontURL}assets/media/signature/`.
- No Stripe/Square/Meta/FCM/SendGrid usage in this domain.

## 7. v1 → v2 mapping
- **Module:** `apps/api/src/modules/widgets` — `widgets.controller.ts` (authed config CRUD), `public-widgets.controller.ts` (public render + inquiry), `widgets.service.ts`, `widgets.repository.ts`, DTOs per widget type. Keep public routes unauthenticated and profile-UUID-keyed.
- **Drizzle tables:**
  - `widgets` (`@oggvo/db`): `{ id, profileId, widgetType (int), properties (jsonb), timestamps }`. v1 stored only chat as `WidgetID='8'`; v2 generalizes via `widgetType`. **Recommend a typed `properties` discriminated union** rather than the loose v1 JSON blob, and a unique `(profileId, widgetType)` constraint to enforce one row per type.
  - `funnel_designs` (`@oggvo/db`): backs the Landing Page (widgetID 1) builds (`exportedHtml`/`exportedJson`, `slug`, `active`).
  - Stream/button/splash/Google-schema settings currently live on the **profile** in v1 — decide whether to migrate them into `widgets.properties` rows (cleaner) or keep on the profile/business record. **Flag as a schema decision** (see §8).
- **Queue:** `—` for config. Inquiry submission should enqueue the messaging/SMS work on the existing messaging queue rather than doing it inline.
- **Frontend:** v2 routes under `apps/web/app/(portal)/widgets/` (picker + per-type pages). Public render via **Next.js SSR/embeddable surface** at `apps/web/app/embed/[profileId]/[widgetType]` returning the widget HTML (replacing `widget.php`); ship a small JS loader equivalent to `widget.v2.js` (iframe + `postMessage` resize, origin-checked). Reuse `@oggvo/ui` ColorInput, RatingStar, CopyButton, switches, carousel, file-upload.
- **Endpoint mapping:**
  - v1 `GET /api/v2/widgets` → v2 `GET /widgets` (authed config bundle, or split per type).
  - v1 `POST /api/v2/settings/chat` → v2 `PUT /widgets/chat` (or `PUT /widgets/{type}`), JSON + separate signed image upload.
  - v1 `GET /api/v2/common/widgets?widgetID=` → v2 `GET /public/widgets/{profileId}/{type}` (SSR HTML) or the embed route.
  - v1 `POST /api/v2/common/inquiries/submit` → v2 `POST /public/widgets/{profileId}/inquiries` (reCAPTCHA-verified → messaging).
  - v1 `widget.js`/`widget.v2.js`/`widget.php` → v2 embed loader + SSR embed route.
- **Known v1 bugs to fix:**
  - Embed snippets use **relative `/widget/...` URLs** in several copy paths (stream/landing/index), which break when embedded on a third-party domain; always emit absolute `frontURL`/CDN URLs (the `iframeSrcdoc` variant already does — standardize on it).
  - `_index.vue` legacy list and dead commented controls/pages (`firstreview`/`secondreview` missing, landing orphaned) should be removed, not ported.
  - Chat `settings/chat` no-op-on-defaults branch can silently skip saves on first edit if a field happens to equal a default — make upsert unconditional in v2.
  - Inquiry phone parsing is regex-heavy and US-only; centralize phone normalization (libphonenumber) and reuse messaging's.
  - jQuery-injection loader (`widget.js`) conflicts with host-site jQuery; the iframe approach (`widget.v2.js`) is safer — use iframe SSR for all types in v2.
  - Profile-coupled widget settings cause cross-domain coupling (a "save-settings" call mutates the whole profile); move widget config into `widgets.properties`.

## 8. Open questions / parity risks
- **Settings home:** Stream, Review Button, Splash, and Google-schema source values all live on the **profile** in v1 (no `widgets` row). Does v2 migrate them into `widgets.properties` per `widgetType`, or keep reading from profile/business? This determines whether `widgets` becomes the single source of truth or stays chat-only. **Schema gap to resolve before phase 3.**
- **Email Signature & Google Schema** have no persistence in v1 (pure computed). Should v2 save named signatures? `_index.vue` implies multiple named signatures ("Signature For Barbara", etc.) that the live app never actually supported — confirm whether multi-instance widgets are in scope (would need a per-instance `widgets` row, not one-per-type).
- **Landing Page widget (widgetID 1):** server view + `funnel_designs` table exist, but the v1 `/widgets/landing` page is orphaned/commented and not in the picker. Is the landing widget in scope for phase 3 or owned by a separate "funnels/campaigns" domain?
- **`widgetType` enum:** decide the canonical integer/string mapping (v1: 1 landing, 3 review-us, 4 review-me, 5 stream, 6 newsletter, 7 splash, 8 chat). `reviewMe` (4) and `newsletter` (6) have server views but no live config page — confirm whether to carry them forward.
- **Newsletter widget** code exists (view + disabled subscribe route + button styling) but is fully commented out. Drop it or revive it under a newsletters domain?
- **Star styling (`starsStyle` base64 param)** on the public render endpoint is undocumented in any config UI — confirm where those custom star colors/labels are set (likely the funnel/design builder).
- **reCAPTCHA migration:** v1 uses v3 with action "Chat"; confirm the v2 site keys/secret and whether the embed iframe (different origin) can still execute reCAPTCHA correctly.
