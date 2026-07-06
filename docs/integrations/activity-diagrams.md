# Integrations & OAuth Vault — Activity / Flow Diagrams

Mermaid flow diagrams for the integrations domain. They render natively in GitHub and VSCode
(Mermaid preview). Actor "lanes" are modelled with subgraphs
(Operator / Web / API / Worker / Scheduler / **Provider**).

Pairs with [user-stories.md](./user-stories.md) and the spec at
[`../feature-spec/integrations-oauth.md`](../feature-spec/integrations-oauth.md).

Index:
1. [OAuth connect (authorize → callback → encrypted token store)](#1-oauth-connect-us-21-22)
2. [Provider sub-selection (pages / locations / orgs)](#2-provider-sub-selection-us-23)
3. [Scheduled token refresh](#3-scheduled-token-refresh-us-31)
4. [Disconnect & revoke (provider teardown)](#4-disconnect--revoke-us-41)
5. [Inbound webhook ingest (signature → enqueue → import)](#5-inbound-webhook-ingest-us-51-52)
6. [Connection status state machine](#6-connection-status-state-machine)

---

## 1. OAuth connect (US-2.1, US-2.2)

```mermaid
flowchart TD
    subgraph Operator
        A([Click Connect on a card])
        R([Redirected back to redirect page])
    end
    subgraph Web
        A --> B[Request authorize URL]
        R --> S[POST returned code/params\nto callback]
    end
    subgraph API[API · integrations service]
        B --> C[Build provider authorize URL\nscopes + signed state = profileId]
        C --> D[[302 to Provider]]
        S --> H{state valid?\nHMAC param ok? Shopify}
        H -- no --> HX[[401 reject]]
        H -- yes --> I[Exchange code → tokens]
    end
    subgraph Provider
        D --> E[Operator authorizes\n+ grants scopes]
        E --> F{all required\nscopes granted?}
        F -- no --> FX[redirect with error]
        F -- yes --> G[redirect with code]
        I --> J[Return access/refresh tokens]
        J --> K[Return account display name]
    end
    FX -.-> R
    G -.-> R
    K --> L{required scopes\npresent on token?}
    L -- no --> LX[[Fail: Missing required permissions]]
    L -- yes --> M[Delete prior rows\nsame profile+provider+extId]
    M --> N[AES-GCM encrypt tokens]
    N --> O[Insert social_accounts row\n+ vault row encrypted]
    O --> P{provider registers\nwebhooks on connect?}
    P -- yes --> Q[Register provider webhooks\nPAM/Clio x3/FUB x12/FB subscribe]
    P -- no --> T
    Q --> T[[200 · card = Connected]]
```

> Fix-on-rebuild: tokens are AES-GCM encrypted, never plaintext; `state` is verified (CSRF);
> Shopify HMAC is enforced and the shop stored per-connection.

---

## 2. Provider sub-selection (US-2.3)

```mermaid
flowchart TD
    subgraph API[API · after token exchange]
        A[Temp token row stored] --> B{provider}
    end
    subgraph Provider
        B -- Meta --> C[List managed pages /me/accounts]
        C --> D[Per page: discover\ninstagram_business_account]
        B -- LinkedIn --> E[List member + admin'd orgs]
        B -- Google --> F[List accounts + locations]
    end
    subgraph Operator
        D --> G([Pick page(s)])
        E --> H([Pick org(s)])
        F --> I([Pick location])
    end
    subgraph Persist[API · integrations]
        G --> J[Insert social_accounts per page\n+ separate instagram row if IG-scoped]
        H --> K[Insert row per chosen org URN\ndelete temp token row]
        I --> L[Write location pageID + review URI\n+ place_id onto profile]
        J --> M[[Connections saved]]
        K --> M
        L --> M
    end
```

---

## 3. Scheduled token refresh (US-3.1)

```mermaid
flowchart TD
    subgraph Scheduler
        A([Periodic tick]) --> B[Select vault rows where\nexpiresAt within lead window]
    end
    subgraph Worker[Worker · token-refresh]
        B --> C[For each connection]
        C --> D{provider has\nrefresh grant?}
        D -- no --> N
        D -- yes --> E[Decrypt refresh token]
        E --> F[Call provider refresh grant]
    end
    subgraph Provider
        F --> G{refresh ok?}
    end
    G -- yes --> H[Re-encrypt new tokens\nupdate expiresAt]
    H --> I[status = Connected]
    G -- no --> J{Google · sibling\nshares user_id?}
    J -- yes --> K[Reuse sibling refresh token]
    J -- no --> M[status = Needs re-auth\nrevoke if Google]
    K --> H
    I --> N
    M --> N[Next connection]
    N --> C
    C -->|done| O[[Tokens current\nor flagged needs-reauth]]
```

> Replaces v1's opportunistic inline refresh. Clio's 30-day webhook expiry is renewed on the same cadence.

---

## 4. Disconnect & revoke (US-4.1)

```mermaid
flowchart TD
    subgraph Operator
        A([Click Disconnect on a card]) --> B([Confirm in modal])
    end
    subgraph API[API · integrations service]
        B --> C[DELETE /integrations/connections/:id]
        C --> D{owned by\ncaller profileId?}
        D -- no --> DX[[403]]
        D -- yes --> E[Decrypt tokens for teardown]
        E --> F{provider teardown}
    end
    subgraph Provider
        F -- Stripe --> G[OAuth deauthorize]
        F -- Google --> H{sibling shares\nuser_id?}
        H -- no --> H2[revoke token]
        H -- yes --> H3[keep shared token]
        F -- PAM --> I[Feed/Unsubscribe]
        F -- Clio --> J[Delete all webhooks]
        F -- FUB --> K[Delete 12 webhooks]
        F -- Facebook --> L[Unsubscribe page]
    end
    G --> M
    H2 --> M
    H3 --> M
    I --> M
    J --> M
    K --> M
    L --> M[Best-effort: log provider failures]
    M --> N[Soft-delete row\nwipe encrypted vault secrets]
    N --> O[[200 · card = Not connected]]
```

> Teardown is best-effort: a provider-side failure is logged but the local disconnect still completes.

---

## 5. Inbound webhook ingest (US-5.1, US-5.2)

```mermaid
flowchart TD
    subgraph Provider
        A([Event fired]) --> B[POST /webhooks/:provider]
    end
    subgraph API[API · webhook receiver · thin]
        B --> C{Clio first request?\nX-Hook-Secret handshake}
        C -- yes --> CX[[Echo secret · enable webhook]]
        C -- no --> D{verify signature}
        D -- invalid --> DX[[401 reject]]
        D -- valid --> E{event id already\nprocessed?}
        E -- yes --> EX[[200 · idempotent skip]]
        E -- no --> F[Record event id]
        F --> G[Enqueue to\nwebhook-ingest queue]
        G --> H[[200 fast]]
    end
    subgraph Worker[Worker · webhook-ingest]
        H --> I{event type}
        I -- payment/order/customer --> J[Resolve customer\nby extId / order]
        J --> K[Dedup phone/email per profile]
        K --> L[Import → contacts\nsource = provider]
        I -- Meta message --> M[Append to messaging inbox]
        M --> N[Enqueue media-process\navatar download]
        N --> O[Enqueue sender\nkeyword auto-response]
        L --> P[Update connection lastSyncedAt]
        O --> P
        P --> Q[[Done]]
    end
```

> Fix-on-rebuild: signature verification enforced for **all** providers (incl. Square / Twilio SMS /
> Shopify); event-id idempotency rejects replays; processing is async so the 200 returns fast.

---

## 6. Connection status state machine

```mermaid
stateDiagram-v2
    [*] --> NotConnected
    NotConnected --> Connected: connect (OAuth/API key/lookup)\ntokens encrypted + stored
    Connected --> Connected: scheduled refresh ok\n/ webhook event (lastSyncedAt)
    Connected --> NeedsReauth: refresh failed / token expired\n/ LinkedIn 60d / scope revoked
    NeedsReauth --> Connected: reconnect (re-run OAuth)\nre-register lapsed webhooks
    Connected --> Error: webhook signature/handshake failing
    Error --> Connected: reconnect / fix
    Connected --> NotConnected: disconnect (teardown + soft-delete)
    NeedsReauth --> NotConnected: disconnect
    Error --> NotConnected: disconnect

    note right of NeedsReauth
        Card flips to warning + Reconnect CTA.
        Connection is NOT deleted on refresh failure.
    end note
    note right of Connected
        Secrets AES-GCM encrypted in vault,
        never returned by GET /connections.
    end note
```
