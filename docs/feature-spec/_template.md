<!--
TEMPLATE — copy this for every domain file. Fill all 8 sections; no empty headings.
Be exhaustive: list EVERY page, tab, field, button, modal, state, endpoint, and rule.
Keep v1 file paths (relative to the `oggvo` repo) so a builder can open the source.
-->

# <Domain Name>

> **v2 target:** module `apps/api/src/modules/<name>` · tables `<drizzle tables>` · queue `<bullmq queue or —>` · build phase `<n>`
> **v1 sources:** frontend `apps/portal-frontend/pages/<...>`, store `store/<...>.js`, API `apps/portal-api/app/Controllers/API/V2/<...>.php`, models `app/Models/<...>`

## 1. Overview
What the feature does, the business value, who can use it (account_type / permission gate), and where
it sits in the product. 3–6 sentences.

## 2. Pages & tabs
Table of every route in this domain.

| Route | v1 page file | Layout | Tabs / nested routes | Access (gate) |
| --- | --- | --- | --- | --- |
| `/...` | `pages/.../x.vue` | default | tab a, tab b | authed / account_type≥N / permission |

## 3. Screen-by-screen
For each page above, a subsection:

### `/route` — Page name
![<page>](_assets/screens/<domain>/<page>.png) <!-- placeholder until captured -->
- **Purpose & layout** — what the user sees and does here.
- **Elements / fields** — every input, column, button, filter, badge (name, type, required, validation,
  default). Document each tab separately.
- **States** — empty, loading, error, permission-denied, paginated.
- **Modals / drawers** — each modal: trigger, fields, actions.
- **Interactions** — sorting, filtering, bulk actions, drag-reorder, infinite scroll, etc.

## 4. Data & API
Every endpoint this domain calls.

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v2/...` | ... | ... | ... | `X.php::method` |

- **v1 models / tables:** list the tables behind these endpoints.
- **Pagination / filtering / sorting:** params and conventions.

## 5. Business rules
Scheduling, timezone handling, quotas/limits, permission nuances, side effects (events fired, async jobs
enqueued, notifications sent), idempotency, validation rules. Bullet each rule precisely.

## 6. Integrations
External services this feature touches (Twilio, Stripe, Square, Google, Meta, FCM, SendGrid, …) and what
they're used for here. Note webhooks involved.

## 7. v1 → v2 mapping
- **Module:** `apps/api/src/modules/<name>` (controller/service/repository/DTO).
- **Drizzle tables:** `<table>` (`@oggvo/db`) — note any field/shape changes vs v1.
- **Queue:** `<bullmq queue>` if async, else "—".
- **Frontend:** v2 route(s) under `apps/web/app/(portal)/...`; shared `@oggvo/ui` components to reuse.
- **Endpoint mapping:** v1 `/api/v2/x` → v2 `GET /<resource>` (RESTful, typed via OpenAPI).
- **Known v1 bugs to fix:** list defects (e.g. timezone, auth, N+1) to correct during rebuild.

## 8. Open questions / parity risks
Anything ambiguous, undocumented v1 behaviour, data-migration concerns, or features that may not have a
v2 schema home yet (flag as schema gaps).
