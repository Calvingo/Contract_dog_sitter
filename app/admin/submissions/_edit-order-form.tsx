"use client";

import { useActionState, useState } from "react";
import { SubmissionStatus } from "@prisma/client";
import { initialFormValues, type FormValues } from "@/lib/form-config";
import { getSubmissionQuote } from "@/lib/submission-data";
import { updateSubmissionActionWithState } from "../actions";

type EditOrderFormProps = {
  submissionId: string;
  revision: number;
  defaultStatus: SubmissionStatus;
  defaultDropoffAt: string;
  defaultPickupAt: string;
  defaultQuotedTotal: string;
  defaultPrescreenNotes: string;
  pricingValues: Pick<
    FormValues,
    | "petWeightLb"
    | "petAgeYears"
    | "prescreenSpayedNeutered"
    | "prescreenHighEnergy"
    | "prescreenMedicalHistory"
    | "hasSecondDog"
    | "secondPetWeightLb"
    | "secondPetAgeYears"
    | "secondPrescreenSpayedNeutered"
    | "secondPrescreenHighEnergy"
    | "secondPrescreenMedicalHistory"
  >;
};

export function EditOrderForm({
  submissionId,
  revision,
  defaultStatus,
  defaultDropoffAt,
  defaultPickupAt,
  defaultQuotedTotal,
  defaultPrescreenNotes,
  pricingValues,
}: EditOrderFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateSubmissionActionWithState,
    null
  );
  const [dropoffAt, setDropoffAt] = useState(defaultDropoffAt);
  const [pickupAt, setPickupAt] = useState(defaultPickupAt);
  const [quotedTotal, setQuotedTotal] = useState(defaultQuotedTotal);
  const [priceError, setPriceError] = useState<string | null>(null);

  function updateSchedule(nextDropoffAt: string, nextPickupAt: string) {
    setDropoffAt(nextDropoffAt);
    setPickupAt(nextPickupAt);
    try {
      const quote = getSubmissionQuote({
        ...initialFormValues,
        ...pricingValues,
        dropoffDate: nextDropoffAt.slice(0, 10),
        dropoffTime: nextDropoffAt.slice(11),
        pickupDate: nextPickupAt.slice(0, 10),
        pickupTime: nextPickupAt.slice(11),
      });
      setQuotedTotal(quote.totalPrice.toFixed(2));
      setPriceError(null);
    } catch {
      setQuotedTotal("");
      setPriceError("Enter valid dropoff and pickup times, with pickup after dropoff, to calculate the price.");
    }
  }

  return (
    <form action={formAction} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="revision" value={revision} />
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
            value={dropoffAt}
            onChange={(event) => updateSchedule(event.target.value, pickupAt)}
            className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-stone-700">Pickup</span>
          <input
            type="datetime-local"
            name="pickupAt"
            value={pickupAt}
            onChange={(event) => updateSchedule(dropoffAt, event.target.value)}
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
            value={quotedTotal}
            onChange={(event) => setQuotedTotal(event.target.value)}
            aria-describedby="order-price-help"
            aria-invalid={Boolean(priceError)}
            className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
            required
          />
          <span
            id="order-price-help"
            role={priceError ? "alert" : undefined}
            className={`mt-2 block text-xs ${priceError ? "text-red-700" : "text-stone-500"}`}
          >
            {priceError || "Price recalculates when dropoff or pickup changes. You can also adjust it manually."}
          </span>
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
        disabled={isPending || Boolean(priceError)}
        className="mt-5 rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save order changes"}
      </button>
    </form>
  );
}
