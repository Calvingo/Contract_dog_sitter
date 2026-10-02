import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { customerAudience } from "@/lib/platform/customers";
import { AdminShell, Stat } from "@/app/admin/admin-ui";
import { ActionForm } from "@/components/ActionForm";
import { campaignAction, saveCampaign, resolveDelivery } from "../../actions";
import { CampaignFields } from "../../fields";
import { emailContent } from "@/lib/marketing/templates";
import { marketingConfig } from "@/lib/marketing/config";
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
  const [audience, counts, deliveries] = await Promise.all([
    customerAudience({
      channel: "email",
      start: campaign.excludeStart,
      end: campaign.excludeEnd,
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
  ]);
  const config = marketingConfig();
  const preview = emailContent(
    campaign.body,
    `${config.baseUrl || ""}/book`,
    "#unsubscribe-preview",
    config.address || "Your business mailing address",
  );
  return (
    <AdminShell
      email={admin.email}
      title={campaign.name}
      subtitle={`${campaign.status} · Send on ${campaign.scheduledAt.toISOString().slice(0, 10)} · Exclude stays ${campaign.excludeStart} – ${campaign.excludeEnd}`}
    >
      <a href="/admin/marketing">← All campaigns</a>
      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Eligible now" value={String(audience.customers.length)} />
        <Stat
          label="Already booked — excluded"
          value={String(audience.excludedCount)}
        />
        <Stat label="Current status" value={campaign.status} />
      </section>
      <div className="notice">
        Only subscribed customers are included. Reservations, opt-outs and
        suppressed addresses are checked again before each email. The daily
        queue runs around 9–10 AM Pacific; larger audiences can continue on
        following days.
      </div>
      {campaign.status === "DRAFT" && (
        <section className="panel">
          <h2>Edit draft</h2>
          <ActionForm action={saveCampaign} label="Save draft">
            <input type="hidden" name="id" value={campaign.id} />
            <CampaignFields campaign={campaign} />
          </ActionForm>
        </section>
      )}
      <section className="panel">
        <h2>Email preview</h2>
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
      {!["COMPLETED", "CANCELLED"].includes(campaign.status) && (
        <section className="panel">
          <h2>Sending controls</h2>
          <ActionForm action={campaignAction} label="Update campaign">
            <input type="hidden" name="id" value={campaign.id} />
            <label>
              Action
              <select name="action">
                {campaign.status === "DRAFT" && (
                  <option value="schedule">Schedule email campaign</option>
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
              audience and sending date. Scheduling or resuming authorizes real
              promotional emails.
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
