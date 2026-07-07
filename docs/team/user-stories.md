# Team & per-profile roles — user stories

> Source of truth: [`docs/foundation/04-epics-and-stories.md`](../foundation/04-epics-and-stories.md) §TEAM (epic register) · net-new in v2 (v1 Teams tab was a stub).
> **v2 target:** module `apps/api/src/modules/tenancy` · tables `user_profiles` (role), `verifications` · queue `email-send` · release R2.

**Personas:** Owner, Operator, Member, Visitor (invitee), System.

## Epic TEAM-1 — Teams & roles

### TEAM-1.1 — Invite a teammate
**As an** Owner **I want** to invite someone by email with a role **so that** my staff can work in the profile.
- **AC1** Invite modal takes email + role (`admin` | `member`) with a plain-language capability list per role.
- **AC2** Creates a pending membership + emailed accept link (verification token, 7-day TTL).
- **AC3** Re-invite replaces the token; Revoke cancels the pending invite.
- **AC4** Every invite email lands in the delivery ledger (PF-6).

### TEAM-1.2 — Accept an invite
**As a** Visitor **I want** the invite link to walk me into a working portal **so that** joining is one sitting.
- **AC1** Logged-in invitee with an existing account joins on one click; new users set name + password first (AUTH activation).
- **AC2** Expired/used tokens show a distinct state with "ask the inviter to resend".
- **AC3** On accept the profile appears in my profile switcher immediately.

### TEAM-1.3 — Manage members
**As an** Owner **I want** to list members, change roles, and remove members **so that** access matches reality.
- **AC1** Members table: avatar, name, email, role badge, joined date, last active.
- **AC2** The last owner cannot be demoted or removed (control disabled with explanatory tooltip).
- **AC3** Removal revokes that user's sessions for this profile immediately.
- **AC4** Role changes take effect on next request (guards read the DB, not JWT claims).

### TEAM-1.4 — Role enforcement
**As a** Member **I must not** perform admin-only actions **so that** least privilege holds.
- **AC1** Billing, team management, profile deletion, and Connect activation require role `admin`+ — enforced server-side.
- **AC2** UI hides what the API forbids, never the reverse.

### TEAM-1.5 — Reps can activate Connect
**As an** Operator with role `admin` **I want** to complete Connect/SMS activation **so that** the owner isn't a bottleneck (BF-023).
- **AC1** Gated by profile role + plan entitlement, not owner-ness.

## Traceability

| Story | Primary v2 endpoint |
| --- | --- |
| TEAM-1.1 | `POST /team/invites` |
| TEAM-1.2 | `POST /team/invites/accept` |
| TEAM-1.3 | `GET/PATCH/DELETE /team/members` |
| TEAM-1.4 | guards (`@RequireRole`) |
| TEAM-1.5 | `POST /messaging/setup` (role-gated) |
