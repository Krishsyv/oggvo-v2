# Spec 08 — Media: files, rows, reference discovery

**v1 sources:** `image`, `video` rows + the S3-Files mount objects under
`public/assets/media/...` · **v2 targets:** `images`, `videos` (existing) + R0 `media_references`
+ S3 objects under the v2 bucket/key scheme.
**Run:** per profile, BEFORE 05b/06a (they resolve media legacy ids). Two phases: 08a rows+files, 08b references.

## Prerequisites
- `legacy_id` on images/videos; R0 `media_references` table.
- Read access to the v1 storage (S3-Files bucket) with a manifest listing (one `aws s3 ls`
  export per prefix, cached — do NOT per-file HEAD, that's the v1 anti-pattern).

## 08a — rows + physical copy

| v1 | v2 | transform |
| --- | --- | --- |
| image.ID / video.ID | legacy_id | direct |
| ProfileID | profile_id | legacy lookup |
| Image / Video (filename or path) | url | **new key:** `profiles/<v2ProfileId>/media/<legacyId>-<sanitized-basename>`; copy object v1→v2 bucket (server-side copy). Source resolution order: `uploads/<name>`, `uploads/thumbs/<name>` (thumb regenerated instead if original exists), `uploads/video/<name>`, verbatim path if it contains `/`. Not in manifest → row migrates with `url`=original string + warning `MEDIA_MISSING` (known prod/dev gap, plan §3.10) — render degrades per AD-12; NEVER drop the row (references depend on it). |
| Source | source | `'Social'→social` (case-insensitive), `'Upload'→upload`, else social + warning |
| CreateDate | created_at | G1 |

Also swept (no v1 rows, files only): profile logos (`profile.Logo`, spec-02), user avatars
(`user.Image`, spec-01), contact images (spec-03), reviewer avatars (spec-04), survey
logos/backgrounds (spec-09), campaign images. Each caller re-keys through THIS spec's copy
routine so every physical file is copied exactly once (dedupe by source path).

## 08b — reference discovery (PF-10 — this is why v1 nearly lost files)

Insert `media_references(media_id, feature, entity_table, entity_id)` from every consumer:

| consumer | reference |
| --- | --- |
| `social_post_media.MediaID` | feature `social`, social_posts row |
| `invite_campaign.ImageID` | feature `campaigns`, campaigns row |
| profile Logo / BusinessLogo | feature `tenancy`, profiles row |
| contact Image | feature `contacts` |
| survey_style Logo/BackgroundImage | feature `surveys` |
| message attachments (spec-07) | feature `messaging` |

Post-condition: **zero-reference media rows are legitimate** (unattached gallery uploads) — they
are NOT deleted; the point is that referenced ones are provably referenced.

## Validation
```sql
SELECT (SELECT count(*) FROM image WHERE ProfileID=:v1id) + (SELECT count(*) FROM video WHERE ProfileID=:v1id); -- v1
SELECT (SELECT count(*) FROM images WHERE profile_id=:v2id AND legacy_id IS NOT NULL)
     + (SELECT count(*) FROM videos WHERE profile_id=:v2id AND legacy_id IS NOT NULL);                          -- equal
-- physical copy accounting
SELECT count(*) FROM migration_warnings WHERE entity='media' AND code='MEDIA_MISSING' AND profile_id=:v2id;      -- human-reviewed
-- every social_post_media / campaign image resolves
SELECT count(*) FROM media_references r LEFT JOIN images i ON i.id=r.media_id
  LEFT JOIN videos v ON v.id=r.media_id WHERE i.id IS NULL AND v.id IS NULL;                                     -- 0
```
Functional smoke: a migrated social post renders its image from the CDN; deleting a
campaign-referenced image via API returns 409 with the campaign listed (PF-10 proof).
