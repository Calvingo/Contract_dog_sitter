import type { FormValues } from "@/lib/form-config";
import { calculatePrice, DEPOSIT_PERCENT, type PriceBreakdown } from "@/lib/pricing";

type Props = {
  values: FormValues;
  title: string;
  incompleteHint: string;
  holidayNote: string;
};

function DogQuote({ name, quote }: { name: string; quote: PriceBreakdown }) {
  return (
    <div className="rounded-lg bg-white/70 p-3">
      <h4 className="font-semibold text-stone-900">{name}</h4>
      <dl className="mt-2 space-y-1.5 text-sm text-stone-700">
        <div className="flex justify-between gap-4"><dt>Weight tier</dt><dd className="text-right font-medium">{quote.weightTier}</dd></div>
        <div className="flex justify-between gap-4"><dt>Billable days</dt><dd className="font-medium">{quote.billableDays}</dd></div>
        <div className="flex justify-between gap-4"><dt>Boarding subtotal</dt><dd className="font-medium">${quote.boardingSubtotal.toFixed(2)}</dd></div>
        {quote.puppyFee > 0 ? <div className="flex justify-between gap-4"><dt>Puppy fee</dt><dd className="font-medium">${quote.puppyFee.toFixed(2)}</dd></div> : null}
        {quote.seniorDogFee > 0 ? <div className="flex justify-between gap-4"><dt>Senior dog fee</dt><dd className="font-medium">${quote.seniorDogFee.toFixed(2)}</dd></div> : null}
        {quote.intactDogFee > 0 ? <div className="flex justify-between gap-4"><dt>Unspayed/unneutered dog fee</dt><dd className="font-medium">${quote.intactDogFee.toFixed(2)}</dd></div> : null}
        {quote.holidayFee > 0 ? <div className="flex justify-between gap-4"><dt>Holiday fee</dt><dd className="font-medium">${quote.holidayFee.toFixed(2)}</dd></div> : null}
        <div className="flex justify-between gap-4 border-t border-orange-100 pt-1.5"><dt className="font-semibold">Subtotal</dt><dd className="font-bold">${quote.totalPrice.toFixed(2)}</dd></div>
      </dl>
    </div>
  );
}

export function PriceEstimate({ values, title, incompleteHint, holidayNote }: Props) {
  const first = calculatePrice(
    Number(values.petWeightLb), Number(values.petAgeYears), values.prescreenSpayedNeutered,
    values.dropoffDate, values.dropoffTime, values.pickupDate, values.pickupTime
  );
  const second = values.hasSecondDog
    ? calculatePrice(
        Number(values.secondPetWeightLb), Number(values.secondPetAgeYears), values.secondPrescreenSpayedNeutered,
        values.dropoffDate, values.dropoffTime, values.pickupDate, values.pickupTime
      )
    : null;
  const hasPartial = Boolean(values.petWeightLb || values.petAgeYears || values.dropoffDate || values.dropoffTime || values.pickupDate || values.pickupTime);

  if (!first || (values.hasSecondDog && !second)) {
    if (!hasPartial) return null;
    return <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-3 text-sm text-stone-600">{incompleteHint}</div>;
  }

  const quotes = second ? [first, second] : [first];
  const total = quotes.reduce((sum, quote) => sum + quote.totalPrice, 0);
  const deposit = quotes.reduce((sum, quote) => sum + quote.depositAmount, 0);

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-4">
      <h3 className="text-base font-semibold text-stone-900">{title}</h3>
      <div className="mt-3 space-y-3">
        <DogQuote name={values.petName || "Dog 1"} quote={first} />
        {second ? <DogQuote name={values.secondPetName || "Dog 2"} quote={second} /> : null}
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between border-t border-orange-200 pt-3 text-base"><dt className="font-semibold">Estimated total</dt><dd className="font-bold text-orange-700">${total.toFixed(2)}</dd></div>
        <div className="flex justify-between"><dt className="font-semibold">Deposit ({DEPOSIT_PERCENT}% of total)</dt><dd className="font-bold text-orange-700">${deposit.toFixed(2)}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-stone-500">Each dog is priced independently. {holidayNote}</p>
    </div>
  );
}
