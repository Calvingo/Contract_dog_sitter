import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { customerAudience } from "@/lib/platform/customers";
import { AdminShell, Stat } from "@/app/admin/admin-ui";
import { ActionForm } from "@/components/ActionForm";
import {
  campaignAction,
  saveCampaign,
  resolveDelivery,
  sendTestEmail,
} from "../../actions";
import { CampaignFields } from "../../fields";
import { BOOKING_WEBSITE, emailContent } from "@/lib/marketing/templates";
import { getMarketingConfig } from "@/lib/marketing/config";
export const maxDuration = 60;
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requirePlatformAdmin();
  const campaign = await prisma.marketingCampaign.findUnique({
    where: { id: (await params).id },
  });
  if (!campaign) notFound();
  const [audience, counts, deliveries, lastTest] = await Promise.all([
    customerAudience({
      channel: campaign.allCustomers ? "saved" : "email",
      ...(campaign.allCustomers
        ? {}
        : { start: campaign.excludeStart, end: campaign.excludeEnd }),
    }),
    prisma.marketingDelivery.groupBy({
      by: ["status"],
      where: { campaignId: campaign.id },
      _count: true,
    }),
    prisma.marketingDelivery.findMany({
      where: { campaignId: campaign.id },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.marketingTest.findFirst({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const config = await getMarketingConfig();
  const preview = emailContent(
    campaign.body,
    BOOKING_WEBSITE,
    "#unsubscribe-preview",
    config.address || "Your business mailing address",
    { firstName: "Chieh", petName: "pocky", imageUrl: campaign.imagePath },
  );
  return (
    <AdminShell
      email={admin.email}
      title={campaign.name}
      subtitle={`${campaign.status} · Send on ${campaign.scheduledAt.toISOString().slice(0, 10)} · ${campaign.allCustomers ? "All customers" : `Legacy audience · Exclude stays ${campaign.excludeStart} – ${campaign.excludeEnd}`}`}
    >
      <a href="/admin/marketing">← All campaigns</a>
      <section
        className={`grid gap-4 ${campaign.allCustomers ? "md:grid-cols-2" : "md:grid-cols-3"}`}
      >
        <Stat label="Eligible now" value={String(audience.customers.length)} />
        {!campaign.allCustomers && (
          <Stat
            label="Excluded by stay dates"
            value={String(audience.excludedCount)}
          />
        )}
        <Stat label="Current status" value={campaign.status} />
      </section>
      <div className="notice">
        {campaign.allCustomers
          ? "This email goes to all saved customer emails, excluding unsubscribed and blocked addresses."
          : "This older campaign uses its original subscriber and stay-date filters. Saving a draft switches it to all customers."}{" "}
        Each run processes up to 40 recipients. Remaining emails continue
        through the daily queue.
      </div>
      {campaign.status === "DRAFT" && (
        <section className="panel">
          <details>
            <summary className="cursor-pointer font-semibold">
              Edit email and image
            </summary>
            <ActionForm action={saveCampaign} label="Save draft">
              <input type="hidden" name="id" value={campaign.id} />
              <CampaignFields campaign={campaign} />
            </ActionForm>
          </details>
        </section>
      )}
      <section className="panel">
        <h2>Saved email preview</h2>
        <p className="small">
          Example: Chieh and pocky. Each email uses that customer’s name and dog
          names.
        </p>
        <p>
          <strong>From:</strong> {config.from || "Not configured"}
        </p>
        <p>
          <strong>Subject:</strong> {campaign.subject}
        </p>
        <div
          className="rounded-xl border border-stone-200 bg-white p-5"
          dangerouslySetInnerHTML={{ __html: preview.html }}
        />
      </section>
      <section className="panel">
        <h2>Send yourself a test</h2>
        <p>
          Preview the saved email in {admin.email}. Test emails never contact
          customers or change campaign status.
        </p>
        {config.mailReady ? (
          <ActionForm action={sendTestEmail} label="Send one test email">
            <input name="id" type="hidden" value={campaign.id} />
          </ActionForm>
        ) : (
          <p className="notice">
            Complete email settings before sending a test. Automatic scheduling
            does not need to be enabled for a test.
          </p>
        )}
        {lastTest && (
          <p className="small">
            Last test: {lastTest.status} · {lastTest.email} ·{" "}
            {lastTest.createdAt.toLocaleString("en-US", {
              timeZone: "America/Los_Angeles",
            })}{" "}
            Pacific · {lastTest.detail}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Audience preview</h2>
        <a
          className="button secondary"
          href={
            campaign.allCustomers
              ? "/api/admin/customers/export?channel=saved"
              : `/api/admin/customers/export?channel=email&start=${campaign.excludeStart}&end=${campaign.excludeEnd}`
          }
        >
          Export eligible audience ↓
        </a>
        <p className="small">
          Eligibility is checked again when each email sends. Showing up to 50
          eligible customers.
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
              {audience.customers.slice(0, 50).map((c) => (
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
        </div>
        {!audience.customers.length && (
          <p className="notice">
            No eligible customer emails for this campaign yet.
          </p>
        )}
        {!campaign.allCustomers && (
          <details className="mt-4">
            <summary className="cursor-pointer">
              Already booked — excluded ({audience.excludedCount})
            </summary>
            {audience.excludedCustomers.slice(0, 50).map((c) => (
              <p key={c.id}>
                {c.firstName} {c.lastName} · {c.email}
              </p>
            ))}
          </details>
        )}
      </section>
      {!["COMPLETED", "CANCELLED"].includes(campaign.status) && (
        <section className="panel">
          <h2>Sending controls</h2>
          {(!config.ready || !config.enabled) && (
            <p className="notice">
              Sending is paused or setup is incomplete. Finish{" "}
              <a href="/admin/marketing" className="text-link">
                email settings
              </a>{" "}
              before scheduling. You can still cancel this campaign.
            </p>
          )}
          <ActionForm action={campaignAction} label="Update campaign">
            <input type="hidden" name="id" value={campaign.id} />
            <label>
              Action
              <select name="action">
                {campaign.status === "DRAFT" && (
                  <>
                    <option value="send">
                      Send now to{" "}
                      {campaign.allCustomers
                        ? "all eligible customers"
                        : "this audience"}
                    </option>
                    <option value="schedule">Schedule email campaign</option>
                  </>
                )}
                {campaign.status === "PAUSED" && (
                  <option value="resume">Resume campaign</option>
                )}
                {["SCHEDULED", "RUNNING"].includes(campaign.status) && (
                  <option value="pause">Pause remaining emails</option>
                )}
                <option value="cancel">Cancel campaign</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="confirmed" />I reviewed the email,
              audience and sending date. Sending, scheduling or resuming
              authorizes real promotional emails.
            </label>
          </ActionForm>
        </section>
      )}
      <section className="panel">
        <h2>Delivery log</h2>
        <p>
          {counts.map((c) => `${c.status}: ${c._count}`).join(" · ") ||
            "No emails queued yet."}
        </p>
        <p className="small">
          Accepted means the SMTP server accepted the email; inbox delivery is
          not confirmed. Latest 200 records shown. Uncertain deliveries require
          mailbox review and are never automatically retried.
        </p>
        <div className="table-scroll">
          <table className="platform-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Detail</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{d.email}</td>
                  <td>{d.status}</td>
                  <td>{d.attempts}</td>
                  <td>{d.detail || "—"}</td>
                  <td>
                    {["UNKNOWN", "FAILED"].includes(d.status) && (
                      <ActionForm
                        action={resolveDelivery}
                        label="Record result"
                      >
                        <input type="hidden" name="id" value={d.id} />
                        <select name="outcome" aria-label="Mailbox result">
                          {d.status === "UNKNOWN" ? (
                            <>
                              <option value="accepted">
                                Found in Sent mail
                              </option>
                              <option value="not-sent">
                                Confirmed not sent
                              </option>
                            </>
                          ) : (
                            <option value="retry">
                              Retry on next scheduled run
                            </option>
                          )}
                        </select>
                        <label className="checkbox-label">
                          <input type="checkbox" name="checked" required />I
                          checked the mailbox
                        </label>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
