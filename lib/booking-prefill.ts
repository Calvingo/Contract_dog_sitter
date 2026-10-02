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
