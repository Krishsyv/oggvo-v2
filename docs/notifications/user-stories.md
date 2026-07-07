# Notifications hub — user stories

> Source of truth: [`docs/foundation/04-epics-and-stories.md`](../foundation/04-epics-and-stories.md) §NOTIF · consolidates nav badges (global), review-alert emails + push devices (settings E4), survey completion (BF-011), tab badges (BF-032), and the delivery ledger (PF-6).
> **v2 target:** module `apps/api/src/modules/notifications` · tables `email_notifications`, `push_channels`, `notification_deliveries` (R0) · release R2.

**Personas:** Owner, Operator, Staff-Support, System.

## Epic NOTIF-1 — Notifications

### NOTIF-1.1 — Preferences
**As an** Operator **I want** notification recipients and channels per event type **so that** the right people hear about the right things.
- **AC1** Event types at minimum: new review, negative review (≤ threshold), survey completed, social post failed, inbound SMS.
- **AC2** Per event: multiple email recipients (chips with inline add/remove) and channel toggles (email / push / in-app).
- **AC3** Push devices are registered/revoked server-side (device list with last-seen; no browser-fingerprint cookie hacks).
- **AC4** Transactional/compliance messages cannot be disabled.

### NOTIF-1.2 — Event fan-out
**As the** System **I want** domain events fanned out to subscribed channels through the send pipeline **so that** every notification is delivered and accounted for.
- **AC1** Each channel delivery writes a ledger row (PF-6); a failed channel never blocks the others (PF-7).

### NOTIF-1.3 — Nav badges
**As an** Operator **I want** per-tab attention counts **so that** I see what needs me at a glance.
- **AC1** Badge sources: unanswered reviews, failed social posts, recent completed surveys; profile switcher shows per-profile totals.
- **AC2** One polling interval, torn down on unmount (BF-032 regression test).

### NOTIF-1.4 — Delivery visibility
**As a** Staff-Support person **I want** to answer "did profile X get their notification and why not" in one lookup **so that** outages aren't multi-day forensics.
- **AC1** Admin ledger view filters by profile/channel/status/date; rows show the **application-level** provider result (e.g. an in-body SendGrid 500), not just transport success.
- **AC2** Rows carry correlation ids (campaign/review/survey) and expand to the full payload context.

## Traceability

| Story | Primary v2 endpoint |
| --- | --- |
| NOTIF-1.1 | `GET/PUT /notifications/preferences`, `/notifications/devices` |
| NOTIF-1.2 | event bus → send pipeline (internal) |
| NOTIF-1.3 | `GET /notifications/nav-badges` |
| NOTIF-1.4 | `GET /admin/deliveries` |
