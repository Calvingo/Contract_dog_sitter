import {
  prescreenQuestions,
  secondPrescreenQuestions,
  type FormValues,
} from "./form-config";

export type PrefillPet = {
  id: string;
  name: string;
  breed: string;
  weightLb: number;
  ageYears?: number | null;
  lastPrescreenAnswers?: unknown;
  lastPrescreenNotes?: string;
  lastSubmittedAt?: string | null;
};
export type PrefillResponse = {
  authenticated: boolean;
  customer: {
    hasBookedBefore: boolean;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    backupContact: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    wechatId: string;
  };
  pets: PrefillPet[];
};

// An empty selection means the customer deliberately cleared/removed that dog.
export type PrefillPetSelection = { first?: string; second?: string };

export function selectPrefillPets(
  data: PrefillResponse,
  chosen: PrefillPetSelection,
) {
  const first =
    chosen.first !== undefined
      ? data.pets.find((pet) => pet.id === chosen.first)
      : data.authenticated || data.pets.length === 1
        ? data.pets.find((pet) => pet.id !== chosen.second)
        : undefined;
  const second =
    chosen.second !== undefined
      ? data.pets.find(
          (pet) => pet.id === chosen.second && pet.id !== first?.id,
        )
      : data.authenticated && first
        ? data.pets.find((pet) => pet.id !== first.id)
        : undefined;
  return { first, second };
}

export function customerPrefillValues(
  customer: PrefillResponse["customer"],
): Partial<FormValues> {
  return {
    firstTimeBooking: customer.hasBookedBefore ? "no" : "yes",
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    backupContact: customer.backupContact,
    emergencyContactName: customer.emergencyContactName,
    emergencyContactPhone: customer.emergencyContactPhone,
    wechatId: customer.wechatId,
    agreed: false,
    signature: "",
  };
}

export function petPrefillValues(
  pet: PrefillPet,
  second = false,
): Partial<FormValues> {
  return {
    ...(second
      ? {
          hasSecondDog: true,
          savedSecondPetId: pet.id,
          secondPetName: pet.name,
          secondPetBreed: pet.breed,
          secondPetWeightLb: String(pet.weightLb),
          secondPetAgeYears: pet.ageYears == null ? "" : String(pet.ageYears),
        }
      : {
          savedPetId: pet.id,
          petName: pet.name,
          petBreed: pet.breed,
          petWeightLb: String(pet.weightLb),
          petAgeYears: pet.ageYears == null ? "" : String(pet.ageYears),
        }),
    ...prescreenPrefillValues(pet, second),
  };
}

function answersOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function answer(value: unknown): string {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "yes" || normalized === "no" ? normalized : "";
}
export function hasSavedPrescreen(pet?: PrefillPet) {
  const answers = answersOf(pet?.lastPrescreenAnswers);
  return prescreenQuestions.every((question) =>
    Boolean(answer(answers[question.name])),
  );
}
export function prescreenPrefillValues(
  pet: PrefillPet,
  second = false,
): Partial<FormValues> {
  const answers = answersOf(pet.lastPrescreenAnswers);
  const fields: Partial<FormValues> = {};
  (second ? secondPrescreenQuestions : prescreenQuestions).forEach(
    (question, index) => {
      Object.assign(fields, {
        [question.name]: answer(
          answers[prescreenQuestions[index].name] ?? answers[question.name],
        ),
      });
    },
  );
  fields[second ? "secondPrescreenNotes" : "prescreenNotes"] =
    pet.lastPrescreenNotes || "";
  return fields;
}
