import Link from "next/link";
import { prisma } from "@/lib/db";
import { getMarketingConfig } from "@/lib/marketing/config";
import {
  holidays,
  holidaySchedule,
  type Holiday,
} from "@/lib/marketing/templates";
import { ActionForm } from "@/components/ActionForm";
import {
  saveCampaign,
  saveHolidayRule,
  suppressEmail,
  saveMarketingSettings,
  updateSubscriber,
} from "./actions";
import { CampaignFields } from "./fields";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { customerAudience } from "@/lib/platform/customers";
import { todayKey } from "@/lib/platform/rules";
import { AdminShell, Stat } from "../admin-ui";
export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    channel?: string;
    q?: string;
  }>;
}) {
  const admin = await requirePlatformAdmin();
  const params = await searchParams;
  const config = await getMarketingConfig();
  const [campaigns, rules, lastRun, suppressedCount, contacts] =
    await Promise.all([
      prisma.marketingCampaign.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { _count: { select: { deliveries: true } } },
      }),
      prisma.marketingRule.findMany(),
      prisma.marketingRun.findFirst({ orderBy: { startedAt: "desc" } }),
      prisma.marketingSuppression.count(),
      prisma.customer.findMany({
        where: params.q
          ? {
              OR: [
                {
                  email: {
                    contains: params.q.slice(0, 100),
                    mode: "insensitive",
                  },
                },
                {
                  firstName: {
                    contains: params.q.slice(0, 100),
                    mode: "insensitive",
                  },
                },
                {
                  lastName: {
                    contains: params.q.slice(0, 100),
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {},
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
  const year = todayKey().slice(0, 4);
  const start = params.start || `${year}-11-01`,
    end = params.end || `${year}-11-30`;
  const channel = "email";
  let result;
  let error = "";
  try {
    result = await customerAudience({ start, end, channel });
  } catch {
    error = "Choose a valid date range of at most one year.";
  }
  const query = new URLSearchParams({ start, end, channel }).toString();
  return (
    <AdminShell
      email={admin.email}
      title="Email marketing"
      subtitle="Plan holiday campaigns, manage subscribers and track promotional emails."
    >
      <section className="panel">
        <h2>Email sending status</h2>
        <p>
          <strong>
            {config.enabled && config.ready
              ? "Sending enabled"
              : "Sending disabled"}
          </strong>{" "}
          · {config.from || "Sender not configured"}
        </p>
        <p className="small">
          Uses your existing SMTP mailbox. The scheduler runs daily around 9–10
          AM Pacific. Each run handles up to 40 recipients; a larger queue
          continues on later runs.
        </p>
        {config.missing.length > 0 && (
          <p className="notice error">
            Missing configuration: {config.missing.join(", ")}
          </p>
        )}
        <p className="small">
          Save a draft → review the email and audience → send yourself a test →
          schedule delivery.
        </p>
        <ActionForm action={saveMarketingSettings} label="Save email settings">
          <label>
            Business mailing address
            <textarea
              name="postalAddress"
              defaultValue={config.address}
              required
              maxLength={500}
              rows={2}
              placeholder="Street or registered mailbox, city, state, ZIP"
            />
          </label>
          <p className="small">
            This address appears in every promotional email. Your existing SMTP
            mailbox remains the sender.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={config.enabled}
              disabled={!config.ready || config.environmentPaused}
            />
            <span>Enable promotional delivery for scheduled campaigns</span>
          </label>
          <p className="small">
            Turning this off pauses the queue without deleting drafts. An email
            already in flight may still finish.
          </p>
          {config.environmentPaused && (
            <p className="notice">
              Deployment pause is active. Set MARKETING_ENABLED=true in Vercel
              to allow the sending switch.
            </p>
          )}
        </ActionForm>
        {config.enabled &&
          config.ready &&
          (!lastRun ||
            lastRun.startedAt.getTime() < Date.now() - 36 * 3600000) && (
            <p className="notice error">
              The daily worker has not reported in the last 36 hours. Check the
              Vercel cron configuration before expecting automatic delivery.
            </p>
          )}
        <p>
          Last worker run:{" "}
          {lastRun
            ? `${lastRun.startedAt.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} Pacific · ${lastRun.processed} processed · ${lastRun.error || (lastRun.finishedAt ? "Finished" : "Running / interrupted")}`
            : "No scheduled run recorded yet"}
        </p>
      </section>
      <section className="panel">
        <h2>Campaigns</h2>
        <div className="table-scroll">
          <table className="platform-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Send date</th>
                <th>Excluded stay dates</th>
                <th>Status</th>
                <th>Recipients queued</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/marketing/campaigns/${c.id}`}>
                      {c.name} →
                    </Link>
                  </td>
                  <td>{c.scheduledAt.toISOString().slice(0, 10)}</td>
                  <td>
                    {c.excludeStart} – {c.excludeEnd}
                  </td>
                  <td>{c.status}</td>
                  <td>{c._count.deliveries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!campaigns.length && (
          <p className="notice">
            No campaigns yet. Save a draft below or configure an annual holiday
            rule.
          </p>
        )}
        <details className="mt-5">
          <summary className="cursor-pointer font-semibold">
            Create an email campaign
          </summary>
          <ActionForm action={saveCampaign} label="Save draft">
            <CampaignFields />
          </ActionForm>
        </details>
      </section>
      <section className="panel">
        <h2>Annual holiday promotions</h2>
        <p>
          Send three calendar months before Thanksgiving, Christmas or June 1.
          November, December or June–August stays are excluded respectively.
          Enabling a rule schedules future dates; missed dates are not sent
          retroactively.
        </p>
        {(Object.keys(holidays) as Holiday[]).map((key) => {
          const template = holidays[key],
            rule = rules.find((r) => r.holiday === key),
            currentSchedule = holidaySchedule(key, Number(year)),
            nextYear =
              currentSchedule.scheduledAt > new Date()
                ? Number(year)
                : Number(year) + 1,
            schedule = holidaySchedule(key, nextYear);
          return (
            <details
              key={key}
              className="mt-5 rounded-xl border border-stone-200 p-4"
            >
              <summary className="cursor-pointer font-semibold">
                {template.name} · {rule?.enabled ? "Enabled" : "Disabled"} ·{" "}
                Next send date:{" "}
                {schedule.scheduledAt.toISOString().slice(0, 10)}
              </summary>
              <ActionForm action={saveHolidayRule} label="Save annual rule">
                <input name="holiday" type="hidden" value={key} />
                <label>
                  Subject
                  <input
                    name="subject"
                    maxLength={150}
                    defaultValue={rule?.subject || template.subject}
                    required
                  />
                </label>
                <label>
                  Message
                  <textarea
                    name="body"
                    rows={4}
                    minLength={10}
                    maxLength={10000}
                    defaultValue={rule?.body || template.body}
                    required
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={rule?.enabled || false}
                  />
                  Enable annual email promotion
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" name="confirmed" />I authorize this
                  email to be sent automatically each year to eligible
                  subscribers.
                </label>
              </ActionForm>
            </details>
          );
        })}
      </section>
      <section className="panel">
        <h2>Preview an eligible email audience</h2>
        <div className="platform-tabs">
          <Link
            href={`?start=${year}-11-01&end=${year}-11-30&channel=${channel}`}
          >
            Thanksgiving · November
          </Link>
          <Link
            href={`?start=${year}-12-01&end=${year}-12-31&channel=${channel}`}
          >
            Christmas · December
          </Link>
          <Link
            href={`?start=${year}-06-01&end=${year}-08-31&channel=${channel}`}
          >
            Summer break · June–August
          </Link>
        </div>
        <form className="filter-form">
          <label>
            Exclude stays from
            <input type="date" name="start" defaultValue={start} required />
          </label>
          <label>
            Through (inclusive)
            <input type="date" name="end" defaultValue={end} required />
          </label>
          <input type="hidden" name="channel" value="email" />
          <button className="button">Preview audience</button>
        </form>
        <p className="small">
          Uses stay dates, not the date a request was submitted. Active holds
          and paid reservations overlapping this period are excluded. Notion
          reservations are not included until Notion sync is connected.
          Cancelled, rejected, and expired unpaid requests do not exclude a
          customer.
        </p>
        {error && <p className="notice error">{error}</p>}
      </section>
      {result && (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <Stat
              label="Email subscribers"
              value={String(result.subscribedCount)}
            />
            <Stat
              label="Already booked — excluded"
              value={String(result.excludedCount)}
            />
            <Stat
              label="Eligible customers"
              value={String(result.customers.length)}
            />
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Eligible audience</h2>
              <a
                href={`/api/admin/customers/export?${query}`}
                className="button secondary"
              >
                Export Excel ↓
              </a>
            </div>
            <p className="small">
              Export recalculates eligibility from current bookings and
              preferences. Each customer appears once.
            </p>
            <div className="table-scroll">
              <table className="platform-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Dogs</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {result.customers.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {c.firstName} {c.lastName}
                      </td>
                      <td>{c.pets.map((p) => p.name).join(", ")}</td>
                      <td>{c.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!result.customers.length && (
                <p className="notice">
                  No eligible subscribers for this date range.
                </p>
              )}
            </div>
          </section>
        </>
      )}
      <section className="panel" id="subscribers">
        <h2>Subscriber preferences</h2>
        <p>
          New customers can opt in while booking. Existing customers can update
          their account preferences; you can also record a customer&apos;s explicit
          request here.
        </p>
        <form className="filter-form">
          <label>
            Find a customer
            <input
              name="q"
              defaultValue={params.q || ""}
              placeholder="Name or email"
            />
          </label>
          <button className="button secondary">Search</button>
        </form>
        <p className="small">
          Showing up to 30 matching customers. This does not automatically
          subscribe your historical customer list.
        </p>
        {contacts.map((c) => (
          <details
            key={`${c.id}:${c.emailMarketingOptIn}`}
            className="mt-3 rounded-xl border border-stone-200 p-4"
          >
            <summary className="cursor-pointer">
              {c.firstName} {c.lastName} · {c.email} ·{" "}
              {c.emailMarketingOptIn ? "Subscribed" : "Not subscribed"}
            </summary>
            <ActionForm action={updateSubscriber} label="Save preference">
              <input name="customerId" type="hidden" value={c.id} />
              <label className="check-label">
                <input
                  name="subscribed"
                  type="checkbox"
                  defaultChecked={c.emailMarketingOptIn}
                />
                Subscribed to promotional emails
              </label>
              <label>
                Customer request / permission record
                <input
                  name="reason"
                  required
                  maxLength={250}
                  placeholder="e.g. Customer asked by email on Oct 1"
                />
              </label>
              <label className="check-label">
                <input name="confirmed" type="checkbox" />
                The customer explicitly asked to receive promotional emails
                (required when subscribing).
              </label>
            </ActionForm>
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>Exclude an email address</h2>
        <p>
          {suppressedCount} suppressed addresses. Record bounced addresses or
          complaints from your mailbox here. These addresses stay excluded even
          if a profile remains subscribed.
        </p>
        <ActionForm action={suppressEmail} label="Exclude from promotions">
          <label>
            Email
            <input type="email" name="email" required maxLength={254} />
          </label>
          <label>
            Reason
            <input
              name="reason"
              required
              maxLength={300}
              placeholder="Bounced address / customer complaint"
            />
          </label>
        </ActionForm>
      </section>
    </AdminShell>
  );
}
