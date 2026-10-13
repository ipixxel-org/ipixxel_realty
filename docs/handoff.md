# Project Handoff

_Last updated 2026-10-13, against `feature-integrations` at `fd48100`._

This document is a from-scratch orientation to this codebase, written by reading the actual code and git history rather than any design docs. Where a claim is about behavior, it's traced to the file that implements it. Where something couldn't be verified or looks inconsistent, that's said outright instead of guessed at. Feature-specific deep dives live next to it in `docs/` (see §2).

The repo currently has two names on it: the seed data, `RELEASE_NOTES.md`, the default Super Admin email in `backend/env.example` and a couple of login/forgot-password strings call the product **BigEstate**; almost everywhere else — the deploy workflow's own header comment, environment defaults (`ipixxel.ae`), domain-verification records (`_ipixxel-challenge`), and the bulk of in-app strings — call it **iPixxel Realty**. "iPixxel" wins by a wide margin in the actual code (~158 references vs. ~12 for "BigEstate"), so treat BigEstate as an old name that didn't get fully cleaned up.

**Branch note.**
- `main` (`74ebc91`, 2026-10-11) is the deployed line. It now contains all of `vidya_new` (Team Chat, marketing integrations, the Integrations console shell, the OpenPage editor work) — `vidya_new` has nothing that isn't on `main`.
- `feature-integrations` = `main` + 9 commits adding the Razorpay payments module (§4.13). This document describes that branch; everything except §4.13 and the Razorpay bits of §4.12 is also true of `main`.
- `vidya` diverged back in September and was **never merged** — most importantly it holds a `TeamUnit` model and a team-based visibility rewrite (see §4.4 and §7.2). Don't assume anything on `vidya` is live.

---

## 1. What the product is

It's a multi-tenant real-estate SaaS: real-estate developers, brokers, and channel partners ("organisations") sign up, get a subdomain (and optionally custom domains), list projects and units, publish marketing landing pages to capture leads, pull in leads from ad platforms, and run those leads through a CRM. A platform operator (iPixxel) runs the whole thing centrally — onboarding orgs, managing the plan catalog, curating a shared template library, approving custom domains, configuring platform integrations (email, Google login, payments), and handling support tickets.

**Roles** (`backend/prisma/schema.prisma` `Role` model, seeded in `backend/prisma/seed.ts`):
- `super_admin` — platform operator, unrestricted, lives outside any organisation.
- Other platform roles (Platform Team) — Super Admin console users with per-module grants (§4.8).
- `admin` — an organisation's own admin, unrestricted *within* that org.
- `manager` / `sales` / `telecaller` — org roles with real, enforced, granular permissions (see §4.8).
- Custom roles — an org admin can define additional roles with their own permission grants.

An organisation also has an `industry` classification (`developer` / `broker` / `channel` / `mixed`), stored against a DB-backed `OrgType` lookup table so Super Admin can relabel it without a deploy (`model OrgType` in `schema.prisma`).

**Core flow, end to end:**
1. Someone signs up (2-step wizard or Google sign-in, no approval needed — see §4.1) and lands on the seeded "Basic" plan automatically.
2. They set up projects, unit inventory, and a landing page (either blank or copied from an admin-curated template).
3. They publish the landing page, which becomes reachable at their org's subdomain or a connected custom domain (traced fully in §7.1).
4. Leads arrive from the landing-page form, from Meta Lead Ads / Google Sheets connections (§4.11), from CSV import, or by manual entry, and land in the org's Lead Center.
5. Leads get worked by managers/sales/telecallers, scoped by direct project/unit assignment (not by team — see §7.2 for why that matters).
6. The org's usage against its plan's quotas is enforced server-side (§4.2). Plan billing is still internal bookkeeping: a Razorpay payments module now exists (§4.13) but is **not** wired to plans yet.

---

## 2. Stack and repo layout

Monorepo, two apps, no shared package:

- **`backend/`** — NestJS 11 + TypeScript, Prisma 6 ORM over PostgreSQL 16, multi-schema (`identity`, `access`, `templates`, `audit`, `billing`, `projects` — the `schemas` list in `schema.prisma`'s datasource; 65 models). 48 feature modules under `backend/src/modules/` (one, `org-teams`, is switched off — §4.4), each the usual Nest `controller` + `service` + `dto/` shape. Shared guards/decorators/utils live in `backend/src/common/`, including `common/storage/` (§4.14). Real-time is Socket.IO (`@nestjs/websockets`), used only by Team Chat.
- **`frontend/`** — Next.js 16 (App Router) + React 19 + Tailwind 4. **Important:** this Next.js version renamed `middleware.ts` to `proxy.ts` (a real, documented rename — see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`) — the repo's `frontend/proxy.ts` is the active host-routing layer, not a leftover.
  - `app/org/*` — the organisation's own portal (projects, units, leads, marketing, team chat, templates, landing pages, domains, settings, …).
  - `app/admin-console/*` — the Super Admin console (organisations, templates, plans/subscriptions, domains, marketing, integrations, payments, support, …).
  - `app/(auth)/*`, `app/admin-login` — org and platform logins, registration, forgot/reset password.
  - `app/org-site`, `app/p/[slug]`, `app/__host/[...host]` — public-site rendering, traced in §7.1.
  - `lib/openpage/` + `components/openpage/` — the drag-and-drop page builder ("OpenPage") that both templates and landing pages are edited through.
- **Deploy**: `.github/workflows/deploy.yml` (GitHub Actions → SSH), `docker-compose.prod.yml` (Postgres + API in Docker), `ecosystem.config.cjs` (PM2, for the frontend — see §3).
- **Other docs in `docs/`:**
  - `local-dev.md` — local gotchas (stale Prisma client in Docker, IPv4 for Prisma, demo marketing seed, Meta setup, Razorpay test mode).
  - `schema-drift-notes.md` — known pre-existing drift between migrations and `schema.prisma` (not fixed; §8).
  - `team-chat-handoff.md`, `team-chat-investigation.md`, `team-chat-realtime.md` — Team Chat (§4.10).
  - `social-media-connection.md`, `social-media-connection-roadmap.md` — marketing connections (§4.11).

Frontend and backend talk over `/api/*`, rewritten by `next.config.ts`'s `rewrites()` to `BACKEND_URL` (defaults to `http://127.0.0.1:3000`).

---

## 3. Deployment

### 3.1 Production topology

- **Backend**: runs in Docker, via `docker-compose.prod.yml` — a `postgres:16` container and an `api` container built from `backend/Dockerfile`'s `prod` stage (multi-stage: `npm ci --omit=dev`, `prisma generate`, copies the pre-built `dist/` from the `build` stage, runs `node dist/src/main.js`). Exposed on port 3000. App secrets come from `backend/.env` on the server via `env_file`; the compose file's comment warns not to add them under `environment:` (that would override `env_file`, and `${VAR}` resolves to `""` in the deploy shell).
- **Frontend**: runs *outside* Docker, directly on the host via PM2 (`ecosystem.config.cjs`, app `realestate-web`), on port 3001, built fresh on every deploy.
- Both are fronted by whatever reverse proxy/DNS terminates the actual domains (not part of this repo — see §7.1). Team Chat needs an nginx `/socket.io/` block; see `docs/team-chat-realtime.md`.

### 3.2 The deploy pipeline (`.github/workflows/deploy.yml`)

Push to `main` (or manual dispatch) triggers two jobs:
1. **`build-check`** — installs and builds both apps in CI *before touching the server*, specifically because "lockfile drift has broken deploys repeatedly" (the workflow's own comment). Uses `npm ci` (fails loudly on lockfile drift) rather than `npm install`. It does **not** run any tests (§9).
2. **`deploy`** — SSHes into the prod host and runs a bash script inline. In order: checks swap is present, `git pull --ff-only`, builds and starts the API's Docker container, runs migrations, stops the frontend PM2 process, rebuilds the frontend, restarts PM2, then curls `localhost:3001` to confirm it's actually serving before declaring success.

### 3.3 Gotchas that have actually bitten this project (all currently mitigated — here's what to know)

**Swap requirement for the frontend build.** The `next build` on the production instance needs more RAM than the instance has; without swap, the OOM killer kills the build partway and leaves a broken `.next/`. The deploy script hard-fails *before* touching anything if `free -m` shows less than 1GB of swap (`deploy.yml:112`), and separately verifies `.next/BUILD_ID` exists after the build (`deploy.yml:148`) as a second check that the build wasn't silently killed.

**`docker compose exec` eating the deploy script's stdin.** The whole deploy runs as `ssh ... 'bash -s' << 'ENDSSH' ... ENDSSH` — a heredoc piped into the SSH session's stdin. Commit `926c012` first added `docker compose exec -T api npx prisma migrate deploy`, but `-T` alone wasn't enough — `exec` still tried to read the *rest of the heredoc script* as its own stdin, which could hang or corrupt the remaining deploy steps. Commit `a10030e` (2026-09-10) fixed it by appending `< /dev/null` (`deploy.yml:135`). **Any new `docker compose exec` inside this SSH block needs the same `< /dev/null`.**

**`node dist/prisma/seed.js` instead of `prisma db seed`.** `backend/package.json`'s `prisma.seed` config is `ts-node prisma/seed.ts` — fine in dev, but the prod image runs `npm ci --omit=dev`, which strips `ts-node`/`typescript`. (The `prisma` CLI itself was moved to `dependencies` in `8a6545a` so `migrate deploy` works in the prod image, but `ts-node` is still a devDependency.) The Nest build (`tsconfig.build.json` has no `include` restricting it to `src/`) compiles `prisma/seed.ts` too — `backend/dist/prisma/seed.js` exists alongside `backend/dist/src/main.js`. So seeding prod means `docker compose exec -T api node dist/prisma/seed.js < /dev/null`, not the Prisma CLI. The deploy workflow does not seed; seeding is manual.
  - Side note: `ecosystem.config.cjs` still points the *non-Docker* `realestate-api` PM2 app at `dist/main.js`, but the real entrypoint is `dist/src/main.js`. Production runs the API via Docker, so this PM2 entry looks stale/unused — but `pm2 start ecosystem.config.cjs` for the API would fail.

**The anonymous `node_modules` volume causing a stale Prisma client.** A **local-dev-only** issue (documented in `docs/local-dev.md`). `backend/docker-compose.yml` (dev) mounts `.:/app` and shadows it with `- /app/node_modules`, so `prisma generate` on the host does nothing for the running container; run `docker exec realestate-api npx prisma generate` after every migration. When the API runs directly on Windows instead, stop the dev server before `prisma generate` (the query-engine DLL is locked while it runs). Production's image bakes `prisma generate` in at build time, so this can't happen there.

---

## 4. Module by module: what's built vs. what isn't

### 4.1 Onboarding & auth
Two steps: account, then organisation (`frontend/app/(auth)/(portal)/register/page.tsx`). From `98c1a51` ("Simplify onboarding to 2 steps, remove approval gate, add Basic plan") and `backend/src/common/utils/onboarding-finalize.util.ts`:
- Finishing step 2 **activates the org immediately** — there is no Super Admin approval gate.
- The org is auto-assigned the seeded **"Basic"** plan (`assignBasicPlanIfMissing`, keyed by `Plan.slug === 'basic'`).
- The subdomain is auto-generated server-side (`GET /auth/subdomain-availability` exists for checks).
- A self-heal path (`finalizeLegacyOnboardingDraft`) rescues any account left stranded on one of the removed wizard steps (their backend routes are commented out, not deleted, "for reversibility").

Auth endpoints (`backend/src/modules/auth/auth.controller.ts`) also cover: **Google sign-in** (`/auth/google/config`, `/auth/google/url`, `POST /auth/google` — redirect flow fixed end to end in `d72e1d8`; the client id/secret are read from the DB-stored marketing settings, configured in Super Admin → Integrations → Social Login), email verification, **forgot / reset password** for both org and platform logins (`1f247c0`), refresh/logout, and change-password. Org and platform logins are separate pages (`ef020ff`). Users created by an org admin can sign in without a separate approval (`8cbc057`).

### 4.2 Plans / billing / subscriptions
**Quota-based, not feature-flag-based**, and this was a deliberate redesign — `backend/src/modules/plans/plan-capabilities.ts`: *"Seeded from the old hardcoded `ALL_FEATURES` matrix list, minus Projects / Users / Templates (those are numeric `limits`, not booleans)."* The `Plan` model splits it in two:
- `limits: Json` — `{ projects, users, templates, landingPages, landingPagesCreate }`, each `number | null` (`null` = unlimited). `landingPages` counts *published* landing pages; `landingPagesCreate` counts created ones (`plan-quota.util.ts`).
- `capabilities: Json` — `{ <key>: boolean }` against a fixed catalog (`publishing`, `customDomain`, `whatsappIntegration`, `whiteLabel`, `ssoAndSla`, …) that the frontend fetches from `GET /admin/plans/capabilities` rather than re-declaring.
- `features: Json` is explicitly **"Marketing bullet strings only — not functional."**

Enforcement lives in `backend/src/common/utils/plan-quota.util.ts` and `subscription-lifecycle.util.ts`: `assertLimit()` for projects (`projects.service.ts`) and users (`org-users.util.ts`), `assertTemplateQuota()` wherever templates get assigned (admin-organisations, signup), and the landing-page quotas inside the lifecycle util's create/publish checks. `assertPlanFitsCurrentUsage()` blocks any plan switch that would put the org over the new plan's limits (it never deletes anything to force a fit).

Billing is still internal bookkeeping for plans:
- `SubscriptionLifecycleSweeper` (`backend/src/modules/subscriptions/subscription-lifecycle.sweeper.ts`) is an in-process hourly timer (`setInterval`, unref'd) running `applyOrgSubscriptionLifecycle` — active → past_due (grace) → expired/cancelled, plus notification flags. The same logic also runs lazily on billing reads and publish attempts.
- Plan changes go through `package-change-requests`: the org submits a request (`submitOrgRequest`), checked against usage; a Super Admin approves (`adminApproveRequest`) or rejects with a reason (`adminRejectRequest`, shown to the org in Settings).
- **Known gap, deliberately left as a TODO:** `PATCH /org/billing/plan` (`OrgBillingService.changePlan`) lets any user with `billing:edit` switch the org to any active plan instantly and **for free**, and `POST /org/billing/renew` renews for free. That bypasses both the request/approval flow and payment. It has to be closed when plans get wired to Razorpay (§4.13).
- Plan prices are whole rupees (`priceMonthly` / `priceYearly`); Razorpay amounts are integer paise — convert ×100 at that boundary.

### 4.3 Projects & units
Real CRUD, org-scoped, with media upload, dynamic project types (`org-project-types`, apartment/plot/villa templates with role-based unit fields), template-driven unit forms, bulk lead creation from a project page (`projects:add_lead`), and unit-level permission pills (book/hold without editing the project). The schema decision — units carrying their own configuration rather than an FK to a unit type — is covered in §5.

- **Standalone units** (`Unit.projectId: null`) are real — resale/broker listings with no parent project. They get their own `managerId` and `UnitSalesAgent` rows, mirroring `Project.managerId`/`ProjectSalesAgent`, because a standalone unit has no project to inherit access from.
- **Three project-detail sub-tabs are still static mockups:** `frontend/app/org/projects/[id]/{ai-calling,insights,knowledge}/page.tsx`, each headed *"Static mockup carried over from the previous hardcoded project folder… nothing here is wired to the backend. It exists so the project tab bar doesn't 404."* `ai-calling` renders fabricated call transcripts with **no on-screen disclaimer**; only `insights` shows one ("figures below are placeholder data"). The fourth tab, `integrations`, is now **real** — it renders `MetaLeadAdsCard` (§4.11).
- **The org-level `/org/calling`, `/org/whatsapp` and `/org/teams` sections are switched off** (`0c715a3`, Phase 0 of the Team Chat rebuild). Each section's `layout.tsx` renders `<ComingSoon/>` for every route, the nav items are hidden, and the `calling`/`whatsapp`/`teams` keys are commented out of the permission catalog. The old pages — which render hardcoded fake call logs, WhatsApp threads and "AI Aarohi"-style agents — are untouched underneath. To restore, search for `[DISABLED-CALLING]`, `[DISABLED-WHATSAPP]`, `[DISABLED-TEAMS]`. The real `CallLog` model that `sales-agents.service.ts` reads for agent stats is unaffected; nothing under `/org/calling` ever read it.

### 4.4 Teams
**Switched off** (`0c715a3`): `OrgTeamsModule` is commented out of `app.module.ts` (`// [DISABLED-TEAMS]`), so `/org/teams/*` isn't served, and the frontend shows Coming Soon. `POST /team/invite` (`TeamModule`) is still live — it's the user-invite endpoint, not Teams.

Even when it was on, nothing read `TeamProject` or `TeamMember` to scope visibility — the only consumer of `teamProject` in the backend is `org-teams.service.ts`'s own CRUD. Lead visibility (`backend/src/common/utils/lead-scope.util.ts`) and project/unit visibility are resolved from the direct-assignment columns (`Project.managerId` / `ProjectSalesAgent`, `Unit.managerId` / `UnitSalesAgent`). Team-based visibility was built on the never-merged `vidya` branch (§7.2).

### 4.5 Templates vs. landing pages
Two separate Prisma models (`Template`, `LandingPage`), and creating a landing page from a template is a genuine **copy, not a live reference** — `org-landing-pages.service.ts`'s `create()` binds `template.content` into a new `content` JSON blob on the `LandingPage` row (`content: bound as Prisma.InputJsonValue`), keeping `sourceTemplateId` only as a lineage pointer. The schema comment on `LandingPage.content` says `// { sections, config } — the org's own copy`. Thank-you pages are separate `LandingPage` rows (`pageType: 'thank_you'`) copied alongside.

- Both models share the OpenPage content shape (`{ sections, config }`), edited through `lib/openpage/` + `components/openpage/`. The editor has page revisions (`page-revisions` module) and typography sets (org + admin).
- Admins manage the template library (`admin-templates` — create/edit/reset/assign-to-org, categories, plan filters). Templates in use by landing pages are protected from removal (`32b2894`).
- Orgs can only copy a template explicitly assigned to them (`OrganisationTemplate` join row), checked server-side.
- Publishing (`org-landing-pages.service.ts` `publish()`) is **self-service**, gated only by `assertOrgCanPublish` (an active/trial/in-grace subscription with the `publishing` capability, plus the landing-page quotas). The `LandingPage` model's `submittedAt`/`reviewedAt`/`reviewedById`/`rejectionReason` columns are unused groundwork — see §6.

### 4.6 Leads
A substantial, real CRM module (`leads.service.ts` is ~1,670 lines): capture from published landing-page forms (with tracking via `org-tracking`), Meta Lead Ads / Google Sheets ingestion with marketing attribution (§4.11), CSV bulk import (`d6294bc`), manual entry, an inbox with notes, stages (with an org-configurable stage display), a required note on status change, "next action", duplicate-mobile detection, and assignment. Visibility scoping is `lead-scope.util.ts` — direct project-manager/sales-agent/assignee based, not team-based. There's also a Super Admin cross-org lead view (`admin-leads`) and org reports (`org-reports`).

### 4.7 Catalogs
`OrgCatalogOption` (`org-project-catalog`) is per-org, freeform (category + label), and **never seeded** — no catalog population in `backend/prisma/seed.ts` or `seed-builder-page.ts`. Every org starts empty and populates it from Settings. Catalog values are copied onto `Unit`/`Project` columns as plain strings and never referenced by FK — the delete path's comment says hard-deleting an option is "safe by design" for this reason (`org-project-catalog.service.ts`, around line 60).

### 4.8 Permissions
A real, granular, DB-backed system (`backend/src/common/utils/permissions.util.ts`):
- **Org catalog:** 16 modules — `dashboard`, `users`, `crm`, `forms`, `projects`, `landing_pages`, `templates`, `websites` (now just the Media Library), `domains`, `team_chat`, `reports`, `integrations`, `billing`, `settings`, `support`, `roles_permissions`. `calling`, `whatsapp` and `teams` are commented out while those sections are off.
- **Platform catalog:** 17 `admin_*` modules (`admin_dashboard`, `admin_organisations`, `admin_templates`, `admin_subscriptions`, `admin_email`, `admin_settings`, …). `PLATFORM_ROUTE_MODULES` maps `/admin/...` path prefixes to these modules for `SuperAdminGuard` — **an unmapped `/admin` path is let through for any platform role**, so every new admin route needs a mapping (e.g. `/admin/payments` → `admin_subscriptions`).
- **Actions:** `view`, `add`, `edit`, `delete`, `approve`, `activate`, `deactivate`, `add_lead`, with per-module subsets (e.g. units get their own pills; landing pages reuse activate/deactivate for publish/pause). Permissions are button-level in the UI (`69054a9`).
- Effective permission resolves in three tiers: org-specific override row → platform-seeded system default for that role → hardcoded fallback (`loadRolePermissions`). Org roles inherit Super Admin's defaults until overridden (`47254d4`).
- `super_admin` and the org's own `admin` role bypass this (`UNRESTRICTED_ROLES`).
- Enforcement is `PermissionGuard` + `@RequirePermission(module, action)`, applied across 26 controllers. Roles that still have users can't be deleted or deactivated (`1a21ecf`).

### 4.9 Domains
Real, and now per landing page. An org requests a subdomain or custom domain (`org-domain`), optionally pinned to a specific landing page (`OrgDomainRequest.landingPageId`); Super Admin approves/rejects/suspends it (`admin-org-domain`). Verification is genuine (`backend/src/common/utils/domain.util.ts`): `verifyDomainDns()` resolves the host's A records (`dns.resolve4`) against the platform IP **and** checks a `_ipixxel-challenge` TXT ownership token, and `verifyDomainSsl()` probes the certificate. Both the org (`verifyDns`) and the admin (`verify`) can run it. Public routing for these domains is traced in §7.1.

### 4.10 Team Chat
Rebuilt from scratch in five phases (0–4) and merged to `main` via `vidya_new`. Full status, constraints and file map: **`docs/team-chat-handoff.md`** (read it before touching chat). In short: channels and DMs, REST API + Socket.IO namespace `/team-chat` (`team-chat.gateway.ts`) with presence, file attachments in a **separate private R2 bucket** served only via short-lived signed URLs, emoji, mentions, pins and message actions. Gated by the `team_chat` permission; DM search only offers active users who themselves have `team_chat:view`. Super Admin's Admin-role setting applies to org admins (`52740b5`). Env: `CHAT_WS_ORIGINS`, `TEAM_CHAT_PRESENCE_GRACE_MS`, `TEAM_CHAT_MAX_ATTACHMENT_MB`, `R2_PRIVATE_*` (see `backend/env.example`).

### 4.11 Marketing & lead attribution
`marketing` + `meta-leads` + `attribution-labels` modules, with `Marketing*` models (platforms, org platform access, connections, campaigns/ad sets/ads, metric snapshots, sync logs).
- **Org side** (`app/org/marketing/{apps,campaigns,sources,utm}`): "Connected Apps" to connect Facebook (Meta OAuth or a pasted long-lived Page token), Google Ads (OAuth), and Google Sheets (create/link a sheet, Apps Script webhook at `/webhooks/google-sheets/:connectionId`). Meta leads arrive via `/webhooks/meta` (`leadgen`) or Sync Now and become leads with Source/Medium attribution.
- **Super Admin side** (`app/admin-console/marketing`, `attribution`): platform catalog, which orgs may use which platforms, sync logs, and the Meta/Google app credentials (stored in `identity.marketing_settings`; `.env` values are optional fallbacks).
- Honest limits (from `docs/local-dev.md`): Instagram/WhatsApp share Meta OAuth but leads are attributed as Facebook/Meta; Google Ads stores tokens only — no lead or spend sync yet. Demo data comes from `npx prisma db seed` (`metadata.demo=true` connections don't call live APIs).
- Security gap: see §6 (credentials endpoints return secrets).

### 4.12 Integrations console (Super Admin)
`app/admin-console/integrations/` is the hub for platform-level third-party settings, listed in `frontend/lib/integrations.ts`; status comes from `GET /admin/integrations/status` (`integrations` module).
- **Email & SMTP** (`/smtp`) — `email` module: `GET/PUT /admin/email/config`, test send, logs, stats. Orgs have their own `/org/email/*` equivalent. Passwords are masked on read (`'••••••••'` + `hasPassword`; a blank/masked value on save keeps the stored one).
- **Social Login (Google)** (`/social-login`) — the Google OAuth client used by Google sign-in (§4.1).
- **Razorpay** (`/razorpay`, `feature-integrations` only) — keys for the payments module (§4.13), following the SMTP masking pattern.

### 4.13 Payments — Razorpay (`feature-integrations` only)
`backend/src/modules/payments/` is a **generic** Razorpay Orders + Checkout integration. It is deliberately **not tied to plans** — the subscription design is being reworked, so Plan, Subscription, package-change-requests and `OrgBillingService` were left untouched. Setup and an end-to-end test walkthrough are in `docs/local-dev.md` → "Razorpay payments (test mode)".
- **Models** (`billing` schema): `Payment` (amount in **integer paise**, status `created|pending|captured|failed|refunded`, purpose — only `test` today, `razorpayOrderId` unique, generic `referenceType`/`referenceId`), `WebhookEvent` (dedupe on `eventId` unique), `RazorpaySettings` (single `default` row).
- **Flow:** a feature calls `PaymentsService.createOrder(...)` → the browser opens Checkout (`frontend/lib/razorpay.ts` `openCheckout`) → `POST /org/payments/verify` checks the HMAC signature (constant-time) **and** fetches the payment from Razorpay; `POST /webhooks/razorpay` verifies the webhook signature over the raw body, stores the event (dedupe on `x-razorpay-event-id`), replies 200, then processes `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`. Fulfilment (`fulfilPayment`) runs under a row lock and is idempotent; it writes an audit log and emits `payment.captured` on the in-process `PaymentEventsService`. **Only the server (verify or webhook) marks a payment captured — never frontend state.**
- **Endpoints:** `GET /org/payments` (history, `billing:view`, shown in org Settings → Billing → Payment History); `GET /admin/payments` (Super Admin → Payments page); `GET/PUT/DELETE /admin/payments/settings`, `POST /admin/payments/settings/test`; `POST /admin/payments/test-order` — a ₹1 test payment for a chosen org, **refused (403) unless the key is `rzp_test_…`**. All writes are `super_admin`-only; `admin_subscriptions` can view.
- **Keys:** preferably saved in Integrations → Razorpay (apply without a restart, never returned by the API). `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` in `backend/.env` are an optional fallback: none set → payments soft-disabled (503); partial set or malformed key id → API refuses to boot; a webhook secret equal to the key id or key secret is rejected (the key id is public, so that would let anyone forge webhooks).
- **To wire plans later:** add a `PaymentPurpose` value (e.g. `plan_purchase`), create the order from the plan price (rupees ×100), subscribe to `payment.captured` to activate/extend the subscription, and close the free plan-change path (§4.2). That would be a one-time-payment model (Option A). Automatic recurring billing would need Razorpay's Subscriptions API (plans, mandates, `subscription.*` webhooks), which is not built.
- Not built: partial refunds (only full refunds are recorded), BillingProfile / GST invoicing.

### 4.14 Storage & uploads
`backend/src/common/storage/` — S3-compatible (Cloudflare R2) with two buckets: the public `R2_*` bucket for marketing media (presigned PUT from the browser, served from `R2_PUBLIC_URL`), and the private `R2_PRIVATE_*` bucket with its **own credentials**, used only for Team Chat attachments. Without R2 configured in dev, uploads fall back to local disk, and local private files are signed too (`f872728`). The Media Library (`app/org/media`, `websites` permission) sits on top.

### 4.15 Other modules worth knowing exist
`support` (tickets, org ↔ Super Admin), `notifications` (bell shows only the user's own — `25efcd4`), `forms` (form builder used by landing pages), `admin-audit-logs`, `admin-platform-team`, `platform-config`, `org-activity`, `org-dashboard` / `admin-dashboard`, and the user's own My Profile page (`35ca44f`). Lists across the app paginate at 10 per page; short create/edit forms open as popups and longer ones as full pages on the shared form kit.

---

## 5. Settled architectural decisions (and the ones that were reversed)

- **Templates and landing pages are separate models, copy-on-use — and this was tried two other ways first, both reverted.** Covered in §4.5. Migration history shows three shapes: (1) an original `templates.templates` catalog with `PricingModel`/`PaymentStatus` enums and a `team_template_access` table (a paid-marketplace shape) — dropped in `20260820114532_drop_template_catalog`, replaced with `organisation_landing_page_templates` (landing pages doubled as the shareable "templates"); (2) that was dropped in `20260822000000_remove_old_builder`, along with the old page-builder engine ("prestate", later renamed "openpage" — `3426180`); (3) `Template` was reinstated as its own model in `20260824145251_add_org_templates` / `20260824152956_add_template` (`ad0c936`) — the current design. **Don't reintroduce org↔LandingPage-as-template or a live `Template` FK — both were tried and abandoned.** Multi-tenant isolation (orgs using the same template must never end up linked to each other's pages) is the main reason for copying; protection from later template edits is a side effect. Note: the old template-catalog `PaymentStatus` enum is gone; the current `PaymentStatus` enum belongs to Razorpay payments (§4.13).

- **Units carry their own configuration; there is no `UnitType` foreign key.** `Unit.configuration` is a free string (a `unit_type` catalog label like "2 BHK"), validated against the org's catalog on write but not FK'd. `UnitType` is a separate per-project record for the **planned/marketed unit mix** — its schema comment: *"The available count is NOT stored here — it's derived at read time from the actual Unit rows' status."* Areas live on `Unit` because units of the same configuration vary in size. So `UnitType` is "what we're building," and `Unit` is the actual inventory — separate on purpose so the two can't drift.

- **Quota-based plan pricing, replacing a hardcoded feature matrix.** Covered in §4.2. Don't reintroduce a boolean "hasProjects" style flag — countable things belong in `limits`.

- **Catalogs are never seeded.** Covered in §4.7.

- **Visibility was *intended* to flow through teams, but that was never merged — and Teams is now switched off entirely.** See §4.4 and §7.2.

- **Payments are generic, and features hook in through events.** §4.13. New paid things should add a `PaymentPurpose` and subscribe to `PaymentEventsService`, not edit the payments module. Amounts are integer paise everywhere.

- **Third-party credentials are managed in the Super Admin console, with `.env` as an optional fallback** (SMTP, Google, Meta, Razorpay). Secrets should be masked on read, following the SMTP pattern — not the marketing credentials pattern (§6).

---

## 6. Known gaps and open questions

Being direct about these rather than papering over them:

- **Free plan changes and renewals.** `PATCH /org/billing/plan` and `POST /org/billing/renew` switch/renew plans with no payment and no approval (§4.2). Left as a TODO on purpose while the subscription design is reworked; must be closed before plans are sold through Razorpay.
- **Marketing credentials endpoints return secrets.** `GET /admin/marketing/credentials` and `GET /org/marketing/credentials` return the Meta app secret and Google client/Ads secrets in plain text. Flagged, not fixed. The Integrations → Social Login card reads the same data.
- **`resolveBySlug` in `PublicSiteService` (`backend/src/modules/public-site/public-site.service.ts`, ~line 334) still leaks draft/unpublished pages.** If no *published* page matches a slug, it falls back to returning **any** page with that slug — including a draft. So `GET /public/site/page/:slug` (and the `/p/[slug]` route) can expose unpublished content to an anonymous visitor who knows or guesses the slug.
- **Three fake project sub-tabs remain** (`ai-calling`, `insights`, `knowledge` — §4.3); `ai-calling` has no disclaimer. The much larger Calling/WhatsApp mock sections are now hidden behind Coming Soon.
- **Team-based visibility and `TeamUnit` exist only on the abandoned `vidya` branch**, and the Teams module itself is off. Decide explicitly whether to resurrect that work or keep the direct-assignment model.
- **Payments not wired to plans** (§4.13), no recurring billing, full refunds only.
- **CI has no schema-drift check and runs no tests.** `build-check` runs `prisma generate` against a fake, unreachable `DATABASE_URL`, so it can't validate migrations; `prisma migrate deploy` first runs live against production. A throwaway-Postgres `migrate deploy` step (plus `npm test` in both apps) would catch the next incident before prod.
- **Pre-existing schema drift** between the migration history and `schema.prisma` (7 items in `docs/schema-drift-notes.md`, e.g. `identity.media_files` never created by a migration, missing `org_domain_requests` columns/enum values). Not fixed — and it's why new migrations must not be generated by diffing a local DB (§8).
- **`ecosystem.config.cjs`'s `realestate-api` PM2 app is stale** (`dist/main.js` vs. the real `dist/src/main.js`).
- **The BigEstate/iPixxel naming split** (top of this doc) — the seeded Super Admin login is still `admin@bigestate.io`.
- **`LandingPage.submittedAt`/`reviewedAt`/`reviewedById`/`rejectionReason`** exist but aren't used by `publish()`; `frontend/app/org/publish-approvals/page.tsx` is a `<ComingSoon/>` placeholder. A planned-but-unbuilt review workflow, not a hidden live path.
- **8 backend tests fail** in `leads.service.spec.ts` (pre-existing; see §9).

---

## 7. The two things you specifically asked about

### 7.1 Is a published landing page actually reachable by a real public visitor?

**Yes — this is real, wired end to end.** The request path:

1. A visitor requests, e.g., `acme.ipixxel.ae/` or a connected custom domain.
2. `frontend/proxy.ts` (this Next.js version's renamed `middleware.ts`) intercepts it; its matcher excludes `api`, `_next/static`, `_next/image` and the favicon/sitemap/robots files. If the `Host` isn't one of the platform's own hosts, it's treated as an org site host and the request is rewritten to `/org-site`.
3. `frontend/app/org-site/page.tsx` (a server component) reads the `Host` header and calls `resolveOrgSiteHost(host)` (`frontend/lib/openpage/resolve-host.ts`).
4. That does a server-to-server `GET /public/site/resolve-org/:host` — no auth, `cache: "no-store"`.
5. `PublicSiteService.resolveByHost` (`public-site.service.ts`, ~line 48) normalises the host (strips port and `www.`), then:
   - first looks for an `OrgDomainRequest` with that custom domain in `approved`/`connected` status and not suspended, for an active org — serving the **published** landing page that request is pinned to, else the org's most recently updated published page (`buildSiteFromDomainRequest`);
   - otherwise falls back to an `Organisation` whose `customDomain` matches with `customDomainStatus: 'connected'` (`buildOrgSite` — the page pinned in `customDomainLandingPageId`, else the latest published page).
6. Back on the frontend, `LocalSitePreview` (`components/openpage/live-site.tsx`) receives the content as a server-provided prop, so its client-side localStorage fallback (used for the builder's own preview) never runs; it renders through `SiteRenderer` with `publicLive` set.

A second public path exists for slug links (`ipixxel.ae/p/some-slug`, plus `/p/[slug]/thank-you`): `app/p/[slug]/page.tsx` checks the builder's own localStorage first, then falls back to `GET /public/site/page/:slug`, which any anonymous visitor can call.

**The wrinkle** (§6): `resolveBySlug` serves a **draft** page over that endpoint if no published page shares its slug.

External dependency the code assumes but doesn't manage: DNS for the subdomain/custom domain, and TLS. The app verifies both (§4.9) but doesn't create records or certificates — that's infra outside this repo.

### 7.2 Is `TeamUnit` (standalone units assigned to teams) built?

**No.** Grepping the backend, frontend and `schema.prisma` for `TeamUnit` returns zero matches on `main` and `feature-integrations`.

It exists only on `vidya`, which `git merge-base --is-ancestor` confirms was **never merged** (it has 2 commits not on `main`, and is ~240 commits behind). The relevant commit there is `b7537bb` ("feat(teams): move project/manager/lead assignment onto Teams…"), adding `TeamUnit` "mirroring TeamProject" and a `team-scope.util.ts` meant to replace the direct `Project.managerId`/`ProjectSalesAgent` scoping everywhere.

What exists on `main` today:
- `TeamProject` and `TeamMember` tables still exist in the schema, but the module that did their CRUD (`org-teams`) is switched off (§4.4), and nothing ever read them for authorization.
- Standalone units get visibility through their own `Unit.managerId` and `UnitSalesAgent` — no team-mediated path.

If you need standalone-units-via-teams, rebuild it or cherry-pick from `b7537bb` — but given that branch's tip is literally named `temp` and is far behind `main`, treat it as a reference, not something to merge wholesale. Re-enabling Teams also means restoring the `[DISABLED-TEAMS]` blocks.

---

## 8. Schema-drift history and the rules that prevent it

Four incidents in roughly three weeks, reconstructed from git history, the last of which broke production:

1. **`fea0256` "fix : for migration" (2026-08-26).** Two migration files had their SQL bodies swapped (`20260824145251_add_org_templates` held the `templates` DDL and vice versa). Since `organisation_templates` has an FK into `templates`, a clean `prisma migrate deploy` would break. Fixed by swapping them back.

2. **`b72f1fb` "fix: missing db migrations" (2026-09-01).** `schema.prisma` changed (added `LandingPage.subdomain`/`subdomainStatus`, a `Lead.source` default) without a migration. Fixed by hand-writing `20260901120000_add_landing_page_subdomain` after the fact.

3. **`2b227c5` "db" (2026-09-01).** Added `backend/prisma/import-missing-schema.sql` — hand-written, idempotent SQL (`IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object`), run manually with `psql -f` to bring a drifted database in line, with its own verification command in the header (`prisma migrate diff … --to-schema-datamodel` should output nothing).

4. **`4e0b404` "fix: make drift-reconcile migration conditional on actual state" (2026-09-11) — took production down.** `20260910170000_reconcile_schema_drift` was generated with `prisma migrate diff --from-url <live db>` against a **local machine that had already drifted**, baking in unconditional `DROP COLUMN`/`ADD CONSTRAINT` statements. Per the fix's own comment: *"That made every statement below assume the local machine's state instead of checking the real one, so it failed on production."* Every statement was rewritten to be conditional.

Since then, `605cc4b` documented further **pre-existing** drift in `docs/schema-drift-notes.md` (found by migrating an empty DB and diffing it against `schema.prisma`; 7 items, not fixed).

**Rules in place, and their limits:**
- **Never generate a migration by diffing a database whose state you haven't confirmed matches the migration history.** The safe way, used for the Razorpay migrations (`20261012054949_add_razorpay_payments`, `20261012074111_add_razorpay_settings`): create a throwaway database, apply the existing migrations, run `prisma migrate dev --create-only` against it, strip anything unrelated to your change (the known drift will show up as spurious `DROP`/`ALTER` statements), drop the throwaway DB, and commit the migration with the schema change.
- **Guard DDL that touches existing objects** — `IF NOT EXISTS`, `IF EXISTS`, `EXCEPTION WHEN duplicate_object/duplicate_column THEN NULL` — so a migration applies cleanly whatever state a given database is in. On a drifted local DB, a guarded migration can be applied with `npx prisma db execute --file …/migration.sql`.
- After migrating: `prisma generate` (in the container when the API runs in Docker — §3.3).
- **What's *not* in place:** a CI step that applies migrations to a real database before deploy (§6).

---

## 9. Testing

- **Backend — Jest 30 + ts-jest.** Unit tests are `*.spec.ts` next to the code under `backend/src` (config in `backend/package.json`: `rootDir: src`, node environment). Run from `backend/`: `npm test`, `npm run test:watch`, `npm run test:cov`. Notable suites: `payments/*.spec.ts` (signature, config, settings, and the payments service against an in-memory Prisma fake), `team-chat/*.spec.ts`, `meta-leads/*.spec.ts`, `storage/private-local.util.spec.ts`.
- **Backend e2e — Jest + Supertest**, in `backend/test/` (`jest-e2e.json`), run with `npm run test:e2e`.
- **Frontend — Vitest 4 + React Testing Library** (`@testing-library/react`, `user-event`, `jest-dom`) on jsdom; config in `frontend/vitest.config.mts` and `frontend/vitest.setup.ts`. Run from `frontend/`: `npm test` (watch) or `npx vitest run`.
- **Baseline:** backend has **8 pre-existing failures**, all in `leads.service.spec.ts`; frontend was 139/139 passing at the last full run. New work must not add failures.
- There's no browser E2E tool (no Playwright/Cypress), and CI doesn't run any of these (§3.2, §6).
