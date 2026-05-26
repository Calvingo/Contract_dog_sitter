import type { FormField, FormValues, Locale } from "@/lib/form-config";
import { getFieldLabel } from "@/lib/form-config";

type Props = {
  field: FormField;
  locale: Locale;
  value: string;
  error?: string;
  selectPlaceholder: string;
  onChange: (name: keyof FormValues, value: string) => void;
};

export function FormFieldInput({
  field,
  locale,
  value,
  error,
  selectPlaceholder,
  onChange,
}: Props) {
  const label = getFieldLabel(field, locale);
  const commonClass =
    "w-full rounded-xl border border-orange-100 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100";

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-stone-700">
        {label}
        {field.required ? <span className="text-red-500"> *</span> : null}
      </span>
      {field.type === "select" ? (
        <select
          required={field.required}
          value={value}
          onChange={(event) => onChange(field.name, event.target.value)}
          className={commonClass}
        >
          <option value="">{selectPlaceholder}</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {locale === "zh" ? option.labelZh : option.labelEn}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type}
          required={field.required}
          value={value}
          onChange={(event) => onChange(field.name, event.target.value)}
          className={commonClass}
        />
      )}
      {error ? <span className="text-sm text-red-500">{error}</span> : null}
    </label>
  );
}
