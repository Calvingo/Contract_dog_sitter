import { DateTimeInput } from "@/components/DateTimeInput";
import type { FormField, FormValues } from "@/lib/form-config";
import { ui } from "@/lib/i18n";

type Props = {
  field: FormField;
  value: string;
  error?: string;
  selectPlaceholder: string;
  onChange: (name: keyof FormValues, value: string) => void;
};

export function FormFieldInput({
  field,
  value,
  error,
  selectPlaceholder,
  onChange,
}: Props) {
  const commonClass =
    "w-full rounded-xl border border-orange-100 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100";

  if (field.type === "date" || field.type === "time") {
    return (
      <DateTimeInput
        field={field}
        value={value}
        error={error}
        emptyHint={
          field.type === "date" ? ui.dateFieldEmpty : ui.timeFieldEmpty
        }
        onChange={onChange}
      />
    );
  }

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-stone-700">
        {field.label}
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
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "number" ? "number" : field.type}
          min={field.type === "number" ? 1 : undefined}
          step={field.type === "number" ? 1 : undefined}
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
