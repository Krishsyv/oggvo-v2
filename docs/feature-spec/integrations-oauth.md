<!--
Feature spec — Integrations, OAuth & Webhooks domain.
Most of this is BACKEND (OAuth callbacks + inbound webhooks). Sections 2/3 are adapted to a
per-provider list rather than UI routes. The only user-facing surface is Settings → Accounts,
which is owned by the Social / Settings specs; this spec owns the OAuth/webhook backend + token store.
v1 paths are relative to the `oggvo` repo.
-->

# Integrations, OAuth & Webhooks

> **v2 target:** module `apps/api/src/modules/integrations` (controller/service/repository/DTOs) · tables `social_accounts` + an OAuth **token vault** (encrypted at rest, AES-GCM — `@oggvo/db`) · queues `media-process` (avatar download) + `email-send`/`sender` (inbound auto-reply) · build phase 4
> **v1 sources:** OAuth connect controllers `apps/portal-api/app/Controllers/API/V2/OAuth/{Facebook,Twitter,Linkedin,Google,Square,Stripe,Clover,Liondesk,Pam,Shopify,Quickbooks,Clio}.php`; non-OAuth connectors in `apps/portal-api/app/Controllers/API/V2/Socials.php` (`setupFUB`, `save` for Zillow, `delete` for revoke/cleanup); inbound webhooks `apps/portal-api/app/Controllers/Webhook/{Square,Stripe,Twilio,TwilioVerification,TwilioTollfreeStatus,Facebook,Instagram,Shopify,Clover,Clio,QuickBooks,Preapproveme,Fub}.php`; provider classes `app/Services/Providers/{Facebook,Google,Instagram,LinkedIn,Twitter}Provider.php`; libraries `app/Libraries/Clover/*`, `app/Libraries/LionDesk/*`; services `app/Services/{FollowUpBoss,Messenger,ZipCodeApi}.php`; model `app/Models/SocialModel.php` (table `social_stream`); config `app/Config/Keys.php`; routes `app/Config/Routes.php` (`/oauth` group lines 202-215, `/webhook` group lines 572-614).

## 1. Overview

This domain owns **every third-party connection** a business can make and **every inbound event** those third parties send back. It has two halves:

1. **OAuth connect flows** — the user clicks "Connect X" in Settings → Accounts, gets redirected to the provider, and the provider redirects back to a portal frontend page (`dashboard/settings/<provider>redirect`) which immediately calls our `/api/v2/oauth/<provider>` endpoint with the returned `code`/`oauth_token`/`token`. That endpoint exchanges the code for tokens, fetches the connected account's display name, and persists the connection. Providers: **Facebook, Instagram (via Facebook), Twitter/X, LinkedIn, Google (Business Profile), Square, Stripe, Clover, LionDesk, Pre-Approve Me (PAM), Shopify, QuickBooks, Clio**, plus two **non-OAuth** connectors saved through `Socials::save`/`setupFUB`: **Zillow** (screen-name/NMLS lookup, no token) and **Follow Up Boss** (manual API key + auto-registered webhooks).

2. **Inbound webhooks** — once connected, providers push events to `/webhook/<provider>/trigger`. Most webhooks (Square, Stripe, Clover, Shopify, Clio, QuickBooks, Pre-Approve Me, Follow Up Boss) exist to **harvest customers/contacts** into the `recipients` table (so the business can later request reviews / send campaigns). The Meta webhooks (Facebook, Instagram) deliver **inbound chat messages** into the messaging inbox. The Twilio webhooks deliver **inbound SMS/MMS** (messaging inbox + keyword auto-response) and **compliance status** updates (toll-free / brand / campaign registration).

The connectors double as the **payment processors**: Square, Stripe, and Clover are connected as merchant accounts and their payment/order webhooks are the primary source of recipients. **This is where the dependency-audit's payment-SDK risk lives:** `stripe/stripe-php ^10.11` (10 majors behind 20.x) and `square/square` pinned to the exact 4-year-old build `17.1.0.20220120` (latest 45.x). Both are used in live OAuth + webhook code below.

**Access:** all OAuth endpoints are behind the `apiAuth` filter and scoped to `request.auth.profile_id` (one tenant). No extra role gate in v1. Webhook endpoints are **public** (no auth filter) and authenticate per-provider via signature/HMAC verification (see §5). Connections are stored once per profile; reconnecting deletes the prior row(s) for that provider+page.

## 2. Providers (connect flows) — per-provider list

> Adapted from the template's "Pages & tabs": this is backend, so the table lists each **provider connect flow** instead of UI routes. The single UI surface is **Settings → Accounts** (`/settings/accounts`, owned by the Social/Settings specs), which renders "Connect" buttons and the provider redirect pages.

| Provider | OAuth? | Connect endpoint (callback) | v1 controller | Frontend redirect page | Token style | Stored `social_stream.Name` |
| --- | --- | --- | --- | --- | --- | --- |
| Facebook (+ Instagram) | Yes (OAuth2) | `GET /api/v2/oauth/facebook` | `OAuth/Facebook.php::redirect` | `dashboard/settings/facebookredirect` | long-lived page token | `Facebook`, `Instagram` |
| Twitter / X | Yes (OAuth 1.0a) | `GET /api/v2/oauth/twitter` | `OAuth/Twitter.php::redirect` | `dashboard/settings/twitterredirect` | oauth_token + secret | `Twitter` |
| LinkedIn | Yes (OAuth2) | `GET /api/v2/oauth/linkedin` | `OAuth/Linkedin.php::redirect` | `dashboard/settings/linkedinredirect` | access + refresh + expiry | `LinkedIn` |
| Google (Business Profile) | Yes (OAuth2) | `GET /api/v2/oauth/google` | `OAuth/Google.php::redirect` | `dashboard/settings/googleredirect` | access + refresh + user_id | `Google` |
| Square | Yes (OAuth2) | `GET /api/v2/oauth/square` | `OAuth/Square.php::redirect` | `dashboard/settings/squareredirect` | access + refresh + expiry | `Square` |
| Stripe | Yes (Connect OAuth2) | `GET /api/v2/oauth/stripe` | `OAuth/Stripe.php::redirect` | `dashboard/settings/striperedirect` | access + refresh + stripe_user_id | `Stripe` |
| Clover | Yes (OAuth2 + merchant_id) | `GET /api/v2/oauth/clover` | `OAuth/Clover.php::redirect` | `dashboard/settings/cloverredirect` | access token | `Clover` |
| LionDesk | Yes (OAuth2) | `GET /api/v2/oauth/liondesk` | `OAuth/Liondesk.php::redirect` | `dashboard/settings/liondeskredirect` | access + refresh + expiry | `LionDesk` |
| Pre-Approve Me (PAM) | Token handshake | `GET /api/v2/oauth/pam` | `OAuth/Pam.php::redirect` | `dashboard/settings/pamredirect` | session token (`X-PAM-S`) | `Pre-Approve Me` |
| Shopify | Yes (OAuth2 + HMAC) | `GET /api/v2/oauth/shopify` | `OAuth/Shopify.php::redirect` | `dashboard/settings/shopifyredirect` | access token | `Shopify` |
| QuickBooks | Yes (OAuth2 + realmId) | `GET /api/v2/oauth/quickbooks` | `OAuth/Quickbooks.php::redirect` | `dashboard/settings/quickbooksredirect` | access + refresh + expiry | `QuickBooks` |
| Clio | Yes (OAuth2) | `GET /api/v2/oauth/clio` | `OAuth/Clio.php::redirect` | `dashboard/settings/clioredirect` | access + refresh + expiry + webhook secrets | `Clio` |
| Follow Up Boss | No — API key | `POST /api/v2/socials/save` (`name=followupboss`) | `Socials.php::setupFUB` | API-key modal in Settings | API key | `FollowUpBoss` |
| Zillow | No — lookup only | `POST /api/v2/socials/save` (`name=zillow`) | `Socials.php::save` | Screen-name / NMLS modal | n/a (profile id) | `Zillow` |

| Inbound webhook | Public route | v1 controller | Trigger / purpose |
| --- | --- | --- | --- |
| Square | `POST/GET /webhook/square/trigger` | `Webhook/Square.php::trigger` | payment created → import customer as recipient |
| Stripe | `POST/GET /webhook/stripe/trigger` | `Webhook/Stripe.php::trigger` | `payment_intent.succeeded` → import customer |
| Clover | `POST /webhook/clover/trigger` | `Webhook/Clover.php::trigger` | order created → import order customers |
| Shopify | `POST/GET /webhook/shopify/trigger` | `Webhook/Shopify.php::trigger` | customer created → import recipient |
| Clio | `POST/GET /webhook/clio/trigger?model=&pid=` | `Webhook/Clio.php::trigger` | contact/matter/bill created/updated → import recipient |
| QuickBooks | `POST /webhook/quickbooks/trigger` | `Webhook/QuickBooks.php::trigger` | entity change (Customer/Invoice/Payment/Purchase/PurchaseOrder/Bill) → pull + import |
| Pre-Approve Me | `POST /webhook/preapproveme/trigger` | `Webhook/Preapproveme.php::trigger` | loan status = Closed → import borrowers + co-borrowers |
| Follow Up Boss | `POST /webhook/fub/(:accountId)` | `Webhook/Fub.php::trigger` | people/relationship/call/email/text/deal events → pull + import |
| Facebook (Messenger) | `GET/POST /webhook/facebook/trigger` | `Webhook/Facebook.php::verify` / `::trigger` | page message → messaging inbox + auto-respond |
| Instagram (DM) | `GET/POST /webhook/instagram/trigger` | `Webhook/Instagram.php::verify` / `::trigger` | IG message → messaging inbox + auto-respond |
| Twilio inbound SMS/MMS | `* /webhook/twilio/trigger` (+ `/webhook/twilio/(:num)/inbound`, `/fallback`) | `Webhook/Twilio.php::trigger` | inbound SMS → messaging inbox, STOP/START opt-out, keyword auto-response, cadences |
| Twilio brand/campaign status | `* /webhook/twilio/(:num)/status` | `Webhook/TwilioVerification.php::trigger` | A2P brand/campaign registration status (currently **stubbed/commented out**) |
| Twilio toll-free status | `POST /webhook/twilio/tollfree/status` | `Webhook/TwilioTollfreeStatus.php::handle` | toll-free verification status change (idempotent, signature-verified) |
| Twilio voice (Calls) | `POST /webhook/calls/twilio/{answer,status,voicemail,recordings,transcriptions}` | `Webhook/Calls/Twilio.php` | call answer/status/voicemail/recording/transcription (Calls feature — out of this spec's core scope but lives in the same group) |

## 3. Provider-by-provider — connect + webhook detail

> Adapted "Screen-by-screen". One subsection per provider, covering the OAuth/connect logic and the matching webhook(s). Screenshot placeholders point at the one UI surface that exists (Settings → Accounts).

![accounts](_assets/screens/integrations/settings-accounts.png) <!-- placeholder until captured -->

### Facebook (+ Instagram) — `OAuth/Facebook.php`
- **Connect** — uses the `JanuSoftware\Facebook` SDK (`default_graph_version v15.0`). Flow: exchange `code` → access token at `frontURL + fbRedirectUri`; `debugToken` validates app id + expiration; short-lived token is exchanged for a **long-lived** token; granular scopes are read from token metadata.
- **Required scopes** (`Keys::fbPermissions`, all must be granted or the connect fails with "Missing Required Permissions"): `pages_manage_ads, pages_manage_metadata, pages_read_engagement, pages_read_user_content, pages_manage_posts, pages_manage_engagement, pages_show_list`. IG scopes (`Keys::igPermissions`): `instagram_basic, instagram_content_publish`. (Login also requests `pages_messaging, instagram_manage_messages` via `fbLoginPermissions`.)
- **What's stored** — calls `/me/accounts` to list managed pages; for each page with an `access_token`: upsert a `social_stream` row (`Name=Facebook`, `Page`=page name, `PageID`=page id, `AuthorizationToken`=page token, `Active=1`), create a review link (`<page link>/reviews`) if missing, and **subscribe the page to webhook events** via `subscribe_to_events()` (`messenger_helper`). Then for each page it looks up `instagram_business_account`; if IG-scoped, inserts a separate `social_stream` row `Name=Instagram` (`PageID`=ig id, token = page token). Per-page IG lookup failures are logged and skipped (do not fail the whole connect).
- **Webhook** (`Webhook/Facebook.php`) — `verify()` handles Meta's GET handshake (`hub_mode=subscribe`, `hub_verify_token === keys.fbSignature` → echo `hub_challenge`). `trigger()` verifies `x-hub-signature-256` HMAC over the body with `fbAppSecret` (`Messenger::verifyPayload`), then for `object == page` iterates `entry[].messaging[]` and routes text/attachment messages to `Messenger::handleMessage('facebook', pageId, senderId, message, timestamp)` → appends to `messaging` conversation (keyed `pageId:senderId`), downloads sender avatar, and triggers keyword auto-response.

### Instagram — `OAuth` via Facebook; `Webhook/Instagram.php`
- **Connect** — Instagram has **no standalone OAuth endpoint**; IG business accounts are discovered and stored during the Facebook connect (above). Credentials in `Keys`: `InstagramID`, `InstagramSecretID`.
- **Webhook** — identical shape to Facebook but `object == 'instagram'` and HMAC verified with `keys.InstagramSecretID`; routes to `Messenger::handleMessage('instagram', …)`.

### Twitter / X — `OAuth/Twitter.php`, `Services/Providers/TwitterProvider.php`
- **Connect** — OAuth **1.0a** via `Abraham\TwitterOAuth`. Callback receives `oauth_token` + `oauth_verifier`; `TwitterProvider::handleOAuth` exchanges them for `{oauth_token, oauth_token_secret, screen_name}`. Stores `social_stream` (`Name=Twitter`, `Page`=screen_name, `AuthorizationToken`=oauth_token, `AuthorizationSecret`=oauth_token_secret). Credentials: `keys.ConsumerKey`, `keys.ConsumerSecret`. (Auth-URL generation `getAuthUrl` lives in the provider; the request-token step is initiated elsewhere/frontend.)
- **Webhook** — none for connector ingest. (Twitter is publish-only here.)

### LinkedIn — `OAuth/Linkedin.php`, `LinkedInProvider.php`
- **Connect** — OAuth2. Callback exchanges `code` at `linkedin.com/oauth/v2/accessToken` (redirect `frontURL + dashboard/settings/linkedinredirect`). Stores access token, refresh token (→ `AuthorizationSecret`), and `refresh_token_expires_in` (→ `AuthorizationExpiry`). Scopes (provider): `r_liteprofile, r_emailaddress, w_member_social, w_organization_social, rw_organization_admin`. Credentials: `keys.ClientID`, `keys.ClientSecret`.
- **Account selection** — a separate two-step flow (`Socials::getlinkedinaccounts` → `savelinkedinaccounts`) lists the member + admin'd organizations and saves one `social_stream` row per chosen account (`PageID`=URN), then deletes the temporary token row.
- **Token expiry rule** — `SocialModel::getSocials` deactivates LinkedIn rows when `CreateDate + 60d` or the refresh-token expiry has passed.
- **Webhook** — none.

### Google (Business Profile) — `OAuth/Google.php`, `GoogleProvider.php`
- **Connect** — OAuth2 via `google/apiclient`. Callback exchanges `code` (offline access) for tokens; fetches the Google **user id** (`people/me` resource name) and stores it in `AuthorizationID`. Scopes (`Keys::gScope`): `https://www.googleapis.com/auth/business.manage`, `https://www.googleapis.com/auth/userinfo.profile`. Credentials: `keys.gClientID`, `keys.gClientSecret`.
- **Refresh-token sharing** — if Google returns **no** refresh token, it looks up another active Google connection with the same `user_id` (`getGoogleDuplicate`) and reuses that refresh token; if none, it **revokes** the access token and fails. On delete, the token is only revoked if no other connection shares the same `user_id`.
- **Location selection** — `Socials::getgoogleaccounts` / `getgooglelocations` / `savegooglelocation` lists accounts + locations and writes the chosen location's `PageID` (`accounts/<id>/locations/<id>`), review URI link, and `place_id`/maps URI onto the profile.
- **Webhook** — none (reviews are pulled by the Go review-puller).

### Square — `OAuth/Square.php`, `Webhook/Square.php`
- **Connect** — Square PHP SDK (`\Square\SquareClient`, `Environment::PRODUCTION`). `ObtainTokenRequest(appId, appSecret, 'authorization_code')` exchanges `code`; stores access + refresh token + `ExpiresAt` (→ `AuthorizationExpiry`), `PageID`=merchant id. Calls `MerchantsApi::retrieveMerchant` for the business name. Existing rows for the same merchant are deleted first. Scopes (`Keys::squarePermissions`): `CUSTOMERS_READ/WRITE, MERCHANT_PROFILE_READ, PAYMENTS_READ, ORDERS_READ/WRITE, INVOICES_WRITE, ITEMS_READ/WRITE`. Credentials: `squareAppID, squareAppSecret, squareAccessToken, squareSignature`.
- **Webhook** — payment event. Finds the merchant by `merchant_id`; **auto-refreshes** the token via `ObtainTokenRequest(... 'refresh_token')` if `AuthorizationExpiry` has passed. Resolves the customer from `payment.customer_id` or via the order (`batchRetrieveOrders` → order customer / tender customer). Imports the customer into `recipients` (`Source=SquareUp`, `Status=Pending`, dedups phone/email against existing recipients). **Signature check is commented out** (`isValidCallback` via HMAC-SHA1 of `webhookUrl + body` against `squareSignature`) — see §8.

### Stripe — `OAuth/Stripe.php`, `Webhook/Stripe.php`
- **Connect** — Stripe Connect OAuth (`\Stripe\OAuth::token` with `stripeSecretKey`). Stores `access_token`, `refresh_token`, `PageID`=`stripe_user_id`; fetches business name via `\Stripe\Account::retrieve`. Existing rows for the same account deleted first. Credentials: `stripeClientID, stripeSecretKey, stripeEndpointSecret`.
- **Webhook** — verifies signature with `\Stripe\Webhook::constructEvent($payload, HTTP_STRIPE_SIGNATURE, stripeEndpointSecret)`. On `payment_intent.succeeded`, retrieves the connected-account customer (`stripe_account` = merchant `PageID`) and imports it into `recipients` (`Source=Stripe`). Name is split naively on the first space. Non-handled event types return HTTP 400.
- **Disconnect** — `Socials::delete` calls `\Stripe\OAuth::deauthorize`.

### Clover — `OAuth/Clover.php`, `Webhook/Clover.php`, `Libraries/Clover/*`
- **Connect** — custom `Clover_Client` library. Callback needs `code` + `merchant_id`; `getAuth(code)` returns access token; `v3/merchants` fetches the merchant name. Existing rows for the merchant deleted first. Credentials: `cloverClientID, cloverSecretKey, cloverSignature`.
- **Webhook** — verifies `X-Clover-Auth` header equals `cloverSignature`. Iterates `merchants[<id>][]` op records; for `objectId` matching `O:<orderId>` (order create/update), calls `v3/merchants` `getMerchantOrderData` and imports each order customer into `recipients` (`Source=Clover`).

### LionDesk — `OAuth/Liondesk.php`, `Libraries/LionDesk/*`
- **Connect** — custom `Liondesk_Client` (`oauth2`). `getAuth(code)` returns access + refresh + `expires`; `me` fetches user name/id. Stores tokens + expiry. Then **bulk-imports contacts**: pages `contacts?status=Closed/Inactive` in batches of 500 (loop until exhausted) → `RecipientModel::importLionDeskContacts`. Credentials: `lionDeskClientID, lionDeskSecretKey, lionDeskRedirectURI`.
- **Webhook** — none (one-time contact pull at connect time).

### Pre-Approve Me (PAM) — `OAuth/Pam.php`, `Webhook/Preapproveme.php`
- **Connect** — token (not OAuth2). Frontend passes a PAM session `token`; controller calls `GET https://api.nextgenpam.com/Session/Summary` with header `X-PAM-S` to get the display name, then **registers a webhook** via `POST .../Feed/Subscribe` (event `EVENT_LOAN_STATUS_CHANGED`, namespace `OggvoPAMEvent`, URL `webhook/preapproveme/trigger`, with a generated `ReferenceNumber` stored as `PageID`). Stores `Name='Pre-Approve Me'`, token, ref number. Credentials: `pamClientID, pamRedirectUri`. **Uses raw cURL with `CURLOPT_SSL_VERIFYPEER/HOST = 0`** — TLS verification disabled (see §8).
- **Webhook** — accepts loan-status payloads; only acts when `Loan.Status == 'Closed'`; finds the social by `ReferenceNumber` (= `PageID`); imports each PrimaryBorrower + CoBorrower into `recipients` (`Source=PreApproveMe`).
- **Disconnect** — `Socials::delete` calls `.../Feed/Unsubscribe` with the stored ref number (also SSL-verify disabled).

### Shopify — `OAuth/Shopify.php`, `Webhook/Shopify.php`
- **Connect** — verifies the `hmac` query param (SHA-256 of sorted params with `shopifySecretID`), then exchanges `code` at `https://<shopifyDomain>.myshopify.com/admin/oauth/access_token`. Stores access token, `PageID`=associated user email, `Page`=full name. Credentials: `shopifyID, shopifySecretID, shopifyDomain`. (Note: `shopifyDomain` is hard-coded `oggvoportal` — a single shop, see §8.)
- **Webhook** — finds the social by `customer.email`; imports the customer into `recipients` (`Source=Shopify`). **No signature verification** on the webhook (see §8).

### QuickBooks — `OAuth/Quickbooks.php`, `Webhook/QuickBooks.php`
- **Connect** — `quickbooks/v3-php-sdk` `DataService` (`auth_mode oauth2`, `baseUrl=qbEnv`=`production`). Callback needs `code` + `realmId`; exchanges for tokens; `getCompanyInfo` for `CompanyName`. Stores access + refresh + refresh-expiry, `PageID`=realm id. Upserts by realm id. Scope (`Keys::qbScope`): `com.intuit.quickbooks.accounting com.intuit.quickbooks.payment`. Credentials: `qbClientId, qbClientSecret, qbVerifierToken`. Scope can be changed via `Socials::updateQbScope`.
- **Webhook** — verifies `Intuit-Signature` HMAC-SHA256 over the body with `qbVerifierToken` (compared as hex of base64-decoded header). Ends the connection early (HTTP 200) once verified, then pulls the changed entity (`QBCompany::get{Customer,Invoice,Payment,Purchase,PurchaseOrder,Bill}` via the `quickbooks` helper) and imports the related customer into `recipients` (`Source=QuickBooks`, tagged with the entity type).

### Clio — `OAuth/Clio.php`, `Webhook/Clio.php`
- **Connect** — OAuth2 (`https://app.clio.com/oauth/token`). Stores access + refresh + expiry. On first connect, **creates three webhooks** (`contact`, `matter`, `bill`; events created/updated) via `POST {clioApiURI}/webhooks.json` (expires in 30 days), storing each webhook's `shared_secret` in `SignatureKey` (JSON map of `webhook_id → secret`) and the webhook expiry in `AuthorizationID`. Reuses existing webhook secrets on reconnect. Credentials: `clioAppKey, clioAppSecret, clioRedirectURI, clioApiURI`.
- **Webhook** — `GET/POST /webhook/clio/trigger?model=<model>&pid=<profileId>`. First request with `X-Hook-Secret` header is echoed back to **enable** the webhook (handshake). Subsequent requests verify `X-Hook-Signature` = HMAC-SHA256 of the body with the per-webhook `shared_secret` (looked up from `SignatureKey`). Imports the contact (for `contact` model) or `data.client` (for matter/bill) into `recipients` (`Source=Clio`, tags `Clio,Clio-<model>`).
- **Disconnect** — `Socials::delete` refreshes the Clio token if expired, then deletes all registered webhooks via `DELETE {clioApiURI}/webhooks/<id>.json`.

### Follow Up Boss — `Socials.php::setupFUB`, `Services/FollowUpBoss.php`, `Webhook/Fub.php`
- **Connect** — **not OAuth.** User pastes an FUB **API key** (`POST /socials/save` with `name=followupboss`, `url=<apiKey>`). `FollowUpBoss::getAccountInfo` validates it (`GET /identity`), stores `Name=FollowUpBoss`, `PageID`=account id, token = API key. Then registers 12 webhooks (people/relationship/email/text/call/deal × Created/Updated) at `webhook/fub/<accountId>`, skipping events already registered. Credentials: `keys.fubSystem`, `keys.fubSystemKey` (the system key signs both outbound API calls and inbound webhook verification).
- **Webhook** — `POST /webhook/fub/(:accountId)`. Verifies `FUB-Signature` = HMAC-SHA256 of base64(body) with `fubSystemKey`. Finds the social by `accountId` (= `PageID`). Per event, calls the matching `FollowUpBoss::get*` (people/relationships/calls/emails/textMessages/deals → resolves to people), sets primary email/phone, and imports each into `recipients` (`Source=FollowUpBoss`, tagged with the event type). If the API key returns 401, the connection is deactivated and a 401 is returned so FUB **retries later** (`FubApiKeyExpiredException`).

### Zillow — `Socials.php::save` (`name=zillow`)
- **Connect** — **not OAuth, no token.** Looks up a Zillow agent (Bridge OData `Reviewees`) by screen name, or a lender by NMLS id (`mortgageapi.zillow.com`). Stores a `social_stream` row (`Name=Zillow`, `AuthorizationToken`/`Secret` carry the Zillow account id + `realtor`/`lender` type) and a review link. Credentials: `zillowServiceID, zillowPartnerID, zillowServerToken`.
- **Webhook** — none (reviews pulled by the Go review-puller).

### Twilio — `Webhook/{Twilio,TwilioVerification,TwilioTollfreeStatus}.php`
- **Connect** — Twilio is **not** connected via OAuth here; numbers are provisioned in the Messaging/Toll-free flows (own specs). Credentials: `keys.AccountSID`, `keys.AccountToken` (master) + per-profile `SMSNumberSID`/`SMSNumberToken`.
- **Inbound SMS/MMS webhook** (`Twilio::trigger`) — resolves the owning profile from the `To` number via `TollfreeInboundResolver`; accepts **US numbers only**; handles `STOP`/`START` opt-out (`IsUnsubscribed`); appends inbound text/media to the `messaging` conversation; fires `send_notification`; runs **keyword auto-response** (`autoResponse`) honouring per-profile schedule windows + timezone, decrementing `smsLimit`, and optionally scheduling **cadence** follow-ups. Signature verification (`X-Twilio-Signature` via `RequestValidator`) is present but **commented out** (see §8).
- **Brand/campaign status webhook** (`TwilioVerification::trigger/(:num)`) — A2P brand/campaign registration status updates; **currently stubbed** (body commented out, only logs).
- **Toll-free status webhook** (`TwilioTollfreeStatus::handle`) — **fully implemented & production-grade**: validates `X-Twilio-Signature` (`TwilioRequestTollfreeWebhookValidator`), is **idempotent** (dedupes by `IdempotencyKey`/`event_id` in `twilio_tollfree_verification_events`), maps Twilio status → portal status (`TollfreeStatusMapper`), updates the verification row, records an event + any rejection reason, and returns a snapshot.

## 4. Data & API

| Method | v1 endpoint | Purpose | Request (key fields) | Response (shape) | Controller |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v2/oauth/facebook` | FB+IG connect callback | `?state`, `?code` (FB SDK reads) | message string | `OAuth/Facebook.php::redirect` |
| GET | `/api/v2/oauth/twitter` | Twitter connect callback | `oauth_token`, `oauth_verifier` | `{message, data:{Twitter:screen_name}}` | `OAuth/Twitter.php::redirect` |
| GET | `/api/v2/oauth/linkedin` | LinkedIn connect callback | `code`, `error`, `error_description` | `{message}` | `OAuth/Linkedin.php::redirect` |
| GET | `/api/v2/oauth/google` | Google connect callback | `code`, `error` | `{message}` | `OAuth/Google.php::redirect` |
| GET | `/api/v2/oauth/square` | Square connect callback | `code` | message string | `OAuth/Square.php::redirect` |
| GET | `/api/v2/oauth/stripe` | Stripe connect callback | `code` | message string | `OAuth/Stripe.php::redirect` |
| GET | `/api/v2/oauth/clover` | Clover connect callback | `code`, `merchant_id` | message string | `OAuth/Clover.php::redirect` |
| GET | `/api/v2/oauth/liondesk` | LionDesk connect callback | `code` | message string | `OAuth/Liondesk.php::redirect` |
| GET | `/api/v2/oauth/pam` | PAM connect callback | `token` | message string | `OAuth/Pam.php::redirect` |
| GET | `/api/v2/oauth/shopify` | Shopify connect callback | `code`, `hmac`, `shop` params | message string | `OAuth/Shopify.php::redirect` |
| GET | `/api/v2/oauth/quickbooks` | QuickBooks connect callback | `code`, `realmId`, `error` | message string | `OAuth/Quickbooks.php::redirect` |
| GET | `/api/v2/oauth/clio` | Clio connect callback | `code` | message string | `OAuth/Clio.php::redirect` |
| GET | `/api/v2/socials/get` | List connections | `?active`, `?postableOnly` | `[{id,name,page,pageID,active}]` | `Socials.php::get` |
| GET | `/api/v2/socials/getpostable` | List postable socials | — | same as above (active+postable) | `Socials.php::getpostable` |
| POST | `/api/v2/socials/save` | Connect Zillow / FUB | `name`, + Zillow (`type,profile,force`) or FUB (`url`=api key) | `{description}` / `{message}` | `Socials.php::save` / `::setupFUB` |
| DELETE | `/api/v2/socials/(:num)` | Disconnect + provider cleanup | path id | 200/deleted | `Socials.php::delete` |
| POST | `/api/v2/socials/getlinkedinaccounts` | List LinkedIn pages | `ID` | `{accounts:[{URN,Name}]}` | `Socials.php::getlinkedinaccounts` |
| POST | `/api/v2/socials/savelinkedinaccounts` | Save chosen LinkedIn pages | `ID`, `accounts[]` | `{message}` | `Socials.php::savelinkedinaccounts` |
| POST | `/api/v2/socials/getgoogleaccounts` | List Google accounts | `ID` | `{accounts}` | `Socials.php::getgoogleaccounts` |
| POST | `/api/v2/socials/getgooglelocations` | List Google locations | `ID`, `Name`, `filterSearch` | `{locations}` | `Socials.php::getgooglelocations` |
| POST | `/api/v2/socials/savegooglelocation` | Save Google location | `ID`, `location[]` | `{message}` | `Socials.php::savegooglelocation` |
| POST | `/api/v2/socials/updateQbScope` | Build QB auth URL | `permissions[]` | `{url}` | `Socials.php::updateQbScope` |
| GET/POST | `/webhook/square/trigger` | Square payment events | raw JSON body | — | `Webhook/Square.php::trigger` |
| GET/POST | `/webhook/stripe/trigger` | Stripe events | raw body + `HTTP_STRIPE_SIGNATURE` | — | `Webhook/Stripe.php::trigger` |
| POST | `/webhook/clover/trigger` | Clover order events | raw JSON + `X-Clover-Auth` | — | `Webhook/Clover.php::trigger` |
| GET/POST | `/webhook/shopify/trigger` | Shopify customer events | raw JSON `{customer}` | — | `Webhook/Shopify.php::trigger` |
| GET/POST | `/webhook/clio/trigger` | Clio events / handshake | JSON + `?model`,`?pid`, `X-Hook-Secret`/`X-Hook-Signature` | echoes secret / `[]` | `Webhook/Clio.php::trigger` |
| POST | `/webhook/quickbooks/trigger` | QB entity changes | JSON `eventNotifications` + `Intuit-Signature` | — | `Webhook/QuickBooks.php::trigger` |
| POST | `/webhook/preapproveme/trigger` | PAM loan status | JSON `{Loan,Borrowers}` | http 200 | `Webhook/Preapproveme.php::trigger` |
| POST | `/webhook/fub/(:accountId)` | FUB events | raw body + `FUB-Signature` | `OK` | `Webhook/Fub.php::trigger` |
| GET/POST | `/webhook/facebook/trigger` | FB verify / messages | GET `hub_*` / POST JSON + `x-hub-signature-256` | challenge / `ok` | `Webhook/Facebook.php` |
| GET/POST | `/webhook/instagram/trigger` | IG verify / messages | as above | challenge / `ok` | `Webhook/Instagram.php` |
| ANY | `/webhook/twilio/trigger` (+ `/(:num)/inbound`,`/fallback`) | inbound SMS/MMS | Twilio POST (`From,To,Body,NumMedia,MediaUrl*`) | — | `Webhook/Twilio.php::trigger` |
| ANY | `/webhook/twilio/(:num)/status` | brand/campaign status | JSON | — (stubbed) | `Webhook/TwilioVerification.php::trigger` |
| POST | `/webhook/twilio/tollfree/status` | toll-free status | Twilio POST + `X-Twilio-Signature` | snapshot / `{status}` | `Webhook/TwilioTollfreeStatus.php::handle` |
| POST | `/webhook/calls/twilio/{answer,status,voicemail,recordings,transcriptions}` | voice events | Twilio POST | TwiML / — | `Webhook/Calls/Twilio.php` |

- **v1 models / tables:**
  - `social_stream` (model `SocialModel`, entity `Social`, **soft-deletes** via `DeleteDate`) — the single connected-accounts + token store. Columns: `ID, Name, Page, PageID, AuthorizationID, AuthorizationToken, AuthorizationSecret, AuthorizationExpiry, SignatureKey, ProfileID, CreateDate, LastUpdated, DeleteDate, Active`. Field reuse is heavy: `AuthorizationToken`=access token/API key/oauth token; `AuthorizationSecret`=refresh token / oauth secret / Zillow type; `AuthorizationExpiry`=token expiry; `AuthorizationID`=Google user id / Clio webhook expiry; `SignatureKey`=Clio webhook secret map; `PageID`=merchant/realm/page/account id / PAM ref number / FUB account id.
  - `recipients` (model `RecipientModel`, entity `Recipient`) — destination of all customer-harvesting webhooks (`Source` ∈ `SquareUp, Stripe, Clover, Shopify, Clio, QuickBooks, PreApproveMe, FollowUpBoss, LionDesk`; `Status=Pending`, `OptIn=true`).
  - `messaging` (model `MessagingModel`) — inbox written by Meta + Twilio inbound webhooks.
  - `messaging_settings` (`MessagingSettingsModel`) — `smsLimit`, `autoResponse`, `autoResponseDetails`, `timeZone` for Twilio auto-reply.
  - `twilio_tollfree_verification`, `twilio_tollfree_verification_events`, `twilio_tollfree_verification_rejections` — toll-free webhook state (own models).
  - `link` / `linkmaster` (`LinkModel`/`LinkmasterModel`) — review links auto-created by Facebook/Google/Zillow connects.
- **Pagination / filtering / sorting:** none on the webhooks (event-per-request). Connection list (`/socials/get`) filters by `active`/`postableOnly` only; LionDesk/FUB internally page their provider APIs (500/contact-batch). No sort/pagination exposed.

## 5. Business rules

- **Auth model.** OAuth endpoints require `apiAuth` (JWT) and act on `request.auth.profile_id`. Webhook endpoints are public and authenticate by signature:
  - Stripe: `\Stripe\Webhook::constructEvent` w/ `stripeEndpointSecret`.
  - QuickBooks: `Intuit-Signature` HMAC-SHA256 (hex of base64-decode) w/ `qbVerifierToken`.
  - FUB: `FUB-Signature` HMAC-SHA256 over base64(body) w/ `fubSystemKey`.
  - Clio: `X-Hook-Signature` HMAC-SHA256 per-webhook `shared_secret`; first request handshake echoes `X-Hook-Secret`.
  - Meta (FB/IG): `x-hub-signature-256` HMAC-SHA256 w/ app secret; GET verify token `keys.fbSignature`.
  - Clover: `X-Clover-Auth` equals static `cloverSignature` (plain compare, not HMAC).
  - Twilio toll-free: `X-Twilio-Signature` validated. **Square + Twilio inbound SMS + Shopify signature checks are NOT enforced** (commented out / absent) — see §8.
- **One connection per provider/page.** Most connects delete prior rows for the same `ProfileID`+`PageID`+`Name` before inserting (Square, Stripe, Clover, LionDesk, PAM, Clio-by-page, QuickBooks-by-realm = upsert).
- **Token refresh side effects.** Square refreshes inline during webhook processing when expired. Clio refreshes on delete when expired. Google reuses/​shares refresh tokens across same-user connections. LinkedIn rows auto-deactivate after 60 days or refresh-expiry. There is **no central token-refresh job** in v1 — refresh happens opportunistically.
- **Recipient dedup.** Every customer-harvesting webhook checks `checkRecipientPhone` / `checkRecipientEmail` for the profile and blanks the duplicate field (or skips the recipient entirely for FUB/QuickBooks). Phone is normalized to digits-only; email validated with `valid_email`.
- **Webhook registration is a connect side effect.** PAM (Feed/Subscribe), Clio (3 webhooks, 30-day expiry), FUB (12 events), and Facebook (`subscribe_to_events` per page) all register external webhooks during connect; disconnect (`Socials::delete`) tears them down (PAM unsubscribe, Clio delete, FUB delete-all, Stripe deauthorize, Google revoke).
- **Idempotency.** Only the Twilio toll-free webhook is idempotent (dedupe by `IdempotencyKey`). All recipient-harvesting webhooks rely on recipient dedup, not event-id dedup — replays are absorbed by the duplicate check, not rejected.
- **Twilio auto-response rules.** US numbers only; STOP/START toggles `IsUnsubscribed`; keyword match supports `*` (catch-all) and multi-word phrases; honors per-keyword schedule windows in the profile's mapped timezone (`scheduleTimeZones`); decrements `smsLimit` per sent reply and stops when credits hit 0; optional cadence follow-ups are inserted as scheduled `messaging` rows.
- **Notifications.** Inbound Meta/Twilio messages fire the `send_notification` event (FCM/push) to the profile's users.
- **Async jobs enqueued:** none directly from these controllers in v1 (work is synchronous in the request); Meta avatar download writes to local `assets/media/uploads`. In v2 these become queue jobs (see §7).

## 6. Integrations

This domain **is** the integrations layer. External services and their use:

- **Meta Graph API** (Facebook + Instagram) — page/IG token exchange, page list, IG business-account discovery, webhook subscription, Messenger send/receive. SDK `JanuSoftware/Facebook` v15.0.
- **Twitter/X API v2 + v1.1** — OAuth 1.0a, tweet publish, media upload (`Abraham\TwitterOAuth`).
- **LinkedIn API v2** — OAuth2, organization/member posting, page listing (raw cURL).
- **Google My Business / Business Profile API** — OAuth2, account/location listing, review reply, local posts (`google/apiclient`).
- **Square** — OAuth, merchant + customer + order retrieval, token refresh, payment webhooks. **SDK `square/square` pinned `17.1.0.20220120` (~4 yrs stale) — payments risk.**
- **Stripe** — Connect OAuth, customer retrieve, webhook signature verification, deauthorize. **SDK `stripe/stripe-php ^10.11` (10 majors behind) — payments risk.**
- **Clover** — OAuth, merchant/order retrieval, order webhooks (custom `Clover_Client` lib).
- **QuickBooks Online** — OAuth, company info, entity pull, webhook signature (`quickbooks/v3-php-sdk`).
- **Clio** — OAuth, webhook CRUD with per-hook secrets (raw cURL).
- **Follow Up Boss** — API-key auth, webhook CRUD, people/relationship/call/email/text/deal pulls (`Services/FollowUpBoss`).
- **Pre-Approve Me (nextgenpam.com)** — session-token auth, Feed Subscribe/Unsubscribe (raw cURL, **TLS verification disabled**).
- **Shopify** — OAuth + HMAC, single hard-coded shop, customer webhook.
- **LionDesk** — OAuth, contact bulk import (custom `Liondesk_Client` lib).
- **Zillow / Bridge Data Output** — review-profile lookup (no auth handshake; server token).
- **Twilio** — inbound SMS/MMS, A2P brand/campaign + toll-free compliance webhooks, outbound auto-reply (`twilio/sdk ^7.11`, 1 major behind).
- **AWS** (`AwsLambda`, `AwsS3`, `DynamoDb` services) — used downstream by recipient import / messaging, not directly in the connect flows.
- **FCM** — push notifications fired on inbound messages.

## 7. v1 → v2 mapping

- **Module:** `apps/api/src/modules/integrations` (controller = OAuth callbacks + webhook receivers; service = per-provider connect/refresh logic; repository = token vault + `social_accounts`; per-provider DTOs validated via zod). Webhook receivers should be thin: verify signature → enqueue → 200 fast.
- **Drizzle tables:**
  - `social_accounts` (`@oggvo/db`) — replaces `social_stream` for the **publishing** providers (Facebook, Instagram, Twitter, LinkedIn, Google). Keep the connection metadata (`platform`, `page`, `page_id`, `active`) but **move secrets out** of overloaded columns.
  - **New OAuth token vault** table (per ARCHITECTURE §"Integrations vault") — `access_token` / `refresh_token` / `expires_at` **AES-GCM encrypted at rest** (key from env/KMS), plus typed columns instead of v1's reuse of `AuthorizationSecret`/`AuthorizationID`/`SignatureKey`. Webhook signing secrets (Clio per-hook map, FUB system key scope) and PAM ref numbers get dedicated, typed fields. One row per connection, scoped by `profileId` via `TenantGuard`.
  - Recipient-harvesting webhooks write to the `contacts` module's table (see contacts spec); messaging webhooks write to the `messaging` module's tables; toll-free webhooks to the toll-free verification tables.
- **Queue:** webhook ingest → enqueue rather than process inline. Meta avatar fetch → `media-process`; auto-reply SMS → `sender`/`email-send`. Recipient imports can run inline in the service or via a light queue. Provider token refresh should become a **scheduled job** (replaces v1's opportunistic refresh).
- **Frontend:** the only UI is **Settings → Accounts** under `apps/web/app/(portal)/settings/accounts` — "Connect" buttons that open provider auth URLs and provider-redirect pages that POST the returned code to the typed `@oggvo/api-client`. Reuse `@oggvo/ui` Button/Modal/TabBar. (The connect surface is shared with the Social spec.)
- **Endpoint mapping (RESTful, OpenAPI-typed):**
  - `GET /api/v2/oauth/<provider>` → `GET /integrations/:provider/callback` (or `POST /integrations/:provider/connect`).
  - `GET /socials/get` → `GET /integrations/connections`.
  - `DELETE /socials/:id` → `DELETE /integrations/connections/:id` (with provider-specific teardown in the service).
  - `POST /socials/save` (FUB/Zillow) → `POST /integrations/followupboss` / `POST /integrations/zillow`.
  - `/webhook/<provider>/trigger` → `POST /webhooks/:provider` (provider sub-handlers; signature middleware per provider).
- **Known v1 bugs / debt to fix during rebuild:**
  - **Disabled signature verification** — enforce Square, Twilio inbound-SMS, and add Shopify HMAC verification (all currently off/missing).
  - **TLS verification disabled** for PAM Subscribe/Unsubscribe (`CURLOPT_SSL_VERIFYPEER=0`) — re-enable.
  - **Token secrets in plaintext** in `social_stream` — must be AES-GCM encrypted in v2.
  - **Stripe customer name split** (`explode(' ', $name)`) breaks on single-word/three-word names — undefined index.
  - **Stale payment SDKs** — Stripe v10 and Square 2022 pin: upgrade as part of the rebuild (audit item #3/#7).
  - **No event-id idempotency** on harvesting webhooks — add a processed-key table (per ARCHITECTURE "Idempotency").
  - **Synchronous webhook processing** (some call multiple provider APIs inside the request) — move to queues so a 200 is returned fast and retries are safe.
  - **Shopify single hard-coded shop** (`shopifyDomain=oggvoportal`) — should be per-connection.
  - **Brand/campaign status webhook is a stub** (`TwilioVerification`) — implement properly (the toll-free one is the model to follow).
  - **QuickBooks empty catch** (`catch (SdkException|ServiceException) {}`) swallows errors silently.
  - **Heavy column overloading** in `social_stream` — replace with typed schema.

## 8. Open questions / parity risks

- **Signature verification gaps.** Square (`isValidCallback` commented out), Twilio inbound SMS (`verifyTwilio` commented out), and Shopify webhook (no verification) accept unauthenticated POSTs in v1. Confirm whether this was intentional (Square signature key rotation?) before porting; v2 should verify all. **Security parity risk + improvement.**
- **Token vault migration.** v1 stores tokens/secrets/refresh-tokens/webhook-secrets across overloaded `social_stream` columns in plaintext. Migrating to the encrypted vault requires mapping each provider's field reuse (documented in §4) and re-encrypting on import. Some values (e.g. Twitter oauth secrets, Clio webhook secret maps) have no clean typed home yet — **schema gap to design.**
- **Provider availability.** Several connectors may be effectively dead or low-use (Zillow Bridge API access, LionDesk, PAM/nextgenpam, Clover). Confirm which providers are still in use before investing in v2 parity — some may be drop candidates.
- **Webhook re-registration on migration.** PAM/Clio/FUB/Facebook webhooks point at v1 URLs (`api.oggvo.com/webhook/...`). Cutover to v2 requires re-registering every active connection's webhooks at the new URLs (or running both during transition). **Migration concern.**
- **Clio webhook expiry.** Clio webhooks expire after 30 days; v1 stores the expiry in `AuthorizationID` but the **refresh-before-expiry job is not visible** in the read sources — verify whether a cron renews them, else they silently stop. **Undocumented v1 behaviour.**
- **Twilio brand/campaign webhook.** Implementation is commented out; unclear whether A2P brand/campaign status is currently tracked at all outside the toll-free path. Clarify intended v2 behaviour.
- **`fbLoginPermissions` vs `fbPermissions`.** Connect enforces `fbPermissions` (7 page scopes) but login requests a superset including messaging/IG scopes. Confirm which scope set v2 should request to support both publishing and Messenger.
- **Instagram has no independent connect.** IG is entirely dependent on the Facebook connect; if the FB page link is removed, IG breaks. Decide whether v2 keeps this coupling.
- **Calls (voice) webhooks** (`/webhook/calls/twilio/*`) live in this route group but belong to a Calls feature not covered here — confirm ownership/spec home.
- **Square signature algorithm** in the (disabled) v1 code uses **HMAC-SHA1** over `webhookUrl + body`; Square's current scheme is HMAC-SHA256. If re-enabling, use the current algorithm, not the v1 one.
