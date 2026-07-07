# OGGVO v2 — Design System

A Claude-authored design system spec for the v2 portal, grounded in the project's real tokens
(`packages/config/tailwind/preset.js`) and primitives (`packages/ui`). It defines the visual language
the contacts mockups (and future screens) are built from.

> **Mockups:** [`./mockups/`](./mockups/) — open `index.html` in a browser (no build step).
> **Tokens source of truth:** [`packages/config/tailwind/preset.js`](../../packages/config/tailwind/preset.js).

---

## 1. Foundations

### 1.1 Color tokens

These are the exact values from the Tailwind preset. Mockups use the same scale.

| Token | Hex | Use |
| --- | --- | --- |
| `primary-50` | `#eef7ff` | tints, subtle hover backgrounds |
| `primary-100` | `#d9edff` | tag pills, info badge bg |
| `primary-500` | `#2e90fa` | **brand blue** — primary buttons, links, active states |
| `primary-600` | `#1570ef` | primary hover |
| `primary-700` | `#175cd3` | pressed / emphasis |
| `success-500` | `#12b76a` | Active status, completed, positive |
| `success-600` | `#039855` | success hover |
| `warning-500` | `#f79009` | Pending / paused / duplicate |
| `warning-600` | `#dc6803` | warning hover |
| `error-500` | `#f04438` | Inactive / failed / destructive |
| `error-600` | `#d92d20` | danger hover |
| `google` | `#dc4e41` | Google brand |
| `linkedin` | `#0077b5` | LinkedIn brand |

**Neutrals** use Tailwind's default `gray` scale: `gray-50` page background, `gray-100` subtle fills,
`gray-200` borders/dividers, `gray-500` muted text, `gray-700` body text, `gray-900` headings.

**Semantic mapping (status badges):**

| Status | Badge color |
| --- | --- |
| Active | `success` (green) |
| Pending | `warning` (yellow) |
| Inactive / Failed | `error` (red) |
| All / neutral / History | `gray` |
| Queued | `gray` |
| In-progress | `primary` (blue) |
| Completed | `success` |

### 1.2 Typography

- **Family:** Inter (`--font-sans`), system fallback.
- **Scale:** Display 30/36 semibold · H1 24/32 semibold · H2 20/28 semibold · H3 16/24 semibold ·
  Body 14/20 · Small 13/18 · Caption 12/16. Page/table content defaults to **Body 14**.
- **Weights:** 400 body, 500 medium (labels, buttons), 600 headings.

### 1.3 Spacing & layout

- 4px base grid (`gap-1`=4 … `gap-6`=24). Card padding `p-4`/`p-6`. Table cell padding `px-4 py-3`.
- **Radius:** `rounded-card` = `0.75rem` (12px) for cards/modals/inputs; `rounded-full` for pills/avatars.
- **Shadow:** subtle `shadow-sm` on cards, `shadow-lg` on modals/dropdowns.
- **Container:** portal content max-width ~`1200px`, page gutter `px-6`.

### 1.4 Elevation & focus

- Focusable elements use `focus-visible:ring-2 ring-primary-500` (from the Button primitive).
- Disabled = `opacity-50 cursor-not-allowed`.
- Cards use the soft `shadow-card` token (`0 1px 2px / 0 1px 3px` rgba) rather than Tailwind's default.

### 1.5 Dark mode

Class-based (`html.dark`), toggled in the top-bar and persisted in `localStorage` (`assets/theme.js`).
The mockups override the specific utilities they use under `html.dark` (`assets/shell.css`) so the
whole surface re-themes from one switch. Dark surface ladder: page `#0e1521` → card `#18202f` →
raised `#222c3e`; borders `#283246`; text `#eef1f6 / #c7cedb / #8a94a4`. Brand + status hues keep
their identity (tints deepened so they don't glare). Production v2 will express this with real
`dark:` variants + the token CSS vars; the mockups approximate it.

---

## 2. Components

Each component lists variants and the states it must support. The live reference renders in
[`mockups/design-system.html`](./mockups/design-system.html).

### 2.1 Button (`@oggvo/ui` Button)
- **Variants:** `primary` (blue), `secondary` (white + border), `ghost` (transparent), `danger` (red).
- **Sizes:** `sm` h-8 · `md` h-10 · `lg` h-12.
- **States:** default, hover, focus-visible ring, disabled, **loading** (spinner + disabled).

### 2.2 Badge
- **Tones:** gray, primary, success, warning, error. Soft style: `{tone}-100` bg + `{tone}-700` text.
- **Status badges** carry a leading `{tone}-500` dot (`.badge-dot`); **count badges** (per-tab totals,
  import counts) stay dot-less and use `tabular-nums`.
- Used for status, import state, counts.

### 2.3 Tag pill
- Blue (`primary-100` bg / `primary-700` text), `rounded-full`, removable (× ) in the combobox.
- List table shows the **first 3** tags; overflow as "+N".

### 2.4 Avatar
- `rounded-full`, sizes 24/32/40px. Falls back to initials on a `gray-200` circle when no image.

### 2.5 TabBar
- Underline style. Active tab = `primary-600` text + `primary-500` bottom border. Used for status filter
  (All/Active/Pending/Inactive) and import detail (Imported/Duplicate/Failed) with per-tab counts.

### 2.6 Table
- Sticky header, zebra-free, `gray-200` row dividers. Header checkbox (select-all, indeterminate).
- Sortable headers show a caret; sort state reflects URL.
- **States:** loading (skeleton rows), empty (icon + message + CTA), populated, row-hover.
- Row action **Dropdown** (Edit / Restart / Activate-Deactivate / Delete).

### 2.7 Bulk action bar
- Appears above the table when ≥1 row selected; Actions dropdown at ≥2. Shows selected count + Clear.

### 2.8 Form controls
- **TextInput / Email / Textarea:** label, optional hint, inline error (`error-500` text + ring).
- **Switch:** on = `primary-500`. **DatePicker.** **TimePicker** (`hh:mm A`). **Number** (min/max).
- **Combobox (tags):** suggest + free-create. **Select.** **File input** (CSV / image with preview).

### 2.9 Modal
- Centered, `rounded-card`, `shadow-lg`, scrim. Header + body + footer (right-aligned actions).
- Used for: delete confirm, change-status confirm, pause-campaigns confirm, import upload, export.

### 2.10 Banner / Alert
- Full-width, tone-colored left accent + icon. Used for the campaign-status banner (paused/active/dormant).

### 2.11 Pagination
- Prev/Next + numeric pages; rows-per-page select (10/25/50/100). Import detail uses infinite-scroll
  (cursor) instead.

### 2.12 Timeline (activity pipeline)
- Vertical line + dots; each item = title, subtitle, timestamp. Card header carries a status badge.

### 2.13 Toast
- Bottom-right, success (green) / error (red), auto-dismiss.

### 2.14 Skeleton
- Shimmer blocks for table rows, form, and timeline loading states.

---

## 3. Layout patterns

- **Portal shell:** left sidebar nav (gradient logo mark, icon domain links with an active accent bar,
  profile switcher) + a sticky **top-bar** (back-link + route breadcrumb, centered global search with a
  `/` hint, theme toggle, notifications bell with unread dot, avatar menu) + content area.
- **List page:** PageHeader (title + header actions) → banner → filter row (tabs + search + date) →
  table → pagination.
- **Detail/form page:** PageHeader with back button → two-column grid (form left, activity sidebar right);
  single column on mobile.
- **Settings page:** single-column form with section cards.

### Responsive
- Header actions collapse into a single Dropdown on mobile.
- Two-column detail collapses to stacked.
- Table becomes horizontally scrollable; primary columns (Name, Status) stay visible.

---

## 4. Content & a11y

- Status, badges, and toasts never rely on color alone — always paired with text/icon.
- All interactive elements keyboard-reachable with a visible focus ring.
- Form errors announced inline next to the field and summarized on submit.
- Dates render in the **profile timezone** with an absolute `MMM DD, YYYY` format (+ time where shown).

---

## 5. How the mockups map to screens

| Mockup file | Screen | Stories |
| --- | --- | --- |
| `design-system.html` | Component & token showcase | — |
| `contacts-list.html` | `/contacts` | E1, E3, E7.2 |
| `contact-form.html` | `/contacts/create` + `/contacts/:id` | E2, E4 |
| `contacts-settings.html` | `/contacts/settings` | E7.1 |
| `imports-list.html` | `/contacts/imports` (+ upload modal) | E5.1–5.2 |
| `import-detail.html` | `/contacts/imports/:id` | E5.3 |

All mockups are static HTML using Tailwind (Play CDN) configured with the tokens above — illustrative
only, not production components.

| Mockup file | Screen | Stories |
| --- | --- | --- |
| `reviews-list.html` | `/reviews` feed (list/grid toggle + Reply/Delete/Contact modals) | R1, R3, R4 |
| `reviews-create.html` | `/reviews/create` | R2 |
| `reviews-calendar.html` | `/reviews/calendar` | R5.2 |
| `reviews-statistics.html` | `/reviews/statistics` | R5.1 |
| `reviews-autoshare.html` | Settings → Review | R6 |
| `reviews-share.html` | Share / review-image composer (per-card Share) | R4 |
| `design-main.html` | `/design` Main (Unlayer visual designer) | D1.1 |
| `design-funnel.html` | `/design/positive` (editor + link manager + Add/Edit/Delete & instructions modals) | D1.2, D1.5, D2 |
| `design-negative.html` | `/design/negative` (private-feedback editor) | D1.3 |
| `design-thanks.html` | `/design/thanks` (thank-you editor) | D1.4 |
| `funnel-public.html` | `/r/:shortname` (public, no shell) | P1, D3 |
| `campaigns-list.html` | `/campaigns` (type tabs + filters, row ⋯ menu, Settings/Send-test/Delete/Schedule modals) | C1 |
| `campaigns-templates.html` | `/campaigns/templates` (accordions, Create + Preview modals) | C2 |
| `campaigns-editor.html` | `/campaigns/editor/:id` — Email (Unlayer canvas) | C3 |
| `campaigns-editor-sms.html` | `/campaigns/editor/:id` — SMS body composer (1600/160 counter, placeholders, MMS) | C3 |
| `connect-inbox.html` | `/connect` inbox | M1 |
| `connect-new.html` | `/connect/new` | M2 |
| `connect-calls.html` | `/connect/calls` | M5 |
| `connect-preference.html` | `/connect/preference` (sortable keywords) | M4 |
| `connect-keyword.html` | keyword editor | M4.2 |
| `connect-scheduled.html` | `/connect/scheduled` (bulk delete + edit modal) | M3 |
| `connect-gated.html` | `/connect` gated states (Activate Connect + feature-request gate) | M0 |
| `social-accounts.html` | Social → Accounts (Connect/Disconnect modals) | US-1.* |
| `social-timeline.html` | `/social` timeline (Edit/Delete/Retry modals) | US-3.1, US-2.3–2.5 |
| `social-composer.html` | `/social/create/post` (media-picker modal) | US-2.1, US-2.2 |
| `social-testimonial.html` | `/social/create/testimonial` (reviews "Share" target) | US-2.6 |
| `social-planner.html` | `/social/planner` calendar | US-3.2 |
| `social-campaigns.html` | `/social/content-planner` (New-Campaign + Cancel modals) | US-4.* |
| `social-statistics.html` | `/social/statistics` (insights + automator) | US-5.* |
| `surveys-list.html` · `survey-builder.html` · `survey-results.html` · `survey-public.html` | Surveys — list (filter/create/delete), builder (sortable + add/select/delete + preview), results (Overview/Responses/Activity tabs + invite), public respondent flow (standalone) | surveys/* |
| `widgets-list.html` · `widget-editor.html` | Widgets (embed snippet) | widgets/* |
| `dashboard-funnel.html` · `dashboard-social.html` · `dashboard-connect.html` · `dashboard-activity.html` · `dashboard-campaigns.html` · `dashboard-profiles.html` | Dashboard tabs (cross-linked; funnel modal, range segments + activity search/filters are interactive) | analytics D0–D6 |
| `dashboard-activity-history.html` | Mobile recipient activity detail | analytics D4 |
| `analytics-google.html` · `analytics-keywords.html` | Analytics tabs (metric selector + keyword sort interactive) | analytics A1–A2 |
| `settings.html` · `integrations.html` · `a2p-compliance.html` | Settings area | settings/integrations/compliance |
| `admin.html` | `/admin` (OGGVO_ADMIN) | admin/* |
| `auth-login.html` · `auth-signup.html` · `auth-onboarding.html` | Auth (public, no shell) | auth/* |
| `_template.html` | Starter for any new page | — |

Later additions (previously shipped but missing from this map):

| Mockup file | Screen | Stories |
| --- | --- | --- |
| `auth/auth-forgot.html` · `auth-reset.html` · `auth-activate.html` | Password + activation flows (standalone) | auth/* |
| `auth/setup-questionnaire.html` · `setup-automation.html` | Onboarding wizard steps (standalone) | auth addendum / onboarding |
| `admin/admin-notifications.html` · `admin-settings.html` · `admin-user-form.html` · `admin-template-editor.html` · `admin-referrals.html` | Admin sub-pages (push broadcasts, platform settings, staff users, template editor, referral directory) | admin A6–A12 |
| `settings/referrals.html` | Client referral program (operator side) | referrals RF1 |
| `media/media-library.html` | `/media` gallery (reference-counted usage) | media M1–M4 |
| `widgets/widget-landing.html` | Landing-page widget builder | widgets E5 |
| `tutorials/tutorials.html` | `/tutorials` (categories + search, BF-001) | tutorials T1–T3 |
| `support/support.html` · `support/article.html` | Help center + article | support S1–S2 |
| `public/unsubscribe.html` · `public/data-deletion-status.html` | Public consent/data-rights pages (standalone) | compliance E5–E6 |
| `system/404.html` · `system/maintenance.html` | System states (standalone) | — |

**Foundation net-new epics (added 2026-07-07** — story IDs use the normalized `EPIC-n.m` scheme
from `docs/foundation/04-epics-and-stories.md`; per-domain story files live in
`docs/{billing,team,tfv,notifications,audit,onboarding,ai}/user-stories.md`):

| Mockup file | Screen | Stories |
| --- | --- | --- |
| `settings/billing-plans.html` | Plan catalog + change-plan + history | BILL-1.1/1.2 |
| `settings/billing-checkout.html` | Stripe checkout handoff | BILL-1.2 |
| `settings/billing-limit-reached.html` | Entitlement over-limit (queued sends + upgrade prompt) | BILL-1.3 |
| `settings/billing-dunning.html` | Payment-failure grace/suspension states | BILL-1.4 |
| `admin/admin-billing.html` | Staff plan admin + comp overrides + MRR | BILL-1.1/1.5 |
| `settings/team.html` | Member management (roles, invites) | TEAM-1.1/1.3/1.4 |
| `auth/team-accept.html` | Invite-accept landing (standalone) | TEAM-1.2 |
| `settings/tfv.html` | TFV start/resume (Twilio Embeddable) | TFV-1.1/1.2 |
| `settings/tfv-status.html` | TFV status timeline + correct/resubmit | TFV-1.3/1.4 |
| `admin/admin-tfv.html` | Staff TFV panel (assign number, sync, history) | TFV-1.5/1.6 |
| `settings/notifications.html` | Notification preference center | NOTIF-1.1 |
| `admin/admin-deliveries.html` | Delivery ledger (support forensics) | NOTIF-1.4 |
| `admin/admin-audit.html` | Audit forensics search + export | AUDIT-1.4/1.5 |
| `contacts/contact-history.html` | Entity-history timeline (pattern page) | AUDIT-1.3 |
| `auth/setup-company.html` · `setup-team.html` · `setup-accounts.html` | Onboarding wizard steps (company/team/connect) | ONBD-1.2/1.4/1.5 |
| `dashboard/dashboard-checklist.html` | "Get set up" recommended-feature checklist | ONBD-1.3 |
| `reviews/ai-templates.html` | Custom share-template manager + round-robin | AI-1.1 |
| `reviews/ai-composer.html` | AI share-copy composer (quota, edit-before-post) | AI-1.2/1.3 |

Removed: `social/social-story.html` (story composer — dropped feature per the epic register).

---

## 6. Authoring a new page (reusable shell)

**Folder layout:** the mockups are organized one folder per domain —
`mockups/{dashboard,reviews,funnel,contacts,campaigns,connect,social,surveys,widgets,settings,admin,auth,media,tutorials,support,public,system}/`.
Shared code stays at the root: `mockups/assets/` (the four assets below), `mockups/index.html` (the
catalog), and `mockups/_template.html`. **Because pages live one level deep, they reference the shared
assets as `../assets/…`** (the root `_template.html` uses `assets/…`; bump each path to `../assets/…`
when you drop your copy into a domain folder). Cross-page links are folder-relative
(`../social/social-composer.html`, `../index.html`).

The sidebar and top-bar are **not copy-pasted** into each page — they're generated by
[`mockups/assets/shell.js`](./mockups/assets/shell.js). To build any new screen, copy
[`mockups/_template.html`](./mockups/_template.html) into the right domain folder and do three things:

1. **Include the four assets** in `<head>` (order matters; `../assets/` from inside a domain folder):
   ```html
   <script src="https://cdn.tailwindcss.com"></script>
   <script src="../assets/tailwind-config.js"></script>   <!-- tokens -->
   <script src="../assets/theme.js"></script>             <!-- dark-mode, applied pre-paint -->
   <link rel="stylesheet" href="../assets/shell.css" />   <!-- component + dark layer -->
   ```
2. **Put all page content inside one element:** `<main data-shell-content class="flex-1 p-6"> … </main>`.
3. **Mount the shell** at the end of `<body>`:
   ```html
   <script src="../assets/shell.js"></script>
   <script>
     OggvoShell.mount({
       active: "reviews",                                  // nav key (see NAV in shell.js)
       storyDomain: "reviews",                             // docs domain for data-story ids (§6.2)
       back:   { href: "../index.html", label: "All mockups" }, // omit to hide
       route:  "/reviews",
       search: "Search…",                                  // null to hide the search box
       // user: { name, initials, tz, email }              // defaults to Acme Co
     });
   </script>
   ```
   The shell loads `stories.data.js` from its own folder automatically, so `data-story` bindings work
   from any folder depth without extra script tags.

`OggvoShell.mount()` injects the sidebar (icon nav + active accent), the sticky top-bar (back-link +
route, global search with `/` shortcut, theme toggle, notifications panel, avatar menu), and a mobile
drawer — then wires every interaction (dropdown open/close, outside-click + Escape, drawer scrim).

**Adding a domain to the nav** is a one-line edit to the `NAV` array in `shell.js`; every page that
mounts the shell picks it up. `reviews-list.html` is a worked example of an entirely different domain
reusing the same shell, tokens, and components — only its page content and `mount()` config differ.

**Reusable pieces at a glance**

| Want | Use |
| --- | --- |
| Page chrome | `OggvoShell.mount()` |
| Card surface | `class="bg-white border border-gray-200 rounded-card shadow-card"` |
| Status badge | pill + leading `.badge-dot` (or inline `h-1.5 w-1.5 rounded-full bg-{tone}-500`) |
| Tag pill | `bg-primary-100 text-primary-700 rounded-full` |
| Icon button | `class="icon-btn"` |
| Sidebar link | `class="nav-link"` / `nav-link-active` |
| Elevated popover | `class="shadow-pop"` |
| Toast | `OggvoShell.toast(msg, "success"\|"error"\|"primary"\|"gray")` |
| Drag-reorder list | `OggvoShell.sortable(listEl, { onSort })` → `{ refresh, order }` |
| Single-select button group | `OggvoShell.buttonGroup(container, { active, inactive, onChange })` → `{ select }` (segmented controls, metric/tab pickers; buttons carry `data-value`) |
| Dark mode | automatic — overrides live in `shell.css` under `html.dark` |

### 6.1 Interactive helpers

Two reusable behaviours live on `OggvoShell` (in `shell.js`), independent of `mount()`:

- **`OggvoShell.toast(message, tone)`** — bottom-right toast; auto-dismisses. Tones map to a colored dot.
- **`OggvoShell.sortable(listEl, { onSort })`** — HTML5 drag-reorder. Mark the container's rows with
  `data-sortable-item` (+ optional `data-id` and a `data-drag-handle` child); `onSort(ids[])` fires after
  a drop. Returns `{ refresh, order }` — call `refresh()` after inserting rows dynamically.

The **Funnel Designer** mockup (`design-funnel.html`) is a worked example: its platform-link manager is
fully interactive — drag to reorder (toast on drop), eye-toggle show/hide (row dims), delete (row fades
out), and **Add New Platform** opens a modal that appends a wired-up row. All built on these two helpers.

### 6.2 Story annotations (bind a screen element to its user story)

Any element in a mockup can be linked to the exact user story + acceptance criterion it implements, so a
reviewer can click it and read the spec inline. This keeps the mockups and `docs/<domain>/user-stories.md`
traceable in both directions.

**How it works**

1. **Bind** — add attributes to the element (usually a `<section>`/card or a control container):
   - `data-story="US-R4.1"` — the story id. Bare ids resolve against the page's domain (see below);
     cross-domain ids collide (7 domains reuse `US-1.1`…), so qualify with `data-story="social:US-2.1"`
     when needed.
   - `data-ac="AC3"` *(optional)* — scroll to and flash-highlight one acceptance criterion.
2. **Declare the page domain** so bare ids resolve: `OggvoShell.mount({ …, storyDomain: "reviews" })`.
3. **Generate the data** from the markdown — the drawer content is a build artifact, never hand-written:
   ```
   node tools/build-stories.mjs      # docs/<domain>/user-stories.md → assets/stories.data.js
   ```
   Re-run whenever a story changes. (Shipped as `.js`, not `.json`, so it loads over `file://`.)

**Using it** — click the **annotate** button in the top-bar (or press **Alt+A**). Bound elements outline
and get an id badge; clicking one slides in the story drawer (id, title, persona, ACs, availability
tables, and a link back to the source markdown). The toggle **gates** click-to-open, so with annotations
off the mockup behaves normally — no interactions are hijacked. `reviews-share.html` is the worked
example (composer cards bound to `US-R4.1/4.2/4.3`, individual controls to their ACs).

You can also open a story programmatically: `OggvoShell.openStory("US-R4.1", "AC3")`.

A story id with **no** `data-story` reference anywhere is an un-mocked feature — a cheap coverage signal.
