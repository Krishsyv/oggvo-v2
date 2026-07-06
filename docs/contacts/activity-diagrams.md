# Contacts — Activity / Flow Diagrams

Mermaid flow diagrams for the contacts domain. They render natively in GitHub and VSCode
(Mermaid preview). Actor "lanes" are modelled with subgraphs (Operator / Web / API / Worker / Scheduler).

Pairs with [user-stories.md](./user-stories.md) and the spec at
[`../feature-spec/contacts.md`](../feature-spec/contacts.md).

Index:
1. [Create a contact](#1-create-a-contact-us-21)
2. [Activate a contact (scheduling side-effects)](#2-activate-a-contact-us-31)
3. [Browse / search / filter the list](#3-browse--search--filter-us-11-15)
4. [Async CSV import](#4-async-csv-import-us-51-53)
5. [Daily auto-activation job](#5-daily-auto-activation-job-us-71)
6. [Pause / resume campaigns](#6-pause--resume-campaigns-us-72)
7. [Contact lifecycle state machine](#7-contact-lifecycle-state-machine)

---

## 1. Create a contact (US-2.1)

```mermaid
flowchart TD
    subgraph Operator
        A([Open /contacts/create]) --> B[Fill form:\nname, phone/email, tags, note, dates, opt-in]
        B --> C[Submit]
    end
    subgraph API[API · contacts module]
        C --> D{First OR Last name?\nAND Phone OR Email?}
        D -- no --> E[[422 field errors]]
        D -- yes --> F[Normalize phone to digits]
        F --> G{Email/Phone unique\nin profile, non-deleted?}
        G -- no --> E
        G -- yes --> H{Email passes\nblacklist?}
        H -- no --> I[Force optIn = false\n+ tag 'invalid']
        H -- yes --> J[optIn as submitted]
        I --> K
        J --> K[Insert contact\nstatus = Pending, source = manual]
        K --> L[Upsert tags →\ncontact_tags + assignments]
        L --> M[Fire recipient_edited]
        M --> N[[201 created]]
    end
    E -.-> B
    N --> O([Redirect /contacts + success toast])
```

---

## 2. Activate a contact (US-3.1)

```mermaid
flowchart TD
    subgraph Operator
        A([Click Activate / Restart / bulk Activate])
    end
    subgraph API[API · contacts service]
        A --> B[Re-check ownership per id]
        B --> C{optIn = true?}
        C -- no --> Z[[Skip: not activatable]]
        C -- yes --> D[status = Active\nactivatedAt = now]
        D --> E[Cancel pending schedules]
        E --> F[Find active campaigns\nmatching Target/Exclude tags]
        F --> G{For each campaign:\nSMS type?}
        G -- yes --> H{Profile has SMS\nnumber/SID/token?}
        H -- no --> I[Skip this campaign]
        H -- yes --> J
        G -- no --> J[Compute scheduledDate\nfrom profile TZ + daily time + Delay]
        J --> K{Delay = 0 AND\ntime already passed today?}
        K -- yes --> L[Push to tomorrow]
        K -- no --> M[Schedule today]
        L --> N
        M --> N[Enqueue scheduled send]
        I --> N
        N --> O[[200 + refresh list/profile/count]]
    end
```

> Fix-on-rebuild: timezone comes from the **profile**, never a hardcoded `America/Los_Angeles`.

---

## 3. Browse / search / filter (US-1.1–1.5)

```mermaid
flowchart LR
    subgraph Web
        A([Load /contacts]) --> B[Read params from URL\n+ sessionStorage]
        B --> C[GET /contacts?sort,dir,page,perpage,\nquery,status,date_added_range]
        I[User types in search] -->|debounced, page→1| C
        J[User clicks status tab] -->|page→1| C
        K[User changes date range] --> C
        L[User clicks sortable header] --> C
    end
    subgraph API
        C --> D[Scope to profileId\nStatus != Deleted]
        D --> E{query present?}
        E -- yes --> F[Match name/phone/email/tags]
        E -- no --> G[All in scope]
        F --> H
        G --> H[Apply status + date cutoff]
        H --> M[Join last-activity read model\nNOT a per-row subquery]
        M --> N[Offset paginate]
        N --> O[[data[], page, total, pages]]
    end
    O --> P[Render table / skeleton / empty state]
    P --> Q[Persist params + scroll to sessionStorage]
```

---

## 4. Async CSV import (US-5.1–5.3)

```mermaid
flowchart TD
    subgraph Operator
        A([Open import modal]) --> B[Pick .csv + name list\n+ map columns + toggles]
        B --> C[Client preview: parse first ~10 rows]
        C --> D[Submit]
    end
    subgraph API[API · contact-imports]
        D --> E{Name unique\nper profile?}
        E -- no --> F[[422]]
        E -- yes --> G[Create contact_imports row\nstatus = queued]
        G --> H[Enqueue contacts-import job\nwith mapping + toggles]
        H --> I[[201 created]]
    end
    subgraph Worker[Worker · contacts-import queue]
        I --> J[status = in_progress]
        J --> K[For each row batch]
        K --> L{Valid identity\n+ unique?}
        L -- duplicate --> M{UpdateData on?}
        M -- yes --> N[Enrich: union tags,\nfill empty birthday/anniv/note]
        M -- no --> O[Record duplicated]
        L -- invalid --> P[Record failed + reason]
        L -- valid --> Q[Insert contact\nPending or Inactive if MakeInactive]
        N --> R
        O --> R
        P --> R
        Q --> R[Write per-row outcome\n→ contact_import_rows]
        R --> K
        K -->|done| S[Update counts:\nimported/duplicate/failed]
        S --> T[status = completed\nor failed on exception]
    end
    subgraph OperatorReview[Operator]
        T --> U([View /contacts/imports])
        U --> V[Refresh list shows counts + status]
        V --> W([Open import detail])
        W --> X[Tabs Imported/Duplicate/Failed\n+ search + Download xlsx]
    end
```

> Schema gap: `contact_import_rows` (per-row outcomes) is not in the v2 schema yet.

---

## 5. Daily auto-activation job (US-7.1)

```mermaid
flowchart TD
    subgraph Scheduler
        A([Daily tick]) --> B[For each profile where\nAutoActivateRecipients = on]
        B --> C{Now == TimeActivateRecipients\nin profile timezone?}
        C -- no --> Z[Wait]
        C -- yes --> D[Select up to AutoActivateLimit\n(max 500) Pending/Inactive contacts]
    end
    subgraph Worker
        D --> E[For each selected contact]
        E --> F[Run activation flow\n→ diagram #2]
        F --> E
        E -->|done| G[[Contacts enrolled + scheduled]]
    end
```

---

## 6. Pause / resume campaigns (US-7.2)

```mermaid
flowchart TD
    subgraph Web[Contacts list banner]
        A[Derive banner state] --> B{CampaignsPaused?}
        B -- yes --> C[Orange: Campaigns paused\nshow Resume]
        B -- no --> D{active count > 0?}
        D -- yes --> E{AutoActivate on?}
        E -- yes --> F[Green: Campaigns active]
        E -- no --> G[Yellow: New activations paused]
        D -- no --> H[Gray: Campaigns dormant]
    end
    subgraph PauseAction[Operator action]
        C --> R[Click Resume] --> RR[POST /profiles/resume-campaigns]
        F --> P[Click Pause Campaigns] --> PC{count > 0?}
        G --> P
        PC -- no --> PD[Button disabled]
        PC -- yes --> PM[Confirm modal] --> PP[POST /profiles/pause-campaigns]
        PP --> PS[Halt pending sends\nstatus UNCHANGED]
        RR --> RS[Re-enable pending sends]
    end
    PS --> R1[Refresh banner + list + count]
    RS --> R1
```

---

## 7. Contact lifecycle state machine

```mermaid
stateDiagram-v2
    [*] --> Pending: create (manual)\nor import (default)
    [*] --> Inactive: import w/ MakeInactive
    Pending --> Active: activate (optIn=true)
    Inactive --> Active: activate / auto-activate
    Active --> Active: restart (re-schedule)
    Active --> Inactive: deactivate / bounce
    Pending --> Inactive: deactivate
    Active --> Deleted: delete (soft)
    Pending --> Deleted: delete (soft)
    Inactive --> Deleted: delete (soft)
    Deleted --> [*]: never hard-deleted

    note right of Active
        Activation: activatedAt=now,
        cancel + reschedule sends,
        profile timezone + daily time
    end note
    note right of Inactive
        Bounce path: optIn=false,
        tag 'Bounced', blacklist email,
        unschedule
    end note
```

> Open question: v2 `contact_status` enum (`pending/activated/bounced/unsubscribed/suppressed`) has no
> direct `inactive`/`deleted` value — map `Active→activated`, `Deleted→deletedAt`, and resolve
> `Inactive` before the Inactive tab + Restart ship.
</content>
