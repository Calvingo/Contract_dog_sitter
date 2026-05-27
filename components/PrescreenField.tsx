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
    <div className="space-y-2 border-b border-orange-100 pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <p className="flex-1 text-sm font-medium leading-snug text-stone-700">
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
                    ? "border-orange-500 bg-orange-600 text-white shadow-sm"
                    : "border-orange-200 bg-white text-stone-700 hover:border-orange-300 hover:bg-orange-50"
                }`}
                aria-pressed={selected}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
