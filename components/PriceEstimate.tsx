import type { FormValues } from "@/lib/form-config";
import { calculatePrice } from "@/lib/pricing";

type Props = {
  values: FormValues;
  title: string;
  incompleteHint: string;
  holidayNote: string;
};

export function PriceEstimate({ values, title, incompleteHint, holidayNote }: Props) {
  const weight = Number(values.petWeightLb);
  const age = Number(values.petAgeYears);
  const hasPartial =
    values.petWeightLb ||
    values.petAgeYears ||
    values.dropoffDate ||
    values.dropoffTime ||
    values.pickupDate ||
    values.pickupTime;
  const hasRequiredPricingInputs =
    values.petWeightLb &&
    values.petAgeYears &&
    values.dropoffDate &&
    values.dropoffTime &&
    values.pickupDate &&
    values.pickupTime;

  if (!hasRequiredPricingInputs) {
    if (!hasPartial) return null;

    return (
      <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-3 text-sm text-stone-600">
        {incompleteHint}
      </div>
    );
  }

  const quote = calculatePrice(
    weight,
    age,
    values.dropoffDate,
    values.dropoffTime,
    values.pickupDate,
    values.pickupTime
  );

  if (!quote) {
    return (
      <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-3 text-sm text-stone-600">
        {incompleteHint}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-4">
      <h3 className="text-base font-semibold text-stone-900">{title}</h3>
      <dl className="mt-3 space-y-2 text-sm text-stone-700">
        <div className="flex justify-between gap-4">
          <dt>Weight tier</dt>
          <dd className="text-right font-medium">{quote.weightTier}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Stay duration</dt>
          <dd className="text-right font-medium">{quote.totalHours} hours</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Billable days</dt>
          <dd className="text-right font-medium">{quote.billableDays}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Boarding subtotal</dt>
          <dd className="text-right font-medium">
            ${quote.boardingSubtotal.toFixed(2)}
          </dd>
        </div>
        {quote.seniorDogFee > 0 ? (
          <div className="flex justify-between gap-4">
            <dt>
              Senior dog fee ({quote.billableDays}{" "}
              {quote.billableDays === 1 ? "day" : "days"} × $
              {quote.seniorDogFeePerDay})
            </dt>
            <dd className="text-right font-medium">
              ${quote.seniorDogFee.toFixed(2)}
            </dd>
          </div>
        ) : null}
        {quote.holidayFee > 0 ? (
          <div className="flex justify-between gap-4">
            <dt>
              Holiday fee, entire stay ({quote.holidayDays}{" "}
              {quote.holidayDays === 1 ? "day" : "days"} × $
              {quote.holidayFeePerDay})
            </dt>
            <dd className="text-right font-medium">
              ${quote.holidayFee.toFixed(2)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-t border-orange-200 pt-2 text-base">
          <dt className="font-semibold text-stone-900">Estimated total</dt>
          <dd className="font-bold text-orange-700">
            ${quote.totalPrice.toFixed(2)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-stone-500">{quote.summary}</p>
      <p className="mt-2 text-xs text-stone-500">{holidayNote}</p>
    </div>
  );
}
