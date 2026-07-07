# Billing, plans & entitlements — user stories

> Source of truth: [`docs/foundation/04-epics-and-stories.md`](../foundation/04-epics-and-stories.md) §BILL · net-new in v2 (v1 "Gold Plan" was hardcoded UI text; upgrades were emails to a human).
> **v2 target:** module `apps/api/src/modules/billing` · tables `plans`, `subscriptions`, `entitlements` · Stripe Billing (AD-14) · release R2.

**Personas:** Owner, Operator, Staff-Manager, Staff-Admin, System.

## Epic BILL-1 — Plans & entitlements

### BILL-1.1 — Plan catalog
**As a** Staff-Admin **I want** to define plans (price, entitlement set, limits) **so that** packaging is data, not code.
- **AC1** Plans sync to Stripe Products/Prices; plans are versioned — existing subscribers keep their version until migrated.
- **AC2** Entitlements per plan include at minimum: Connect SMS (+ monthly credits), widgets, social accounts, AI generations.

### BILL-1.2 — Subscribe, upgrade, downgrade
**As an** Owner **I want** to pick a plan and pay **so that** my business unlocks the features it needs.
- **AC1** Checkout/payment-method management via Stripe Checkout + Billing portal — card details never touch OGGVO.
- **AC2** Entitlements update within 1 minute of the Stripe webhook.
- **AC3** Downgrades schedule at period end, stated explicitly before confirming.
- **AC4** Every transition is recorded in a plan-change history (date, from→to, actor, reason).

### BILL-1.3 — Entitlement gating
**As the** System **I want** every gated route and worker to check entitlements **so that** limits are real.
- **AC1** `@RequireEntitlement` guard on routes; workers check before spending provider money.
- **AC2** Over-limit SMS sends are queued, not dropped, with an upgrade prompt showing the queued count.

### BILL-1.4 — Dunning & suspension
**As the** System **I want** graceful degradation on payment failure **so that** recoverable customers aren't destroyed.
- **AC1** Stripe smart retries → grace state (banner + retry timeline) → feature suspension; data is never deleted.
- **AC2** Updating the payment method reactivates immediately.

### BILL-1.5 — Staff overrides
**As a** Staff-Manager **I want** comp/trial entitlement grants with reason + expiry **so that** exceptions are controlled and audited.
- **AC1** Override modal requires a reason; grants auto-expire; all overrides land in the audit trail (PF-19).
- **AC2** Grandfathered (migrated v1) profiles are visibly badged until converted to a real plan.

## Traceability

| Story | Primary v2 endpoint |
| --- | --- |
| BILL-1.1 | `GET/POST /admin/plans` |
| BILL-1.2 | `POST /billing/checkout`, Stripe webhooks |
| BILL-1.3 | guards + `entitlements` reads |
| BILL-1.4 | Stripe webhook → subscription state machine |
| BILL-1.5 | `POST /admin/profiles/:id/entitlement-override` |
