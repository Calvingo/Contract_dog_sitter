"use client";

import { useActionState } from "react";
import { restoreAccount } from "@/app/admin/customers/actions";

export function CustomerAccountStatus({ id, deactivated }: { id: string; deactivated: boolean }) {
  const [state, action, pending] = useActionState(restoreAccount, {});
  return (
    <div className="form-stack">
      <span className="small">{deactivated ? "Deactivated" : "Active"}</span>
      {deactivated && (
        <form action={action}>
          <input type="hidden" name="customerId" value={id} />
          <button className="button secondary" disabled={pending}>
            {pending ? "Restoring…" : "Restore account"}
          </button>
        </form>
      )}
      {state.error && <p role="alert" className="notice error">{state.error}</p>}
      {state.message && <p role="status" className="notice">{state.message}</p>}
    </div>
  );
}
