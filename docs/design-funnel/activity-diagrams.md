# Design & Funnel — Activity / Flow Diagrams

Mermaid flow diagrams for the design/funnel domain. They render natively in GitHub and VSCode.
Actor "lanes" are modelled with subgraphs (Operator / Web / API / Store / Visitor).

Pairs with [user-stories.md](./user-stories.md), [`../feature-spec/design-funnel.md`](../feature-spec/design-funnel.md),
and the reviews companion ([reviews activity-diagrams](../reviews/activity-diagrams.md) covers ingestion / share /
auto-share / the public-funnel review side).

Index:
1. [Content editor save (Positive / Negative / Thank You)](#1-content-editor-save)
2. [Visual designer load & save (S3 → DB)](#2-visual-designer-load--save-s3--db)
3. [Platform-link manager (add / edit / delete / reorder / toggle)](#3-platform-link-manager)
4. [Public funnel routing + instructions interstitial](#4-public-funnel-routing--instructions-interstitial)
5. [Link & funnel-design lifecycle](#5-link--funnel-design-lifecycle)

---

## 1. Content editor save

```mermaid
flowchart TD
    subgraph Operator
        A([Open /design/positive | negative | thanks]) --> B[GET /design\n profile copy + rating stats]
        B --> C[Edit Header / Body / HappyMinimum\n live preview updates]
        C --> D[Click Apply]
    end
    subgraph API[funnel service]
        D --> E[POST /design/savecontent\n only this tab's field set]
        E --> F{Field in allowlist?\n header->MessageHeader,\n body->MessageText,\n footer->CustomPoweredBy}
        F -- no --> G[[Reject unknown key\n fix-on-rebuild: v1 mass-assigns]]
        F -- yes --> H[Write fields + stamp LastUpdatedBy]
        H --> I{All saved?}
        I -- no --> J[[errors: Could not save field!]]
        I -- yes --> K[[message: Data Saved Successfully!]]
    end
    K --> L[Toast: Data updated successfully!]
    L --> M[(profile / funnel_content)]
```

---

## 2. Visual designer load & save (S3 → DB)

```mermaid
flowchart TD
    subgraph Operator
        A([Open /design Main tab]) --> B[Unlayer editor loads]
        B --> C[GET /design/getdesign]
        E[Drag/drop blocks, insert image] --> F[Click Save]
        K[Delete an uploaded image] --> K1{Confirm\n Are you sure you want\n to delete this file?}
        K1 -- yes --> K2[DELETE media/:id/image]
    end
    subgraph API[funnel service]
        C --> C1{Design exists?}
        C1 -- no --> C2[[design: null - blank canvas]]
        C1 -- yes --> C3[Load editor design]
        C3 -. load fails .-> C4[[Toast: We could not load\n your existing design!]]
        F --> G[exportHtml -> json + html{fonts,css,body}]
        G --> H[POST /design/savedesign]
        H --> I{Saved?}
        I -- yes --> J[[Store inline:\n funnel_designs.exported_json/html]]
        I -- no --> J2[[Toast: We could not save your design!]]
    end
    J --> Z[Toast: Data Saved Successfully!]
```

> v1 wrote `funnel.json` + `html.json` to S3 (CSS minified, body `utf8_encode`d). v2 stores inline in the DB and
> the public page injects sanitized HTML — no runtime Vue template compile.

---

## 3. Platform-link manager

```mermaid
flowchart TD
    subgraph Operator
        A([Positive/Negative editor]) --> B[GET /links ordered by rank]
        B --> C{Action?}
        C -->|Add| D[Add Platform modal]
        C -->|Edit| E[Edit Platform modal\n leave image blank to keep]
        C -->|Delete| F[Delete Link modal\n won't be able to revert]
        C -->|Reorder| G[Drag handle]
        C -->|Show/Hide| H[Eye toggle]
    end
    subgraph API[funnel service]
        D --> D1{Custom Link on?}
        D1 -- no --> D2[Catalog: copy name/logo\n from link_masters]
        D1 -- yes --> D3{Custom name unique\n vs catalog?}
        D3 -- no --> D4[[Error: Platform already exists]]
        D3 -- yes --> D5[Store custom name + logo]
        D2 --> D6[POST /links rank = count]
        D5 --> D6
        E --> E1[PATCH /links/:id]
        F --> F1[DELETE /links/:id]
        G --> G1[PATCH /links/order\n rank = array index]
        G1 --> G2{Saved?}
        G2 -- no --> G3[[Revert order + error\n fix-on-rebuild: v1 swallows]]
        G2 -- yes --> G4[Toast: Order updated successfully!]
        H --> H1[PATCH /links/:id/active]
    end
    D6 --> R[(links table)]
    E1 --> R
    F1 --> R
    G4 --> R
    H1 --> R
```

---

## 4. Public funnel routing + instructions interstitial

```mermaid
flowchart TD
    subgraph Visitor
        A([Open /r/:shortname]) --> B[Select a star rating]
    end
    subgraph API[funnel public]
        A0[GET /funnel/:shortname] --> A1{Found?}
        A1 -- no --> A2[[404]]
        A1 -- yes --> A3[Return copy, happyMinimum,\n active links, rating stats, design]
    end
    B --> C{rating >= happyMinimum?\n 1 = review-all, 0 = feedback-all}
    C -- yes --> D[Positive screen:\n Connect with platform buttons]
    D --> E{platform in\n google/facebook/zillow/realtor.com\n AND skipInstructions != 1?}
    E -- yes --> F[How to leave a review interstitial\n disclaimer + Click to review CTA]
    E -- no --> G[Open platform link\n respect Open in New Window]
    F --> G
    G --> T[Thank-you screen]
    C -- no --> I[Negative screen: feedback form\n name/email/phone/message]
    I --> J[Leave Feedback -> create review + recipient\n tag Left Oggvo Feedback, set Inactive]
    J --> T
```

> Parity gap: Yelp has a server-side instruction view but no Vue modal branch — add it in v2.

---

## 5. Link & funnel-design lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft: profile created (auto design row)
    Draft --> Edited: savecontent / savedesign
    Edited --> Edited: further edits (LastUpdatedBy stamped)
    Edited --> Published: design Active = 1\n public /r/:shortname serves it

    state Link {
        [*] --> Catalog: add from link_masters
        [*] --> Custom: add custom (unique name + logo)
        Catalog --> Active
        Custom --> Active
        Active --> Hidden: toggle isActive off
        Hidden --> Active: toggle on
        Active --> Reordered: drag (rank = index)
        Active --> Removed: delete (hard delete)
        Hidden --> Removed
    }
```
