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
