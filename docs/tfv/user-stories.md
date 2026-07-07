# Toll-free verification (TFV) — user stories

> Source of truth: [`docs/foundation/04-epics-and-stories.md`](../foundation/04-epics-and-stories.md) §TFV · decision AD-15: **Twilio Compliance Embeddable** (Twilio hosts the form; we own the status machine). Companion: `docs/compliance/user-stories.md` (A2P 10DLC).
> **v2 target:** module `apps/api/src/modules/compliance` · tables `twilio_tollfree_*` (R0 gap) · queue `twilio-tollfree-sync` · release R2–R3.

**Personas:** Owner, Operator, Staff-Manager (Admin/Support), System, Twilio.

## Epic TFV-1 — Toll-free verification

### TFV-1.1 — Start verification
**As an** Owner (eligible + feature-flagged) **I want** to start TFV inside the portal **so that** my toll-free number can send compliant SMS.
- **AC1** API initializes the Twilio inquiry → `inquiry_id` + session token; the **Twilio-hosted embeddable form** mounts in the page (we never rebuild the compliance form).
- **AC2** Ineligible profiles never see the entry point.

### TFV-1.2 — Resume verification
**As an** Owner **I want** to resume a started verification where I left off **so that** I don't re-enter everything.
- **AC1** Session token re-issued; embeddable restores prior answers.

### TFV-1.3 — Status tracking
**As an** Operator **I want** normalized status with history **so that** I always know where verification stands.
- **AC1** Status machine: `draft → submitted → needs_correction → approved | rejected`, shown as a timeline.
- **AC2** Status synced by webhook AND a reconciling poll job — the poll is the source of truth.

### TFV-1.4 — Correct & resubmit
**As an** Owner **I want** rejection reasons and a fix path **so that** a rejection isn't a dead end.
- **AC1** Rejection reasons listed verbatim; "Fix and resubmit" re-opens the embedded form.

### TFV-1.5 — Admin panel
**As a** Staff-Manager **I want** full TFV visibility and controls per profile **so that** support can unblock customers.
- **AC1** Eligibility toggle, toll-free number assignment (allowed BEFORE verification), manual sync, status/rejection history.

### TFV-1.6 — Sender activation
**As the** System **I want** sending enabled only when approved + number assigned **so that** compliance is enforced.
- **AC1** Deactivation always resets local state even if Twilio-side cleanup fails (fixes the v1 closed-subaccount deadlock).

## Traceability

| Story | Primary v2 endpoint |
| --- | --- |
| TFV-1.1/1.2 | `POST /compliance/tollfree/start` |
| TFV-1.3 | `GET /compliance/tollfree/status` + sync queue |
| TFV-1.4 | embeddable re-mount (same start endpoint) |
| TFV-1.5 | `GET/POST /admin/tollfree/*` |
| TFV-1.6 | sender gate in `messaging`/workers |
