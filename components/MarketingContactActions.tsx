"use client";

import { useActionState } from "react";
import { manageMarketingContact } from "@/app/admin/marketing/contacts/actions";

export function MarketingContactActions({ id, email, enabled, deleted, inactive }: {
  id: string; email: string; enabled: boolean; deleted: boolean; inactive: boolean;
}) {
  const [state, action, pending] = useActionState(manageMarketingContact, {});
  return (
    <form action={action} className="email-contact-actions" aria-label={`Manage ${email}`}>
      <input type="hidden" name="customerId" value={id} />
      <div className="email-action-buttons">
        {deleted ? (
          <button className="button secondary" name="action" value="restore" disabled={pending}>Restore email</button>
        ) : (
          <>
            <button className={`button ${enabled ? "secondary" : ""}`} name="action" value={enabled ? "block" : "enable"}
              disabled={pending || inactive} title={inactive ? "Restore the customer account first" : undefined}>
              {enabled ? "Block promotion" : "Enable promotion"}
            </button>
            <button className="button email-delete" name="action" value="delete" disabled={pending}>Delete email</button>
          </>
        )}
      </div>
      {pending && <p role="status" className="small">Updating email…</p>}
      {state.error && <p role="alert" className="notice error">{state.error}</p>}
      {state.message && <p role="status" className="small">{state.message}</p>}
    </form>
  );
}
