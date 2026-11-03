"use client";

import { useId, useState } from "react";
import { petAgeInputFromYears, petAgeInYears, type PetAgeUnit } from "@/lib/pet-age";

type Props = {
  name: string;
  value: string;
  onChange: (ageYears: string) => void;
  required?: boolean;
  readOnly?: boolean;
  maxYears?: number;
  error?: string;
  inputClassName?: string;
};

export function PetAgeInput({
  name, value, onChange, required, readOnly, maxYears, error,
  inputClassName = "w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100",
}: Props) {
  const id = useId();
  const [draft, setDraft] = useState(() => ({
    ...petAgeInputFromYears(value), years: value,
  }));

  // Saved-pet selection and form resets replace the value from outside this input.
  // Local edits retain the chosen unit, even when crossing the one-year boundary.
  if (draft.years !== value) {
    setDraft({ ...petAgeInputFromYears(value), years: value });
  }

  function change(amount: string, unit: PetAgeUnit) {
    const years = petAgeInYears(amount, unit);
    setDraft({ amount, unit, years });
    onChange(years);
  }

  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        <span>Age{required ? <span className="text-red-500"> *</span> : null}</span>
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={maxYears === undefined ? undefined : maxYears * (draft.unit === "months" ? 12 : 1)}
          step="any"
          value={draft.amount}
          onChange={(event) => change(event.target.value, draft.unit)}
          required={required}
          readOnly={readOnly}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          className={`${inputClassName} min-w-0 flex-1`}
        />
        <div className="w-32 shrink-0">
          <select
            aria-label="Age unit"
            value={draft.unit}
            onChange={(event) => change(draft.amount, event.target.value as PetAgeUnit)}
            disabled={readOnly}
            className={inputClassName}
          >
            <option value="years">Years</option>
            <option value="months">Months</option>
          </select>
        </div>
      </div>
      <input type="hidden" name={name} value={value} />
      <p id={`${id}-hint`} className="text-xs text-stone-500">For puppies, choose Months (e.g. 8 months).</p>
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
