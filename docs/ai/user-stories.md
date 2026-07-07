# AI templates & content generation — user stories

> Source of truth: [`docs/foundation/04-epics-and-stories.md`](../foundation/04-epics-and-stories.md) §AI · folds BF-005 (AI/custom templates), BF-047 (more templates), BF-048 (round-robin).
> **v2 target:** modules `reviews`/`campaigns` · render worker (AD-12), provider gateway (AD-13), quota entitlements (AD-14) · release R4.

**Personas:** Operator, Owner, System.

## Epic AI-1 — Templates & generation

### AI-1.1 — Custom review-share templates
**As an** Operator **I want** my own share templates alongside stock ones **so that** shared reviews match my brand.
- **AC1** Create/upload a template (name, background, colors, font) with a live 1080×1080 preview.
- **AC2** Templates are versioned media assets (PF-10) rendered by the render worker (AD-12).
- **AC3** Auto-share round-robin draws from my selected template set (BF-048) — selection is explicit checkboxes.

### AI-1.2 — AI-generated share copy
**As an** Operator **I want** generated post text per review with tone presets **so that** sharing is fast but still mine.
- **AC1** Tone presets (e.g. Professional / Warm / Playful / Grateful); regenerate on demand.
- **AC2** Copy is ALWAYS editable before posting; nothing auto-publishes outside the existing scheduling/approval path.
- **AC3** Generation runs behind a provider gateway (model swappable) and consumes a per-profile monthly quota (entitlement) with a visible meter.

### AI-1.3 — Real AI-usage metric
**As an** Owner **I want** the dashboard "AI used" stat to be real **so that** I can see the value (v1 hardcoded 0%).
- **AC1** Counter increments per accepted generation; dashboard reads the real number.

## Traceability

| Story | Primary v2 endpoint |
| --- | --- |
| AI-1.1 | `GET/POST /reviews/share-templates` |
| AI-1.2 | `POST /reviews/:id/generate-copy` |
| AI-1.3 | `GET /analytics/ai-usage` |
