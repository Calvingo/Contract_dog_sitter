import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { marketingContacts } from "@/lib/marketing/contacts";
import { MarketingContactActions } from "@/components/MarketingContactActions";
import { AdminShell } from "../../admin-ui";

export default async function MarketingContactsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const admin = await requirePlatformAdmin();
  const filters = await searchParams;
  const contacts = await marketingContacts();
  const current = contacts.filter((contact) => !contact.marketingEmailDeletedAt);
  const enabled = current.filter((contact) => contact.status === "Promotion on").length;
  const deleted = contacts.length - current.length;
  const status = ["enabled", "blocked", "deleted"].includes(filters.status || "") ? filters.status : "all";
  const query = (filters.q || "").trim().toLowerCase().slice(0, 100);
  const visible = contacts.filter((contact) => {
    if (status === "deleted" ? !contact.marketingEmailDeletedAt : contact.marketingEmailDeletedAt) return false;
    if (status === "enabled" && contact.status !== "Promotion on") return false;
    if (status === "blocked" && contact.status === "Promotion on") return false;
    return `${contact.firstName} ${contact.lastName} ${contact.email}`.toLowerCase().includes(query);
  });
  return (
    <AdminShell email={admin.email} title="Customer emails" subtitle="Find every saved customer email and manage promotions in one place.">
      <div className="email-summary">
        <div><span>Total emails</span><strong>{current.length}</strong></div>
        <div><span>Promotion on</span><strong>{enabled}</strong></div>
        <div><span>Promotion off</span><strong>{current.length - enabled}</strong></div>
        <Link href="/admin/marketing/contacts?status=deleted"><span>Deleted emails</span><strong>{deleted} →</strong></Link>
      </div>
      <section className="panel">
        <form className="filter-form" key={`${status}:${filters.q || ""}`}>
          <label>Search customer emails<input type="search" name="q" defaultValue={filters.q} placeholder="Customer name or email" maxLength={100} /></label>
          <label>Promotion status<select name="status" defaultValue={status}>
            <option value="all">All emails</option>
            <option value="enabled">Promotion on</option>
            <option value="blocked">Promotion off</option>
            <option value="deleted">Deleted emails</option>
          </select></label>
          <button className="button">Search</button>
          <Link className="button secondary" href="/admin/marketing/contacts">Reset</Link>
          <Link className="button secondary" href="/admin/marketing">Create an email →</Link>
        </form>
        <p className="small mt-4">Deleting removes an address from the marketing list and stops promotions. Customer accounts and booking history are kept. Deleted emails can be restored.</p>
      </section>
      <section className="panel">
        <p className="customer-count" role="status"><strong>{visible.length}</strong> {status === "deleted" ? "deleted emails" : `emails shown · ${current.length} total emails`}</p>
        <div className="table-scroll">
          <table className="platform-table email-contacts-table">
            <thead><tr><th scope="col">No.</th><th scope="col">Customer</th><th scope="col">Email</th><th scope="col">Promotion</th><th scope="col">Actions</th></tr></thead>
            <tbody>{visible.map((contact, index) => (
              <tr key={contact.id}>
                <td>{index + 1}</td>
                <td><strong>{`${contact.firstName} ${contact.lastName}`.trim() || "New customer"}</strong></td>
                <td><a href={`mailto:${contact.email}`}>{contact.email}</a></td>
                <td>
                  <span className={`promotion-status ${contact.status === "Promotion on" ? "on" : "off"}`}>{contact.status}</span>
                  {contact.reason && <span className="small mt-2">{contact.reason}</span>}
                </td>
                <td><MarketingContactActions id={contact.id} email={contact.email} enabled={contact.status === "Promotion on"} deleted={Boolean(contact.marketingEmailDeletedAt)} inactive={Boolean(contact.deactivatedAt)} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!visible.length && <p className="notice">No customer emails match these filters.</p>}
      </section>
    </AdminShell>
  );
}
