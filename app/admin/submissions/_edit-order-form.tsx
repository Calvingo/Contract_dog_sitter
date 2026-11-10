"use client";

import { useActionState, useState } from "react";
import { SubmissionStatus } from "@prisma/client";
import { initialFormValues, type FormValues } from "@/lib/form-config";
import {
  getPickupDropoffTimeOptions,
  isPickupDropoffTimeAllowed,
} from "@/lib/booking-time";
import { getSubmissionQuote, type DogPricingTerms, type ManualOrderPrice } from "@/lib/submission-data";
import { updateSubmissionActionWithState } from "../actions";

type Schedule = Pick<
  FormValues,
  "dropoffDate" | "dropoffTime" | "pickupDate" | "pickupTime"
>;

type EditOrderFormProps = {
  submissionId: string;
  revision: number;
  defaultStatus: SubmissionStatus;
  defaultDropoffAt: string;
  defaultPickupAt: string;
  defaultPrescreenNotes: string;
  dogTerms: DogPricingTerms[];
  dogNames: string[];
  manualPrice?: ManualOrderPrice;
  pricingValues: Pick<
    FormValues,
    | "savedPetId"
    | "savedSecondPetId"
    | "useReward"
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
  defaultPrescreenNotes,
  pricingValues, dogTerms, dogNames, manualPrice,
}: EditOrderFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateSubmissionActionWithState,
    null
  );
  const [schedule, setSchedule] = useState<Schedule>({
    dropoffDate: defaultDropoffAt.slice(0, 10),
    dropoffTime: defaultDropoffAt.slice(11, 16),
    pickupDate: defaultPickupAt.slice(0, 10),
    pickupTime: defaultPickupAt.slice(11, 16),
  });
  const [terms, setTerms] = useState(dogTerms);
  const [priceMode, setPriceMode] = useState("keep");
  const [manualTotal, setManualTotal] = useState("");
  let quotedTotal = "";
  let calculatedTotal = "";
  let hasManualPrice = false;
  let priceError: string | null = null;
  try {
    if (!isPickupDropoffTimeAllowed(schedule.dropoffTime, schedule.dropoffDate) ||
        !isPickupDropoffTimeAllowed(schedule.pickupTime, schedule.pickupDate)) {
      throw new Error("Invalid dropoff or pickup time.");
    }
    const quote = getSubmissionQuote({ ...initialFormValues, ...pricingValues, ...schedule }, terms, priceMode === "keep" ? manualPrice : undefined);
    quotedTotal = quote.totalPrice.toFixed(2);
    calculatedTotal = quote.dogs.reduce((sum, dog) => sum + dog.totalPrice, 0).toFixed(2);
    hasManualPrice = Boolean(quote.manualPrice);
  } catch {
    priceError = "Enter valid dropoff and pickup times, with pickup after dropoff, to calculate the price.";
  }

  function updateSchedule(name: keyof Schedule, value: string) {
    const next = { ...schedule, [name]: value };
    if (name === "dropoffDate" && !isPickupDropoffTimeAllowed(next.dropoffTime, next.dropoffDate)) {
      next.dropoffTime = "";
    }
    if (name === "pickupDate" && !isPickupDropoffTimeAllowed(next.pickupTime, next.pickupDate)) {
      next.pickupTime = "";
    }
    setSchedule(next);
  }

  return (
    <form action={formAction} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="expectedStatus" value={defaultStatus} />
      <input type="hidden" name="dropoffAt" value={`${schedule.dropoffDate}T${schedule.dropoffTime}`} />
      <input type="hidden" name="pickupAt" value={`${schedule.pickupDate}T${schedule.pickupTime}`} />
      <h2 className="text-xl font-bold text-stone-950">Edit Order</h2>
      <div className="mt-4 grid gap-4">
        <label className="block">
          <span className="text-sm font-medium text-stone-700">Status</span>
          <select
            name="status"
            defaultValue={defaultStatus}
            className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
          >
            {(Object.values(SubmissionStatus) as SubmissionStatus[]).filter(status => status !== "CANCELLED").map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        {(["dropoff", "pickup"] as const).map((kind) => {
          const label = kind === "dropoff" ? "Dropoff" : "Pickup";
          const dateName = `${kind}Date` as const;
          const timeName = `${kind}Time` as const;
          const time = schedule[timeName];
          const timeOptions = getPickupDropoffTimeOptions(schedule[dateName]);
          return (
            <div key={kind} className="grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="text-sm font-medium text-stone-700">{label} date</span>
                <input
                  type="date"
                  name={dateName}
                  value={schedule[dateName]}
                  onChange={(event) => updateSchedule(dateName, event.target.value)}
                  className="mt-2 w-full min-w-0 rounded-xl border border-stone-200 px-3 py-3"
                  required
                />
              </label>
              <label className="block min-w-0">
                <span className="text-sm font-medium text-stone-700">{label} time</span>
                <select
                  name={timeName}
                  value={time}
                  onChange={(event) => updateSchedule(timeName, event.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-3"
                  required
                >
                  <option value="">Choose a time</option>
                  {time && !timeOptions.some((option) => option.value === time) ? (
                    <option value={time}>{time} (current)</option>
                  ) : null}
                  {timeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
        {terms.length > 1 && terms.map((term, index) => (
          <fieldset key={term.petId} className="grid gap-3 sm:grid-cols-2">
            <legend>{dogNames[index]} · shorter stay (optional)</legend>
            {(["lateDropoff", "earlyPickup"] as const).map(kind => (
              <label key={kind}>{kind === "lateDropoff" ? "Late drop-off" : "Early pickup"}
                <input className="mt-2 w-full rounded-xl border p-2" type="datetime-local" name={`${kind}${index + 1}`}
                  value={term[`${kind}At`] || ""} min={`${schedule.dropoffDate}T${schedule.dropoffTime}`}
                  max={`${schedule.pickupDate}T${schedule.pickupTime}`}
                  onChange={event => setTerms(terms.map((item, i) => i === index ? { ...item, [`${kind}At`]: event.target.value } : item))} />
              </label>
            ))}
          </fieldset>
        ))}
        <p className="text-xs text-stone-500">
          Times are in California local time. Available 8:30 AM–9:00 PM; Sundays 3:00–6:00 PM unavailable.
        </p>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-stone-700">Order price (USD)</legend>
          <select aria-label="Order pricing" name="priceMode" value={priceMode}
            className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
            onChange={event => {
              if (event.target.value === "manual") setManualTotal(quotedTotal);
              setPriceMode(event.target.value);
            }}>
            <option value="keep">{hasManualPrice || manualPrice ? "Use current order pricing" : "Use calculated price"}</option>
            <option value="manual">Set final price manually</option>
            {manualPrice && <option value="automatic">Restore calculated price</option>}
          </select>
          <input
            type="number"
            aria-label="Final order price in dollars"
            name={priceMode === "manual" ? "manualTotal" : undefined}
            min="0"
            max="99999999.99"
            step="0.01"
            value={priceMode === "manual" ? manualTotal : quotedTotal}
            onChange={event => setManualTotal(event.target.value)}
            readOnly={priceMode !== "manual"}
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
            {priceError || (priceMode === "manual" || hasManualPrice
              ? `Calculated price: $${calculatedTotal}. The manual total applies only to this stay. Changing the stay or its charges recalculates the price. Recorded payments are unchanged.`
              : "Calculated from this stay and its dogs. Choose “Set final price manually” to enter a different total.")}
          </span>
        </fieldset>
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
