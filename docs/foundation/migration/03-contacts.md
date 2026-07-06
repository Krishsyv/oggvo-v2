# Spec 03 — Contacts, tags, import summaries

**v1 source:** `invite_recipient` · **v2 targets:** `contacts`, `contact_tags`,
`contact_tag_assignments`, `contact_imports` (summaries only — DynamoDB row detail is NOT migrated, plan §3.13).
**Run:** per profile, after spec-02.

## Prerequisites
- `contacts.legacy_id`, `contact_imports.legacy_id` (G3).
- Suppression table (`suppressions`, R0/PF-17) — bounced contacts also write suppression rows.

## Column map — `invite_recipient` → `contacts`

| v1 | v2 | transform |
| --- | --- | --- |
| ID | legacy_id | direct |
| EmailAddress | email | lowercase+trim; v1 default '' stays '' (v2 notNull ''). |
| Phone | phone | normalize to E.164 via libphonenumber (default US); unparseable → keep raw + warning `CONTACT_BAD_PHONE` |
| FirstName / LastName | first_name / last_name | G7, G6 |
| OptIn | opt_in | G4 (default true) |
| Sent | sent_count | NULL→0 |
| LastSent | last_sent_at | G1 |
| **Status** | status | `'Pending'→pending` · `'Active'→activated` · `'Deleted'→ migrate + `deleted_at`=LastUpdated (soft delete; v2 contacts table needs `deleted_at` — R0 PF-2 column)` · **`'Inactive'` → `unsubscribed` IF (OptIn=0 OR an Unsubscribed activity exists in invite_history for this recipient) ELSE `suppressed`** (decided, plan §3.3) · any other value → pending + warning `CONTACT_UNKNOWN_STATUS` |
| Source | source | map: `NULL/''/'manual'→manual`, `%csv%/%upload%/%import%→csv_import`, `%widget%/%chat%→widget`, webhook provider names (`square, stripe, shopify, clover, clio, quickbooks, fub, liondesk, pam`)→`api`; unknown → manual + warning `CONTACT_UNKNOWN_SOURCE` (keep original string in custom_fields._legacySource) |
| ActivationDate | activated_at | G1 |
| Tags (CSV varchar) | contact_tags + assignments | split on ',', trim, dedupe case-insensitively; create per-profile `contact_tags` rows (first-seen casing wins); system tags `invalid`,`Bounced`,`LionDesk` preserved verbatim. Empty string → no tags. |
| CustomField (single varchar) | custom_fields | `{"note": <value>}` when non-empty, plus `_legacySource` if set above; else `{}` |
| Birthday / Anniversary | birthday / anniversary | G2 zero-dates→NULL; also **impossible dates (e.g. Feb 30 stored as 0000 artifacts) → NULL + warning** |
| Image | image | media re-key (spec-08) |
| CreateDate / LastUpdated | created_at / updated_at | G1 |

**Side effect:** every contact tagged `Bounced` (or status→suppressed via bounce evidence) also
inserts `suppressions(profile_id, channel:'email', address, reason:'bounce_migrated')`. STOP-based
SMS opt-outs are derived in spec-07 (conversation parsing) — not here.

## `contact_imports` (summaries)
Copy v1 `contact_imports`-equivalent summary rows if present in the dump under that name — the
extraction found `contact_imports` only in v2. v1 kept import *names/counts* in DynamoDB + the
`invite_recipient.Source`; therefore: **create one synthetic `contact_imports` row per distinct
v1 CSV batch only if the ops team exports the DynamoDB summary before decommission** (checklist
item in plan §8); otherwise skip entirely — historical import UI starts empty + release note.

## Validation
```sql
SELECT count(*) FROM invite_recipient WHERE ProfileID=:v1id;                       -- v1
SELECT count(*) FROM contacts WHERE profile_id=:v2id AND legacy_id IS NOT NULL;    -- equal (incl. soft-deleted)
-- status distribution sanity (report side-by-side, human-reviewed)
SELECT status, count(*) FROM contacts WHERE profile_id=:v2id GROUP BY status;
-- tag integrity: no orphan assignments
SELECT count(*) FROM contact_tag_assignments a LEFT JOIN contacts c ON c.id=a.contact_id WHERE c.id IS NULL; -- 0
-- every v1 'Inactive' decision is traceable
SELECT count(*) FROM migration_warnings WHERE entity='contacts' AND code IN ('CONTACT_UNKNOWN_STATUS');
```
Functional smoke: contacts list renders with correct tabs (All/Active/Pending…), tags filter works,
a migrated `suppressed` contact is NOT selectable as a campaign target (eligibility engine check).
