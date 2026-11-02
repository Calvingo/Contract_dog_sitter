"use client";

import { useActionState, useState } from "react";
import { cancelSubmissionActionWithState } from "@/app/admin/actions";

export function CancelOrderForm({ id, revision, status }: { id: string; revision: number; status: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(cancelSubmissionActionWithState, {});
  return (
    <div className="mt-3">
      {status !== "CANCELLED" && (confirming ? (
        <form action={action} className="form-stack">
          <input type="hidden" name="submissionId" value={id} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="expectedStatus" value={status} />
          <input type="hidden" name="confirmCancellation" value="on" />
          <p className="text-sm">Cancel this order and release its reserved space? The customer will receive a cancellation email. Refunds are handled separately.</p>
          <div className="flex flex-wrap gap-2">
            <button className="button" disabled={pending}>{pending ? "Cancelling…" : "Confirm cancellation"}</button>
            <button type="button" className="button secondary" disabled={pending} onClick={() => setConfirming(false)}>Keep order</button>
          </div>
        </form>
      ) : (
        <button type="button" className="button secondary" onClick={() => setConfirming(true)}>Cancel order</button>
      ))}
      {state.error && <p role="alert" className="notice error">{state.error}</p>}
      {state.message && <p role="status" className="notice">{state.message}</p>}
    </div>
  );
}
