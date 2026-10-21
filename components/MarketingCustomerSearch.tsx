"use client";

import { useState } from "react";
import { MarketingContactActions } from "@/components/MarketingContactActions";

type SearchContact = {
  id: string;
  name: string;
  email: string;
  status: string;
  deleted: boolean;
  inactive: boolean;
};

export function MarketingCustomerSearch({ contacts }: { contacts: SearchContact[] }) {
  const [query, setQuery] = useState("");
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = words.length ? contacts.filter((contact) => {
    const text = `${contact.name} ${contact.email}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }) : [];

  return (
    <div className="marketing-customer-search">
      <div className="filter-form">
        <label>
          Search customers
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Customer name or email"
            maxLength={254}
            autoComplete="off"
            aria-controls="marketing-customer-results"
          />
        </label>
        {query && <button type="button" className="button secondary" onClick={() => setQuery("")}>Clear search</button>}
      </div>
      <div id="marketing-customer-results">
        <p className="small mt-3" role="status">
          {words.length
            ? matches.length
              ? `${matches.length} customer${matches.length === 1 ? "" : "s"} found. Manage their email below.`
              : "No customers found. Try another name or email."
            : "Type a name or email to search all customers instantly, including deleted email entries."}
        </p>
        {matches.length > 0 && (
          <div className="table-scroll mt-4">
            <table className="platform-table email-contacts-table">
              <thead><tr><th scope="col">No.</th><th scope="col">Customer</th><th scope="col">Email</th><th scope="col">Promotion</th><th scope="col">Actions</th></tr></thead>
              <tbody>{matches.map((contact, index) => (
                <tr key={contact.id}>
                  <td>{index + 1}</td>
                  <td><strong>{contact.name || "New customer"}</strong></td>
                  <td><a href={`mailto:${contact.email}`}>{contact.email}</a></td>
                  <td><span className={`promotion-status ${contact.status === "Promotion on" ? "on" : "off"}`}>{contact.status}</span></td>
                  <td><MarketingContactActions id={contact.id} email={contact.email} enabled={contact.status === "Promotion on"} deleted={contact.deleted} inactive={contact.inactive} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
