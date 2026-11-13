import { DateTimeInput } from "@/components/DateTimeInput";
import { PetAgeInput } from "@/components/PetAgeInput";
import {
  EARLIEST_PICKUP_DROPOFF_TIME,
  LATEST_PICKUP_DROPOFF_TIME,
} from "@/lib/booking-time";
import type { FormField, FormValues } from "@/lib/form-config";
import { ui } from "@/lib/i18n";

type Props = {
  field: FormField;
  value: string;
  error?: string;
  readOnly?: boolean;
  selectPlaceholder: string;
  onChange: (name: keyof FormValues, value: string) => void;
};

export function FormFieldInput({
  field,
  value,
  error,
  readOnly,
  selectPlaceholder,
  onChange,
}: Props) {
  const commonClass =
    `w-full rounded-xl border bg-white px-4 py-3 text-stone-800 outline-none transition focus:ring-2 ${error ? "border-red-500 focus:border-red-500 focus:ring-red-100" : "border-emerald-100 focus:border-emerald-300 focus:ring-emerald-100"}`;
  const errorId = `booking-error-${field.name}`;
  if (field.name === "petAgeYears" || field.name === "secondPetAgeYears") {
    return (
      <PetAgeInput
        name={field.name}
        validationId={`booking-field-${field.name}`}
        value={value}
        onChange={(ageYears) => onChange(field.name, ageYears)}
        required={field.required}
        readOnly={readOnly}
        error={error}
        inputClassName={commonClass}
      />
    );
  }

  if (field.type === "date" || field.type === "time") {
    return (
      <DateTimeInput
        field={field}
        value={value}
        error={error}
        emptyHint={
          field.type === "date" ? ui.dateFieldEmpty : ui.timeFieldEmpty
        }
        min={field.type === "time" ? EARLIEST_PICKUP_DROPOFF_TIME : undefined}
        max={field.type === "time" ? LATEST_PICKUP_DROPOFF_TIME : undefined}
        note={field.type === "time" ? ui.pickupDropoffTimeNote : undefined}
        onChange={onChange}
      />
    );
  }

  return (
    <label id={`booking-field-${field.name}`} className="block space-y-2">
      <span className="text-sm font-medium text-stone-700">
        {field.label}
        {field.required ? <span className="text-red-500"> *</span> : null}
      </span>
      {field.type === "select" ? (
        <select
          name={field.name}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
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
          name={field.name}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          readOnly={readOnly}
          type={field.type === "number" ? "number" : field.type}
          min={field.type === "number" ? 0 : undefined}
          step={field.type === "number" ? "any" : undefined}
          required={field.required}
          value={value}
          onChange={(event) => onChange(field.name, event.target.value)}
          className={commonClass}
        />
      )}
      {error ? <span id={errorId} className="text-sm text-red-600">{error}</span> : null}
    </label>
  );
}
