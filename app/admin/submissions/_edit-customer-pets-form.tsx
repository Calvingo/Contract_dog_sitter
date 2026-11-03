"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { PetAgeInput } from "@/components/PetAgeInput";
import type { FormValues } from "@/lib/form-config";
import { getSubmissionQuote } from "@/lib/submission-data";
import { updateCustomerPetActionWithState } from "../actions";

type Field = { name: keyof FormValues; label: string; type?: string; optional?: boolean };
const contactFields: Field[] = [
  { name: "firstName", label: "First name" },
  { name: "lastName", label: "Last name" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone" },
  { name: "backupContact", label: "Backup contact" },
  { name: "emergencyContactName", label: "Emergency contact name" },
  { name: "emergencyContactPhone", label: "Emergency contact phone" },
  { name: "wechatId", label: "WeChat ID", optional: true },
];
const dogFields: Field[] = [
  { name: "petName", label: "Dog name" },
  { name: "petBreed", label: "Breed" },
  { name: "petWeightLb", label: "Weight lb", type: "number" },
  { name: "petAgeYears", label: "Age years", type: "number" },
];
const secondDogFields: Field[] = [
  { name: "secondPetName", label: "Dog name" },
  { name: "secondPetBreed", label: "Breed" },
  { name: "secondPetWeightLb", label: "Weight lb", type: "number" },
  { name: "secondPetAgeYears", label: "Age years", type: "number" },
];

export function EditCustomerPetsForm({ submissionId, revision, customerId, petId, secondPetId, initialValues }: {
  submissionId: string;
  revision: number;
  customerId: string;
  petId: string;
  secondPetId?: string;
  initialValues: FormValues;
}) {
  const [values, setValues] = useState(initialValues);
  let total: string | null = null;
  try {
    const numericFields = ["petWeightLb", "petAgeYears", ...(values.hasSecondDog ? ["secondPetWeightLb", "secondPetAgeYears"] : [])] as const;
    if (numericFields.some(name => !String(values[name as keyof FormValues]).trim())) throw new Error("Missing dog details");
    total = getSubmissionQuote(values).totalPrice.toFixed(2);
  } catch {
    // A partial number is normal while the administrator is typing.
  }

  function field({ name, label, type, optional }: Field) {
    if (name === "petAgeYears" || name === "secondPetAgeYears") {
      return (
        <PetAgeInput
          key={name}
          name={name}
          value={String(values[name] ?? "")}
          onChange={(ageYears) => setValues(current => ({ ...current, [name]: ageYears }))}
          required={!optional}
          inputClassName="w-full rounded-xl border border-stone-200 px-3 py-3"
        />
      );
    }
    return (
      <label key={name} className="block">
        <span className="text-sm font-medium text-stone-700">{label}</span>
        <input
          type={type || "text"}
          name={name}
          value={String(values[name] ?? "")}
          onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))}
          required={!optional}
          step={type === "number" ? "0.01" : undefined}
          min={type === "number" ? (name.endsWith("WeightLb") ? "0.01" : "0") : undefined}
          className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
        />
      </label>
    );
  }

  return (
    <ActionForm action={updateCustomerPetActionWithState} label="Save customer and dogs" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100 form-stack">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="petId" value={petId} />
      <input type="hidden" name="secondPetId" value={secondPetId || ""} />
      <h2 className="text-xl font-bold text-stone-950">Edit Customer and Pets</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {contactFields.map(field)}
        {dogFields.map(field)}
        {values.hasSecondDog && <>
          <div className="mt-2 border-t border-stone-200 pt-4 text-sm font-bold text-stone-800 sm:col-span-2">Second dog</div>
          {secondDogFields.map(field)}
        </>}
      </div>
      <p className="mt-4 font-semibold" aria-live="polite">
        {total ? `Recalculated order total: $${total}` : "Enter valid weights and ages to calculate the price."}
      </p>
      <p className="text-xs text-stone-500">Saving updates this order’s price and the saved customer and dog profiles. Other orders keep their existing prices.</p>
    </ActionForm>
  );
}
