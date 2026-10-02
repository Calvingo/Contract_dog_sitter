# Silicon Paws Retreat

A Next.js / PostgreSQL dog boarding platform with a customer portal, booking agreements, capacity management, manual Zelle / Venmo payment verification, and scheduled email marketing.

## Local setup

```bash
npm install
cp .env.example .env.local
# Configure your own database, email credentials, secrets, and ADMIN_PASSWORD.
npm run db:generate
npm run dev
```

Prisma CLI does not automatically load `.env.local`: supply `DATABASE_URL` and `DIRECT_URL` in the shell (or an untracked `.env`) when running migration commands. Apply `npm run db:deploy` to the intended database before using the new platform pages. Never point tests at the production database.

`npm run vercel-build` generates the Prisma client, applies migrations, and builds the site. Review migration `20261001000000_booking_platform` and back up the production database before deploying. It adds tables and fields; it does not delete existing customers or bookings. No production migration is performed by a normal `npm run build`.

## Routes

| Audience | Route                    | Purpose                                                                               |
| -------- | ------------------------ | ------------------------------------------------------------------------------------- |
| Public   | `/`                      | Service introduction and live availability                                            |
| Customer | `/login`                 | Email magic-link sign-in for new and returning customers                              |
| Customer | `/book`                  | Availability selection, existing care questionnaire, pricing, agreement and signature |
| Customer | `/account`               | Own booking history and status                                                        |
| Customer | `/account/dogs`          | Add and maintain multiple dog profiles                                                |
| Customer | `/account/profile`       | Contact details and email marketing preference                                        |
| Customer | `/account/bookings/[id]` | Own booking, payment instructions, payment history, change and cancellation requests  |
| Admin    | `/admin`                 | Dashboard and navigation                                                              |
| Admin    | `/admin/requests`        | Booking review and cancellation request indicators                                    |
| Admin    | `/admin/calendar`        | Monthly occupancy and date-range capacity overrides                                   |
| Admin    | `/admin/customers`       | Searchable customer table and `.xlsx` export                                          |
| Admin    | `/admin/payments`        | Verify reported transfers and record completed full refunds                           |
| Admin    | `/admin/marketing`       | Email campaigns, annual holiday rules, audiences, delivery logs and exclusions        |
| Admin    | `/admin/settings`        | Default capacity, hold rules, and payment recipients                                  |

Users must verify their email before reading profiles or making new bookings. Supplying an email query parameter does not reveal that account. Booking ownership is checked on the server. Admin sessions are separate. Old signed booking-edit links continue to work, including the previous `/?editToken=...` URLs.

## Booking business rules

- Default capacity is **17 dogs**. Every dog in a booking counts. Legacy submissions without a `SubmissionPet` row count as one dog.
- Arrival and pick-up dates both consume a slot by default. Admin can select night-based counting; same-day visits still consume one day.
- Daily overrides replace the default; `0` closes the date to new reservations. Reducing a limit preserves existing bookings and flags over-capacity dates.
- New requests have a **24-hour hold**. Approval starts a fresh payment window. The duration is configurable (1–168 hours); changing it does not rewrite existing deadlines.
- Expired unpaid requests release capacity dynamically. An expired request can only be approved if capacity is available again. A verified deposit keeps space reserved; cancellation and rejection release it.
- Legacy reservations have a null hold deadline and remain reserved. Review them in the admin calendar instead of silently expiring old bookings. Historical payments are not invented; existing reservations do not request another deposit through the new payment page. Handle their balances directly with the customer.
- A Postgres transaction-scoped advisory lock serializes capacity-changing writes. New bookings, edits, admin changes, email decisions, payment verification and limit changes use the same lock, with occupancy read afterward.
- Existing **20% deposit** pricing is retained. Payment instructions appear after approval and while a hold is valid. Customer-reported payments are unverified until an admin checks the transfer. A report extends the verification window once; duplicate pending reports are blocked.
- Admin records the actual received amount. Partial verified payments leave a remaining deposit. Full verification triggers a confirmation email; delivery failure is logged and does not roll back payment or invite another transfer.
- This site does not initiate Zelle / Venmo transfers or refunds and has no automatic reconciliation. Full refunds are recorded after being sent in the payment app. Partial refunds and balance collection are not part of this first phase.
- Cancellation is a request: the booking stays active until admin changes its status to `CANCELLED`. Refunds are separate. Modifying a booking requires review again.
- Historical agreement and price snapshots remain separate from the editable dog profile. The current booking form supports **up to two dogs per booking**, while the account can store more dogs.
- Promotions support email only. Customer profiles default to no email marketing subscription, and preference changes have an audit record. Phone numbers remain available for booking contact and customer exports. Legacy SMS database fields remain for compatibility, but there is no SMS audience, export column, subscription control, or sending feature.
- Audience exclusions use **stay dates** and active reservations, not order creation dates. Cancelled/rejected/expired unpaid requests do not suppress a customer. Exports recalculate the current audience and write literal Excel strings, including names beginning with `=`.

### Date convention

The existing production app stores booking timestamps as local civil date/time values in UTC fields. This version makes that convention explicit: `2027-04-05T10:00:00Z` means 10:00 AM **Pacific local booking time**, not an actual UTC arrival instant. Booking forms, price calculation, receipt formatting and capacity use the same wall-clock representation. Hold, login, payment and audit timestamps are real instants; their UI is formatted in `America/Los_Angeles`. Existing booking dates are not shifted by the migration. Before deployment, verify a known historical booking against this convention if data was previously created on a non-UTC server.

## Configuration

| Variable                                          | Purpose                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`, `DIRECT_URL`                      | PostgreSQL runtime and migration connections                       |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`                | Existing email transport; no message is sent without configuration |
| `ADMIN_EMAIL`                                     | Comma-separated admin allowlist / notification recipients          |
| `ADMIN_PASSWORD`                                  | Required shared admin password; there is no built-in fallback      |
| `APP_SECRET`                                      | Signing secret, at least 16 characters                             |
| `CUSTOMER_SESSION_SECRET`, `ADMIN_SESSION_SECRET` | Optional separate session secrets, falling back to `APP_SECRET`    |
| `LOGIN_TOKEN_TTL_MINUTES`                         | Magic-link lifetime; defaults to 30 minutes                        |
| `APP_BASE_URL`                                    | Public HTTPS origin for email links                                |
| `NEXT_PUBLIC_APP_URL`                             | Optional public origin fallback                                    |

Configure the real Zelle enrolled identifier / recipient name and Venmo username / recipient name in **Admin → Settings**. Empty values disable that method. No real payment details are seeded by migrations.

## Checks

```bash
npm run typecheck
npm run lint
npm run test:pricing
npm run test:platform
npm run test:marketing
npm run check:production
npm run build
```

`test:platform` first checks pure booking rules. Optional integration checks are restricted to a **dedicated local database on port 55439**. Use an empty disposable PostgreSQL database with all migrations applied. The test creates temporary customers, changes local capacity settings, and cleans up its fixtures. It never sends emails.

```bash
TEST_DATABASE_URL=postgresql://USER@127.0.0.1:55439/postgres npm run test:platform
```

Optional HTTP checks additionally require a local test server on port 3100, pointing to that same database, with:

- `APP_SECRET`, `CUSTOMER_SESSION_SECRET`, `ADMIN_SESSION_SECRET`: `platform-local-test-secret-only`
- `ADMIN_EMAIL`: `admin@example.test`
- `GMAIL_USER` and `GMAIL_APP_PASSWORD`: empty, to disable delivery

Then add `TEST_BASE_URL=http://127.0.0.1:3100` to the test command. These checks cover cross-account isolation, admin-only Excel downloads, literal Excel cells, availability privacy and atomic one-time token consumption.

## Email marketing

Promotional emails use the existing Gmail / SMTP connection. There is no SMS integration and no separate email provider account is needed. Transactional booking and sign-in emails remain separate from marketing preferences.

- Admin → Marketing creates editable **drafts**, previews the exact email body and eligible audience, then schedules an explicitly authorized campaign. Drafts never send. Scheduled content is frozen; campaigns can be paused or cancelled. Messages already in flight may finish.
- Optional annual rules schedule Thanksgiving three calendar months before the fourth Thursday in November, Christmas on September 25, and summer on March 1. Exclusion windows are the whole of November, December, and June–August respectively. Rules are disabled initially. Enabling them creates this and next year's future campaigns; unique annual keys prevent duplicates. Past dates are skipped, and disabling a rule pauses unfinished associated campaigns. Existing paused campaigns require explicit resumption.
- `vercel.json` registers one daily job at 17:00 UTC (9 AM PST / 10 AM PDT). This supports the daily scheduling limit; it does not promise an exact minute. The endpoint requires the `CRON_SECRET` Bearer token. Each invocation handles at most 40 recipients within a bounded time budget. Larger audiences continue on subsequent daily runs. For substantially larger lists, increase scheduler frequency on an appropriate hosting plan after reviewing mailbox quotas.
- At campaign start the opted-in audience is snapshotted; new subscribers join future campaigns. Before each email the worker rechecks consent, unchanged recipient address, suppression and overlapping active reservations. Expired campaigns are not sent.
- Durable delivery records, an atomic recipient claim and a database worker lease prevent concurrent workers sending the same recipient. Explicit temporary SMTP rejection is retried on a later daily run, at most three automatic attempts. Permanent rejections are marked failed. Network uncertainty or a crash while sending is marked **UNKNOWN**, never retried automatically. Admin must check Sent mail, resolve the result, then explicitly retry only a confirmed unsent message. SMTP cannot guarantee exactly-once delivery or confirm inbox placement.
- Every promotional email includes a booking link, physical mailing address, a signed unsubscribe link and one-click unsubscribe headers. Unsubscribe does not require login; GET requests only show confirmation, while POST performs the opt-out and writes a consent audit record. Keep `MARKETING_TOKEN_SECRET` stable so old links continue working.
- SMTP does not provide bounce / complaint webhooks. Review the existing mailbox and use **Exclude an email address** to suppress bounced addresses or complaints. Suppressions affect both campaign eligibility and promotional exports.
- The dashboard shows configuration readiness, the last worker run and per-recipient results. `ACCEPTED` means the SMTP server accepted the message, not that it arrived in the inbox. Delivery records currently show the latest 200 recipients per campaign.

### Production configuration and deployment

1. Back up the production database and confirm the existing Vercel project / domain before release. Use an isolated database for preview deployments. Never copy local demo customers or payment settings into production.
2. Keep the current database, SMTP and public URL settings. Set a strong `ADMIN_PASSWORD` (no fallback password exists). Run `npm run check:production` against the intended environment; it checks configuration without printing secrets or sending messages.
3. For promotions, configure `MARKETING_POSTAL_ADDRESS`, `MARKETING_TOKEN_SECRET` and `CRON_SECRET` (separate random values of at least 32 characters). `MARKETING_FROM` is optional and defaults to the existing SMTP user; only use an authorized sender. Start with `MARKETING_ENABLED=false`. Missing promotional settings do not prevent normal bookings or draft preparation.
4. Use `npm run vercel-build` as the Vercel build command. It generates the Prisma client, applies the two additive platform/campaign migrations, then builds. Do not use production database credentials for preview builds. The new tables are empty; annual rules and campaigns are not automatically enabled or seeded.
5. After deployment verify admin sign-in, customer magic-link sign-in, availability, a known historical booking, exports and payment recipients. Configure actual Zelle / Venmo identifiers in Admin → Settings; blank methods stay disabled. Verify SMTP connectivity with `npm run check:smtp` (no email sent).
6. Verify the email footer address, public unsubscribe URL and cron secret in production. Then set `MARKETING_ENABLED=true`, redeploy and explicitly enable desired rules or schedule reviewed campaigns. This release does not send promotional emails simply by deploying it.
7. Check Admin → Marketing after the next daily run. A missing, stale or failed worker run requires investigation. To stop sending, set `MARKETING_ENABLED=false` and redeploy, or pause a campaign in the admin UI. Roll back the application through Vercel if necessary; leave additive database tables in place rather than deleting data.

### Additional validation

`npm run test:marketing` tests holiday dates, safe HTML rendering and validation. With `TEST_DATABASE_URL` it additionally verifies authorization, unsubscribe tokens/auditing, reservation exclusions, suppression, concurrent workers, no duplicate sends, crash handling, temporary SMTP retry, pause, and atomic rate limits. The integration suite is limited to the isolated local PostgreSQL port 55439 and injects a fake sender: **no real email is sent**.

```bash
TEST_DATABASE_URL=postgresql://USER@127.0.0.1:55439/postgres npm run test:marketing
```

Admin password attempts and customer login-link requests now use database-backed rate limits. Vercel's trusted proxy IP header is used in production; forwarded headers from arbitrary clients are not accepted.

Technical references: [Vercel cron scheduling](https://vercel.com/docs/cron-jobs/usage-and-pricing), [cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [SMTP transport](https://nodemailer.com/smtp). Promotional mailing-address requirements: [FTC commercial email guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).
