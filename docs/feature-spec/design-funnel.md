# Design & Funnel

> **v2 target:** modules `apps/api/src/modules/funnel` (+ `apps/api/src/modules/reviews` for the public render & rating stats) · tables `funnel_designs`, `links`, `link_masters`, `crawler_history`, `designs`, `buttons` (`@oggvo/db`) · queue `—` (S3 read/write is synchronous; review-monitoring crawl is the `review-puller` queue, see reviews spec) · build phase 1–3
> **v1 sources:** frontend `apps/portal-frontend/pages/design/{index.vue, index/index.vue, index/positive.vue, index/negative.vue, index/thanks.vue}`, components `apps/portal-frontend/components/Design/*` (`AddPlatformModal`, `EditPlatformModal`, `DeletePlatformModal`, `Links.vue`, `InstructionsModal.vue`) + `components/Funnel/*`; API `app/Controllers/API/V2/{Design,Links,Buttons}.php`; models `app/Models/{FunnelDesignsModel,LinkModel,LinkmasterModel,DesignModel,ButtonsModel}.php`; review-instruction views `app/Views/review/instructions/{google,facebook,yelp,zillow,realtor}.php`

## 1. Overview
The Design & Funnel domain lets a profile build and brand its **review funnel** — the customer-facing flow that captures a star rating, then routes "happy" customers to public review platforms (Google, Facebook, Yelp, Zillow, Realtor.com, …) and "unhappy" customers to a private feedback form, then shows a thank-you screen. It has two distinct editing surfaces in v1: (1) a **drag-and-drop visual designer** (Unlayer email editor) reached at `/design`, whose output JSON + rendered HTML are stored on **S3**, and (2) a set of **per-screen content editors** (`/design/positive`, `/design/negative`, `/design/thanks`) that write structured fields (colors, headings, body text, the happy/unhappy star threshold) directly onto the `profile` row. Each editor embeds a live preview and a shared **platform-link manager** (the review-routing funnel: add/edit/delete/reorder/show-hide platform buttons). The same `links` records double as the Linktree-style **bio-links** surfaced on the public funnel. The public funnel renders unauthenticated at v1 `/review/:shortname` (v2 `/(public)/r/[shortname]`). All editors are gated to the authenticated portal user scoped to their JWT `profile_id`; the public render is anonymous.

## 2. Pages & tabs
The `/design` parent (`pages/design/index.vue`) renders a shared header (copyable public funnel link `{frontURL}review/{Shortname}`) + a `TabBar` whose tabs are matched by **route name**, with a `<NuxtPage>` for the active child. Children live under `pages/design/index/`.

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/design` | `pages/design/index/index.vue` | default (portal) + `design` parent layout | tab **Main** (route `design-index`) | authed, scoped to `profile_id` |
| `/design/negative` | `pages/design/index/negative.vue` | same | tab **Negative Review** (`design-index-negative`) | authed |
| `/design/positive` | `pages/design/index/positive.vue` | same | tab **Positive Review** (`design-index-positive`) | authed |
| `/design/thanks` | `pages/design/index/thanks.vue` | same | tab **Thank You** (`design-index-thanks`) | authed |
| `/review/:shortname` (public) | `pages/review/[shortname].vue` (see reviews spec) | **none** (`layout:false`, `auth:false`) | renders S3 funnel JSON/HTML + platform links | **public** |

> Note: a `/design/buttons`-style "Buttons" editor exists in code (`Buttons.php` controller, `ButtonsModel`, `buttons` table) but the **buttons route group is commented out in `Routes.php`** (lines ~153–158). It is dormant in v1 — document it as a parity/migration consideration, not an active page.

## 3. Screen-by-screen

### `/design` — Main (visual funnel designer)
![design-main](_assets/screens/design/main.png) <!-- placeholder until captured -->
- **Purpose & layout** — full-bleed embed of the Unlayer **EmailEditor** (`@elmehdi/oggvo-vue-email-editor`, `projectId: 138792`, `displayMode: "web"`, `contentWidth: 1024px`). A floating **Save** button (top-right) exports and persists the design. The editor loads custom CSS/JS from `{frontURL}assets/css/unlayerCustom.css` and `…/unlayerCustom.js` (cache-busted by `customAssetsVersion`, currently `'3'` — Unlayer caches `customJS`/`customCSS` server-side, so the version param must change to pick up edits).
- **Elements / fields**
  - **Save button** — exports via `editor.exportHtml`, posts `{ json, html:{ fonts, css, body } }` to `POST /design/savedesign`. Disabled + spinner while `saving`.
  - **Image picker** — registers `userUploads` provider backed by `GET media/image?page&perPage` (paginated 20/page); inserted image URL = `{baseURL}assets/media/uploads/{name}`.
  - **Image upload callback** (`image`) — `POST /media/upload` (FormData `file`, `source=Funnel`) → returns `name`.
  - **Video upload callback** (`video`) — same endpoint, URL prefix `assets/media/uploads/video/{name}`.
  - **Image removal callback** (`image:removed`) — opens themed `ConfirmModal` ("Delete file"); on confirm `DELETE media/{id}/image`.
- **States** — initial design loaded from `GET /design/getdesign` on `editorLoaded`; if `res.design` present → `editor.loadDesign`. Load failure → error toast "We could not load your existing design!". Save success/failure → toast.
- **Modals / drawers** — themed `ConfirmModal` (delete-media confirm only). No native confirm/alert.
- **Interactions** — full Unlayer drag-and-drop block editing (preview & form tools disabled via `tools.features.preview:false`, `tools.form.enabled:false`).

### `/design/positive` — Positive Window
![design-positive](_assets/screens/design/positive.png) <!-- placeholder until captured -->
- **Purpose & layout** — split view: left (4/5) is a **live preview** of the positive screen (header nav with avatar/back-arrow, business `Name` title, read-only star rating + count, big heading, body text, list of "Connect with {platform}" buttons, colored footer bar). Right (1/5) is the **edit form**.
- **Elements / fields** (right panel form; all loaded from `GET /design` → `profile`):
  - **"Select an option"** (`HappyMinimum`, select) — the happy/positive star threshold: `5`=5★ & above, `4`=4★ & above, `3`=3★ & above, `2`=2★ & above, `1`=Review to All, `0`=Feedback to All. **This is the funnel routing decision** (≥ threshold → positive/review path; below → negative/feedback path).
  - **Header Color** (`PositiveFunnelHeaderBgColor`, `ColorInput`, default `#1849A9`).
  - **Footer Color** (`PositiveFunnelFooterBgColor`, `ColorInput`, default `#1849A9`).
  - **Header** (`ThankYouMessage`, textarea, rows 4) — the big positive heading (rendered via `v-html`).
  - **Body** (`MessageHappy`, textarea, rows 4) — positive body copy (`v-html`).
  - **`<DesignLinks>`** — embedded platform-link manager (see "Platform-link manager" below).
  - **Cancel** / **Apply** buttons (Apply submits).
- **States** — `pageLoading` → `<Loader>`; preview shows "No Platforms!" empty state (`BookmarkSlashIcon`) when no active links; rating from `stats.ratingValue` (ceil) and count `stats.ratingCount`.
- **Modals** — preview platform buttons open `DesignInstructionsModal` (see below) for google/facebook/zillow/realtor.com when `SkipInstructions != 1`; otherwise plain `<a>`.
- **Interactions** — `Apply` → `POST /design/savecontent` (body = whole `form`); success toast "Data updated successfully!". Links list pulled separately via `GET /links` (only `IsActive` links shown in preview).

### `/design/negative` — Negative Window
![design-negative](_assets/screens/design/negative.png) <!-- placeholder until captured -->
- **Purpose & layout** — split view. Left preview shows the **private feedback form** (First/Last name, Email, Phone, message textarea, "Leave Feedback" button) under a heading/body, plus an optional "Do you want to leave a review online?" platform row, header/footer color bars.
- **Elements / fields** (right form; loaded from `GET /design`):
  - **Header Color** (`NegativeFunnelHeaderBgColor`, `ColorInput`, default `#1849A9`).
  - **Footer Color** (`NegativeFunnelFooterBgColor`, `ColorInput`, default `#1849A9`).
  - **Header** (`NegativeFeedbackMessage`, textarea) — heading (`v-html`).
  - **Body** (`MessageUnhappy`, textarea) — body copy (`v-html`).
  - **`<DesignLinks>`** — same shared link manager.
  - **Cancel** / **Apply**.
- **Preview form fields** (display-only mock of public form): First name, Last name, Email, Phone (`pattern [0-9]{3}-[0-9]{2}-[0-9]{3}`), Your message. These are the public feedback-capture fields the negative path collects.
- **States** — `pageLoading` loader; platform row only shown if `links?.length`; instruction-modal vs `<a>` logic identical to positive.
- **Interactions** — `Apply` → `POST /design/savecontent`.

### `/design/thanks` — Thank You Window
![design-thanks](_assets/screens/design/thanks.png) <!-- placeholder until captured -->
- **Purpose & layout** — split view. Left preview shows a centered success/emoji icon, big heading, body text (the screen shown after a review/feedback submit). No platform links here.
- **Elements / fields** (right form; loaded from `GET /design`):
  - **Header** (`ThankYouHeading`, textarea) — heading (`v-html`).
  - **Body** (`ThankYouBody`, textarea) — body copy (`v-html`).
  - **Cancel** / **Apply**.
- **States** — no separate loader guard (binds directly after fetch); rating/count shown in preview header same as other tabs.
- **Interactions** — `Apply` → `POST /design/savecontent`.

### Platform-link manager — `<DesignLinks>` (`components/Design/Links.vue`)
![design-links](_assets/screens/design/links.png) <!-- placeholder until captured -->
Embedded inside positive & negative editors. Section title "Social Media" / "Show Following Social Media For Feedback".
- **List** — `GET /links` (cached key `"links"`), each row: platform logo (`ImageURL`), `Name`, and on hover/mobile an action cluster: **Show/Hide** (eye toggle), **Edit** (pencil), **Remove** (trash), **Reorder drag handle**. Inactive rows render at `opacity-50`.
- **Empty state** — "No links." when list empty.
- **Toggle visibility** — optimistic flip of `IsActive`, `POST /links/toggle/{ID}`; reverts on error; success toast "Platform visible/hidden on funnel."
- **Reorder** — `useSortable` drag (handle `.handle-sortable`); on sort → `POST /links/save-order` with body = array of link IDs in new order (index = rank). Success toast "Order updated successfully!".
- **Modals** (lazy): `AddPlatformModal`, `EditPlatformModal`, `DeletePlatformModal`.

#### Add Platform modal (`AddPlatformModal.vue`)
- Trigger: "Add New Platform" link. Fields:
  - **Call to Action (CTA) URL** (`URL`, text, required).
  - **Custom Link** (`CustomLink`, switch) — toggles between catalog mode and custom mode.
  - Custom mode: **Platform Name** (`PlatformName`, text) + **image upload** (`PlatformImage`, file, ≤5 MB).
  - Catalog mode: **Platform** searchable `Listbox` grouped by category, sourced from `GET /links/categories?query=` (search debounced via watched `query`); each option has `{id, text, img}`.
  - Switches: **Open in New Window** (`OpensInNewWindow`), **Skip Instructions** (`SkipInstructions`), **Show on Mobile** (`ShowOnMobile`, default on), **Show on Desktop** (`ShowOnDesktop`, default on).
  - **Confirm** → builds FormData (catalog: sends `Name = platform.id`), `POST /links/create`; `refreshNuxtData("links")`; success toast.

#### Edit Platform modal (`EditPlatformModal.vue`)
- Opened via `openModal(item)`; pre-fills all fields from the link row (`CustomLink = !item.MasterLinkID`, switches from `== '1'` strings, matches catalog option by name). Image hint "leave it blank to not update the image."
- **Confirm** → FormData → `POST /links/update/{ID}`; refresh + toast.

#### Delete Platform modal (`DeletePlatformModal.vue`)
- Opened via `openModal(item)`; shows logo + name, danger styling, "Are you sure? You won't be able to revert this!".
- **Delete** → `DELETE /links/{ID}`; refresh + toast.

#### Review-instructions modal (`InstructionsModal.vue` / `DesignInstructionsModal`)
- On the public-facing previews & funnel, clicking a platform button for **google / facebook / zillow / realtor.com** (when `SkipInstructions != 1`) opens an interstitial modal with platform-specific "How to leave a review on {platform}" copy, a logo, a disclaimer ("not affiliated with or endorsed by {platform}"), and a "Click to review us on {platform}" CTA that opens `URL` (respecting `OpensInNewWindow`). Copy is hard-coded per platform in the Vue component; server-side equivalents live in `app/Views/review/instructions/{google,facebook,yelp,zillow,realtor}.php` (Bootstrap-modal markup keyed by link `ID`). **Note divergence:** Vue modal covers facebook/google/zillow/realtor.com; PHP views additionally include **yelp** — yelp instructions exist server-side but not in the Vue component.

## 4. Data & API

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/design` | Load profile + design row + rating stats for content editors | — (auth) | `{ profile{…, DesignID, escaped{…}, MessageHeader, MessageText, CustomPoweredBy, MessageHappy, MessageUnhappy, StarText1-5, HappyMinimum, ThankYouMessage, ThankYouHeading, ThankYouBody, Negative/PositiveFunnelHeader/FooterBgColor, Name, Shortname}, stats{ratingValue, ratingCount}, design{…} }` | `Design.php::index` |
| GET | `/design/getdesign` | Load Unlayer design JSON from S3 | — | `{ design: <unlayer json|null> }` | `Design.php::getdesign` |
| POST | `/design/savedesign` | Persist Unlayer design (JSON + minified HTML) to S3 | `{ json, html:{ fonts, css, body } }` | `{ message }` | `Design.php::saveDesign` |
| POST | `/design/savecontent` | Save per-screen content fields onto `profile` | partial `profile` fields (colors, messages, `HappyMinimum`, etc.) | `{ message }` | `Design.php::savecontent` → `ProfileModel::saveDesignContent` |
| GET | `/links` | List profile's funnel/bio platform links | — | array of `{ ID, MasterLinkID, Name, URL, ReviewMonitoringURL, ImageURL, IsActive, OpensInNewWindow, SkipInstructions, ShowOnDesktop, ShowOnMobile }` (ImageURL rewritten to `{frontURL}assets/media/link-logos/{img}-sm.png`) | `Links.php::index` |
| POST | `/links/create` | Create link (catalog or custom) | FormData: `URL`, `Name`(masterId)\|`PlatformName`+`PlatformImage`, `CustomLink`, `OpensInNewWindow`, `SkipInstructions`, `ShowOnMobile`, `ShowOnDesktop`, optional `ReviewMonitoringURL` | `201` / `{errors}` | `Links.php::create` → `LinkModel::createLink` |
| POST | `/links/update/(:num)` | Update link | FormData (same as create) | `200` / `{errors}` | `Links.php::update` → `LinkModel::updateLink` |
| POST | `/links/save-order` | Persist drag order (rank = array index) | JSON body: `[id, id, …]` | `200` / `{error}` | `Links.php::saveorder` → `LinkModel::changeOrder` |
| POST | `/links/toggle/(:num)` | Toggle `IsActive` | — | `200` / `{errors}` | `Links.php::toggle` → `LinkModel::toggleActive` |
| DELETE | `/links/(:num)` | Delete link | — | `"Data Deleted successfully!"` | `Links.php::delete` → `LinkModel::deleteLinkByIdAndProfile` |
| GET | `/links/categories` | Platform catalog grouped by category (for add/edit picker) | `?query=` (LIKE on Name) | `{ "<Category>": [{ id, text, img, Category }], … }` | `Links.php::categories` → `LinkmasterModel::getActiveLinks` |
| GET | `links/get` | (legacy, outside `/design`/`/links` group, line 47) public links fetch | — | links | `Links::get` |
| GET | `/buttons` *(dormant — route commented out)* | Styled buttons for profile | — | `[{ ID, BtnText, BtnStyle, ShortName }]` | `Buttons.php::get` |
| GET | `/buttons/style` *(dormant)* | Button style / defaults | `?update&ID` | button + `BtnPreview` | `Buttons.php::style` |
| POST | `/buttons/update` *(dormant)* | Create/update button | POST style fields | message | `Buttons.php::update` |
| POST | `/buttons/preview` *(dormant)* | Render button preview style | POST style fields | `{ DisplayText, Preview }` | `Buttons.php::preview` |
| DELETE | `/buttons/(:num)` *(dormant)* | Delete button | — | message | `Buttons.php::delete` |
| GET | `media/image` | Paginated user image library (Unlayer picker) | `?page&perPage` | `{ data[], meta }` | (media controller) |
| POST | `media/upload` | Upload funnel image/video | FormData `file`, `source=Funnel` | `{ name }` | (media controller) |
| DELETE | `media/{id}/image` | Delete uploaded media | — | ok | (media controller) |

- **v1 models / tables:**
  - `funnel_designs` (`FunnelDesignsModel`) — `ID, ProfileID, Slug, Active, created_at, updated_at`. **Stores only a pointer**; actual design lives on S3 at `{ProfileID}/funnels/{ID}/funnel.json` (Unlayer JSON) and `…/html.json` (`{fonts, css(minified), body(utf8_encoded)}`).
  - `link` (`LinkModel`) — `ID, ProfileID, MasterLinkID, Name, URL, ReviewMonitoringURL, Rank, ImageURL, IsActive, OpensInNewWindow, SkipInstructions, ShowOnDesktop, ShowOnMobile, DeviceAndroid/Blackberry/iOS/Windows, ShowInReviewFunnel, CreateDate, LastUpdated`.
  - `linkmaster` (`LinkmasterModel`) — platform catalog: `ID, Name, ImageURL, Category, Active, CreateDate, LastUpdated`.
  - `design` (`DesignModel`) — legacy color/background panel template: `PageColor, BackgroundImage/Position/Repeat/Size(+Value), PanelColor, NameColor, HeaderFooterColor, HeaderFooterTextColor, BodyColor, StarColor, NewPanel, ShowName`. Linked via `profile.DesignID`; auto-created (`createProfileDesign`/`generateDesign`) if missing.
  - `buttons` (`ButtonsModel`) — per-profile styled button (28 style fields; `mapButtonStyle` builds inline CSS). Dormant.
  - `profile` (`ProfileModel`) — holds the content-editor fields written by `savecontent` (`MessageHeader/Text`, `CustomPoweredBy`, `MessageHappy/Unhappy`, `StarText1-5`, `HappyMinimum`, `ThankYou*`, funnel header/footer colors, `LastUpdatedBy`).
  - `crawler_history` — review-monitoring crawl log (tied to `ReviewMonitoringURL`); owned by the reviews/crawler domain, included here because the link's `ReviewMonitoringURL` field feeds it.
- **Pagination / filtering / sorting:** `/links` returns all links ordered by `Rank ASC`. `/links/categories` LIKE-search on `Name`, grouped by `Category` (ordered Category ASC, Name ASC). Media picker paginates `page`/`perPage` (default 20). No pagination on design endpoints.

## 5. Business rules
- **Funnel routing threshold:** `HappyMinimum` (set on the Positive tab) decides the split — rating ≥ threshold → positive/review-platform path; below → negative/private-feedback path. Special values `1`="Review to All" and `0`="Feedback to All" override the split.
- **Design persistence is S3-backed:** `funnel_designs` row stores only `ProfileID/Slug/Active`; `getFunnelDesign` reads the JSON from S3 (`{ProfileID}/funnels/{ID}/funnel.json`) for the **Active='1'** row only; `saveFunnelDesign` writes `funnel.json` + `html.json` (CSS minified via `MatthiasMullie\Minify`, body `utf8_encode`d). A missing row is created on first save.
- **Save granularity (content editors):** `savecontent` saves whatever subset of fields the form posts (positive/negative/thanks each post their own field set); special-cased keys `header`→`MessageHeader`, `body`→`MessageText`, `footer`→`CustomPoweredBy`. Always stamps `LastUpdatedBy = UserID`.
- **Link rank:** new links get `Rank = current count` (appended last). Reorder rewrites `Rank` to array index. **Bug:** `changeOrder` sets `$success = true` inside its catch block (swallows failures — should be `false`).
- **Custom vs catalog link:** custom requires a unique `PlatformName` (checked LIKE against `linkmaster.Name` — duplicate → "Platform already exists") + an image; catalog requires a valid `MasterLinkID`, copying `Name`/`ImageURL` from `linkmaster`.
- **Boolean coercion bugs (LinkModel):** `createLink`/`updateLink` set switches via `$postData['X'] == 'true' ?? true` — the `??` never fires on a non-null comparison, so the value is just `($x == 'true')`; harmless result but the `?? true` is dead code. Worth fixing to explicit booleans in v2.
- **Image filename:** custom-link logo filename = lowercased alphanumerics of the platform name; `check_link_logos()` generates sized variants (`-sm.png`). List rewrites `ImageURL` to `{frontURL}assets/media/link-logos/{name}-sm.png`.
- **Instruction interstitial:** shown only for google/facebook/zillow/realtor.com **and** only when `SkipInstructions != 1`; otherwise direct link. Yelp has server-side instructions but no Vue modal branch (parity gap).
- **Tenancy:** every link/design op is scoped by `profile_id` from JWT auth; update/toggle/delete re-check `ProfileID` ownership before mutating.
- **Media size limit:** funnel uploads limited to 5 MB (UI copy); `source=Funnel`.
- **Unlayer asset cache:** `customJS`/`customCSS` are cached server-side by Unlayer; the `customAssetsVersion` query param MUST be bumped to ship CSS/JS edits.
- **Delete confirmation:** media deletion uses the themed `ConfirmModal`, never native `confirm()`.

## 6. Integrations
- **AWS S3** (`App\Services\AwsS3`) — stores/reads the Unlayer funnel design (`funnel.json`) and rendered HTML bundle (`html.json`). Core to this domain.
- **Unlayer** (`@elmehdi/oggvo-vue-email-editor`, projectId `138792`) — the visual drag-and-drop funnel designer; custom CSS/JS hosted on the front origin.
- **Review platforms** (Google, Facebook, Yelp, Zillow, Realtor.com, + any `linkmaster` entry) — destinations of the funnel's review-routing links; instruction copy references each. The link `ReviewMonitoringURL` feeds the **review-monitoring crawler** (`crawler_history`, reviews domain) — see reviews spec for the puller/crawler queue.
- No Twilio/Stripe/Square/FCM/SendGrid in this domain. No webhooks.

## 7. v1 → v2 mapping
- **Module:** `apps/api/src/modules/funnel` — controller/service/repository/DTO for funnel-design CRUD, link CRUD/reorder/toggle, and the link-master catalog. Public-render concerns (resolve shortname → funnel JSON + active links + rating stats) shared with `apps/api/src/modules/reviews`.
- **Drizzle tables (`@oggvo/db`):**
  - `funnel_designs` — keep `ProfileID/Slug/Active` pointer + S3 path convention. *(Confirm schema file exists; `links.ts` defines `links`/`link_masters`/`crawler_history`; `design.ts` defines `designs`/`palettes`/`buttons`. A `funnel_designs` Drizzle table should mirror `FunnelDesignsModel`.)*
  - `links` (camelCased: `profileId, masterLinkId, name, url, reviewMonitoringUrl, rank, imageUrl, isActive, opensInNewWindow, skipInstructions, showOnDesktop, showOnMobile, deviceAndroid/Blackberry/Ios/Windows, showInReviewFunnel`) — booleans now real `boolean` (v1 stored as `'0'/'1'` strings → fixes the string-compare coercion).
  - `link_masters` (`name, imageUrl, category, active`).
  - `designs` (legacy color panel; phase 3 / may be deprecated), `buttons` (dormant; migrate only if revived), `palettes` (preset colors).
  - `crawler_history` (`profileId, siteName, reviewUrl, lastRun, newReviewsFound, errors`) — fed by `reviewMonitoringUrl`; owned jointly with reviews domain.
- **Queue:** `—` for design save (synchronous S3 write). Review-monitoring crawl → `review-puller` queue (reviews spec).
- **Frontend:** v2 portal routes under `apps/web/app/(portal)/design/{page.tsx, positive, negative, thanks}` (or tabbed segment). Public funnel **already scaffolded** at `apps/web/app/(public)/r/[shortname]/page.tsx`. Reuse `@oggvo/ui` for `ColorInput`, `Switch`, `Listbox`, `Modal`, `ConfirmModal`, drag-reorder list. Evaluate replacing Unlayer with a lighter typed funnel builder, or keep Unlayer + S3 JSON.
- **Endpoint mapping (RESTful, OpenAPI-typed):**
  - `GET /design` → `GET /funnel/content` (or fold into profile resource).
  - `GET /design/getdesign` → `GET /funnel/design`; `POST /design/savedesign` → `PUT /funnel/design`.
  - `POST /design/savecontent` → `PATCH /funnel/content`.
  - `GET /links` → `GET /links`; `POST /links/create` → `POST /links`; `POST /links/update/:id` → `PATCH /links/:id`; `DELETE /links/:id` → `DELETE /links/:id`; `POST /links/toggle/:id` → `PATCH /links/:id/active` (or part of PATCH); `POST /links/save-order` → `PATCH /links/order`; `GET /links/categories` → `GET /link-masters?query=`.
  - Public: `GET /(public)/r/:shortname` resolves design + active links + rating stats.
- **Known v1 bugs to fix:**
  - `LinkModel::changeOrder` catch sets `$success = true` (swallows reorder failures).
  - `LinkModel` boolean `== 'true' ?? true` dead `??` coercion → use real booleans.
  - `Design::savecontent` mass-assigns arbitrary posted profile keys (no allowlist) — restrict in v2.
  - Yelp instruction parity (server view exists, Vue modal doesn't).
  - `utf8_encode` of HTML body is deprecated in PHP 8.2+ — store UTF-8 directly in v2.
  - String-typed boolean comparisons (`IsActive == '1'`) sprinkled across frontend — clean up with typed API.

## 8. Open questions / parity risks
- **Funnel design rendering:** does the public `/r/[shortname]` page re-render the Unlayer S3 JSON, or the pre-rendered `html.json` bundle? Confirm which artifact the v2 public route consumes and whether Unlayer stays.
- **`funnel_designs` Drizzle table:** verify a schema table exists mirroring `FunnelDesignsModel` (S3-pointer model); not found alongside `links.ts`/`design.ts` during this pass — possible schema gap.
- **`designs` vs `funnel_designs` vs profile content fields:** three overlapping design stores in v1 (legacy `design` color panel, S3 Unlayer `funnel_designs`, and inline `profile` content fields). Decide the v2 canonical home; the legacy `design` panel may be dead.
- **Buttons feature:** route group is commented out — is it being revived in v2 or dropped? Schema (`buttons`) is present.
- **`Slug` on `funnel_designs`:** purpose/uniqueness unclear (set but never validated); may relate to multi-funnel support not yet exposed.
- **Profile content fields not in a dedicated table:** positive/negative/thanks copy + colors + `HappyMinimum` live on `profile` in v1; confirm whether v2 keeps them on the profile/tenancy table or extracts a `funnel_content` table.
- **`ShowInReviewFunnel`, device flags (`DeviceAndroid/iOS/…`):** set on create but no UI exposes them; confirm they're still meaningful (device-targeted link visibility) or vestigial.
- **`ReviewMonitoringURL`:** captured on links but the editing UI doesn't surface a field for it on create/update (only sent for catalog links) — confirm how it's populated and its handoff to `crawler_history`.
- **Public feedback form (negative path) submission target:** the negative-screen form is a preview mock in the editor; confirm the real public submission endpoint (likely reviews domain `Site=Oggvo` feedback) and that it's documented there.
