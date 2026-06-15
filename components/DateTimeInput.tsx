import type { FormField, FormValues } from "@/lib/form-config";

type Props = {
  field: FormField;
  value: string;
  error?: string;
  emptyHint: string;
  note?: string;
  min?: string;
  max?: string;
  onChange: (name: keyof FormValues, value: string) => void;
};

export function DateTimeInput({
  field,
  value,
  error,
  emptyHint,
  note,
  min,
  max,
  onChange,
}: Props) {
  const isEmpty = !value;
  const inputType = field.type === "date" ? "date" : "time";

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-stone-700">
        {field.label}
        {field.required ? <span className="text-red-500"> *</span> : null}
      </span>
      <div className="relative">
        <input
          type={inputType}
          required={field.required}
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(field.name, event.target.value)}
          className={`w-full rounded-xl border border-orange-100 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100 ${
            isEmpty ? "dt-empty" : ""
          }`}
          aria-label={field.label}
        />
        {isEmpty ? (
          <span
            className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-stone-400"
            aria-hidden
          >
            {emptyHint}
          </span>
        ) : null}
      </div>
      {note ? <span className="text-xs leading-5 text-stone-500">{note}</span> : null}
      {error ? <span className="text-sm text-red-500">{error}</span> : null}
    </label>
  );
}
