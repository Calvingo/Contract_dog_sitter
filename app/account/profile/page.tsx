import { CustomerShell } from "@/components/PlatformShell";
import { ActionForm } from "@/components/ActionForm";
import { requireCustomer } from "@/lib/platform/auth";
import { backupContactOptions } from "@/lib/form-config";
import { deactivateAccount, saveProfile } from "../actions";
export default async function ProfilePage() {
  const customer = await requireCustomer();
  return (
    <CustomerShell
      name={customer.firstName}
      title="Your details, your preferences."
      subtitle="Keep your contact details up to date and choose how you hear from us."
    >
      <section className="panel content-narrow">
        <ActionForm action={saveProfile}>
          <h2>Contact information</h2>
          <div className="field-grid">
            <label>
              First name
              <input
                name="firstName"
                defaultValue={customer.firstName}
                required
                maxLength={100}
                autoComplete="given-name"
              />
            </label>
            <label>
              Last name
              <input
                name="lastName"
                defaultValue={customer.lastName}
                required
                maxLength={100}
                autoComplete="family-name"
              />
            </label>
            <label>
              Email
              <input type="email" value={customer.email} disabled />
              <span className="small">Your verified sign-in email.</span>
            </label>
            <label>
              Mobile number
              <input
                name="phone"
                type="tel"
                defaultValue={customer.phone}
                required
                maxLength={40}
                autoComplete="tel"
              />
            </label>
            <label>
              Preferred backup contact method
              <select name="backupContact" defaultValue={customer.backupContact} required>
                <option value="">Choose a contact method</option>
                {backupContactOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              WeChat ID
              <input name="wechatId" defaultValue={customer.wechatId ?? ""} maxLength={100} />
              <span className="small">Required if WeChat is your backup contact method.</span>
            </label>
            <label>
              Emergency contact name
              <input
                name="emergencyContactName"
                defaultValue={customer.emergencyContactName ?? ""}
                maxLength={100}
              />
            </label>
            <label>
              Emergency contact phone
              <input
                name="emergencyContactPhone"
                type="tel"
                defaultValue={customer.emergencyContactPhone ?? ""}
                maxLength={40}
              />
            </label>
          </div>
          <h2>Stay in the loop</h2>
          <p className="small">
            Optional holiday reminders and early-booking promotions by email.
            Your choice does not affect your booking.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              name="emailOptIn"
              defaultChecked={customer.emailMarketingOptIn}
            />
            <span>I’d like email promotions from Silicon Paws Retreat.</span>
          </label>
          <p className="small">
            You can unsubscribe from promotional emails here at any time.
          </p>
        </ActionForm>
      </section>
      <section className="panel content-narrow">
        <h2>Deactivate your account</h2>
        <p>
          Deactivation signs you out and stops account access and promotional emails.
          Your contact details, dog profiles and booking history are retained.
          Contact us if you want to restore your account.
        </p>
        <p className="notice error">
          <strong>Existing bookings are not canceled.</strong> Request cancellation
          from your booking page or contact us separately.
        </p>
        <ActionForm action={deactivateAccount} label="Deactivate my account">
          <label className="check-label">
            <input type="checkbox" name="confirmDeactivation" required />
            <span>I understand my data will be retained and my existing bookings will remain in place.</span>
          </label>
        </ActionForm>
      </section>
    </CustomerShell>
  );
}
