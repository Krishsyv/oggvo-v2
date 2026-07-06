# Flow diagrams — cross-cutting & new-epic flows

Mermaid diagrams (render on GitHub/VS Code) for the flows introduced by the foundation that no
per-domain `activity-diagrams.md` covers. Per-domain flows stay in `docs/<domain>/activity-diagrams.md`;
known thin spots there: **media, referrals, support, tutorials** have no diagram file (small,
mostly-CRUD domains — add when their epics start, using the format of the other 13).

## 1. The send pipeline (every outbound message — PF-4/5/6/17)

```mermaid
flowchart LR
    A[Domain action<br/>campaign due · notify · broadcast] --> B{Eligibility<br/>engine}
    B -->|active + opted-in + tag-match<br/>+ reachable + not suppressed| C[(DB tx:<br/>state change + outbox row)]
    B -->|excluded| X1[skip — reason logged]
    C --> D[Relay drains outbox] --> E[[BullMQ queue]]
    E --> F[Worker: idempotency-key check]
    F -->|already processed| X2[ack, no-op]
    F --> G{PF-17 gates:<br/>quiet hours · STOP · suppression}
    G -->|blocked| H[reschedule + ledger row 'blocked']
    G --> I[Provider gateway send]
    I --> J[(notification_deliveries<br/>ledger row: app-level result)]
    J -->|provider-confirmed| K[mark sent]
    J -->|failed| L{Error taxonomy}
```

## 2. Provider error taxonomy (AD-13 — the Zillow-incident fix)

```mermaid
flowchart TD
    E[Gateway call fails] --> C{Classify}
    C -->|transient<br/>network, 5xx, decode| R[retry w/ backoff<br/>max N, then DLQ + alarm]
    C -->|rate_limited| RL[requeue at provider-specific<br/>backoff window]
    C -->|terminal<br/>non-idempotent publish| T[mark failed · NO auto-retry<br/>user gets 'Retry post' BF-044]
    C -->|auth_revoked<br/>only this one!| D[deactivate connection<br/>+ notify owner to reconnect]
```

## 3. Billing & entitlements (AD-14)

```mermaid
sequenceDiagram
    participant O as Owner
    participant W as apps/web
    participant A as API (billing)
    participant S as Stripe
    O->>W: pick plan
    W->>A: create checkout session
    A->>S: Checkout/Billing portal
    S-->>A: webhook: subscription created/updated/failed
    A->>A: verify signature · idempotent by event id (PF-8)
    A->>A: upsert subscriptions + materialize entitlements
    Note over A: guards & workers read LOCAL entitlements —<br/>never Stripe on the request path
    S-->>A: payment_failed → smart retries
    A->>A: grace state → feature suspension (data kept)
```

## 4. Team invite lifecycle (TEAM epic)

```mermaid
stateDiagram-v2
    [*] --> invited: TEAM-1.1 owner invites (role, email)
    invited --> invited: re-invite (token replaced)
    invited --> expired: 7-day TTL
    invited --> active: accept — existing account
    invited --> activating: accept — new account
    activating --> active: password set (AUTH activation)
    active --> role_changed: owner changes role (next-request effect)
    role_changed --> active
    active --> removed: owner removes → sessions revoked for profile
    expired --> [*]
    removed --> [*]
```

## 5. Toll-free verification state machine (TFV / AD-15)

```mermaid
stateDiagram-v2
    [*] --> draft: eligible + flag on
    draft --> submitted: Twilio embeddable form submitted
    submitted --> needs_correction: rejection w/ reasons
    needs_correction --> submitted: TFV-1.4 resubmit
    submitted --> approved
    submitted --> rejected
    approved --> sending_enabled: number assigned (TFV-1.6)
    note right of submitted
        status source of truth = poll job
        (webhook is a hint — v1 event
        streams were silently broken)
    end note
    sending_enabled --> [*]: deactivate ALWAYS resets local state
    rejected --> [*]
```

## 6. Provider disconnect / reconnect lifecycle (INT — PF-2/PF-5)

```mermaid
stateDiagram-v2
    [*] --> connected: OAuth connect (captures provider user id!)
    connected --> grace: user disconnects OR Meta data-deletion callback
    note right of grace
        one tx: revoke token · soft-delete
        connection + ALL children as a set
        (reviews, posts, insights, threads)
    end note
    grace --> connected: reconnect within window → RESTORE row + children (never duplicate)
    grace --> purged: grace window ends → hard-delete via purge job
    purged --> [*]
```

## 7. Media reference-counted delete (MEDIA — PF-10)

```mermaid
flowchart TD
    D[DELETE /media/:id] --> Q{media_references<br/>count for id}
    Q -->|> 0| R[409 + list of usages<br/>feature, entity links]
    Q -->|= 0| S[soft-delete row] --> P[purge job after grace:<br/>S3 delete + hard delete]
    A[any feature attaches media] -.same tx.-> W[(media_references row)]
    B[any feature detaches] -.same tx.-> X[remove reference row]
```

## 8. v1 profile migration & cutover (MIGR — unscheduled)

```mermaid
flowchart LR
    P[pending] --> M[migrated<br/>MIGR-1.1 ETL, idempotent]
    M --> V{validated?<br/>MIGR-1.2 aggregate diff}
    V -->|mismatch| E[exceptions report → fix mapping → re-run]
    E --> M
    V -->|match| C[cut-over: v1 read-only ·<br/>webhooks re-pointed · v2 sends on]
    C --> O[observed N days]
    O -->|issue| RB[rollback: v2 sends off · v1 writable]
    O -->|clean| DONE[done]
```
