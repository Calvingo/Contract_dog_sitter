import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import {
  customerAudience,
  type CustomerFilters,
} from "@/lib/platform/customers";
import { AdminShell } from "../admin-ui";
import { CustomerAccountStatus } from "@/components/CustomerAccountStatus";
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomerFilters>;
}) {
  const admin = await requirePlatformAdmin();
  const filters = await searchParams;
  let result;
  let error = "";
  try {
    result = await customerAudience(filters);
  } catch {
    error =
      "Could not load customers. Check the date range and select All customers or Email subscribers.";
  }
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => Boolean(value)) as [
      string,
      string,
    ][],
  ).toString();
  return (
    <AdminShell
      email={admin.email}
      title="Customers"
      subtitle="One customer per row, with all their dogs and marketing preferences."
    >
      <section className="panel">
        <form className="filter-form">
          <label>
            Search customers or dogs
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Name, email, phone, dog"
            />
          </label>
          <label>
            Audience
            <select name="channel" defaultValue={filters.channel || "all"}>
              <option value="all">All customers</option>
              <option value="email">Email subscribers</option>
            </select>
          </label>
          <button className="button">Filter</button>
          <Link href="/admin/customers" className="button secondary">
            Reset
          </Link>
          {result && (
            <a
              className="button secondary"
              href={`/api/admin/customers/export?${query}`}
            >
              Export Excel ↓
            </a>
          )}
        </form>
        {error && <p className="notice error">{error}</p>}
      </section>
      <section className="panel table-scroll">
        <p className="small">
          {result?.customers.length ?? 0} customers · Promotion exports respect
          the selected subscription filter.
        </p>
        <p className="small">All customers includes deactivated accounts. Restoring an account restores sign-in access without resubscribing it to promotions.</p>
        <table className="platform-table">
          <thead>
            <tr>
              {[
                "Customer",
                "Dogs",
                "Email",
                "Phone",
                "Marketing",
                "Account status",
                "Recent booking",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result?.customers.map((c) => {
              const last = [...c.submissions].sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
              )[0];
              return (
                <tr key={c.id}>
                  <td>
                    <strong>
                      {`${c.firstName} ${c.lastName}`.trim() || "New customer"}
                    </strong>
                  </td>
                  <td>{c.pets.map((p) => `${p.name}${p.archivedAt ? " (removed)" : ""}`).join(", ") || "—"}</td>
                  <td>
                    <a href={`mailto:${c.email}`}>{c.email}</a>
                  </td>
                  <td>{c.phone || "—"}</td>
                  <td>
                    <span className="small">
                      Email: {c.emailMarketingOptIn ? "Subscribed" : "Off"}
                    </span>
                  </td>
                  <td><CustomerAccountStatus id={c.id} deactivated={Boolean(c.deactivatedAt)} /></td>
                  <td>
                    {last ? (
                      <Link href={`/admin/submissions/${last.id}`}>
                        View booking →
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {result?.customers.length === 0 && (
          <p className="notice">No customers match these filters.</p>
        )}
      </section>
    </AdminShell>
  );
}
