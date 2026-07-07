# Audit trail — user stories

> Source of truth: [`docs/foundation/04-epics-and-stories.md`](../foundation/04-epics-and-stories.md) §AUDIT · standard PF-19 (design informed by the shopschool audit module, adapted: tenancy, impersonation, worker actors).
> **v2 target:** `audit_events` table (R0 upgrade of scaffold `audit_log`) + interceptor · capture R0, viewers R2.

**Personas:** Owner, Operator, Staff-Support, Staff-Admin, System.

## Epic AUDIT-1 — Who did what, when

### AUDIT-1.1 — Automatic capture
**As the** System **I want** an audit event for every mutating API action without per-feature code **so that** the trail is complete by construction.
- **AC1** Interceptor derives profile, actor, **impersonator when staff act as a user**, IP, and user-agent from request context.
- **AC2** `changes` holds changed-fields-only before/after diffs.
- **AC3** Secrets and PII bodies never enter the trail (PF-18 redaction).
- **AC4** The audit row commits in the same transaction as the data change.

### AUDIT-1.2 — Domain & worker events
**As the** System **I want** events the interceptor can't see recorded explicitly **so that** logins, sends, and jobs are traceable.
- **AC1** Login/logout, impersonate start/stop, exports/imports, bulk ops, campaign/broadcast sends, provider connect/disconnect.
- **AC2** Worker actions record `actor_type=system` with the triggering job id in metadata.

### AUDIT-1.3 — Entity history
**As an** Owner **I want** a "who changed what" timeline on a record **so that** I can trust my data.
- **AC1** Timeline on contacts/campaigns/settings records; tenant-scoped to my profile.
- **AC2** Field-level diffs rendered human-readably (before → after pills); actor shown with a user/staff/system chip.

### AUDIT-1.4 — Admin activity search
**As a** Staff-Support person **I want** to filter events by profile, actor, action, entity, and date **so that** forensics is one query.
- **AC1** Impersonated actions clearly attributed to the staff member ("Sarah K. (staff) as Bright Smile Dental").
- **AC2** Filtered result sets export to CSV.

### AUDIT-1.5 — Retention & archival
**As the** System **I want** events archived past the retention window **so that** the hot table stays fast and PF-18 holds.
- **AC1** Default 24 months hot, then S3 archive; hot table is Stage-B partition-ready.

## Traceability

| Story | Primary v2 endpoint |
| --- | --- |
| AUDIT-1.1/1.2 | interceptor + `AuditService` (internal) |
| AUDIT-1.3 | `GET /audit/entity/:table/:id` |
| AUDIT-1.4 | `GET /admin/audit` (+ export) |
| AUDIT-1.5 | archival job |
