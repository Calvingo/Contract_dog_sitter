import Link from "next/link";
import { prisma } from "@/lib/db";
import { getMarketingConfig } from "@/lib/marketing/config";
import { customerAudience } from "@/lib/platform/customers";
import { ActionForm } from "@/components/ActionForm";
import {
  saveCampaign,
  suppressEmail,
  saveMarketingSettings,
  saveHolidayRule,
} from "./actions";
import { CampaignFields } from "./fields";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { AdminShell } from "../admin-ui";

export default async function MarketingPage() {
  const admin = await requirePlatformAdmin();
  const [config, audience, campaigns, rules] = await Promise.all([
    getMarketingConfig(),
    customerAudience({ channel: "saved" }),
    prisma.marketingCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { deliveries: true } } },
    }),
    prisma.marketingRule.findMany({ where: { enabled: true } }),
  ]);
  return (
    <AdminShell
      email={admin.email}
      title="Email marketing"
      subtitle="Edit your message, add a photo, and send to your customers."
    >
      <section className="panel">
        <h2>Create an email</h2>
        <p>
          <strong>{audience.customers.length} customer emails</strong> · All
          saved customers are included automatically, except unsubscribed or
          blocked addresses.
        </p>
        <ActionForm action={saveCampaign} label="Save & preview email">
          <CampaignFields />
        </ActionForm>
      </section>
      <section className="panel">
        <h2>Your emails</h2>
        {!campaigns.length ? (
          <p>No emails yet. Save your first draft above.</p>
        ) : (
          <div className="table-scroll">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Send date</th>
                  <th>Audience</th>
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
                      {c.allCustomers
                        ? "All customers"
                        : "Legacy filtered audience"}
                    </td>
                    <td>{c.status}</td>
                    <td>{c._count.deliveries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <details open={!config.ready || !config.enabled}>
          <summary className="cursor-pointer font-semibold">
            Email settings ·{" "}
            {config.ready && config.enabled
              ? "Sending enabled"
              : "Sending disabled"}
          </summary>
          <p>From: {config.from || "Not configured"}</p>
          {config.missing.length > 0 && (
            <p className="notice error">
              Missing configuration: {config.missing.join(", ")}
            </p>
          )}
          <ActionForm
            action={saveMarketingSettings}
            label="Save email settings"
          >
            <label>
              Business mailing address
              <textarea
                name="postalAddress"
                defaultValue={config.address}
                required
                maxLength={500}
                rows={2}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={config.enabled}
                disabled={!config.ready || config.environmentPaused}
              />
              Enable campaign delivery
            </label>
            <p className="small">
              Only emails you choose to send or schedule will be delivered. Each
              run sends up to 40 emails; the daily queue continues any remaining
              deliveries.
            </p>
            {config.environmentPaused && (
              <p className="notice">
                Sending is paused in deployment settings
                (MARKETING_ENABLED=false).
              </p>
            )}
          </ActionForm>
        </details>
      </section>
      {rules.length > 0 && (
        <section className="panel">
          <details>
            <summary className="cursor-pointer font-semibold">
              Existing automatic holiday emails ({rules.length})
            </summary>
            <p>
              These previously enabled rules are still active. Turn them off
              here if you prefer to send emails manually.
            </p>
            {rules.map((rule) => (
              <ActionForm
                key={rule.holiday}
                action={saveHolidayRule}
                label={`Turn off ${rule.holiday} automation`}
              >
                <input type="hidden" name="holiday" value={rule.holiday} />
                <input type="hidden" name="subject" value={rule.subject} />
                <input type="hidden" name="body" value={rule.body} />
              </ActionForm>
            ))}
          </details>
        </section>
      )}
      <section className="panel">
        <details>
          <summary className="cursor-pointer font-semibold">
            Exclude an email address
          </summary>
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
                placeholder="Bounced address / customer request"
              />
            </label>
          </ActionForm>
        </details>
      </section>
    </AdminShell>
  );
}
