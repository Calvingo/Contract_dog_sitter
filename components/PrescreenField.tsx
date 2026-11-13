import type { FormValues } from "@/lib/form-config";
import { yesNoOptions } from "@/lib/form-config";

type Props = {
  name: keyof FormValues;
  label: string;
  value: string;
  error?: string;
  onChange: (name: keyof FormValues, value: string) => void;
};

export function PrescreenField({ name, label, value, error, onChange }: Props) {
  return (
    <div id={`booking-field-${name}`} role="group" aria-labelledby={`booking-label-${name}`}
      aria-describedby={error ? `booking-error-${name}` : undefined}
      className={`space-y-2 border-b border-emerald-100 pb-4 last:border-b-0 last:pb-0 ${error ? "rounded-lg bg-red-50 p-3 ring-1 ring-red-300" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <p id={`booking-label-${name}`} className="flex-1 whitespace-pre-line text-sm font-medium leading-snug text-stone-700">
          {label}
          <span className="text-red-500"> *</span>
        </p>
        <div className="flex shrink-0 gap-2">
          {yesNoOptions.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(name, option.value)}
                className={`min-w-[4.5rem] rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                  selected
                    ? "border-emerald-500 bg-emerald-600 text-white shadow-sm"
                    : "border-emerald-200 bg-white text-stone-700 hover:border-emerald-300 hover:bg-emerald-50"
                }`}
                aria-pressed={selected}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      {error ? <p id={`booking-error-${name}`} className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
