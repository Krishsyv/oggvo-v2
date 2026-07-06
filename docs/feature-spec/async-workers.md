# Async Workers (Bots & Lambdas)

> **v2 target:** app `apps/workers` (NestJS standalone process + BullMQ on Redis) · queues `review-puller`, `sender`, `newsletter`, `social-publish`, `post-automator`, `activator`, `birthday`, `media-process`, `email-send` · `QueueService` abstraction (swappable to SQS+Lambda) · build phases 2–4
> **v1 sources:** Go daemons `bots/{activator,newsletter,post-automator,review-puller,sender,social}/` · Go Lambda ports `lambdas/{activator-bot,birthday-bot,newsletter-bot,post-automator-bot,review-puller-bot,sender-bot,social-bot}/` (dispatcher → SQS → worker pattern via `lambdas/_common/lambdabot`) · delivery/utility Lambdas `lambdas/{send-email,webhook-email,process-contacts-uploads,process-twilio-records,os-reporter}/` and the Node SAM stack `lambdas/sls/` (`generateByCampaign`, `resizeAssets`) · shared DB layer `libraries/commons` (note the `FOR UPDATE SKIP LOCKED` + `ClaimedAt` claim pattern) and `bots/review-puller/db` · build/deploy `bots/build-all.sh`

> **Note — no UI.** This domain is entirely background processing. Section 3 has no screenshots; the
> `_template.md` sections 2/3/4 are repurposed: §2 = worker inventory, §3 = per-worker detail, §4 =
> tables & queues touched, §5 = scheduling/timezone/idempotency rules, §7 = the v1→v2 queue mapping +
> known bugs.

## 1. Overview
OGGVO v1 runs all background processing in two coexisting styles. (a) **Long-running Go daemons**
(`bots/*`) — each is an infinite `for {}` loop that polls MySQL every 30s–60s, does work, and sleeps.
They are packaged as Docker images (`bots/build-all.sh` → ECR `oggvo-bot-*`) and run as always-on
ECS/EC2 containers. (b) **AWS Lambdas** — a partial re-platforming of those same daemons into the
*dispatcher → SQS → worker* fan-out pattern (`lambdas/*-bot`, Go, sharing `lambdas/_common/lambdabot`),
plus standalone utility Lambdas (Python/Node) for email send, webhooks, CSV ingestion, call-recording
transcription, and log shipping. Both styles call the same `libraries/commons` data access, which is
why the same job exists twice. The work itself: activating/scheduling recipients, sending email/SMS
campaigns, sending newsletters, birthday/anniversary messages, pulling reviews from social platforms,
auto-sharing reviews to social, publishing scheduled social posts, and rendering review/campaign
images. v2 collapses all of this into **one `apps/workers` process running nine BullMQ queues**, with a
`QueueService` interface so a high-volume queue (e.g. `email-send`) can later be swapped to SQS+Lambda
without touching domain code.

## 2. Worker inventory
Every v1 background processor and its v2 queue.

| v1 worker | Type / runtime | v1 path | Trigger (v1) | v2 queue |
| --- | --- | --- | --- | --- |
| activator | Go daemon (30s loop) | `bots/activator/` | always-on poll | `activator` |
| activator-bot | Go Lambda | `lambdas/activator-bot/` | EventBridge cron (single handler, no SQS) | `activator` |
| sender | Go daemon (30s loop) | `bots/sender/` | always-on poll; **8am–5pm Pacific gate** | `sender` (+ `email-send`) |
| sender-bot | Go Lambda (dispatcher→SQS→worker) | `lambdas/sender-bot/` | EventBridge cron → SQS chunks | `sender` (+ `email-send`) |
| newsletter | Go daemon (30s loop) | `bots/newsletter/` | always-on poll | `newsletter` (+ `email-send`) |
| newsletter-bot | Go Lambda (dispatcher→SQS→worker) | `lambdas/newsletter-bot/` | EventBridge cron → SQS chunks | `newsletter` (+ `email-send`) |
| birthday-bot | Go Lambda (single handler) | `lambdas/birthday-bot/` | EventBridge daily cron | `birthday` (+ `email-send`) |
| review-puller | Go daemon (30s loop) | `bots/review-puller/` | always-on poll | `review-puller` (+ `email-send`, `social-publish`) |
| review-puller-bot | Go Lambda (dispatcher→SQS→worker) | `lambdas/review-puller-bot/` | EventBridge cron → SQS chunks | `review-puller` |
| social | Go daemon (5 workers, 60s loop) | `bots/social/` | always-on poll | `social-publish` |
| social-bot | Go Lambda | `lambdas/social-bot/` | EventBridge cron | `social-publish` |
| post-automator | Go daemon (1 worker, 60s loop) | `bots/post-automator/` | always-on poll | `post-automator` (+ `media-process`) |
| post-automator-bot | Go Lambda | `lambdas/post-automator-bot/` | EventBridge cron | `post-automator` |
| sendEmail | Python 3.12 Lambda (SendGrid) | `lambdas/send-email/` | **synchronous Invoke** from sender/newsletter/birthday/review-puller bots | `email-send` |
| webhookEmail | Python 3.12 Lambda | `lambdas/webhook-email/` | HTTP API `POST /notify` (SendGrid Event Webhook) | API webhook (not a queue) |
| processContactUploads | Python 3.12 Lambda | `lambdas/process-contacts-uploads/` | S3 `ObjectCreated` on `*/imports/*` | `media-process`-style import job (contacts domain) |
| processTwilioRecordings | Python 3.11 Lambda (OpenAI) | `lambdas/process-twilio-records/` | direct Invoke with `{recordingURL}` | on-demand transcription job |
| lambdaOSReporter | Node 22 Lambda (OpenSearch) | `lambdas/os-reporter/` | SQS event source (`loggerQueue`) | observability (out of scope for portal queues) |
| reviewGenerateByCampaign | Node 14 Lambda (wkhtmltoimage) | `lambdas/sls/` (`index.generateByCampaign`) | API Gateway `GET /reviews/generate-by-campaign` | `media-process` |
| resizeAssets | Node 14 Lambda (graphicsmagick) | `lambdas/sls/` (`index.resizeAssets`) | S3 `ObjectCreated` | `media-process` |

## 3. Worker-by-worker detail
No UI for any of these. For each: purpose, trigger/cadence, external services, DB tables touched, what
it enqueues/invokes.

### activator — `bots/activator/main.go`
- **Purpose** — auto-activates pending recipients for profiles with `AutoActivateRecipients`, then
  creates per-campaign drip **schedules** for each newly activated recipient, applying campaign
  target/exclude **tag** filters and per-campaign `Delay`.
- **Trigger** — daemon, 30s sleep loop. Lambda variant (`lambdas/activator-bot`) runs the same
  `processOnce` body on an EventBridge cron (single handler, no SQS fan-out).
- **External services** — none (DB only).
- **Tables** — reads `profile`/profile-info, `campaign`, `invite_recipient`; writes `schedule` rows via
  `ScheduleRecipient`, updates recipient status (`ActivateRecipient`), `SetLastActivationDate`.
- **Enqueues** — nothing external; produces `schedule` rows the **sender** consumes.
- **Claim/cursor logic** — uses `FOR UPDATE SKIP LOCKED` + `ClaimedAt` to claim a window of profiles
  (`ORDER BY ID LIMIT 100`). When a claimed profile activates 0 recipients it **deliberately keeps the
  claim** until a 15-min timeout so the ID window advances; releasing early re-pins the window to the
  low-ID profiles and starves higher IDs.
- **Timezone bug** — `ScheduleRecipient` (`libraries/commons/db.go:472`) formats `time.Now()` as a
  wall-clock string that MySQL re-reads **as Pacific**. The daemon logs a `tz-check` line at boot; if
  `loc=UTC` every drip schedule silently shifts ~7h. See §5.

### sender — `bots/sender/main.go`
- **Purpose** — sends the actual email and SMS campaign messages for due `schedule` rows. Builds the
  email body (Unlayer "unlayered" raw HTML, or the templated `templates/emailV1.html` with
  thank-you/unsubscribe/affiliate/powered-by/tracker blocks via `Asset()` bindata), substitutes
  `[[placeholder]]`/`{{placeholder}}` tokens, generates a unique tracker UUID, then dispatches.
- **Trigger** — daemon, 30s loop, **gated to business hours `hour() >= 8 && <= 17`** and skips weekends
  when `campaign.SendOnWeekends == false`.
- **External services** — S3 (`GetObject` for the per-campaign `<profileID>/campaigns/<id>/email.html`
  template), the **`sendEmail` Lambda** (synchronous `RequestResponse` invoke for email), **Twilio
  REST API** (`POST .../Messages.json` with profile SID/token, optional `MessagingServiceSid`, optional
  `MediaUrl`) for SMS.
- **Tables** — reads `schedule`, `campaign`, `invite_recipient`, `profile`, `image`; writes
  `email_tracker` (`InsertTracker`/`CheckTracker`), updates `SetScheduleSent`, `SetRecipientLastSent`,
  `CheckLastCampaign`, deactivates recipients on error/suspension/opt-out.
- **Enqueues / invokes** — invokes `sendEmail` Lambda per email; calls Twilio directly per SMS.
- **Timezone bug** — the 8am–5pm gate uses container-local `time.Now().Hour()`; correctness depends on
  the Dockerfile pinning `TZ=America/Los_Angeles`. Self-checks via boot `tz-check` log; if the pin is
  lost the bot is online 1am–10am instead of 8am–6pm Pacific. See §5.

### newsletter — `bots/newsletter/main.go`
- **Purpose** — sends scheduled one-off **newsletters** to a profile's recipients (all, or filtered by
  tags). Same template/placeholder/tracker machinery as sender. Caches profile lookups per loop
  iteration. Pauses the campaign if the profile is suspended.
- **Trigger** — daemon, 30s loop (no business-hour gate).
- **External services** — S3 (template fetch), **`sendEmail` Lambda** (synchronous invoke).
- **Tables** — `newsletter`/campaign rows, `invite_recipient` (`GetNewsletterRecipients[ByTags]`),
  `profile`, `email_tracker`; `PauseCampaign`.
- **Enqueues / invokes** — invokes `sendEmail` per recipient email.

### birthday-bot — `lambdas/birthday-bot/handler.go` (Lambda only; no daemon)
- **Purpose** — sends birthday/anniversary lifecycle emails to recipients whose birthday matches today,
  per active birthday campaign (all recipients or by target tags).
- **Trigger** — EventBridge **daily** cron. Honours `BOT_DISABLED`.
- **External services** — **`sendEmail` Lambda** (async invoke, function name from
  `SEND_EMAIL_LAMBDA` secret, default `sendEmail-dev`).
- **Tables** — `GetBirthdayCampaigns`, `GetBirthdayRecipients[ByTags]`, `ClaimBirthdaySend`
  (idempotency claim so a recipient is not emailed twice/day), `invite_recipient`, `profile`.
- **Enqueues / invokes** — invokes `sendEmail`; releases the claim on failure.

### review-puller — `bots/review-puller/main.go`
- **Purpose** — pulls new reviews from connected platforms via their APIs and stores them; also pulls
  Google **insights** + **search keywords**; sends profile **notifications** for new reviews; and
  **auto-shares** qualifying reviews to social (`shareReview` → writes `social_post` rows + queues
  image render). Platforms handled: **Google** (My Business v4 reviews + Business Profile Performance
  metrics/keywords), **Facebook** (Graph API ratings), **Zillow** (lender / realtor feeds).
- **Trigger** — daemon, 30s loop. Lambda variant uses dispatcher (`DB.GetSocials()` → chunk → SQS) →
  worker per chunk; per-profile cadence is driven by `Social.LastScraped`.
- **External services** — Google OAuth2 (`business.manage`), Google MyBusiness + Business Profile
  Performance APIs, Facebook Graph API (`huandu/facebook`), Zillow feeds, S3, `sendEmail` Lambda
  (new-review notifications), `wkhtmltoimage` (review image render for shares). Vendor creds baked from
  `bots/review-puller/docker/config.json` (Secrets Manager `oggvo/bot-review-puller/config-json`).
- **Tables** — reads `social`, `profile`; writes `review` (`Review.Save`), `review_insight`
  (`insight.Save`), `review_keyword` (`keyword.Save`), `profile_notification`
  (`ProfileNotification.Save`), `social_post` (via `shareReview`).
- **Error handling** — `handleSocialError` classifies upstream failures (terminal / rate-limit /
  transient) and applies Deactivate / `RateLimitRetry(Retry-After)` / `RetryAfter(backoff)` with
  `Attempts++` and `MaxSocialAttempts` cap — the fix for the May 16 Zillow mass-deactivation that the
  old "any non-200 → Deactivate" logic caused.
- **Auto-share gating** — `shareReview` applies `isBadReview` (low-score / old-review skip), a minimum
  rating threshold, a platform **whitelist**, and template rotation
  (`AutoReviewShareMode` = `rotate`|`fixed`, pool `type-1..type-5`). A `backfill-share` subcommand
  re-runs `shareReview` for reviews with no `social_post` rows.
- **Enqueues / invokes** — invokes `sendEmail` (notifications); produces `social_post` rows consumed by
  the **social** worker; renders images for posts.

### social — `bots/social/main.go`
- **Purpose** — publishes due `post` rows to the connected platform. Per-platform branches for
  **Instagram** (photo / video-as-Reels with async container status polling, review/igreview images),
  **Facebook** (text / review / photo / video), **Twitter/X** (text / review / photo / video via
  oauth1 + go-twitter/anaconda), **Google** Business Profile, **LinkedIn**. Renders/uses pre-built
  review images (`getReviewImagePath`).
- **Trigger** — daemon, **5 concurrent workers**, 60s loop. Pulls `Posts.GetPostsToPost` (status
  queued), validates (`getValidJobs`), fans out to a buffered channel.
- **External services** — Facebook/Instagram Graph API (`socials.FB`), Twitter/X API (oauth1),
  LinkedIn API (`socials.LinkedIn`), Google Business Profile, S3/asset host for media URLs
  (`https://api.oggvo.com/assets/media/...`). Vendor creds from `bots/social/docker/config.json`
  (Secrets Manager `oggvo/bot-social/config-json`).
- **Tables** — `post`/`social_post` (claim via `FOR UPDATE SKIP LOCKED`, stamp `Status`, `URL`,
  `SocialID`, `FailureReason`, `Attempts`, `ClaimedAt`, `NextAttemptAt`), `social`, `review`, `image`,
  `video`.
- **Async media** — Instagram Reels containers are polled with `mediaPollInterval` (30s) via
  `RateLimitRetry` (does **not** increment `Attempts`) until `FINISHED`/`PUBLISHED`. `verifyPublished`
  re-reads after a transient post-commit error to avoid double-posting.

### post-automator — `bots/post-automator/main.go`
- **Purpose** — turns **social campaigns** (Content Planner) into individual scheduled review posts. For
  each campaign post it renders a branded review image (1080×1080) with `wkhtmltoimage`, generates
  150/400 thumbnails, then writes a scheduled `post` row for the social worker to publish.
- **Trigger** — daemon, 1 worker, 60s loop. `firstExec` arg supports one-shot render mode.
- **External services** — `wkhtmltoimage` shelling out to the portal `review/single` render endpoint;
  local filesystem image writes (`SOCIAL_CAMPAIGN_PATH`); `nfnt/resize` for thumbnails.
- **Tables** — `social_campaign` (`GetSocialCampaigns`, `UpdateStatus`), `campaign_posts`
  (`CustomCampaignPost`: `GetCampaignsPosts`, `Delete`, `Terminate`), `social`, `review`, `post`
  (`SaveScheduled`).
- **Enqueues** — produces scheduled `post` rows consumed by the **social** worker; v2 maps the image
  render to `media-process`.

### sendEmail — `lambdas/send-email/src/lambda_function.py`
- **Purpose** — the single email egress point. Sends via **SendGrid** (layer/API key), records per-send
  stats. Accepts a payload of `{from_email, from_name, reply_to, to_emails[], profile_id, message_type,
  subject, html_content}`; `message_type` values include `campaign_reviewSender` (and newsletter /
  birthday / review-notification variants).
- **Trigger** — synchronous `RequestResponse` **Lambda Invoke** from the Go bots (sender/newsletter/
  birthday/review-puller). Not currently SQS-driven.
- **External services** — SendGrid (Twilio), DynamoDB tables `EmailProvider` + `EmailStats`. Local-dev
  switches: `SENDGRID_SANDBOX`, `SENDGRID_STUB=1` (skip live send).
- **Tables** — DynamoDB only (`EmailStats` write); MySQL trackers are written by the calling bot.

### webhookEmail — `lambdas/webhook-email/src/lambda_function.py`
- **Purpose** — receives **SendGrid Event Webhook** callbacks (bounce / delivered / dropped /
  spamreport) and records send outcomes. Verifies the `x-twilio-email-event-webhook-signature` /
  timestamp ECDSA signature.
- **Trigger** — HTTP API `POST /notify`. (Bounce/complaint suppression logic is present but commented
  out.)
- **v2 note** — this is an inbound webhook, not a queue; in v2 it belongs in the API
  (`messaging`/`notifications`), optionally enqueuing follow-up work.

### processContactUploads — `lambdas/process-contacts-uploads/process_contacts/`
- **Purpose** — ingests uploaded contact CSVs into recipients: parse, normalize, **enrich/merge** with
  existing `invite_recipient` rows (birthday/anniversary/custom-field/tag merge in `enrich.py`),
  de-dup, insert.
- **Trigger** — S3 `ObjectCreated` on `<bucket>/*/imports/*` (RDS-Proxy + VPC). Uses a DynamoDB job
  table for progress.
- **Tables** — `invite_recipient` (insert/update), recipient tags.
- **v2 note** — belongs to the contacts domain; a `media-process`-style import job.

### processTwilioRecordings — `lambdas/process-twilio-records/process_recordings/app.py`
- **Purpose** — downloads a Twilio call **recording**, transcribes it (OpenAI), and summarizes/resumes
  the transcript. Enforces a `MAX_REC_SIZE` MB cap.
- **Trigger** — direct Invoke with `{ "recordingURL": "..." }`.
- **External services** — OpenAI (transcribe + summarize), Twilio recording URL fetch.

### lambdaOSReporter — `lambdas/os-reporter/src/index.js`
- **Purpose** — ships request-log records to **OpenSearch** (`request-logs` index, bulk) with partial-
  batch-failure reporting (`batchItemFailures`).
- **Trigger** — **SQS event source** (`loggerQueue`).
- **v2 note** — observability pipeline, out of scope for the portal BullMQ queues; keep on SQS or
  swap for the v2 logging stack.

### reviewGenerateByCampaign / resizeAssets — `lambdas/sls/src/index.js`
- **Purpose** — `generateByCampaign`: render review images for a campaign (wkhtmltoimage layer).
  `resizeAssets`: generate resized asset variants (graphicsmagick layer).
- **Triggers** — `generateByCampaign`: API Gateway `GET /reviews/generate-by-campaign` (IAM auth).
  `resizeAssets`: S3 `ObjectCreated`.
- **v2 note** — both map to the `media-process` queue.

## 4. Tables & queues touched
- **DB tables (v1 MySQL):** `profile` (+profile-info), `campaign`, `newsletter`, `schedule`,
  `invite_recipient` (recipients + tags), `email_tracker`, `image`, `video`, `social`, `social_post` /
  `post`, `social_campaign`, `campaign_posts`, `review`, `review_insight`, `review_keyword`,
  `profile_notification`. DynamoDB: `EmailProvider`, `EmailStats`.
- **Claim pattern:** activator / sender / social / review-puller all use `SELECT … FOR UPDATE SKIP
  LOCKED` + `ClaimedAt` / `NextAttemptAt` / `Attempts` columns to lease rows safely across concurrent
  workers (and across the daemon vs Lambda variants). v2 BullMQ replaces row-claiming with native job
  locking; the `Attempts`/`NextAttemptAt` semantics map to BullMQ `attempts` + `backoff`.
- **v2 queues (BullMQ on Redis, in `apps/workers`):** `review-puller`, `sender`, `newsletter`,
  `social-publish`, `post-automator`, `activator`, `birthday`, `media-process`, `email-send`. All
  enqueue/consume through the `QueueService` interface.

## 5. Scheduling, timezone & idempotency rules
- **Polling cadence (v1):** activator/sender/newsletter/review-puller loop every **30s**; social/
  post-automator every **60s**. birthday-bot runs **daily** (EventBridge). `BOT_DISABLED=true` makes
  every loop sleep without working (a kill switch).
- **Business-hours gate (sender):** only sends when container-local `hour() ∈ [8,17]`; skips Sat/Sun
  for campaigns with `SendOnWeekends == false`.
- **KNOWN TIMEZONE BUGS (must fix in v2):**
  1. **sender hardcodes Pacific.** The 8am–5pm gate reads `time.Now().Hour()` against the **container
     TZ**, which must be pinned `America/Los_Angeles` via the Dockerfile `ENV TZ`. If the pin is lost,
     the gate evaluates in UTC → bot is online ~1am–10am Pacific instead of 8am–6pm. Boot logs a
     `tz-check: loc=… hour=…` line to detect this.
  2. **activator relies on MySQL wall-clock as Pacific.** `ScheduleRecipient`
     (`libraries/commons/db.go:472`) formats `time.Now()` to a string that **MySQL re-interprets as
     Pacific**; if the process loc is UTC, every drip schedule shifts ~7h. Same `tz-check` log.
  - **v2 fix:** store all timestamps UTC, schedule per **profile/user timezone** (ARCHITECTURE.md says
    "sender bot hardcodes Pacific → per-profile timezone honoured by schedulers"). The send-window and
    weekend checks become per-profile-TZ comparisons, not container-clock comparisons.
- **Idempotency / dedupe:**
  - sender/newsletter generate a unique **tracker UUID** with a `CheckTracker` collision loop before
    `InsertTracker`; `SetScheduleSent` marks a schedule done so it is not re-sent.
  - birthday-bot uses `ClaimBirthdaySend(profile, campaign, recipient)` so a recipient is emailed at
    most once per day; the claim is released on failure for retry.
  - row-claim columns (`ClaimedAt` + 15-min timeout, `NextAttemptAt`, `Attempts`/`MaxSocialAttempts`)
    provide at-least-once with retry/backoff and a terminal give-up.
  - sender-bot/newsletter-bot/review-puller-bot Lambdas chunk work and dispatch deterministically
    (sorted by ID, content hashed) to make SQS replays safe.
  - **v2:** ARCHITECTURE.md mandates a **processed-key table** so BullMQ retries are idempotent; reuse
    tracker UUID + per-(profile,campaign,recipient,day) keys.
- **Retry classification (review-puller/social):** terminal → deactivate; rate-limit → retry after
  `Retry-After` (no attempt increment); transient → backoff + attempt increment; cap at max attempts.

## 6. Integrations
- **SendGrid (Twilio)** — all outbound email via the `sendEmail` Lambda; delivery/bounce/complaint
  events via `webhookEmail`. Per-send stats in DynamoDB `EmailStats`.
- **Twilio** — SMS sends (sender bot, REST API with per-profile SID/token + optional MessagingService);
  call-recording transcription source (process-twilio-records).
- **Google** — OAuth2 `business.manage`; MyBusiness reviews + Business Profile Performance metrics &
  search keywords (review-puller); Google Business Profile posting (social).
- **Meta (Facebook / Instagram)** — Graph API for review pulling and post publishing (Reels async
  container flow on Instagram).
- **Twitter/X** — oauth1, go-twitter/anaconda for posting.
- **LinkedIn** — posting API.
- **Zillow** — lender/realtor review feeds (review-puller).
- **OpenAI** — transcript transcription/summarization (process-twilio-records).
- **OpenSearch** — request-log shipping (os-reporter).
- **AWS** — S3 (templates, media, CSV imports, asset resize), SQS (Lambda fan-out + logger queue),
  EventBridge (cron triggers), DynamoDB (`EmailProvider`, `EmailStats`), Lambda layers
  (wkhtmltoimage, graphicsmagick, SendGrid), Secrets Manager (vendor configs, DB creds), RDS Proxy.

## 7. v1 → v2 queue mapping
- **App:** `apps/workers` — a single NestJS standalone process hosting all BullMQ processors. Domain
  services in `apps/api` enqueue jobs **only** through `QueueService` (never `import { Queue }`
  directly), so any one queue can be swapped to SQS+Lambda later.
- **Repeatable vs on-demand:** repeatable jobs (review-puller, sender, newsletter, post-automator,
  activator) use BullMQ repeatable/cron; birthday is a daily repeatable; social-publish/email-send/
  media-process are fired on-demand by domain events.
- **Build phases:** core delivery (sender, newsletter, email-send, activator, birthday) in **phase 2**
  (campaigns); social-publish + post-automator + review-puller in **phase 3** (social/reviews);
  media-process in **phase 3–4**.

| v1 worker(s) | Trigger (v1) | v2 queue | Trigger (v2) | Notes |
| --- | --- | --- | --- | --- |
| `bots/activator` + `lambdas/activator-bot` | 30s loop / cron | `activator` | repeatable | claim window → BullMQ locking; fix MySQL-wall-clock TZ bug |
| `bots/sender` + `lambdas/sender-bot` | 30s loop (8–17 PT) / cron→SQS | `sender` | repeatable; **per-profile TZ** send window | fans email to `email-send`; SMS direct via Twilio integration |
| `bots/newsletter` + `lambdas/newsletter-bot` | 30s loop / cron→SQS | `newsletter` | repeatable + on-demand | fans email to `email-send` |
| `lambdas/birthday-bot` | daily cron | `birthday` | daily repeatable | per-(profile,campaign,recipient,day) idempotency key |
| `bots/review-puller` + `lambdas/review-puller-bot` | 30s loop / cron→SQS | `review-puller` | repeatable (per-profile cadence via LastScraped) | enqueues `social-publish` (auto-share) + `email-send` (notifications) |
| `bots/social` + `lambdas/social-bot` | 60s loop (5 workers) / cron | `social-publish` | scheduled posts due | IG Reels async-status polling → delayed jobs; retry/backoff via BullMQ |
| `bots/post-automator` + `lambdas/post-automator-bot` | 60s loop / cron | `post-automator` | repeatable | image render delegated to `media-process` |
| `lambdas/send-email` | sync Invoke from bots | `email-send` | on-demand fan-out | **candidate for SQS+Lambda** swap via QueueService; keep SendGrid |
| `lambdas/sls` resizeAssets / generateByCampaign | S3 / API GW | `media-process` | on-demand | replace wkhtmltoimage/graphicsmagick layers with v2 render service |
| `lambdas/webhook-email` | HTTP `POST /notify` | — (API webhook) | API endpoint | inbound SendGrid events → messaging/notifications module |
| `lambdas/process-contacts-uploads` | S3 `ObjectCreated` | contacts import job | on-demand | belongs to contacts domain |
| `lambdas/process-twilio-records` | direct Invoke | on-demand transcription | on-demand | messaging domain; OpenAI |
| `lambdas/os-reporter` | SQS `loggerQueue` | — (observability) | keep SQS / v2 logging | not a portal queue |

### Known v1 bugs to fix in v2
- **Timezone (critical):** sender hardcodes Pacific via container TZ; activator depends on MySQL
  re-reading wall-clock as Pacific. Both silently shift schedules ~7h if the TZ pin is lost. Fix with
  UTC storage + per-profile-timezone scheduling (see §5).
- **Dual implementations / drift:** every job exists as both a Go daemon and a Go Lambda hitting the
  same `libraries/commons`, with two struct copies (`libraries/commons/structs` **and**
  `bots/review-puller/structs` — adding a column to one without the other breaks Lambdas with
  `missing destination name`). v2 has a single `@oggvo/db` source of truth.
- **Over-aggressive deactivation (historical):** the old "any non-200 → Deactivate" social-error path
  caused the May 16 Zillow mass-deactivation; v1 now classifies errors (`handleSocialError`). v2 must
  preserve terminal/rate-limit/transient classification, not blanket-deactivate.
- **Claim-cursor starvation:** activator's `ORDER BY ID LIMIT 100` window only advances because empty
  profiles keep their claim until timeout — fragile. v2 BullMQ job locking removes this hack.
- **`die`-on-error daemons:** several bot loops `return` (exit) on a single DB error, relying on the
  container restart policy. v2 should handle per-job failures with BullMQ retry, not process exit.
- **Synchronous email Invoke:** sender/newsletter block on a `RequestResponse` `sendEmail` invoke per
  recipient (slow, serial). v2 fans out to the `email-send` queue for parallelism/backpressure.

## 8. Open questions / parity risks
- **Daemon vs Lambda as source of truth:** which v1 variant is actually running in prod per job? The
  daemons and `*-bot` Lambdas can diverge; confirm before porting behaviour.
- **QueueService SQS swap boundary:** confirm whether `email-send` (and possibly `os-reporter` log
  shipping) launches on BullMQ or directly on SQS+Lambda in v2 — affects the QueueService contract.
- **Image rendering replacement:** v1 leans on `wkhtmltoimage`/graphicsmagick Lambda layers and a
  server-rendered `review/single` page. v2 needs a `media-process` render strategy (headless browser /
  image lib) — flag as a build decision.
- **Schema homes:** `email_tracker`, `EmailStats` (DynamoDB), `review_insight`/`review_keyword`,
  `profile_notification`, and the contacts-import progress (DynamoDB) need confirmed v2 Drizzle homes —
  possible schema gaps.
- **webhook signature & suppression:** v1 webhookEmail's bounce/complaint **suppression** logic is
  commented out. Decide whether v2 enforces suppression (deactivate recipients on hard bounce/spam).
- **OpenAI usage (call transcription):** confirm whether transcription stays a separate Lambda or moves
  into the messaging domain; cost/PII handling is undefined in v1.
- **Idempotency table design:** ARCHITECTURE.md mandates a processed-key table but does not specify
  granularity per queue; needs a per-queue key strategy (tracker UUID, (profile,campaign,recipient,day),
  social_post id, etc.).
