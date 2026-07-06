# Auth & Onboarding — Activity / Flow Diagrams

Mermaid flow + sequence diagrams for the auth & onboarding domain. They render natively in GitHub and
VSCode (Mermaid preview). Actor "lanes" are modelled with subgraphs / sequence participants
(Visitor / Web / API · auth / API · tenancy / DB (`auth_sessions`, `verifications`) / `email` worker).

Pairs with [user-stories.md](./user-stories.md) and the spec at
[`../feature-spec/auth-onboarding.md`](../feature-spec/auth-onboarding.md).

Index:
1. [Login + access/refresh issuance](#1-login--accessrefresh-issuance-us-11)
2. [Refresh-token rotation + reuse detection](#2-refresh-token-rotation--reuse-detection-us-12)
3. [Signup → email verification → activation](#3-signup--email-verification--activation-us-21-22)
4. [Forgot / reset password](#4-forgot--reset-password-us-14-15)
5. [Onboarding wizard (resumable)](#5-onboarding-wizard-resumable-us-31-35)
6. [Session lifecycle state machine](#6-session-lifecycle-state-machine)

---

## 1. Login + access/refresh issuance (US-1.1)

```mermaid
sequenceDiagram
    actor V as Visitor
    participant W as Web · /login
    participant A as API · auth
    participant T as API · tenancy
    participant DB as DB · users / auth_sessions

    V->>W: Enter email + password, Sign in
    W->>A: POST /auth/login { email, password }
    A->>DB: Look up user by email
    alt unknown email or bad password
        A-->>W: 401 generic "credentials don't match" (enumeration-safe)
    else password OK
        A->>A: Verify argon2/bcrypt hash<br/>(upgrade-on-login if legacy SHA256)
        A->>T: Resolve accessible profile (TenantGuard)
        alt no profile / suspended
            A-->>W: 403 "account not activated / suspended" (no tokens)
        else profile resolved
            A->>DB: Insert auth_sessions row<br/>(refresh hash, userId, profileId, UA, IP, expiresAt)
            A->>DB: Stamp users.last_login_at
            A-->>W: 200 { user, accessJWT (15m), refreshToken (30d) }
            W->>W: access in memory · refresh in httpOnly cookie
            W-->>V: "Welcome back, {firstName}!" → dashboard
        end
    end
```

---

## 2. Refresh-token rotation + reuse detection (US-1.2)

```mermaid
flowchart TD
    subgraph Web
        A([access JWT near expiry / 401]) --> B[POST /auth/refresh<br/>with refresh cookie]
    end
    subgraph API[API · auth]
        B --> C[Hash presented refresh token]
        C --> D{Matching auth_sessions row?}
        D -- no --> E[[401 — unknown token<br/>reject]]
        D -- yes --> F{Row revoked?}
        F -- yes (already rotated) --> G[REUSE DETECTED:<br/>revoke entire session family]
        G --> H[[401 — force re-login]]
        F -- no --> I{expires_at > now?}
        I -- no --> J[[401 — expired]]
        I -- yes --> K[Revoke presented row<br/>revoked_at = now]
        K --> L[Insert NEW auth_sessions row<br/>+ new refresh token]
        L --> M[Sign new 15-min access JWT]
        M --> N[[200 { accessJWT, refreshToken }]]
    end
    N --> O([Web stores rotated pair, retries request])
```

> Fix-on-rebuild: v1 `/refresh` was unauthenticated and never rotated — any valid refresh token worked
> until expiry. v2 authenticates against `auth_sessions`, rotates on every use, and detects reuse.

---

## 3. Signup → email verification → activation (US-2.1, 2.2)

```mermaid
sequenceDiagram
    actor V as Visitor
    participant W as Web · /signup
    participant A as API · auth
    participant DB as DB · users / profiles / verifications
    participant Q as email worker (BullMQ)

    V->>W: Full name, business, email, password, accept terms
    W->>A: POST /auth/register
    A->>DB: Create user (argon2 hash) + draft profile + user_profiles link
    A->>DB: Create verification (type=new_user, 90d TTL)
    A->>Q: Enqueue verification email (retryable)
    A-->>W: 200 generic "check your email" (enumeration-safe)
    Q-->>V: Verification email with /activate?token=…

    V->>W: Open activation link
    W->>A: GET /auth/activation/:token
    A->>DB: Resolve verification (unexpired, not completed)
    alt invalid/expired
        A-->>W: redirect → not-found / expired state
    else valid
        A-->>W: { name, userId } → greet "Welcome, {name}!"
        V->>W: Set initial password
        W->>A: POST /auth/activate (or /password/reset type=activate)
        A->>DB: Store hash · stamp completed_at · mark user active
        A->>DB: Insert auth_sessions (issue token pair via login flow)
        A-->>W: 200 + tokens → enter onboarding wizard
    end
```

---

## 4. Forgot / reset password (US-1.4, 1.5)

```mermaid
flowchart TD
    subgraph Forgot[Visitor · /password/forgot]
        A([Enter email]) --> B[POST /auth/password/forgot]
    end
    subgraph APIf[API · auth]
        B --> C{Email matches a user?}
        C -- no --> D[No-op]
        C -- yes --> E[Create verification<br/>type=password, 1d TTL]
        E --> F[Enqueue reset email<br/>on email queue]
        D --> G
        F --> G[[200 generic 'if it exists,<br/>we sent a link' · enumeration-safe]]
    end
    G --> H([Success panel · throttled resend])

    subgraph Reset[Visitor · /password/reset?token=]
        I([Open reset link]) --> J[Enter new password + confirm]
        J --> K[POST /auth/password/reset]
    end
    subgraph APIr[API · auth]
        K --> L{Token valid<br/>+ unexpired + unused?}
        L -- no --> M[[Top-level error:<br/>invalid/expired token]]
        L -- yes --> N{passwords match,<br/>min length 8?}
        N -- no --> O[[Field errors]]
        N -- yes --> P[Store argon2 hash]
        P --> Q[Stamp completed_at on verification]
        Q --> R[Revoke ALL auth_sessions for user]
        R --> S[[200 → success panel → Continue to login]]
    end
```

---

## 5. Onboarding wizard (resumable) (US-3.1–3.5)

```mermaid
flowchart TD
    subgraph Owner[New Owner · onboarding wizard]
        A([Enter wizard after activation]) --> B[Step 1 · Business info]
        B -->|Continue| C[(PATCH /profiles/me<br/>scoped to profileId)]
        C --> D[Step 2 · Connect a platform]
        D -->|Connect Google/Facebook| E[(OAuth → encrypted<br/>integrations vault)]
        D -->|Skip| F
        E --> F[Step 3 · Invite first contacts/team]
        F -->|Continue / Skip| G[(user_profiles invites<br/>+ seed contacts · optional)]
        G --> H[Step 4 · Done]
        H -->|Finish| I[(Mark onboarding complete<br/>on profile)]
        I --> J([Redirect → dashboard])
    end
    B -. Back keeps data .-> A
    D -. Back .-> B
    F -. Back .-> D
    K([Leave + return later]) -.->|resume from saved step| B
```

> Fix-on-rebuild: each step persists on Continue (resumable across sessions), uploads go through the
> media/S3 pipeline, OAuth tokens land in the AES-GCM vault, and hours use the profile timezone — none of
> which existed in v1's static mockup wizard. All writes are TenantGuard-scoped to the owner's profileId.

---

## 6. Session lifecycle state machine

```mermaid
stateDiagram-v2
    [*] --> Active: login / activate<br/>(auth_sessions row created)
    Active --> Active: refresh<br/>(rotate: old revoked, new issued)
    Active --> Revoked: logout / password reset<br/>/ "log out everywhere"
    Active --> Expired: refresh TTL (30d) elapses
    Active --> Compromised: revoked token reused<br/>(reuse detection)
    Compromised --> Revoked: revoke entire family<br/>→ force re-login
    Revoked --> [*]
    Expired --> [*]

    note right of Active
        Access JWT = 15 min (stateless).
        Only the refresh-token HASH is
        stored in auth_sessions.
    end note
    note right of Compromised
        Presenting an already-rotated
        (revoked) refresh token =
        token theft signal.
    end note
```
