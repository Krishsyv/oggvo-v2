# Social — Activity / Flow Diagrams

Mermaid flow diagrams for the social domain. They render natively in GitHub and VSCode
(Mermaid preview). Actor "lanes" are modelled with subgraphs
(Operator / Web / API / Worker / Scheduler / Provider).

Pairs with [user-stories.md](./user-stories.md) and the spec at
[`../feature-spec/social.md`](../feature-spec/social.md).

Index:
1. [Connect an account (OAuth)](#1-connect-an-account-oauth-us-12)
2. [Compose & publish a post](#2-compose--publish-a-post-us-21-22)
3. [Async publish via the social-publish queue](#3-async-publish-via-the-social-publish-queue-us-22-24)
4. [Schedule via the content planner calendar](#4-schedule-via-the-content-planner-calendar-us-32)
5. [Content-planner drip campaign](#5-content-planner-drip-campaign-us-41)
6. [Auto-share a review](#6-auto-share-a-review-us-26)
7. [Insights pull](#7-insights-pull-us-52)
8. [Post status state machine](#8-post-status-state-machine)
9. [Browse / filter the timeline + edit / delete / retry](#9-browse--filter-the-timeline--edit--delete--retry-us-31-us-23-25)
10. [Campaign history & cancel](#10-campaign-history--cancel-us-42-44)

---

## 1. Connect an account (OAuth) (US-1.2)

```mermaid
flowchart TD
    subgraph Operator
        A([Click Connect on a platform card])
    end
    subgraph Web
        A --> B[Redirect to provider OAuth consent]
    end
    subgraph Provider[Provider · FB / Google / LinkedIn / Twitter]
        B --> C[User authorizes]
        C --> D[Callback with code + state]
    end
    subgraph API[API · social/oauth]
        D --> E[Validate state]
        E --> F[Exchange code → token\nencrypt AES-GCM, store]
        F --> G{Provider?}
        G -- Facebook --> H[List /me/accounts pages\n+ derive IG business account\n+ subscribe page webhooks]
        G -- Google --> I[List accounts → locations\nawait location selection]
        G -- LinkedIn --> J[List pages/profile\nawait page selection]
        G -- Twitter --> K[Save member account]
        H --> L
        I --> L
        J --> L
        K --> L[Insert social_accounts row\nActive = true]
        L --> M[[connected successfully]]
    end
    M --> N([Card flips to Connected\n+ last-sync line])
```

---

## 2. Compose & publish a post (US-2.1, US-2.2)

```mermaid
flowchart TD
    subgraph Operator
        A([Open /social/create]) --> B[Pick platforms\n+ message + media]
        B --> C[Live preview per platform]
        C --> D{Schedule a future time?}
        D -- no --> E[Publish now]
        D -- yes --> F[Pick datetime\nfuture-only, profile TZ]
        E --> G[Submit]
        F --> G
    end
    subgraph API[API · social module]
        G --> H[Scope to profileId]
        H --> I[Validate per platform:\ntext limit, IG ≥1 media,\nGoogle 1 image, Twitter ≤4]
        I -- errors --> J[[422 messages keyed by platform]]
        I -- ok --> K[Insert one social_posts row\nper platform × media]
        K --> L{Schedule set?}
        L -- yes --> M[status = scheduled]
        L -- no --> N[status = queued]
        M --> O
        N --> O[Enqueue social-publish job]
        O --> P[[201 created]]
    end
    J -.-> B
    P --> Q([Redirect /social + success toast])
```

---

## 3. Async publish via the social-publish queue (US-2.2–2.4)

```mermaid
flowchart TD
    subgraph Worker[Worker · social-publish queue]
        A([Job ready\nimmediate or at scheduled time]) --> B[Acquire job lock\nno -2 sentinel / 10-min heuristic]
        B --> C[Load post + media + account token]
        C --> D[Call per-platform provider]
    end
    subgraph Provider
        D --> E{Publish ok?}
    end
    subgraph Worker2[Worker · stamp result]
        E -- yes --> F[status = published\nset URL + socialId]
        E -- no --> G{attempts < max?}
        G -- yes --> H[status stays queued\nattempts++ , set nextAttemptAt\nre-enqueue with backoff]
        G -- no --> I[status = failed\nset failureReason]
        F --> J[Mirror status to\nsocial_campaign_posts if campaign]
        I --> J
    end
    H -.->|retry tick| A
    subgraph Operator
        J --> K([Timeline shows badge:\npublished / failed])
        I --> L([Retry action available])
        L --> M[POST /social/posts/:id/retry] --> A
    end
```

---

## 4. Schedule via the content planner calendar (US-3.2)

```mermaid
flowchart LR
    subgraph Web[Content planner]
        A([Open /social/planner]) --> B[GET /social/posts?status=scheduled]
        B --> C[Render week/month grid\nchips colored by platform]
        C --> D[Side list: upcoming posts]
        C --> E[Insights mini-chart]
    end
    subgraph API
        B --> F[Scope to profileId\nstatus = scheduled]
        F --> G[Group by scheduled date]
        G --> B
    end
    subgraph Operator
        D --> H{Click a chip}
        H --> I([Open /social/edit/:id])
        I --> J[Reschedule → re-queue\nsee diagram #3]
    end
```

---

## 5. Content-planner drip campaign (US-4.1)

```mermaid
flowchart TD
    subgraph Operator
        A([Open /social/content-planner/create]) --> B[Pick preset + duration\n+ platforms + min rating\n+ style params + description]
        B --> C[postsToSchedule =\ndates × platforms]
        C --> D[Submit]
    end
    subgraph API[API · social/campaigns]
        D --> E[Scope to profileId]
        E --> F[Select N un-posted reviews\nscore ≥ min_rating,\nnot in a pending campaign]
        F --> G[Create social_campaigns row\nUUID match /^[a-f0-9]{16}$/]
        G --> H[Create social_campaign_posts:\none per review × social\nwith scheduleDate from preset×range]
        H -- text errors --> I[[422 messages keyed by platform]]
        H --> J[Enqueue post-automator job]
        J --> K[[201 created]]
    end
    subgraph Worker[Worker · post-automator queue]
        K --> L[Generate branded testimonial\nper campaign post]
        L --> M[Hand off to social-publish\nat each scheduleDate → diagram #3]
        M --> N[Update processed / rate]
    end
    K --> O([Redirect to campaign history])
```

---

## 6. Auto-share a review (US-2.6)

```mermaid
flowchart TD
    subgraph Operator
        A([Open testimonial composer\n?review=id]) --> B[Pick platforms\n+ style params + description tokens]
        B --> C[Live iframe preview]
        C --> D{Schedule?}
        D -- no --> E[Post now]
        D -- yes --> F[Pick datetime]
        E --> G[Share]
        F --> G
    end
    subgraph API[API · reviews share → social publisher]
        G --> H[Step 1: render image\nGET /reviews/:id/image?params\ncache it]
        H --> I[Step 2: POST /reviews/:id/share\nsocials, reviewMessage, params]
        I --> J[Replace tokens\nlink / rating / platform / page]
        J --> K[Insert social_posts rows\nstatus = queued]
        K --> L[Enqueue social-publish]
        L --> M[[published[] , failed{}]]
    end
    M --> N([Per-platform success / error toasts])
```

> Auto-share opt-out platforms live in `platform_whitelist` (a *deactivated* list — rename in v2).

---

## 7. Insights pull (US-5.2)

```mermaid
flowchart TD
    subgraph Scheduler
        A([Scheduled tick]) --> B[For each connected\npostable account]
    end
    subgraph Worker[Worker · insights job]
        B --> C[Call platform insights API\nimpressions / engagement / clicks]
        C --> D{Token valid?}
        D -- no --> E[Auto-deactivate account\nmark Not connected]
        D -- yes --> F[Upsert social_insights\nper post + account]
        F --> G[Roll up followers + engagement]
    end
    subgraph Web
        G --> H([Accounts insights strip])
        G --> I([Statistics overview chart\nGET /social/analytics/overview-chart])
    end
```

> Schema gap: `social_insights` has **no v1 source** — define metrics, source APIs, and cadence first.

---

## 8. Post status state machine

```mermaid
stateDiagram-v2
    [*] --> queued: create (publish now)
    [*] --> scheduled: create (future time)
    scheduled --> queued: scheduled time reached
    queued --> published: provider success (URL + socialId)
    queued --> queued: transient failure (attempts++, backoff)
    queued --> failed: attempts exhausted (failureReason)
    failed --> queued: retry / edit re-queue
    scheduled --> queued: edit re-queue
    queued --> [*]: delete (attempt upstream removal)
    published --> [*]: delete (attempt upstream removal)
    failed --> [*]: delete

    note right of queued
        Claimed by social-publish via
        BullMQ job lock — not the v1
        -2 sentinel + 10-min heuristic.
    end note
    note right of published
        IG delete is a no-op stub →
        explicit warning returned.
    end note
```

> Open question: v2 normalizes v1's bit-sum statuses (`-1/0/1/-2`) into the explicit enum
> `failed/queued/scheduled/published`; campaign posts mirror their post status back into
> `social_campaign_posts` on publish/delete.

---

## 9. Browse / filter the timeline + edit / delete / retry (US-3.1, US-2.3–2.5)

```mermaid
flowchart TD
    subgraph Web[Timeline /social]
        A([Open /social]) --> B[GET /social/posts\npage, query, status[], platforms[], dates[]]
        F[Change a filter] -->|debounced ~1s, page→1| B
        S[Scroll to bottom] -->|page < pages| B
        V[Toggle List/Grid] -->|cookie| R
    end
    subgraph API
        B --> C[Scope to profileId]
        C --> D[Explicit enum filter\n failed/queued/scheduled/published\n NOT v1 bit-sum]
        D --> E[Order by schedule ?? createdAt DESC, paginate]
        E --> R[Render cards / skeleton / empty 'No posts']
    end
    subgraph Operator
        R --> G{Row action?}
        G -->|Edit| H[Open Edit modal\n status in queued/scheduled/failed\n platform immutable]
        H --> H1[PUT /social/posts/:id\n re-validate + re-queue → diagram #3]
        G -->|Delete| I[Confirm → DELETE /social/posts/:id]
        I --> I1{published & still connected?}
        I1 -- yes --> I2[Attempt upstream removal\n IG = no-op → warning]
        I1 -- no --> I3[Remove from Oggvo only]
        G -->|Retry failed| J[POST /social/posts/:id/retry\n status→queued, clear failureReason]
        J --> H1
    end
```

> Edit/Retry are spec-authoritative (§3–§5); the v1 post card surfaced only View + Delete — confirm the v1 surface when porting.

---

## 10. Campaign history & cancel (US-4.2, 4.4)

```mermaid
flowchart TD
    subgraph Web[Content planner]
        A([Open /social/content-planner]) --> B[GET /social/campaigns?status=&page=]
        B --> C[Status TabBar:\n all/Generating/Running/Completed/Cancelled]
        C --> D[Table: id, date, status,\n processed/total, rate% progress]
        D --> E{Row action?}
        E -->|Browse Posts| F([/social/content-planner/:uuid\n grouped, read-only])
        E -->|Cancel| G[Confirm modal]
    end
    subgraph API
        G --> H[DELETE /social/campaigns/:uuid\n uuid matches /^[a-f0-9]{16}$/]
        H --> I[status → cancelled]
        I --> J[Delete queued social_posts rows]
        J --> K[Mirror statuses back to\n social_campaign_posts]
    end
    K --> L([Row badge → Cancelled])
```

> v1 quirk: the cancel modal is titled "Delete Post" and toasts "campaigns deleted successfully!" — normalize the copy in v2.
