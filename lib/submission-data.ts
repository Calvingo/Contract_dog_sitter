import type { FormValues } from "./form-config";
import { prescreenQuestions } from "./form-config";
import { calculatePrice, parseDateTime, type PriceBreakdown } from "./pricing";

export type CustomerSnapshot = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  backupContact: string;
  wechatId: string | null;
};

export type PetSnapshot = {
  name: string;
  breed: string;
  weightLb: number;
  ageYears: number;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function buildCustomerSnapshot(data: FormValues): CustomerSnapshot {
  return {
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    email: normalizeEmail(data.email),
    phone: data.phone.trim(),
    backupContact: data.backupContact.trim(),
    wechatId: data.wechatId?.trim() || null,
  };
}

export function buildPetSnapshot(data: FormValues): PetSnapshot {
  return {
    name: data.petName.trim(),
    breed: data.petBreed.trim(),
    weightLb: Number(data.petWeightLb),
    ageYears: Number(data.petAgeYears),
  };
}

export function buildPrescreenAnswers(data: FormValues): Record<string, string> {
  return Object.fromEntries(
    prescreenQuestions.map((question) => [
      question.name,
      String(data[question.name] ?? "").trim(),
    ])
  );
}

export function getSubmissionDateTimes(data: FormValues): {
  dropoffAt: Date;
  pickupAt: Date;
} {
  const dropoffAt = parseDateTime(data.dropoffDate, data.dropoffTime);
  const pickupAt = parseDateTime(data.pickupDate, data.pickupTime);

  if (!dropoffAt || !pickupAt) {
    throw new Error("Invalid drop-off or pick-up date/time");
  }

  return { dropoffAt, pickupAt };
}

export function getSubmissionQuote(data: FormValues): PriceBreakdown {
  const quote = calculatePrice(
    Number(data.petWeightLb),
    Number(data.petAgeYears),
    data.prescreenSpayedNeutered,
    data.dropoffDate,
    data.dropoffTime,
    data.pickupDate,
    data.pickupTime
  );

  if (!quote) {
    throw new Error("Unable to calculate price");
  }

  return quote;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

type SubmissionLike = {
  firstTimeBooking: string;
  dropoffAt: Date;
  pickupAt: Date;
  prescreenAnswers: unknown;
  prescreenNotes: string | null;
  signatureData: string;
  customerSnapshot: unknown;
  petSnapshot: unknown;
};

export function formValuesFromSubmission(submission: SubmissionLike): FormValues {
  const customer = submission.customerSnapshot as Partial<CustomerSnapshot>;
  const pet = submission.petSnapshot as Partial<PetSnapshot>;
  const prescreen = submission.prescreenAnswers as Partial<Record<keyof FormValues, string>>;

  return {
    firstTimeBooking: submission.firstTimeBooking,
    prescreenAggression: prescreen.prescreenAggression ?? "",
    prescreenBitten: prescreen.prescreenBitten ?? "",
    prescreenPottyTraining: prescreen.prescreenPottyTraining ?? "",
    prescreenSeparationAnxiety: prescreen.prescreenSeparationAnxiety ?? "",
    prescreenFrequentBarking: prescreen.prescreenFrequentBarking ?? "",
    prescreenSpayedNeutered: prescreen.prescreenSpayedNeutered ?? "",
    prescreenMedicalHistory: prescreen.prescreenMedicalHistory ?? "",
    prescreenAggressionChildren: prescreen.prescreenAggressionChildren ?? "",
    firstName: customer.firstName ?? "",
    lastName: customer.lastName ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    backupContact: customer.backupContact ?? "",
    wechatId: customer.wechatId ?? "",
    petName: pet.name ?? "",
    petBreed: pet.breed ?? "",
    petWeightLb: pet.weightLb == null ? "" : String(pet.weightLb),
    petAgeYears: pet.ageYears == null ? "" : String(pet.ageYears),
    dropoffDate: toDateInputValue(submission.dropoffAt),
    dropoffTime: toTimeInputValue(submission.dropoffAt),
    pickupDate: toDateInputValue(submission.pickupAt),
    pickupTime: toTimeInputValue(submission.pickupAt),
    prescreenNotes: submission.prescreenNotes ?? "",
    agreed: false,
    signature: "",
    honeypot: "",
  };
}
