# Waiting list

Full operating dates remain grey and selectable. The complete counted stay is
checked using the existing California wall-clock convention, includePickupDay
setting and dog count. Any shortage saves a waiting-list request; capacity-zero,
manually blocked and past dates remain unavailable to customer submissions.

## State and acceptance

`Submission.waitlistedAt` is the active membership marker and original queue time.
It is separate from PENDING / NEEDS_REVIEW / MEET_GREET_REQUESTED. The most recently
checked shortage dates are stored in `waitlistDates`; this array may become empty
without removing membership. Edits and meet-and-greet scheduling retain membership.
The operational deadline does not expire it. Revisions preserve the marker and
dates; decision history records the joined time when accepting or rejecting.

New requests do not occupy capacity. A waitlisted change to an already accepted
booking leaves its accepted snapshot occupying the original dates. Only accepting
the change replaces that snapshot. Rejecting the change retains the original stay.

Admin Accept explicitly permits capacity overages and records the actor and
affected counts, e.g. 17/17 → 18/17, without changing settings. It still rejects
closed dates, stale revisions, closed requests and repeat acceptance. Waiting-list
requests cannot be accepted merely by changing the status in Edit Order. Existing
normal order edits retain their prior workflow. All capacity writes use the shared
transaction lock.

Legacy email Accept links route waitlisted or over-capacity requests to authenticated
admin review. The remaining direct email acceptance path uses the strict capacity
guard under the lock, protecting against a race after its initial preview.

## Reminders

Before a capacity-changing write, capture affected dates overlapping active waiting
requests. After the write, compare actual remaining space inside the same locked
transaction. Create a `WaitlistAlert` only for open dates whose remaining space
increased and still overlap an active candidate. Cancellation-request-only changes,
unaccepted cancellations, unchanged limits, and 18/17 → 17/17 do not create a vacancy
alert. Replacing accepted dates, shortening a stay, raising a limit, reopening dates
and changing pickup-day counting all use this comparison.

Alerts persist separately from email delivery and are shown on Dashboard, Requests
and Calendar. Date links apply the same occupancy convention to the waiting-list
filter. A reminder indicates overlap, not guaranteed space for a candidate's entire
stay. Requests with cancellation pending are omitted from contact reminders but
remain visible in the waiting list until explicitly closed.

Each event has a unique key. Email attempts are claimed once before SMTP, recipient
addresses are deduplicated, and one recipient's failure does not stop the others.
Delivery and scheduling failures are retained. No automatic mail retries are made;
the persistent dashboard reminder is the fallback, including a failure indicator.
Acknowledging a reminder requires admin access and never changes an application.

## Customer communication

The calendar provides the requested Chinese message and its English equivalent.
Waiting-list submission buttons, success pages, account status, receipt emails and
PDF covers explicitly say the request is not confirmed. Deposit instructions start
after acceptance. The original signed agreement and pricing remain attached as
conditional terms; this feature does not change financial records or refund rules.

On admin acceptance, the owner receives the standard acceptance confirmation and
admins receive a separate `[New Submission] Dogs — $Total — Start to End — Owner`
email, using the same full submission template and signature/PDF attachments as
ordinary intake. It identifies the booking as confirmed, links to its admin detail
page and omits decision buttons. It uses the reviewed revision's saved form and
quote, including manual prices and both dogs, without recalculating current rates.
Normal acceptance, Meet & Greet and rejection do not create this extra intake copy.

The winning status transition sends the copy once; stale/concurrent/repeat Accept
attempts send nothing. Owner and admin delivery are attempted independently, with
separate email logs and failure feedback in the admin action. Failures do not undo
acceptance or reopen Accept. There is no automatic retry of this intake email.

## Migration and verification

Migration `20261119000000_waiting_list` adds nullable membership timestamps, empty
date arrays and the reminder table. It does not convert historical orders, modify
capacity settings or delete data. Apply migrations before running the new app;
the existing `vercel-build` command does this. The production database was not
migrated as part of local implementation.

Run against a disposable database on local port 55439, with all migrations applied:

```sh
TEST_DATABASE_URL=postgresql://USER@127.0.0.1:55439/TEST_DB npm run test:waitlist
```

The suite uses fake SMTP and covers full/cross-month dates, two-dog shortages,
guest API create/edit, persistent membership, receipt status, safe legacy links,
admin permissions, explicit overbooking, stale/double/concurrent accepts, actual
cancellation vs a request, vacancy matching, deduplication/failures, acknowledgement,
accepted-change retention, limit/reopening changes, night counting and same-day visits.
Existing booking, platform, admin workflow/order edits, submission response,
validation and pricing suites are also part of regression verification. Run database
suites sequentially because they share test capacity settings.

Local verification completed on 2026-11-18 (Pacific): all 17 migrations applied to
a fresh disposable PostgreSQL database; type checking, lint, production build and
all eight suites listed above passed. Browser checks covered desktop and 390px
mobile full-date selection with the bilingual notice, the admin waiting-list view,
and a real local Accept changing the calendar from 17/17 to 18/17. Email delivery
was simulated in tests; real SMTP was disabled in the local browser preview.

The acceptance-email regression added on 2026-11-21 exercises the real email
templates with simulated SMTP/PDF generation. It checks the exact intake subject,
complete stored information, multi-dog and manual prices, attachments, owner
confirmation, duplicate suppression, independent delivery failures and PDF errors.
