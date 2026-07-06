# Spec 10 — Misc: notifications, targets, referrals, links, widgets, newsletters, admin queue

Small tables, run last (after all lookups exist). `legacy_id` on each target (G3).

## `notification` → `email_notifications` (review-alert recipients)
ID→legacy_id; EmailAddress→email (lowercase, skip empties + warning); ProfileID lookup.
These become NOTIF-1.1 preference rows (event type: new-review) — the 2026-06-24 outage's
"no recipients" failure mode is validated here: **profiles with reviews but zero notification
rows are listed in the report** (`NOTIF_NO_RECIPIENTS`) so CS can fix them at cutover.

## `profile_notification` → `profile_notifications` (in-app feed)
ID→legacy_id; Message G6; URL: rewrite v1 portal paths to v2 routes via the route map
(spec exists in redirect-map config); unmapped → keep + warning. **Status int → enum:**
`0→unread`, `>=1→read`. SeenBy int → seen_by user lookup (0/unresolved → NULL).
Only migrate last 90 days (feed noise beyond that; count noted in report).

## `monthly_targets` → `monthly_targets`
ID→legacy_id; ProfileID lookup; **date → month** (normalize to first-of-month; duplicate months
per profile after normalization → keep latest updated_at + warning); requests/reviews/
social_media_posts/reviews_posted/connections direct (NULL ok).

## `referrals` → `referrals`
ID→legacy_id; **ReferralID→referrer_profile_id, RefereeID→referee_profile_id** (profile legacy
lookups; 0/unresolved → NULL — v2 allows it); Name/BusinessName/Email/Phone direct;
**Status enum('0','1','-1') → `0→pending, 1→accepted, -1→declined`**.

## `linkmaster` → `link_masters` and `link` → `links`
linkmaster: ID→legacy_id; Name/ImageURL (media re-key)/Category direct; Active G4 (NULL→true).
link: ID→legacy_id; ProfileID lookup (NULL ProfileID rows = template links → skip + warning,
v2 links are profile-scoped); MasterLinkID→master_link_id lookup; Name/URL/ReviewMonitoringURL/
Rank/ImageURL direct; all tinyint flags → G4 **with v2 defaults on NULL** (is_active→true,
show_on_desktop/mobile→true, device_*→true, opens_in_new_window/skip_instructions→false,
show_in_review_funnel→true — matches v2 column defaults, not blanket-false; the funnel look must
not change at cutover). `ReviewMonitoringURL` non-empty → also seed a `crawler_history` row
(site_name=link name) so review monitoring resumes.

## `widgets` → `widgets`
ID→legacy_id; ProfileID lookup; WidgetID→widget_type (int map kept: 1 landing, 3 review-us,
4 review-me, 5 stream, 6 newsletter, 7 splash, 8 chat); Properties mediumtext→jsonb (parse;
`{"_raw":...}` fallback + warning). **Plus the register's ownership fix:** widget-ish settings
living on the v1 profile row (stream/button/splash colors etc.) were already routed to
`profile_review_settings` by spec-02 — v2 widget config reads them from `widgets.properties`
going forward; a one-time v2-side job composes initial `properties` for widget types the profile
uses but has no `widgets` row for (type 5/3/7), sourced from those settings. ETL itself stays
copy-only.

## `newsletter_newsletter` → `newsletters`, `newsletter_category` → `newsletter_categories`
Global (not per-profile), migrate once. category: ID→legacy_id, Name (v2 unique — dupes get
`-2` suffix + warning), Type, IsActive G4. newsletter: ID→legacy_id; CategoryID lookup;
Name (unique, same dupe rule); Body G6; DesignJson→jsonb; Image media re-key;
Subject direct; **DefaultDate: G2 — this is where the 1899/2022 defaults live (BF-038): → NULL**;
IsActive G4.

## `manage_requests` (admin deletion queue)
Migrate only `pending` rows: type map (`0→user`, `1→profile` — v1 constants OGGVO_DELETE_USER/
PROFILE), request_id → target legacy lookup, requester lookup. Historical resolved rows → skip
(audit value near zero; count in report).

## NOT migrated (final consolidated list — plan §3.13)
`login_history`, `review_backup`, CI `migrations`, request logs/OpenSearch, DynamoDB import row
detail (unless ops exports summaries pre-decommission), FCM/APN tokens, v1 sessions,
`notificaiton_navbar` (typo table — its SeenReview CSV → `notification_seen` rows IF the review
lookup resolves; else dropped: badge-seen state is cosmetic), `blacklisted_emails`-equivalent v1
data folds into `suppressions` if a v1 source exists (verify at implementation; none found in
the schema dump under that name).

## Validation
```sql
-- referral graph integrity
SELECT count(*) FROM referrals WHERE referrer_profile_id IS NULL AND legacy_id IS NOT NULL; -- == warnings count
-- links: funnel visibility unchanged (per profile: active link count parity)
SELECT count(*) FROM link WHERE ProfileID=:v1id AND (IsActive=1 OR IsActive IS NULL);
SELECT count(*) FROM links WHERE profile_id=:v2id AND is_active=true;
-- notification recipients gap report
SELECT count(*) FROM migration_warnings WHERE code='NOTIF_NO_RECIPIENTS';
```
Functional smoke: admin Manage page stat cards show sane numbers; a migrated profile's funnel
shows the same platform buttons in the same order as v1 (screenshot diff in the pilot).
