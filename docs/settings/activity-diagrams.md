# Settings — Activity / Flow Diagrams

Mermaid flow diagrams for the settings domain. They render natively in GitHub and VSCode
(Mermaid preview). Actor "lanes" are modelled with subgraphs
(Owner / Web / API / Media-S3 / External / Team member / Staff).

Pairs with [user-stories.md](./user-stories.md) and the spec at
[`../feature-spec/settings.md`](../feature-spec/settings.md).

Index:
1. [Save business profile settings](#1-save-business-profile-settings-us-11)
2. [Branding / logo upload (crop + S3)](#2-branding--logo-upload-us-21-22)
3. [Team-member invite + role assignment](#3-team-member-invite--role-assignment-us-31-34)
4. [Timezone change propagation](#4-timezone-change-propagation-us-12)
5. [Campaign pause / billing-style state change](#5-campaign-pause--resume-us-71)
6. [Settings surface map (read on mount)](#6-settings-surface-map)

---

## 1. Save business profile settings (US-1.1)

```mermaid
flowchart TD
    subgraph Owner
        A([Open /settings · Business Profile]) --> B[Edit fields:\nname, phone, address,\ncity/state/zip, email, website]
        B --> C{Save enabled?\n(something changed)}
        C -- no --> B
        C -- yes --> D[Click Save]
    end
    subgraph API[API · tenancy module]
        D --> E[TenantGuard resolves profileId]
        E --> F{Payload contains only\ntyped, allowed fields?}
        F -- Google fields present --> G[[Strip / reject\nserver-derived fields]]
        F -- ok --> H[PATCH /profiles/current\n(satellite-scoped writers)]
        G --> H
        H --> I[Resolve IANA tz from address\n→ diagram #4]
        I --> J[Persist to profiles\n+ satellites]
        J --> K[[200 updated DTO]]
    end
    K --> L([Form rehydrates · Save disabled · toast])
```

> Fix-on-rebuild: no single `save-settings` god-endpoint; each satellite has its own typed PATCH and
> no client can mass-assign arbitrary `profile` columns.

---

## 2. Branding / logo upload (US-2.1, US-2.2)

```mermaid
flowchart TD
    subgraph Owner
        A([Select logo file]) --> B{Business logo?}
        B -- yes --> C[Open crop modal\n→ produce cropped file]
        B -- no --> D[Use file as-is]
        C --> E[Auto-upload on confirm]
        D --> E
    end
    subgraph API[API · tenancy + media]
        E --> F{MIME in png/jpeg/jpg?}
        F -- no --> G[[422 invalid type]]
        F -- yes --> H[POST /profiles/current/logos/{profile|business}]
        H --> I{Existing object?}
        I -- yes --> J[Delete previous S3 object]
        I -- no --> K
        J --> K[Stream new file]
    end
    subgraph S3[Media · S3]
        K --> L[Store object\nreturn public URL]
    end
    L --> M[Persist URL ref on profile]
    M --> N[[200 {url}]]
    N --> O([Preview updates · spinner clears])
    G -.-> A
```

> Schema gap: the **business logo** needs its own column/media row (v2 `profiles` has only `logo`).

---

## 3. Team-member invite + role assignment (US-3.1–3.4)

```mermaid
flowchart TD
    subgraph Owner
        A([Open Team & Roles]) --> B[Click Invite]
        B --> C[Enter email + pick role\nAdmin / Manager / Member]
        C --> D[Submit]
    end
    subgraph API[API · tenancy · members]
        D --> E{@RequirePermission\nOwner/Admin?}
        E -- no --> Z[[403 forbidden]]
        E -- yes --> F{Email valid\n+ not already active member?}
        F -- no --> Y[[422 field error]]
        F -- yes --> G{Pending invite\nfor email exists?}
        G -- yes --> H[Re-send existing\n(no duplicate)]
        G -- no --> I[POST .../members/invitations\ncreate pending + token]
        H --> J
        I --> J[Email tokenized link]
        J --> K[[Row shows Pending badge]]
    end
    subgraph TeamMember[Team member]
        K --> L([Open invite link])
        L --> M[POST /profiles/invitations/accept\n{token}]
        M --> N{Token single-use\n+ unexpired?}
        N -- no --> X[[Error · no access]]
        N -- yes --> O[Attach user to profile\nat invited role · revoke token]
        O --> P[[Row flips Pending → role pill]]
    end
    subgraph Manage[Owner · later]
        P --> Q{Change role / revoke?}
        Q -- change --> R[PATCH .../members/userId\n(Owner not demotable)]
        Q -- revoke --> S[DELETE .../members/userId\n+ revoke their sessions]
    end
```

> v2-new: v1 ships only the owner row (invite/role UI is dead markup). RBAC is enforced via guards
> (fix-on-rebuild: v1 RBAC was flat unenforced bools).

---

## 4. Timezone change propagation (US-1.2)

```mermaid
flowchart TD
    subgraph Web
        A([Address / state / ZIP edited]) --> B[Status line:\n"Timezone will update after you save…"]
        B --> C[Save profile / address]
    end
    subgraph API[API · single tz resolver]
        C --> D{Current tz empty,\nnumeric, or invalid?}
        D -- no (manual IANA override) --> E[Preserve existing tz]
        D -- yes --> F[Map state → IANA]
        F --> G{Resolved?}
        G -- no --> H[Longitude-band fallback\nvia geo_zipcodes]
        G -- yes --> I
        H --> I[Persist IANA tz\n+ lat/long on profile]
        E --> J
        I --> J[[200 · tz on DTO]]
    end
    subgraph Consumers[Propagation · next read]
        J --> K[Campaign scheduling]
        J --> L[Daily activation time]
        J --> M[Review auto-publish 14-day window]
        J --> N[All timestamp rendering]
    end
    K & L & M & N --> O([Everything in profile timezone])
```

> Fix-on-rebuild: one resolver (consolidate `resolveTimezone` vs `syncTimezoneFromAddress`); never
> default to `America/Los_Angeles` / Pacific business hours.

---

## 5. Campaign pause / resume (US-7.1)

```mermaid
flowchart TD
    subgraph Owner
        A([Toggle campaigns state]) --> B{Pause or Resume?}
    end
    subgraph API[API · transactional]
        B -- Pause --> C[Confirm modal]
        C --> D[BEGIN tx]
        D --> E[Hold unsent schedules\n(Sent 0 → held)]
        E --> F[Set CampaignsPaused = true]
        F --> G[COMMIT]
        B -- Resume --> H[BEGIN tx]
        H --> I[Release held schedules\n(held → 0)]
        I --> J[Set CampaignsPaused = false]
        J --> K[COMMIT]
    end
    G --> L[[Paused · status unchanged]]
    K --> M[[Resumed]]
    L & M --> N([Refresh banner + list + count])
```

> Schema gap: `CampaignsPaused` flag + held-schedule semantics must be added to v2; the flag and the
> held rows are written atomically so they can't diverge (v1 fix BF-037).

---

## 6. Settings surface map

```mermaid
flowchart LR
    subgraph Web[/settings · left sub-nav]
        A[Business Profile] --> A1[GET /profiles/current]
        B[Branding] --> B1[logos/* endpoints]
        C[Notifications] --> C1[email-notifications\n+ /me/push-channels]
        D[Team & Roles] --> D1[/profiles/current/members]
        E[Billing] --> E1[(plan / billing module)]
        F[Integrations] --> F1[(integrations.html\nGET /integrations/oauth-urls)]
        G[Messaging Compliance] --> G1[(a2p-compliance.html\nGET /twilio/verification)]
    end
    subgraph Cross[Surfaced, owned elsewhere]
        H[Review Sharing] --> H1[review-settings\n+ reviews/auto-share]
        I[Geo ZIPs] --> I1[geo-zipcodes]
        J[Referral] --> J1[affiliate]
        K[Monthly Targets] --> K1[monthly-targets · dashboard]
        L[Admin profile edit] --> L1[/admin/profiles/id · staff]
    end
```
</content>
