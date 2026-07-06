# Messaging Compliance — Activity / Flow Diagrams

Mermaid flow + state diagrams for the Twilio A2P 10DLC & toll-free compliance domain. They render
natively in GitHub and VSCode (Mermaid preview). Actor "lanes" are modelled with subgraphs
(Operator / Account Manager / Web / API · messaging / Integrations · Twilio adapters / Twilio /
Worker).

Pairs with [user-stories.md](./user-stories.md) and the spec at
[`../feature-spec/twilio-a2p-compliance.md`](../feature-spec/twilio-a2p-compliance.md).

Index:
1. [Brand / customer-profile registration (10DLC wizard)](#1-brand--customer-profile-registration-us-11-17)
2. [Campaign use-case submission](#2-campaign-use-case-submission-us-18)
3. [Toll-free verification status webhook updates](#3-toll-free-verification-status-webhook-updates-us-31)
4. [Toll-free number → messaging-service linkage (admin)](#4-toll-free-number--messaging-service-linkage-us-41-43)
5. [Toll-free verification status — state machine](#5-toll-free-verification-status--state-machine)
6. [10DLC step / brand / campaign — state machine](#6-10dlc-step--brand--campaign--state-machine)

---

## 1. Brand / customer-profile registration (US-1.1–1.7)

```mermaid
flowchart TD
    subgraph Operator
        A([Open /settings/compliance]) --> B[Pick type:\nbusiness / sole-proprietor + email]
        B --> C[Fill KYC panels:\nbusiness-info / address / representative\nor personal profile-information / address]
        C --> D[Submit for review]
        D --> E[Submit trust product\nbusiness/personal]
    end
    subgraph API[API · messaging]
        B0[GET /messaging/compliance] -->|step ordinal| A
        B --> F[POST /messaging/compliance\ntype + email]
        C --> G[PUT /messaging/compliance/&lbrace;section&rbrace;\nper-panel save]
        D --> H[POST /messaging/compliance/submit\nassign parent SID + evaluate]
        E --> I[POST /messaging/compliance/trust-product]
    end
    subgraph Twilio[Twilio · Integrations adapters]
        F --> T1[Create TrustHub customer-profile bundle]
        G --> T2[Create end-user + assignment\nre-evaluate policy]
        T2 -->|noncompliant| T2E[Return per-field errors\n+ assignment_sid]
        H --> T3[Assign to parent business SID\nsubmit customer profile]
        I --> T4[Create A2P trust bundle\n+ register brand implicitly\nbusiness skipAutomaticSecVet / personal SOLE_PROPRIETOR]
    end
    T2E -.-> C
    T1 --> S1[step → 1.x\nstore SID + type + email]
    T2 --> S1
    T3 --> S2[step → submit\nmark panels saved]
    T4 --> S3[step → campaign\nstore brandSid + trustProductSid]
    S3 --> P([Poll GET /messaging/compliance/brand\nuntil APPROVED / VERIFIED])
```

---

## 2. Campaign use-case submission (US-1.8)

```mermaid
flowchart TD
    subgraph Operator
        A([Open campaign step]) --> B{Brand APPROVED?\npersonal: identity VERIFIED?}
        B -- no --> C[Form disabled\nwarning banner + Resend SMS]
        B -- yes --> D[Fill campaign:\nuse-case, description, opt-in flow,\n2 samples no placeholders, volume, link/phone toggles]
        D --> E[Submit]
    end
    subgraph API[API · messaging]
        BR[GET /messaging/compliance/brand] --> B
        C --> RO[POST …/brand/retry-otp]
        E --> F[POST /messaging/compliance/campaign]
        F --> G[Delete prior campaign\nof compliance type]
        G --> H{Re-fetch brand\nstatus == APPROVED?}
        H -- no --> I[[409 / &lbrace;error,reason&rbrace;]]
        H -- yes --> J[Create usAppToPerson campaign]
    end
    subgraph Twilio[Twilio · Integrations]
        J --> T1[Register campaign use-case]
        T1 --> T2[Subscribe brand + campaign\nevent streams — FIX v1 early-return bug]
    end
    T2 --> K[campaignStatus stored\nstep → completed]
    K --> L([Show 'under review' panel])
```

---

## 3. Toll-free verification status webhook updates (US-3.1)

```mermaid
flowchart TD
    subgraph Twilio
        A([TFV decision:\nPENDING_REVIEW / TWILIO_APPROVED / TWILIO_REJECTED]) --> B[POST /integrations/twilio/tollfree/status\nsigned payload]
    end
    subgraph Integrations[API · integrations webhook]
        B --> C{Valid X-Twilio-Signature?\nper-subaccount auth token}
        C -- no --> D[[401 unauthorized]]
        C -- yes --> E[Idempotency key =\nevent_id or sha1(reg+status+occurred+sid)]
        E --> F{Key already seen?}
        F -- yes --> G[[200 &lbrace;status:'duplicate'&rbrace;]]
        F -- no --> H[Map Twilio status → portal status]
    end
    subgraph Mapper[Pure · TollfreeStatusMapper]
        H --> M1{status?}
        M1 -- PENDING_REVIEW --> N1[portal = submitted]
        M1 -- TWILIO_APPROVED --> N2[portal = approved\nset approvedAt]
        M1 -- TWILIO_REJECTED --> N3{edit_allowed &&\nwindow open?}
        N3 -- yes --> N4[portal = needs_correction]
        N3 -- no --> N5[portal = rejected\nset rejectedAt]
        M1 -- other --> N6[sync_state = error\nlog status_unrecognized]
    end
    subgraph Persist[API · messaging repository]
        N1 --> W[Write verification_events row]
        N2 --> W
        N4 --> W
        N5 --> W
        N6 --> W
        W --> X[Update verification\ndeactivate prior rejections\ninsert active rejection if present]
        X --> Y[[200 snapshot]]
    end
    Y -.->|next Operator load /\ndebounced post-submit sync| Z([Status card + history reflect change])
```

---

## 4. Toll-free number → messaging-service linkage (US-4.1–4.3)

```mermaid
flowchart TD
    subgraph Manager[Account Manager · account_type >= 2]
        A([Open admin toll-free panel]) --> B[Enable eligibility]
        B --> C[Assign available number]
        C --> D[Activate sender]
    end
    subgraph API[API · admin profiles/tollfree]
        B --> E[POST …/tollfree/eligibility\nenabled=true → set EligibleAt + ByUserID]
        GN[GET …/tollfree/numbers\nreserved/released, unassigned] --> C
        C --> F{number reserved|released?\nprofile eligible?\nno active number?}
        F -- no --> FE[[409 blocked reason]]
        F -- yes --> G[ownership_state = assigned\nlink PhoneNumberSid + MessagingServiceSid]
        D --> H[POST …/tollfree/activate-sender]
    end
    subgraph Policy[Pure · TollfreeSenderActivationPolicy]
        H --> P{can_activate? ALL of:\nassigned number ∧ latest portal=approved\n∧ INBOUND_ROUTING_ENABLED\n∧ PILOT_SCOPE=web_connect_only}
        P -- no --> PE[[Surface blocking reasons]]
        P -- yes --> Q[TollfreeSendMode = active\nset ActivatedAt + ByUserID]
    end
    Q --> R[Log admin-source event\nidempotency key admin-activate-…]
    R --> S([Inbound To → number resolves\nvia TollfreeInboundResolver\nelse profiles.SMSNumber])
```

---

## 5. Toll-free verification status — state machine

```mermaid
stateDiagram-v2
    [*] --> not_started: no verification record
    not_started --> in_progress: POST /tollfree/initialize\n(create pending, embed form)
    in_progress --> submitted: Twilio PENDING_REVIEW
    submitted --> approved: TWILIO_APPROVED
    submitted --> needs_correction: TWILIO_REJECTED + edit_allowed\n(window open)
    submitted --> rejected: TWILIO_REJECTED + !edit_allowed
    needs_correction --> in_progress: resume + resubmit\n(edit window not expired)
    needs_correction --> rejected: edit window expires
    approved --> [*]: sender activation eligible
    rejected --> [*]: terminal (until reset)

    note right of approved
        sets ApprovedAt;
        unlocks admin activate-sender
        (policy-gated)
    end note
    note right of needs_correction
        active rejection_reasons shown;
        Resume Verification offered;
        unrecognized status → sync_state=error
    end note
```

---

## 6. 10DLC step / brand / campaign — state machine

```mermaid
stateDiagram-v2
    [*] --> init: GET /messaging/compliance → 404
    init --> profile_started: POST /compliance (type+email)
    profile_started --> panels_saved: PUT business-info / representative\nor personal profile-information + address
    panels_saved --> submitted: POST /compliance/submit\n(assign parent SID, evaluate)
    submitted --> trust_created: POST /compliance/trust-product\n(brand registered implicitly)
    trust_created --> brand_pending: brand IN_REVIEW
    brand_pending --> brand_approved: Twilio brand APPROVED\n(personal: identity VERIFIED)
    brand_pending --> brand_pending: retry-otp (personal)
    brand_approved --> campaign_submitted: POST /compliance/campaign
    campaign_submitted --> completed: campaign approved
    completed --> [*]

    submitted --> init: POST /compliance/reset
    trust_created --> init: POST /compliance/reset
    brand_pending --> init: POST /compliance/reset

    note right of trust_created
        step ordinal advances;
        brandSid + trustProductSid stored;
        no DB txn in v1 → v2 tracks
        created SIDs for rollback
    end note
```
