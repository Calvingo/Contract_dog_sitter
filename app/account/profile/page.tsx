import { CustomerShell } from "@/components/PlatformShell";
import { ActionForm } from "@/components/ActionForm";
import { requireCustomer } from "@/lib/platform/auth";
import { saveProfile } from "../actions";
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
              <input value={customer.email} disabled />
            </label>
            <label>
              Mobile number
              <input
                name="phone"
                defaultValue={customer.phone}
                required
                maxLength={40}
                autoComplete="tel"
              />
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
            Automated promotional sending is not yet enabled.
          </p>
        </ActionForm>
      </section>
    </CustomerShell>
  );
}
