# Onboarding wizard — user stories

> Source of truth: [`docs/foundation/04-epics-and-stories.md`](../foundation/04-epics-and-stories.md) §ONBD · v1's 6-step wizard was an unwired static mockup (no API, no persistence). Companion: `docs/auth/user-stories.md` (wizard shell/addendum).
> **v2 target:** modules `tenancy`/`auth` · table `profile_onboarding` (R0) · release R3.

**Personas:** New Owner, Owner, System.

## Epic ONBD-1 — Real onboarding

### ONBD-1.1 — Resumable setup state
**As a** New Owner **I want** my wizard progress saved **so that** I can leave and resume anytime.
- **AC1** `profile_onboarding` row stores step + answers per step; completing stops re-prompting.
- **AC2** Every step shows "Your progress is saved — finish anytime".

### ONBD-1.2 — Company details step
**As a** New Owner **I want** the company step to write my real profile **so that** setup isn't theater.
- **AC1** Business name, address, phone persist to `profiles` + satellites.
- **AC2** Address triggers timezone resolution; the detected IANA zone is shown and editable (PF-3).
- **AC3** Logo upload is a real presigned-S3 upload with progress (PF-10).

### ONBD-1.3 — Questionnaire step
**As a** New Owner **I want** my goals captured **so that** the product guides me accordingly.
- **AC1** Answers persist; selected goals map to a recommended-feature checklist on the dashboard.

### ONBD-1.4 — Team step
**As a** New Owner **I want** to invite teammates during setup **so that** my staff is in from day one.
- **AC1** Reuses TEAM-1.1 invites (email + role); skippable.

### ONBD-1.5 — Connect-accounts step
**As a** New Owner **I want** to link Google/Facebook/etc. during setup **so that** reviews start flowing immediately.
- **AC1** Reuses INT OAuth flows with inline connected/needs-action state per provider; skippable.

### ONBD-1.6 — Automation step
**As a** New Owner **I want** plain-language automation choices **so that** I understand exactly what will send.
- **AC1** Auto-activation and default-campaign toggles state their consequences explicitly (the BF-037 confusion is designed out).

### ONBD-1.7 — Default content seeding
**As the** System **I want** new profiles seeded with defaults **so that** the product works on day one.
- **AC1** Default campaigns (Initial/Follow-up/Final, email + SMS), a funnel design, and messaging settings — in DB, idempotently.

## Traceability

| Story | Primary v2 endpoint |
| --- | --- |
| ONBD-1.1 | `GET/PUT /onboarding/state` |
| ONBD-1.2 | `PATCH /profiles/current` (via step) |
| ONBD-1.3 | `PUT /onboarding/questionnaire` + dashboard checklist |
| ONBD-1.4/1.5 | TEAM/INT endpoints (reused) |
| ONBD-1.7 | profile-creation seeder (internal) |
