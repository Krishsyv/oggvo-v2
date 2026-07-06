# Spec 01 — Users, memberships, verifications

**v1 sources:** `user`, `user_profile`, `verification` · **v2 targets:** `users`, `user_profiles`, `verifications`
**Run:** global (not per-profile) for `user`/`verification`; `user_profile` rows migrate with each profile wave.
**Global rules G1–G10 apply** (see README). Upsert keys: `users.legacy_id`, `user_profiles(legacy_id)`, `verifications.legacy_id`.

## Prerequisites (R0 schema changes — blocked until done)
- `legacy_id bigint` on all three targets (G3).
- `users.legacy_password jsonb` — holds `{scheme: 'sha256_salt'|'utf16le_sha256', hash: base64, salt: base64}` for upgrade-on-login. v2 today has only `password_hash`.
- **Decision needed at R0:** align `account_type` enum with AD-09 (`none|sales|manager|supervisor|admin`). Current v2 enum (`user|staff|admin|superadmin`) loses the Sales/Manager distinction. Mapping below assumes the AD-09 ladder; if the 4-value enum survives, use the fallback column.

## Column map — `user` → `users`

| v1 | v2 | transform |
| --- | --- | --- |
| ID | legacy_id | direct |
| FirstName / LastName | first_name / last_name | G7 trim |
| EmailAddress | email | lowercase + trim. **Duplicate emails:** keep the row with most-recent LastLogin as canonical; others get warning `USER_DUP_EMAIL` and email suffixed `+legacy<ID>@` (v2 email is unique; v1 wasn't). |
| Password (blob) | legacy_password.hash | base64-encode; `password_hash` stays NULL until first v2 login re-hashes to argon2id |
| Salt (blob) | legacy_password.salt | base64-encode. Scheme detection: verify at login — try `sha256(salt+password)` then legacy UTF-16LE variant; record which succeeded. |
| AccountType (varchar '0'–'4') | account_type | AD-09 ladder: `'0'→none(user)`, `'1'→sales`, `'2'→manager`, `'3'→supervisor`, `'4'→admin`. Fallback to current enum: `0→user, 1|2→staff, 3→admin, 4→superadmin` + warning `USER_TIER_LOSSY`. Non-numeric/NULL → user + warning. |
| PermissionFunnel…PermissionSupport (bit) / PermissionSms (tinyint) | perm_funnel…perm_support / perm_sms | G4. Also feed spec-02's grandfathered-entitlement derivation (profile-level). |
| LastLogin | last_login_at | G1 |
| LastProfileViewUUID ('' or uuid) | last_profile_view_uuid | ''→NULL; invalid uuid → NULL + warning |
| CreateDate / LastUpdated | created_at / updated_at | G1; NULL CreateDate → migration run time + warning `USER_NO_CREATEDATE` |
| Moved (bit) | — | DROP (v1 internal migration flag, meaningless in v2) |
| Suspended | suspended | G4 |
| Image | image | media re-key via spec-08 (avatar files); keep filename if file missing + warning `MEDIA_MISSING` |
| FcmToken / ApnToken | — | DROP (decision §3.13 of the plan: push tokens are stale; devices re-register on next login) |

## Column map — `user_profile` → `user_profiles`

| v1 | v2 | transform |
| --- | --- | --- |
| ID | legacy_id | direct |
| UserID / ProfileID | user_id / profile_id | via legacy-id lookup maps. Orphans (user or profile missing) → skip + warning `MEMBERSHIP_ORPHAN`. Duplicates (same pair twice) → single row. |
| — | role (R0 column) | `owner` if UserID == profiles.created_by, else `admin` if the user has ≥5 of 7 permission flags true, else `member`. Every profile must end with ≥1 owner: if none qualifies, promote the earliest membership + warning `PROFILE_NO_OWNER`. |

## Column map — `verification` → `verifications`

Only migrate rows where `Completed != 1` AND `ExpireDate > now()` (live tokens; historical ones are noise).

| v1 | v2 | transform |
| --- | --- | --- |
| ID | legacy_id | direct |
| VerificationType | type | `'NewUser'→registration`, `'Password'→password_reset`; anything else → skip + warning `VERIF_UNKNOWN_TYPE` |
| Token | token | direct (v2 unique — collision: keep newest, warn) |
| UserID | user_id | legacy lookup |
| Completed (bit) | completed | G4 |
| CreateDate / ExpireDate | created_at / expires_at | G1 |

**Consequence:** in-flight v1 activation/reset links keep working on v2 IF the v1 URL redirect map (plan §2) rewrites `password/reset?token=` to the v2 route. Verify in pilot.

## Validation (per run)
```sql
-- counts (v1 vs v2)
SELECT count(*) FROM user;                       -- v1
SELECT count(*) FROM users WHERE legacy_id IS NOT NULL;  -- v2 (== v1 minus USER_DUP_EMAIL warnings)
-- no membership orphans
SELECT count(*) FROM user_profiles up LEFT JOIN users u ON u.id=up.user_id WHERE u.id IS NULL; -- must be 0
-- every migrated profile has an owner
SELECT p.id FROM profiles p WHERE p.legacy_id IS NOT NULL AND NOT EXISTS
  (SELECT 1 FROM user_profiles up WHERE up.profile_id=p.id AND up.role='owner');  -- must be empty
```
Functional smoke: login as a pilot user with their v1 password → succeeds → `password_hash` populated, `legacy_password` cleared.
