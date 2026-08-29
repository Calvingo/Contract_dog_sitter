"use client";

import { useActionState } from "react";
import { SubmissionStatus } from "@prisma/client";
import { updateSubmissionActionWithState } from "../actions";

type EditOrderFormProps = {
  submissionId: string;
  defaultStatus: SubmissionStatus;
  defaultDropoffAt: string;
  defaultPickupAt: string;
  defaultQuotedTotal: string;
  defaultPrescreenNotes: string;
};

export function EditOrderForm({
  submissionId,
  defaultStatus,
  defaultDropoffAt,
  defaultPickupAt,
  defaultQuotedTotal,
  defaultPrescreenNotes,
}: EditOrderFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateSubmissionActionWithState,
    null
  );

  return (
    <form action={formAction} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
      <input type="hidden" name="submissionId" value={submissionId} />
      <h2 className="text-xl font-bold text-stone-950">Edit Order</h2>
      <div className="mt-4 grid gap-4">
        <label className="block">
          <span className="text-sm font-medium text-stone-700">Status</span>
          <select
            name="status"
            defaultValue={defaultStatus}
            className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
          >
            {(Object.values(SubmissionStatus) as SubmissionStatus[]).map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-stone-700">Dropoff</span>
          <input
            type="datetime-local"
            name="dropoffAt"
            defaultValue={defaultDropoffAt}
            className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-stone-700">Pickup</span>
          <input
            type="datetime-local"
            name="pickupAt"
            defaultValue={defaultPickupAt}
            className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-stone-700">Quoted total</span>
          <input
            type="number"
            name="quotedTotal"
            min="0"
            step="0.01"
            defaultValue={defaultQuotedTotal}
            className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-stone-700">Prescreen notes</span>
          <textarea
            name="prescreenNotes"
            defaultValue={defaultPrescreenNotes}
            rows={5}
            className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
          />
        </label>
      </div>

      {state?.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.message || "Order updated successfully."}
        </p>
      ) : null}

      <button
        disabled={isPending}
        className="mt-5 rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save order changes"}
      </button>
    </form>
  );
}
