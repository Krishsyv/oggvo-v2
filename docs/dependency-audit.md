# Dependency Audit & Upgrade Risk Report

**Date:** 2026-06-23
**Scope:** Entire `oggvo` monorepo (portal-frontend, portal-api, Go bots & lambdas, JS lambdas, CDK infra, runtime base images)
**Purpose:** Inventory every dependency, compare against the latest available version, and document the risk of staying on the current (often outdated) versions.

> "Latest available" figures were confirmed via web search on 2026-06-23. Patch numbers move daily — treat them as "as of this date."

---

## 0. Executive summary — the headline risks

| # | Component | We use | Latest | Status | Severity |
|---|-----------|--------|--------|--------|----------|
| 1 | **Nuxt** (portal-frontend) | `3.6.2` (Jul 2023) | `3.21.8` / Nuxt `4.4.8` | **Nuxt 3 EOS 31 Jul 2026** | 🔴 Critical |
| 2 | **Firebase JS SDK** | `8.3.3` (2021) | `12.15.0` | 4 majors behind, legacy namespaced API | 🔴 Critical |
| 3 | **Stripe PHP** | `^10.11` | `20.2.1` | 10 majors behind (payments) | 🔴 Critical |
| 4 | **AWS SDK for JS v2** (lambdas/sls) | `^2.1272` | v2 dead → v3 `3.9xx` | **EOL 8 Sep 2025, repo archived** | 🔴 Critical |
| 5 | **Go toolchain** (all bots/lambdas) | `go 1.24.0` | `1.26.4` / `1.25.11` | **1.24 EOL 11 Feb 2026** | 🔴 Critical |
| 6 | **CodeIgniter 4** (portal-api) | `4.3.7` (2023) | `4.7.3` | 4 minors behind | 🟠 High |
| 7 | **Square PHP SDK** | `17.1.0.20220120` (pinned, Jan 2022) | `45.1.0.20260520` | Pinned, ~4 years stale (payments) | 🟠 High |
| 8 | **PHP runtime** | `8.2` (constraint allows `7.4`) | `8.4` / `8.5` | 8.2 security-only, **EOL 31 Dec 2026** | 🟠 High |
| 9 | **Monolog** | `^2.9` | `3.x` | 2.x EOL | 🟡 Medium |
| 10 | **Tailwind / @nuxtjs/tailwindcss** | `^6.8` (Tailwind v3) | Tailwind v4 | 1 major behind | 🟡 Medium |

The two areas that should be addressed first are **payments code (Stripe/Square in portal-api)** and **anything past its EOL date and therefore receiving zero security patches** (Nuxt 3 after Jul, Go 1.24, AWS JS SDK v2, PHP 8.2 at year-end).

---

## 1. portal-frontend (Nuxt / Vue / npm)

Source: [apps/portal-frontend/package.json](../../oggvo/apps/portal-frontend/package.json)

| Package | Current | Latest (Jun 2026) | Notes / Risk |
|---------|---------|-------------------|--------------|
| `nuxt` | **3.6.2** | 3.21.8 / **4.4.8** | See risk box below. Released mid-2023. |
| `vue` (bundled by Nuxt) | ~3.3 | 3.5.x | Carried by Nuxt; upgrades with it. |
| `@nuxtjs/tailwindcss` | ^6.8.0 | 7.x (wraps Tailwind v4) | We're on Tailwind v3 era. |
| `@nuxt/devtools` | ^0.6.7 | 2.x | Pre-1.0, very old. Dev-only. |
| `@vueuse/core` / `nuxt` / `components` / `integrations` | ^10.2.1 | 13.x | 3 majors behind. |
| `@headlessui/vue` | 1.7.14 (pinned) | 1.7.x+ | Pinned exact version. |
| `@pinia/nuxt` | ^0.4.11 | 0.11.x / Pinia 3 | Pre-1.0, several minors behind. |
| `firebase` | **8.3.3** | **12.15.0** | See risk box. Namespaced (compat) API — removed in modular v9+. |
| `chart.js` | ^4.3.3 | 4.5.x | Minor behind. |
| `@nuxt-alt/auth`, `@nuxt-alt/http`, `@nuxt-alt/proxy` | various | — | Community forks of abandoned `@nuxtjs/auth`; not Nuxt 4 compatible. Migration blocker. |
| `@playwright/test` | ^1.60.0 | 1.6x | Fairly current. |
| `prettier` | 3.0.0 | 3.x | Minor behind. |
| many `vue3-*` UI widgets | various | — | Small community packages; check individually before a Nuxt 4 move. |

### 🔴 Risk: Nuxt `3.6.2`
- **End of support for the entire Nuxt 3 line is 31 Jul 2026** — after that, **no security patches at all**, including for the underlying Vue/Vite/Nitro stack.
- 3.6.2 is from mid-2023; ~15 minor releases of bug/security fixes have shipped since (the line is at 3.21.8).
- The jump to Nuxt 4 is non-trivial here because of the `@nuxt-alt/*` auth/http/proxy modules (community forks) and a long tail of `vue3-*` widgets that may not be v4-ready.
- **Recommendation:** first move to the latest Nuxt 3 (3.21.x) to regain patch coverage and buy time, then plan the Nuxt 4 migration. Don't sit on 3.6.2 past July.

### 🔴 Risk: Firebase `8.3.3`
- v8 uses the **legacy namespaced API** (`firebase.auth()`), which was deprecated and dropped in the modular v9 redesign. We are **4 major versions** and ~5 years behind (latest 12.15.0).
- Old versions bundle outdated transitive deps and miss security fixes; auth-token handling improvements never land.
- Upgrade is a code rewrite (namespaced → modular tree-shakeable imports), so it needs scheduling, not a version bump.

---

## 2. portal-api (PHP / CodeIgniter / Composer)

Source: [apps/portal-api/composer.json](../../oggvo/apps/portal-api/composer.json) · Runtime: [Dockerfile.fpm](../../oggvo/apps/portal-api/Dockerfile.fpm) = `php:8.2-fpm-bookworm`

| Package | Current | Latest (Jun 2026) | Notes / Risk |
|---------|---------|-------------------|--------------|
| `php` (constraint) | `^7.4 \|\| ^8.0` | 8.4 / 8.5 | Constraint still allows **EOL PHP 7.4**. Runtime image is 8.2. |
| `codeigniter4/framework` | **4.3.7** | **4.7.3** | 4 minor versions of fixes missed (incl. CSP/security changes in 4.6.5). |
| `stripe/stripe-php` | **^10.11** | **20.2.1** | **10 majors behind. Payments code.** Pinned API version semantics changed since v11. |
| `square/square` | **`17.1.0.20220120`** (exact pin) | **45.1.0.20260520** | Pinned to a Jan 2022 build. ~4 years of API/security drift. Payments code. |
| `twilio/sdk` | ^7.11 | 8.11.6 | 1 major behind. Relevant given the active toll-free portal work. |
| `aws/aws-sdk-php` | ^3.295 | 3.385.x | Same major (v3), ~90 minor releases behind. Low-risk catch-up. |
| `monolog/monolog` | **^2.9** | **3.5.x** | 2.x is EOL. v3 needs PHP 8.1+ (we have 8.2) and a small code migration (LogRecord object, Level enum). |
| `google/apiclient` | ^2.13 | 2.18.x | Minor catch-up. |
| `firebase/php-jwt` | ^6.3 | 6.11.x | Security-sensitive (JWT verification). Catch up. |
| `phpoffice/phpspreadsheet` | **^1.27** | 4.x | 1.x line is EOL; multiple majors behind. Had security advisories. |
| `abraham/twitteroauth` | ^6.0 | 7.x | 1 major behind. |
| `quickbooks/v3-php-sdk` | ^6.1 | 6.x+ | Check current. |
| `openai-php/client` | **^0.8.0** | 0.20.x | **Pre-1.0**, fast-churning; ~12 minors behind. API shape changes between minors. |
| `lsolesen/pel` | ^0.9.12 | 0.9.x | EXIF lib, stable/low-churn. |
| `matthiasmullie/minify` | ^1.3 | 1.3.x | Low-churn. |
| `php-http/guzzle7-adapter` | ^1.0 | current | Fine. |
| `redjanym/php-firebase-cloud-messaging` | ^1.1 | — | FCM **legacy HTTP API was shut down by Google in 2024**; verify this still works or migrate to FCM HTTP v1. |

### 🟠 Risk: CodeIgniter `4.3.7`
- Latest is 4.7.3; we're ~4 minor releases behind, missing accumulated security and bug fixes (e.g., CSP nonce handling changes in 4.6.5).
- Newer CI4 targets PHP 8.1+. Staying on 4.3.7 indirectly keeps us anchored to the older PHP/runtime story.
- Upgrade within the 4.x line is generally smooth (composer bump + upgrade-guide review), so this is good ROI.

### 🟠 Risk: Payments SDKs (Stripe v10, Square pinned 2022)
- These touch money. Old SDKs miss: new API versions, fraud/3DS handling improvements, deprecation cutoffs, and security patches.
- Stripe in particular pins API behavior to the SDK version; a 10-major gap means we may be calling deprecated endpoints that Stripe can sunset.
- Square is pinned to an **exact** 4-year-old build — no patches at all.
- **Recommendation:** prioritize these even above the framework, because the blast radius (failed/incorrect charges, compliance) is high.

### 🟠 Risk: PHP `8.2` runtime + `^7.4` constraint
- PHP 8.2 is in **security-only** support and reaches **EOL on 31 Dec 2026**. After that the base image stops getting PHP security fixes.
- The composer constraint still allows **PHP 7.4** (EOL since Nov 2022) — anyone building on 7.4 gets zero security coverage. Tighten the constraint to `^8.2` and plan a move to 8.4.

---

## 3. Go bots & lambdas

Sources: `go.mod` across [bots/](../../oggvo/bots/) and [lambdas/](../../oggvo/lambdas/). All main modules declare `go 1.24.0`.

| Module / dep | Current | Latest (Jun 2026) | Notes / Risk |
|--------------|---------|-------------------|--------------|
| **Go toolchain** | `go 1.24.0` | 1.26.4 (stable) / 1.25.11 | **Go 1.24 reached EOL on 11 Feb 2026** — no more security/runtime patches. Move to 1.25 or 1.26. |
| `aws-sdk-go-v2` (core) | 1.41.7 | recent | v2 line, actively maintained — minor catch-up only. |
| `aws-sdk-go-v2/service/*` | various recent | recent | Fine; bump alongside core. |
| `aws-lambda-go` | 1.54.0 | 1.5x | Minor behind. |
| `go-sql-driver/mysql` | 1.10.0 (one module at **1.7.1**) | 1.10.x | review-puller-bot/db pins old 1.7.1 — align all modules. |
| `jmoiron/sqlx` | 1.3.5 (one at **1.3.1**) | 1.3.x/1.4 | review-puller-bot/structs at 1.3.1. |
| `golang.org/x/oauth2` | `v0.0.0-20211104...` | current tagged | **Pinned to a 2021 pseudo-version.** Very stale; x/ libs get security fixes. |
| `golang.org/x/text` | **0.3.3** | 0.2x | 0.3.3 is old and `x/text` has had CVEs (e.g. CVE-2022-32149). Bump. |
| `huandu/facebook/v2` | 2.5.3 | 2.5.x | Current-ish. |
| `g8rswimmer/go-twitter/v2` | 2.1.5 | 2.x | Check. |
| `ChimeraCoder/anaconda` | v2.0.0+incompatible | — | Old Twitter lib; effectively unmaintained. |
| submodule `go.mod` versions | `1.17`, `1.22.2` | — | `bots/social/socials` (1.17) and `lambdas/review-puller-bot/db` (1.22.2) declare old language versions. |

### 🔴 Risk: Go `1.24.0`
- **EOL since 11 Feb 2026.** Go's policy supports only the two latest majors; 1.24 no longer gets security or `crypto/x509`/`net` fixes that 1.25.11 and 1.26.4 received in June.
- The bump is usually low-cost (change `go` directive + rebuild + run tests), so this is high ROI. Do all modules together to avoid the current 1.17/1.22.2/1.24 spread.

### 🟡 Risk: pinned `x/oauth2` (2021) and `x/text 0.3.3`
- These are used in the social/review-puller OAuth flows. Stale `golang.org/x` packages are a common source of known CVEs. Bump to current tagged releases.

---

## 4. JS Lambdas

Sources: [lambdas/sls/src/package.json](../../oggvo/lambdas/sls/src/package.json), [lambdas/os-reporter/src/package.json](../../oggvo/lambdas/os-reporter/src/package.json)

| Package | Current | Latest (Jun 2026) | Notes / Risk |
|---------|---------|-------------------|--------------|
| `aws-sdk` (sls) | **^2.1272.0** | v2 **dead** → v3 | **AWS SDK for JS v2 reached EOL 8 Sep 2025; the repo was archived (read-only) 9 Mar 2026.** No fixes, no new service support. Migrate to modular `@aws-sdk/*` v3. |
| `moment` (sls) | ^2.29.4 | 2.30.x (legacy) | Moment is in **maintenance mode**; project recommends day.js/luxon. Frontend already uses dayjs — converge. |
| `mysql2` (sls) | ^2.3.3 | 3.x | 1 major behind; v3 has security/perf fixes. |
| `axios` (sls) | ^1.2.1 | 1.x | Several minors behind; axios has had CVEs (SSRF/redirect). Bump. |
| `gm`, `hasbin`, `md5`, `child_process` (sls) | old | — | `child_process` as an npm dep is a typo-ish no-op (Node built-in); the others are low-churn/unmaintained. |
| `@aws-sdk/client-sqs` (os-reporter) | ^3.927.0 | 3.9xx | v3, current. ✅ |
| `@opensearch-project/opensearch` (os-reporter) | ^3.5.1 | 3.x | Current-ish. ✅ |

### 🔴 Risk: `aws-sdk` v2 in lambdas/sls
- The whole v2 SDK is **end-of-support and archived**. Lambda runtimes are also dropping the bundled v2, so this can break at the platform level, not just security-wise.
- Migrate to v3 modular clients (matches what os-reporter already does).

---

## 5. Infra / CDK

Source: [infra/cdk/package.json](../../oggvo/infra/cdk/package.json)

| Package | Current | Status |
|---------|---------|--------|
| `aws-cdk-lib` | ^2.251.0 | ✅ Current (v2 line). |
| `aws-cdk` (CLI) | 2.1120.0 | ✅ Recent. |
| `constructs` | ^10.5.0 | ✅ Current. |
| `typescript` | ~5.9.3 | ✅ Current. |
| `@types/node` | ^24.10.1 | ✅ Current. |
| `jest` / `ts-jest` / `ts-node` | 30 / 29 / 10.9 | ✅ Fine. |

**This is the healthiest part of the repo** — kept current. No action needed beyond routine bumps.

---

## 6. Container base images

| Image | File | Status |
|-------|------|--------|
| `php:8.2-fpm-bookworm` | [Dockerfile.fpm](../../oggvo/apps/portal-api/Dockerfile.fpm) | 🟠 PHP 8.2 security-only, EOL 31 Dec 2026. |
| `nginx:1.25-alpine` | [Dockerfile.nginx](../../oggvo/apps/portal-api/Dockerfile.nginx) | 🟡 1.25 is a couple of minors behind current stable; bump for CVE coverage. |
| `golang:1.24` | [local-dev/sqs-bridge/Dockerfile](../../oggvo/local-dev/sqs-bridge/Dockerfile) | 🔴 Tracks EOL Go 1.24. |
| `debian:bookworm-slim` | bots `docker/Dockerfile` | ✅ Bookworm is current Debian stable; keep `apt upgrade` in builds. |
| `mcr.microsoft.com/devcontainers/php:8.2-bookworm` | [.devcontainer/Dockerfile](../../oggvo/.devcontainer/Dockerfile) | 🟡 Dev-only; matches prod PHP. |
| `gcr.io/distroless/static-debian12` | sqs-bridge | ✅ Good practice. |

---

## 7. Vendored front-end assets (Metronic theme)

[apps/portal-api/public/assets/vendors/general/](../../oggvo/apps/portal-api/public/assets/vendors/general/) contains ~50 bundled libraries (jQuery, Bootstrap, moment, select2, dropzone, sweetalert2, chart.js, dompurify, etc.) shipped as part of the **Metronic admin theme**.

- These are **frozen, vendored copies** — not managed by any package manager, so they never receive updates.
- Several are EOL or have known client-side CVEs at the versions theme bundles typically ship (old jQuery, old Bootstrap, moment.js).
- **`dompurify`** is the security-relevant one (XSS sanitization) — verify its bundled version against known DOMPurify bypass CVEs.
- **Risk:** these power the legacy server-rendered CI4 admin pages. Treat the whole bundle as a single "upgrade the theme or migrate the page off it" decision rather than per-file bumps.

---

## 8. Why outdated dependencies are a risk (general)

1. **No security patches past EOL.** Once a version line is end-of-life (Nuxt 3 after Jul 2026, Go 1.24, AWS JS SDK v2, PHP 8.2 after Dec 2026), disclosed CVEs are simply never fixed for you — you're permanently exposed.
2. **Compounding upgrade cost.** Each major you fall behind makes the eventual jump bigger and riskier (Firebase 8→12, Stripe 10→20). Small, frequent bumps are cheap; rare giant ones are project-sized.
3. **Platform forcing functions.** AWS Lambda drops old SDK bundles and runtimes; Stripe sunsets old API versions; Google shut down the legacy FCM API. Outdated SDKs can break with **no code change on our side**.
4. **Payment & auth blast radius.** Stale Stripe/Square/JWT/OAuth code risks failed charges, compliance gaps, and auth vulnerabilities — the highest-consequence category here.
5. **Transitive dependency rot.** Old top-level packages pin old, vulnerable sub-dependencies you can't easily override.
6. **Hiring/maintenance drag.** Legacy APIs (Firebase namespaced, Moment.js, jQuery) are unfamiliar to current devs and slow every future change.

---

## 9. Recommended order of action

1. **EOL / zero-patch items first** (security cliff):
   - Bump **Go 1.24 → 1.25/1.26** across all modules (low cost).
   - Migrate **lambdas/sls `aws-sdk` v2 → v3**.
   - Move **Nuxt 3.6.2 → latest 3.21.x** before 31 Jul 2026 (then plan Nuxt 4).
   - Plan **PHP 8.2 → 8.4** and tighten the `^7.4` constraint before 31 Dec 2026.
2. **Payments / security-sensitive PHP:** Stripe v10→latest, Square (un-pin), `firebase/php-jwt`, `monolog 2→3`.
3. **Framework catch-up:** CodeIgniter 4.3.7 → 4.7.x, `aws-sdk-php` minor bump, Twilio 7→8.
4. **Frontend modernization (project-sized):** Firebase 8→12, Tailwind v3→v4, `@vueuse` 10→13, replace `@nuxt-alt/*` for Nuxt 4.
5. **Hygiene:** bump `x/oauth2` / `x/text` in Go, axios/mysql2 in sls, nginx image; audit vendored `dompurify`.

---

*Generated as a point-in-time audit. Re-run `composer outdated`, `npm outdated`, and `go list -u -m all` before acting, since patch versions change frequently.*
