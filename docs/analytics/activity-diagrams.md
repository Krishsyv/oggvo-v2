# Analytics & Dashboard — Activity / Flow Diagrams

Mermaid flow diagrams for the analytics & dashboard domain. They render natively in GitHub and VSCode
(Mermaid preview). Actor "lanes" are modelled with subgraphs (Operator / Web / API / Ingestion).

Pairs with [user-stories.md](./user-stories.md) and the spec at
[`../feature-spec/analytics-dashboard.md`](../feature-spec/analytics-dashboard.md).

Index:
1. [Dashboard load + tab aggregation](#1-dashboard-load--tab-aggregation-us-11-21-31)
2. [Date-range refresh (chart only)](#2-date-range-refresh-chart-only-us-12-22)
3. [Per-widget data fetch (funnel tab fan-out)](#3-per-widget-data-fetch-funnel-tab-fan-out-us-11-14)
4. [Connect tab permission gate](#4-connect-tab-permission-gate-us-31)
5. [Modify goals (targets upsert)](#5-modify-goals-targets-upsert-us-52)
6. [Activity log drill-down](#6-activity-log-drill-down-us-41)

---

## 1. Dashboard load + tab aggregation (US-1.1, 2.1, 3.1)

```mermaid
flowchart TD
    subgraph Operator
        A([Open /dashboard])
    end
    subgraph Web
        A --> B[Resolve active tab\nfrom route]
        B --> C{Which tab?}
        C -- Review Funnel --> D[Funnel widget set]
        C -- Social Media --> E[Social widget set]
        C -- Oggvo Connect --> F[Connect widget set]
        C -- Activity --> G[Activity table]
    end
    subgraph API[API · analytics module]
        D --> DF[GET /analytics/dashboard/funnel?month=]
        E --> EF[GET /analytics/dashboard/social?month=]
        F --> FG{caller has sms?}
        FG -- no --> FU[[403 → Upgrade prompt]]
        FG -- yes --> FF[GET /analytics/dashboard/connect?range=]
        G --> GF[GET /analytics/activity?page=1]
        DF --> S[Scope to profileId\nAggregate across review +\ninvite_scheduler/campaign tables]
        EF --> S
        FF --> S
        GF --> S
        S --> R[[Return KPIs + goals]]
    end
    R --> Z[Render KPI cards + charts\nor skeleton / empty states]
```

---

## 2. Date-range refresh (chart only) (US-1.2, 2.2)

```mermaid
flowchart LR
    subgraph Operator
        A[Pick range tab\n1M / 3M / 6M / 12M] 
        B[Or set inline date range]
    end
    subgraph Web
        A --> C[Update range state]
        B --> C
        C -->|throttled ~1s| D[Re-fetch CHART only\nKPI cards unchanged]
    end
    subgraph API
        D --> E[GET /analytics/dashboard/*/chart?from=&to=\nor ?range=]
        E --> F[Normalize from <= date <= to\nDrizzle bindings, no string interp]
        F --> G[Aggregate per-day/per-month buckets\nin profile timezone]
        G --> H[[timeline + metrics]]
    end
    H --> I[Redraw series + range label]
```

> Fix-on-rebuild: conventional `from <= date <= to` (v1 inverted), parameterized (v1 interpolated), profile-tz buckets (v1 raw DB dates).

---

## 3. Per-widget data fetch (funnel tab fan-out) (US-1.1–1.4)

```mermaid
flowchart TD
    subgraph Web[Review Funnel tab]
        A([Tab mounts]) --> B[Issue parallel widget fetches]
    end
    subgraph API
        B --> C[GET /analytics/dashboard/funnel?month=\n→ KPI cards + goals]
        B --> D[GET /analytics/dashboard/funnel/chart?from=&to=\n→ reviews-over-time + requests-vs-reviews]
        B --> E[GET /analytics/reviews/by-channel?from=&to=\n→ top 4 sites + Other]
        B --> F[GET /analytics/reviews/rating-distribution?from=&to=\n→ 5★..1★ counts + avg]
        C --> G[All scoped to profileId]
        D --> G
        E --> G
        F --> G
    end
    G --> H[Render: KPI cards · area chart ·\ndoughnut+legend · horizontal bars]
    H --> I{any widget count = 0?}
    I -- yes --> J[Show that widget's empty state\nothers still render]
    I -- no --> K[All populated]
```

> Fix-on-rebuild: v1 fans out independent stats+chart+goals calls per tab (N+1). Consider one consolidated per-tab endpoint in v2.

---

## 4. Connect tab permission gate (US-3.1)

```mermaid
flowchart TD
    subgraph Web
        A([Open /dashboard/connect]) --> B{permissions.sms?}
        B -- no --> C[Render lock icon +\nUpgrade Plan prompt\nNO endpoint called]
        B -- yes --> D[Fetch connect stats + goals]
    end
    subgraph API
        D --> E[RequirePermission 'sms' guard]
        E -- fails --> F[[403]]
        E -- passes --> G[GET /analytics/dashboard/connect/goals?date=]
        E -- passes --> H[GET /analytics/dashboard/connect?range=]
        G --> I[Scope to profileId\nAggregate messaging/chat tables]
        H --> I
        I --> J[[connections + SMS/Web split + tiles]]
    end
    F -.-> C
    J --> K[Render 5 KPI tiles + SMS/Web stacked bar]
```

> Fix-on-rebuild: gate is enforced server-side (v1 RBAC was client-only). "AI Used" hardcoded 0% card must be wired or removed.

---

## 5. Modify goals (targets upsert) (US-5.2)

```mermaid
flowchart TD
    subgraph Operator
        A([Click Modify Goals]) --> B[Edit goal quantity inputs\nfor the active tab]
        B --> C[Submit]
    end
    subgraph API[API · monthly-targets]
        C --> D[Scope to profileId\nkey by (profileId, YYYY-MM)]
        D --> E{Row for that month exists?}
        E -- yes --> F[UPDATE row]
        E -- no --> G[INSERT row]
        F --> H[[200 updated — idempotent]]
        G --> H
    end
    H --> I[Emit 'updated' → toast]
    I --> J[Re-fetch active tab stats\n→ progress bars re-measure]
```

---

## 6. Activity log drill-down (US-4.1)

```mermaid
flowchart LR
    subgraph Operator
        A([Open /dashboard/activity])
        S[Type search / pick filters / dates] -->|page→1, throttled ~1s| B
    end
    subgraph Web
        A --> B[GET /analytics/activity?\npage,perpage,from,to,types,names,search]
    end
    subgraph API
        B --> C[Scope to profileId\nServer-side filter + paginate]
        C --> D[Join recipient + campaign + activity\nrender activityDate in profile tz]
        D --> E[[activities[] + meta.pages]]
    end
    E --> F{rows?}
    F -- none --> G[Show 'No Activity Found']
    F -- some --> H[Render rows:\nRecipient · Request Type badge ·\nActivity badges + interactions pill ·\nSchedule · Via]
    H --> I([Click a recipient row])
    I --> J[Drill into recipient detail\n+ full interaction history]
```

> Fix-on-rebuild: consolidate the v1 top-level `/activity` stub and mobile-only `/dashboard/activity-history` static page into this one view; convert `activityDate` UTC→profile-tz via a single tz boundary.
