# Local development notes

## Prisma client goes stale in the API container after a schema change

**Symptom.** You change `backend/prisma/schema.prisma` and run a migration, but
the running `realestate-api` container keeps throwing TypeScript errors like
`Property 'xxx' does not exist on type '{ ... }'` for the new column/relation,
or serialized API responses are missing the new fields. `npx prisma generate`
on your host machine appears to succeed but changes nothing.

**Cause.** `backend/docker-compose.yml` mounts the project as `.:/app` **and**
shadows `node_modules` with an anonymous volume:

```yaml
    volumes:
      - .:/app
      - /app/node_modules   # <- anonymous volume, container-only
```

So the container has its **own** `node_modules` (including its own generated
`@prisma/client`), completely separate from the one on your host. Running
`prisma generate` on the host regenerates the host copy; the container never
sees it. The container's client is only regenerated when the image is (re)built
or when `prisma generate` runs *inside* the container.

**Fix.** After applying any migration, regenerate the client inside the
container:

```bash
docker exec realestate-api npx prisma generate
```

The `npm run start:dev` watcher then recompiles against the fresh client. If it
doesn't pick it up, `touch` a source file it watches or `docker restart
realestate-api`.

> Not fixing the mount here on purpose — a proper fix (e.g. a named volume plus
> a `prisma generate` step in the container entrypoint) is a separate change.
> This note is so the next person doesn't lose an hour to it.

## Applying migrations against the Dockerised Postgres

`realestate-pg` publishes Postgres on `localhost:5433`. If Prisma CLI commands
intermittently fail with `P1001 Can't reach database server at localhost:5433`,
force IPv4:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/realestate?schema=public" \
  npx prisma migrate dev
```

## Demo / dummy marketing data

Re-run the database seed to populate the Skyline Developers demo org with
Connected Apps, campaigns, sync logs, metric snapshots, and attributed leads
(Facebook Lead Ads, Google Ads, website):

```bash
cd backend
npx prisma db seed
```

Login as `rohan@skylinedev.in` (password from `SEED_USER_PASSWORD`, default
`Welcome@123`). Demo connections are marked `metadata.demo=true` so Sync Now
does not call live Meta/Google APIs.

Primary product path: **Marketing → Connected Apps** (Facebook / Instagram /
WhatsApp). Settings → CRM and project Integrations still expose the legacy Meta
card. Manager-facing overview: `docs/social-media-connection.md`.

1. Create a Meta App with **Facebook Login** + **Webhooks** + **Lead Ads** products.
2. Copy `META_APP_ID`, `META_APP_SECRET`, and a random `META_WEBHOOK_VERIFY_TOKEN`
   into `backend/.env` (see `backend/env.example`).
3. Expose the API with a tunnel (ngrok, Cloudflare Tunnel, etc.) and set
   `BACKEND_PUBLIC_URL` to that public base (no trailing slash).
4. In Meta App settings:
   - Valid OAuth Redirect URI: `{BACKEND_PUBLIC_URL}/org/meta/oauth/callback`
   - Webhook callback URL: `{BACKEND_PUBLIC_URL}/webhooks/meta`
   - Verify token: same as `META_WEBHOOK_VERIFY_TOKEN`
   - Subscribe the app to the `leadgen` field on Page.
5. Super Admin → Marketing / Lead Attribution confirms Meta env is loaded and
   the org is allowed to use Meta platforms if access is restricted.
6. Org admin connects from **Marketing → Connected Apps** (or legacy
   Settings → CRM / project Integrations). Prefer Connected Apps.
7. Without a public tunnel, use **Connect with Page token** (Graph API Explorer
   long-lived Page token) instead of OAuth.
8. **Verify:** connect from Connected Apps, then click **Sync Now** (imports
   recent form leads) or send a Meta test lead → confirm rows in Lead Center
   with Source = Facebook, Medium = Paid Social, and Marketing Attribution on
   the lead detail page.
9. Honest limits for demos: Instagram/WhatsApp share Meta OAuth but leads are
   still attributed as Facebook/Meta today; Google Ads connect stores tokens
   only (no lead or spend sync yet).

## Razorpay payments (test mode)

The payments module (`backend/src/modules/payments`) is a generic Razorpay
Orders + Checkout integration. It isn't wired to plans yet: features call
`PaymentsService.createOrder()` and subscribe to `PaymentEventsService`
(`payment.captured` / `payment.failed` / `payment.refunded`). Amounts are
integer paise.

### Keys

Preferred: Super Admin → **Integrations → Razorpay**. Enter the Key ID and
Key Secret (Dashboard (Test Mode) > Account & Settings > API Keys) and the
Webhook Secret (the separate secret you type when creating the webhook), click
**Test connection**, then **Save**. Saved keys apply immediately (no restart),
are stored in `billing.razorpay_settings`, and are never returned by the API
(masked). Only `super_admin` can change them; `admin_subscriptions` can view.

Optional fallback in `backend/.env` (all three or none), used when nothing is
saved in the console:

```
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."          # its own value — NOT the key id / key secret
```

Without any keys the API boots and payment endpoints return 503. A partial env
set or a malformed key id stops the API at boot. An env webhook secret equal to
the key id or key secret is ignored (logged as an error), because the key id is
public and anyone could then forge webhooks.

### Webhook through a tunnel

1. Expose the API: `ngrok http 4000` (or `cloudflared tunnel --url http://localhost:4000`).
2. Razorpay Dashboard (Test Mode) > Account & Settings > Webhooks > Add:
   - URL: `https://<tunnel>/webhooks/razorpay`
   - Secret: same as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`
3. Make sure payment capture is automatic (Account & Settings > Payment
   capture). With manual capture, `/verify` leaves the payment `pending` until
   you capture it in the dashboard and the `payment.captured` webhook arrives.

### End-to-end check

1. Log in to the admin console as Super Admin → **Payments** → **Test payment**,
   pick an org → Checkout opens for ₹1.00. The button is disabled (and the
   API returns 403) unless the key is `rzp_test_…`.
2. Pay with a test method:
   - Domestic test card, e.g. Mastercard `5267 3181 8797 5449` or Visa
     `4386 2894 0766 0153`, any future expiry, any CVV; pick Success on the mock
     OTP page. Razorpay's "Test Card Details" docs page has the current list.
   - UPI ID `success@razorpay` (succeeds) or `failure@razorpay` (fails).
   - Netbanking: pick any bank, choose Success/Failure on the mock page.
3. Expect: the success notice, the row `captured` in Admin → Payments and in
   the org's Settings → Billing → Payment History, and a row in
   `billing.webhook_events` with `processed_at` set (or `error` explaining why
   not). Re-sending the webhook from the dashboard does not reprocess it.
4. Failure path: use `failure@razorpay`, close Checkout → "payment failed"
   notice; the `payment.failed` webhook marks the row `failed` with the reason.
5. Refund: refund the payment in the dashboard → `refund.processed` marks it
   `refunded` (full refunds only for now).

Applying the migration on a DB whose history has drifted (see
`schema-drift-notes.md`): the payments migration is guarded and idempotent, so
`npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261012054949_add_razorpay_payments/migration.sql`
is safe, then `npx prisma generate` (stop the dev server first on Windows;
`docker exec realestate-api npx prisma generate` when the API runs in Docker).

## Testing billing v2 renewals, grace and "fall back to Basic"

Billing v2 needs `NEXT_PUBLIC_BILLING_V2=true` in `frontend/.env` **and**
`BILLING_V2=true` in `backend/.env`. On the server, `BILLING_V2` only changes
what happens when grace ends unpaid: the org always falls back to Basic. With
it unset, the old "restrict" / "cancel" setting still applies (the v2 settings
card shows a warning).

How the dates work: grace always ends at **renewal date + grace days** (+ any
"Extend grace" days). It is worked out again on every check, so editing
`billing.subscriptions.renews_at`, or changing the grace days, applies at once;
`grace_ends_at` is kept in step (a NULL there is filled in). The check runs
hourly, whenever an org opens Billing, and on demand (below).

### Run lifecycle check now

Super Admin → Settings → Subscription expiry policy → **Run now** (the
`super_admin` role only; `POST /admin/billing/lifecycle/run`). It runs the
check straight away — renewals due, grace, fall back to Basic, scheduled
downgrades / cancellations, reminders — shows what it did, and writes a
`billing_lifecycle_run` audit log entry.

### Moving the billing clock (`BILLING_CLOCK_OVERRIDE`)

To try future dates without editing the database, set in `backend/.env` and
restart the backend:

```
BILLING_CLOCK_OVERRIDE="+10d"        # 10 days from now (also -2d, +36h)
BILLING_CLOCK_OVERRIDE="2026-11-20"  # a fixed date (or a full ISO datetime)
```

Ignored when `NODE_ENV=production`. It moves only billing decisions — the
lifecycle check, the Billing overview, checkout prices and period dates.
Row timestamps, Razorpay orders and invoice dates stay real. Remove it (and
restart) when you're done.

Example — a subscription that renews 4 days from today, notify days 3, grace
7 days: `+2d` → renewal due (Pay now, reminder); `+5d` → payment due, grace
day 2 of 7; `+12d` → on Basic with the extras paused.
