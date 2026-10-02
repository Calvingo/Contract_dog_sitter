import { requirePlatformAdmin } from "@/lib/platform/auth";
import { getSettings } from "@/lib/platform/capacity";
import { ActionForm } from "@/components/ActionForm";
import { AdminShell } from "../admin-ui";
import { saveSettings } from "../platform-actions";
export default async function SettingsPage() {
  const admin = await requirePlatformAdmin();
  const settings = await getSettings();
  return (
    <AdminShell
      email={admin.email}
      title="Platform settings"
      subtitle="Capacity rules, reservation holds, and customer-facing payment details."
    >
      <section className="panel content-narrow">
        <ActionForm action={saveSettings}>
          <h2>Booking rules</h2>
          <div className="field-grid">
            <label>
              Default daily capacity
              <input
                type="number"
                name="defaultCapacity"
                min="0"
                max="100"
                required
                defaultValue={settings.defaultCapacity}
              />
            </label>
            <label>
              Hold duration (hours)
              <input
                type="number"
                name="holdHours"
                min="1"
                max="168"
                required
                defaultValue={settings.holdHours}
              />
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              name="includePickupDay"
              defaultChecked={settings.includePickupDay}
            />
            <span>
              Count both arrival and pick-up dates toward capacity. When
              disabled, count nights (same-day stays still occupy one day).
            </span>
          </label>
          <p className="small">
            New requests hold space for this duration. Approval starts a fresh
            payment window. Verified deposits keep the reservation. Existing
            bookings without a hold deadline remain reserved for compatibility.
          </p>
          <h2>Payment instructions</h2>
          <p className="small">
            Customers pay the existing 20% deposit after approval. Venmo uses
            the same recipient name and contact as Zelle unless a separate
            Venmo username and name are provided below. Leave all payment
            details empty to disable both methods.
          </p>
          <div className="field-grid">
            <label>
              Zelle enrolled email or phone
              <input
                name="zelleRecipient"
                defaultValue={settings.zelleRecipient}
                maxLength={150}
              />
            </label>
            <label>
              Zelle recipient display name
              <input
                name="zelleName"
                defaultValue={settings.zelleName}
                maxLength={150}
              />
            </label>
            <label>
              Venmo username
              <input
                name="venmoUsername"
                defaultValue={settings.venmoUsername}
                maxLength={30}
                placeholder="@your-business"
              />
            </label>
            <label>
              Venmo recipient display name
              <input
                name="venmoName"
                defaultValue={settings.venmoName}
                maxLength={150}
              />
            </label>
          </div>
          <p className="notice">
            Transfer details are shown only to the signed-in owner of an
            approved booking. Reporting payment does not automatically verify
            it.
          </p>
        </ActionForm>
      </section>
    </AdminShell>
  );
}
