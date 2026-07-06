# Spec 09 — Surveys

**v1 sources:** `surveys`, `survey_questions`, `survey_answers`, `survey_tracking`,
`survey_tracking_actions`, `survey_style` · **v2 targets:** same names.
**Run:** per profile, after 03 (tracking FKs contacts). Easiest domain — v1 already used
soft-delete + created/updated columns; mostly type-true copies.

## Prerequisites
- `legacy_id` on all six targets (G3).

## Column maps

**surveys:** ID→legacy_id; ProfileID lookup; Title/PageTitle/Description direct (G6/G7);
**Slug → slug: preserve verbatim** (public `/s/:slug` URLs). v2 slug is globally unique, v1
wasn't scoped-checked against soft-deleted rows — collision resolution: live row keeps the slug,
soft-deleted collider gets `-legacy<ID>` suffix + warning `SURVEY_SLUG_RESUFFIXED` (dead URLs
only). Views/Sent/Started/CompletedCount direct (known historical inflation from the
double-ViewsCount bug is documented, not repaired — plan §3.11);
**Status tinyint → active boolean** (`1→true`); Welcome/Thankyou json→jsonb (BF-040 cleanup: strip
the auto-populated `oggvo.com` redirect default from Thankyou during transform — decided by that
sprint fix); deleted_at/created_at/updated_at G1.

**survey_questions:** ID→legacy_id; SurveyID lookup; Question/Description direct (Description
'' stays — BF-009 makes it optional in v2 UI); **Type enum TitleCase → v2 lowercase**
(`Name→name`, `ShortText→short_text`, `RankingScale→ranking_scale`, `StarRating→star_rating`,
`MultipleChoice→multiple_choice`, `YesNo→yes_no`, `DateTime→date_time`, `FileUpload→file_upload`,
rest 1:1 lowercased); Required G4; Options json→jsonb (**`Options.Flow` branching data carried
verbatim but inert** — register decision: linear rendering); Order direct (**v1 bug: first
question order=2 for surveys built empty-first — keep raw values; v2 sorts by order, gaps are
harmless**).

**survey_tracking:** ID→legacy_id; SurveyID lookup; RecipientID→recipient_id (NULL ok);
TrackingCode→tracking_code (v2 unique — v1 dupes: keep earliest + suffix later ones + warning);
Step direct.

**survey_answers:** ID→legacy_id; QuestionID/SurveyTrackingID lookups (orphans → skip +
`ANSWER_ORPHAN` — v1 had no FKs); Answer json→jsonb (G6 on string leaf values).

**survey_tracking_actions:** ID→legacy_id; SurveyTrackingID lookup; Action verbatim.
**Exactly-once check** (Issues.txt rule): duplicate `'Completed'` rows per tracking id → keep
first, drop rest + warning `TRACKING_DUP_COMPLETED`, and decrement nothing (counters stay as
stored).

**survey_style:** PK=survey_id (lookup); all color/font columns direct — **do NOT rewrite
`progress_color` `#175CD3`→`#2E90FA`**: migrated surveys keep their v1 look; the new default
applies to new surveys only. BackgroundImage/Logo → media re-key (spec-08, varchar(45)→255 is
widening, safe).

## Validation
```sql
-- per-survey answer-count parity (the number a customer checks)
SELECT s.Slug, count(a.ID) FROM surveys s JOIN survey_questions q ON q.SurveyID=s.ID
  JOIN survey_answers a ON a.QuestionID=q.ID WHERE s.ProfileID=:v1id GROUP BY s.Slug;      -- v1
SELECT s.slug, count(a.id) FROM surveys s JOIN survey_questions q ON q.survey_id=s.id
  JOIN survey_answers a ON a.question_id=q.id WHERE s.profile_id=:v2id GROUP BY s.slug;    -- equal per slug
-- completed exactly-once
SELECT survey_tracking_id FROM survey_tracking_actions WHERE action='Completed'
 GROUP BY survey_tracking_id HAVING count(*)>1;                                            -- empty
```
Functional smoke: public `/s/<migrated-slug>` renders with v1 styling and takes a submission;
Overview charts aggregate historical + new answers together.
