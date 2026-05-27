import type { FormValues } from "@/lib/form-config";
import { yesNoOptions } from "@/lib/form-config";

type Props = {
  name: keyof FormValues;
  label: string;
  value: string;
  error?: string;
  selectPlaceholder: string;
  onChange: (name: keyof FormValues, value: string) => void;
};

export function PrescreenField({
  name,
  label,
  value,
  error,
  selectPlaceholder,
  onChange,
}: Props) {
  const commonClass =
    "w-full rounded-xl border border-orange-100 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100";

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-stone-700">
        {label}
        <span className="text-red-500"> *</span>
      </span>
      <select
        required
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        className={commonClass}
      >
        <option value="">{selectPlaceholder}</option>
        {yesNoOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="text-sm text-red-500">{error}</span> : null}
    </label>
  );
}
