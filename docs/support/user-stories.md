# Support / Help Center — User Stories & Acceptance Criteria

> Source of truth: v1 routes [`apps/portal-frontend/pages/support/index.vue`](../../../oggvo/apps/portal-frontend/pages/support/index.vue),
> [`support/knowledgebase/index.vue`](../../../oggvo/apps/portal-frontend/pages/support/knowledgebase/index.vue), and
> [`support/knowledgebase/[...slug].vue`](../../../oggvo/apps/portal-frontend/pages/support/knowledgebase/[...slug].vue).
> v2 target: module `apps/api/src/modules/support` · tables `support_topics`, `support_articles`,
> `support_article_feedback` (`@oggvo/db`) · build phase 5.
>
> Mockups in [../design-system/mockups/support/](../design-system/mockups/support/):
> **[support.html](../design-system/mockups/support/support.html)** (Help Center landing — hero search + topic grid + popular list + contact card),
> **[article.html](../design-system/mockups/support/article.html)** (article detail — breadcrumb + prose body + "Was this helpful?" + related + contact card).
>
> Companion surface: [tutorials.html](../design-system/mockups/tutorials/tutorials.html) (video guides, separate domain).

> **How to read this doc** — one section per page / block. Each story cites the real v2 endpoint;
> **Copy** lines quote v1 verbatim (grounding the mockups); **Fix-on-rebuild** and **Open** lines carry
> parity risks. In v1 the knowledge base is hard-coded arrays in the Vue pages (no API, no search, no
> feedback); v2 promotes it to a real content model served from the API.

**Personas**
- **Operator** — authenticated portal user looking for help while using the product.
- **Visitor** — any reader of a Help Center article (may be unauthenticated on the public help surface).
- **System** — support API + content store (articles authored in an admin/CMS surface, out of scope here).

**Global rules**
- The Help Center is **read-mostly and tenant-agnostic**: articles are global product docs, not per-profile
  data, so listing/reading is not scoped to `profileId` (unlike every other portal domain).
- Only **published** articles are returned to the portal (`status = 'published'`); drafts/archived are hidden.
- Feedback (`POST …/feedback`) is **rate-limited to one vote per visitor per article** (cookie/user id);
  a repeat vote updates the prior one rather than double-counting.
- Search and topic filtering are **server-side** in v2 (v1 had a non-functional search box over static arrays —
  see US-S1.1 Fix-on-rebuild).
- Article bodies are **sanitized HTML** rendered as prose; no runtime template compilation.

---

## Epic S1 — Help Center landing (`/support`)

> Mock: [support.html](../design-system/mockups/support/support.html). v1: `support/index.vue` (hero search +
> contact resource cards + static FAQ) and `support/knowledgebase/index.vue` (hard-coded article list).

### US-S1.1 — Search the knowledge base
**As a** Visitor **I want** to type a question and get matching articles **so that** I can self-serve an answer fast.
- **AC1** The hero shows heading **"How can we help?"** (v1: "Hi, How can we help?") with a full-width search input
  (placeholder e.g. *"Search articles… e.g. 'share a review'"*). Bound block: hero (`data-story="US-S1.1"`).
- **AC2** Submitting/typing queries `GET /support/articles?q=<text>` (matches article title, summary, and topic);
  results replace the popular-articles list and update the count. Empty result → "No articles match your search."
- **AC3** Search is debounced (~300 ms) and case-insensitive; clearing the box restores the popular list.
- **Copy (v1):** input `placeholder="Enter your question"`, submit button **"Search"**.
- **Fix-on-rebuild:** v1's search `<form>` had **no handler** — it posted nowhere and the KB list was a static
  array, so search never worked. v2 wires it to a real `GET /support/articles?q=` endpoint.

### US-S1.2 — Browse by topic
**As a** Visitor **I want** to see help grouped into topics **so that** I can browse when I don't know the exact term.
- **AC1** `GET /support/topics` returns each topic's name, icon, blurb, and article count; rendered as a card grid
  (Getting Started, Reviews & Funnel, Campaigns & SMS, Contacts, Connect, Social & Widgets). Bound block: topic grid (`data-story="US-S1.2"`).
- **AC2** A topic card links to that topic's article list (`GET /support/articles?topic=<slug>`); a card shows the
  live article count (e.g. "· 8 articles").
- **Copy (v1):** the landing "resources" cards were **Knowledgebase / Blogs / Videos** (`BookOpenIcon` /
  `DocumentTextIcon` / `VideoCameraIcon`) linking to `/support/knowledgebase`, `/blog`, `/tutorials`.
- **Open:** confirm whether Blogs and Videos stay as top-level topic cards or move to the contact/footer area
  (v2 mock folds Videos into the "Prefer video? → tutorials" card and topics become product-area buckets).

### US-S1.3 — See popular / recent articles
**As a** Visitor **I want** a list of the most-read articles **so that** common answers are one click away.
- **AC1** `GET /support/articles?sort=popular&limit=N` returns the top articles (title, topic, read time); rendered
  as a list with a chevron affordance and an article count in the header. Bound block: popular list (`data-story="US-S1.3"`).
- **AC2** Each row links to the article detail (`/support/articles/:slug` → article.html). Read time and topic show as sub-text.
- **Copy (v1):** KB list rows show a topic pill + `read_time` (e.g. *"12 min read"*) above the title (`knowledgebase/index.vue`).

### US-S1.4 — Contact support when self-serve fails
**As a** Visitor **I want** a clear way to reach a human **so that** I'm not stuck if no article helps.
- **AC1** A "Still need help?" card offers **Start a chat** (primary) and **Email support** (secondary), with an
  expectation line ("replies within a few hours"). Bound block: contact card (`data-story="US-S1.4"`).
- **AC2** A secondary "Prefer video?" card links to the tutorials surface ([tutorials.html](../design-system/mockups/tutorials/tutorials.html)).
- **Copy (v1):** FAQ footer **"Still have questions?"** / *"Can't find the answer you're looking for? Please chat
  to our friendly team."* with a **"Get in touch"** button.
- **Open:** wire chat/email targets to the real support channel (v1 button was inert). FAQ accordion from
  `support/index.vue` may be folded in as a topic or a static block — spec the FAQ source when built.

---

## Epic S2 — Article detail (`/support/articles/:slug`)

> Mock: [article.html](../design-system/mockups/support/article.html). v1: `knowledgebase/[...slug].vue`
> (breadcrumb + topic pill + read time + title + prose + badge footer, all hard-coded).

### US-S2.1 — Read an article
**As a** Visitor **I want** a readable article with steps and context **so that** I can follow along and solve my problem.
- **AC1** A breadcrumb renders **Help Center / {Topic} / {Article}**, each segment linking up (Help Center and
  Topic → [support.html](../design-system/mockups/support/support.html); current = non-link). Bound block: breadcrumb (`data-story="US-S2.1" data-ac="AC1"`).
- **AC2** `GET /support/articles/:slug` returns title, summary, topic (name + slug), `read_time`, and
  `updated_at`; the header shows the title, summary, a topic pill + read-time pill, and a meta row
  **"Updated {MMM D, YYYY} · {N} min read"**. Bound block: title/meta (`data-story="US-S2.1" data-ac="AC2"`).
- **AC3** The article `body` (sanitized HTML) renders as prose: headings (`<h2>`), numbered steps, paragraphs,
  a callout/tip block, code snippets, and figures. Bound block: prose body (`data-story="US-S2.1" data-ac="AC3"`).
- **Copy (v1):** title *"Thank You Email"*, meta pill *"Dashboard · 12 min read"*, breadcrumb *Campaign ›
  Thank You Email*, badge footer `Campaign / Email / Thank You`.
- **Fix-on-rebuild:** v1 breadcrumb, pills, badges, and body were **static literals** in the Vue file (the
  `[...slug]` route ignored the slug entirely and always rendered the same article). v2 resolves real content
  by slug and 404s an unknown/unpublished slug.

### US-S2.2 — Give feedback ("Was this helpful?")
**As a** Visitor **I want** to mark whether an article helped **so that** the team can improve the docs.
- **AC1** A feedback row shows **"Was this helpful?"** with 👍 **Yes** / 👎 **No** buttons. Clicking either posts
  `POST /support/articles/:slug/feedback` with `{ helpful: true|false }` and shows an inline "Thanks for your
  feedback!" confirmation; buttons disable after voting. Bound block: feedback row (`data-story="US-S2.2" data-ac="AC1"`).
- **AC2** One vote per visitor per article (see Global rules); re-visiting shows the prior vote state, and a
  changed vote updates rather than duplicates. Aggregate helpful/unhelpful counts feed article quality metrics.
- **Open:** decide whether an optional free-text comment box opens on a 👎 vote (common pattern; not in v1 —
  v1 had no feedback at all).

### US-S2.3 — Discover related articles
**As a** Visitor **I want** links to nearby articles **so that** I can keep learning without going back to search.
- **AC1** A "Related articles" sidebar lists articles from the same topic (or explicitly linked), each with title,
  topic, and read time, linking to its detail page. Source: `GET /support/articles/:slug/related` (fallback:
  `GET /support/articles?topic=<slug>&exclude=<slug>`). Bound block: related list (`data-story="US-S2.3" data-ac="AC1"`).

### US-S2.4 — Contact support from the article
**As a** Visitor **I want** a contact card while reading **so that** I can escalate if the article didn't fully answer me.
- **AC1** A sticky "Still need help?" sidebar card mirrors US-S1.4 (Start a chat / Email support) so escalation is
  always in reach without scrolling back to the landing. Bound block: contact card (`data-story="US-S2.4" data-ac="AC1"`).

---

## Cross-cutting acceptance criteria
- **No tenant scope** on reads (global docs); the `TenantGuard` is not applied to `GET /support/*` list/read routes.
- **Published-only** filtering on every read; unknown/unpublished slug → 404.
- **Server-side search & topic filter** (fix-on-rebuild: v1 search was a dead form over static arrays).
- **Sanitized HTML** article bodies; no runtime Vue/template compilation of stored content.
- **Feedback idempotency**: one vote per visitor per article, upsert semantics, rate-limited.

## Traceability (story → primary v2 endpoint)

| Story | Endpoint |
| --- | --- |
| US-S1.1 | `GET /support/articles?q=` |
| US-S1.2 | `GET /support/topics`, `GET /support/articles?topic=` |
| US-S1.3 | `GET /support/articles?sort=popular` |
| US-S1.4 | support chat / email channel |
| US-S2.1 | `GET /support/articles/:slug` |
| US-S2.2 | `POST /support/articles/:slug/feedback` |
| US-S2.3 | `GET /support/articles/:slug/related` |
| US-S2.4 | support chat / email channel |
