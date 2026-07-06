# Spec 02 — Profile god-table → profiles + 7 satellites (+ geo, entitlements)

**v1 source:** `profile` (100+ cols) · **v2 targets:** `profiles`, `profile_review_settings`,
`profile_google`, `profile_email_settings`, `profile_messaging_settings` (+`messaging_settings` v1 table, see spec-07),
`profile_newsletter_settings`, `profile_affiliate`, `profile_prompts`, `geo_zipcodes_profile`, grandfathered plan.
**Run:** first per-profile step — everything else FKs `profiles.id`. One v1 row → 8 v2 rows in ONE transaction.

## Prerequisites
- `legacy_id` on `profiles` (G3). Satellites don't need one (PK = profile_id).
- R0 additions used here: `plans/subscriptions/entitlements` tables; `profiles.business_logo` (schema gap — v2 has only `logo`).

## Column map — `profile` → `profiles` (core)

| v1 | v2 | transform |
| --- | --- | --- |
| ID | legacy_id | direct |
| UUID | public_id | keep if valid uuid, else mint + warning `PROFILE_BAD_UUID` |
| Name / BusinessName / InternalID | name / business_name / internal_id | G7 |
| **Shortname** | shortname | **preserve verbatim** (public funnel URLs). Collision across profiles → STOP the profile, human decision (never auto-rename). |
| Logo | logo | media re-key (spec-08) |
| Address/Address2/City/State/Zipcode/Phone | same names | direct |
| Timezone | timezone | if valid IANA keep; else resolve from address (v2 resolver); else 'America/Los_Angeles' + warning `PROFILE_TZ_GUESSED` |
| Latitude/Longitude (varchar) | latitude/longitude (double) | parseFloat; ''/invalid → NULL |
| Suspended / Migrated | suspended / migrated | G4; set `migrated=true` for every ETL'd profile |
| CreatedBy / LastUpdatedBy | created_by / last_updated_by | user legacy lookup; missing → NULL |
| LastViewed / LastRecipientActivation / ExpirationDate / ClaimedAt | *_at columns | G1; ClaimedAt→NULL (worker-claim artifact, not state) |
| CreateDate / LastUpdated | created_at / updated_at | G1 |

## Satellite routing (v1 col → satellite.col — transforms per G-rules unless noted)

**profile_review_settings:** HappyMinimum, StarShape, StarText1–5, MessageHeader, MessageText,
MessageHappy, MessageUnhappy, ThankYouHeading, ThankYouBody, ThankYouMessage,
NegativeFeedbackMessage, CustomPoweredBy, ShowBusinessNameText, ShowReviewStream,
ShowLocationDetails, UseCaptcha, ShowPoweredBy, HideOggvoReviews, DoNotFilter, ShowReviews,
IncludeEmpty, ShowAggregate, UseReviewersLastInitial, NumberOfReviews,
ReviewNotificationThreshold (varchar ''→NULL, else parseInt), StreamThreshold (varchar→int),
**SocialThreshold (varchar→int; v1 stores star−1: migrate the RAW value, v2 code treats it as
star−1 too — do NOT +1 here; parity first, normalize in a v2-side migration with the UI)**,
SocialReviewMessage, ReviewWidgetButtonBgColor/TextColor, LocationBusinessName/PostalCode/Phone,
PaletteID/DesignID (legacy lookups → palettes/designs migrated first as global tables — copy v1
`palette`/`design` rows verbatim), UseDesign.

**profile_google:** GooglePlaceID, GoogleCID, GoogleLRD, GoogleReviewDialog,
GoogleAlternateReview, GoogleMapsURL, GoogleReviewList.

**profile_email_settings:** EmailCampaignFromName→from_name, FromEmail→from_email,
ReplyTo→reply_to, AutoActivateRecipients, AutoActivateLimit, ActiveRecipientLimit,
DaysBeforeRemovingPastRecipients, DeactivateRecipientsOnOpen/Click/Clickthrough,
TimeActivateRecipients (keep 'HH:MM:SS' string; interpreted in profile tz by v2 scheduler — PF-3).

**profile_messaging_settings:** SMSNumber, SMSNumberSID, **SMSNumberToken → vault-encrypt (PF-9),
column stores vault ref, never plaintext**, SMSNumberID, MessagingServiceId. (autoResponse/smsLimit
etc. come from v1 `messaging_settings` — spec-07 merges into this same row; run 02 first.)
Dead-subaccount detection: post-migration health check flags closed subaccounts → clear SMS fields
(the v1 deadlock fix, TFV-1.6 behaviour).

**profile_newsletter_settings:** NewsletterBgColor→bg_color, TextColor, Header, Footer,
NewsletterButtonID→button_id (0→NULL).

**profile_affiliate:** AffiliateActive→active, AffiliateCode→code (''+active → generate at first
use, don't invent), AffiliateFooterText→footer_text.

**profile_prompts:** PromptVisitorsToConnect, PromptFacebook→facebook, Twitter, Instagram,
Youtube, PromptPageWeb→web, PromptOggvo.

## Grandfathered plan (plan §3.12)
One `subscriptions` row per profile: plan `legacy_grandfathered`, no Stripe id. Entitlements
derived: `connect_sms` = any member had PermissionSms AND SMSNumber != '' ; `widgets/reviews/
campaigns/analytics/social/surveys` = true (v1 gated by user flags, not profile — grant all,
restrict per-user via role). `sms_credits_month` = v1 `messaging_settings.smsLimit` (spec-07).

## Geo
v1 `geo_zipcodes` is global (zip → lat/long): migrate once, dedupe by zip. v1 links profile-zips
via… **v1 has no `geo_zipcodes_profile` table in the dump — profile zips live where the Settings
spec found them; if the ETL finds no link table, reconstruct from `profile.Zipcode` (1 row) and
flag `GEO_LINKS_UNKNOWN` for a source-code check** (Settings.php `zipcodes` endpoint is the truth).

## Validation
```sql
SELECT count(*) FROM profile;                                   -- v1
SELECT count(*) FROM profiles WHERE legacy_id IS NOT NULL;      -- equal
-- every migrated profile has all 7 satellites
SELECT p.id FROM profiles p WHERE p.legacy_id IS NOT NULL AND (
  NOT EXISTS (SELECT 1 FROM profile_review_settings s WHERE s.profile_id=p.id) OR
  NOT EXISTS (SELECT 1 FROM profile_google s WHERE s.profile_id=p.id) OR
  NOT EXISTS (SELECT 1 FROM profile_email_settings s WHERE s.profile_id=p.id) OR
  NOT EXISTS (SELECT 1 FROM profile_messaging_settings s WHERE s.profile_id=p.id) OR
  NOT EXISTS (SELECT 1 FROM profile_newsletter_settings s WHERE s.profile_id=p.id) OR
  NOT EXISTS (SELECT 1 FROM profile_affiliate s WHERE s.profile_id=p.id) OR
  NOT EXISTS (SELECT 1 FROM profile_prompts s WHERE s.profile_id=p.id));  -- empty
-- shortname uniqueness survived
SELECT shortname, count(*) FROM profiles GROUP BY shortname HAVING count(*)>1;  -- empty
-- no plaintext twilio tokens
SELECT count(*) FROM profile_messaging_settings WHERE sms_number_token LIKE 'SK%' OR length(sms_number_token)=32; -- 0
```
Functional smoke: open `/r/<shortname>` for a pilot profile → funnel renders with migrated colors/copy.
