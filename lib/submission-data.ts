import type { FormValues } from "./form-config";
import { prescreenQuestions, secondPrescreenQuestions } from "./form-config";
import { calculatePrice, parseDateTime, type PriceBreakdown } from "./pricing";

export type CustomerSnapshot = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  backupContact: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  wechatId: string | null;
};

export type PetSnapshot = {
  name: string;
  breed: string;
  weightLb: number;
  ageYears: number;
};

export type SubmissionQuote = {
  dogs: PriceBreakdown[];
  totalPrice: number;
  depositAmount: number;
  summary: string;
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
    emergencyContactName: data.emergencyContactName?.trim() || null,
    emergencyContactPhone: data.emergencyContactPhone?.trim() || null,
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

export function buildPetSnapshots(data: FormValues): PetSnapshot[] {
  const pets = [buildPetSnapshot(data)];
  if (data.hasSecondDog) {
    pets.push({
      name: data.secondPetName.trim(),
      breed: data.secondPetBreed.trim(),
      weightLb: Number(data.secondPetWeightLb),
      ageYears: Number(data.secondPetAgeYears),
    });
  }
  return pets;
}

export function buildPrescreenAnswers(data: FormValues): Record<string, string> {
  return Object.fromEntries(
    prescreenQuestions.map((question) => [
      question.name,
      String(data[question.name] ?? "").trim(),
    ])
  );
}

export function buildPetPrescreenAnswers(
  data: FormValues
): Record<string, string>[] {
  const answers = [buildPrescreenAnswers(data)];
  if (data.hasSecondDog) {
    answers.push(
      Object.fromEntries(
        secondPrescreenQuestions.map((question, index) => [
          prescreenQuestions[index].name,
          String(data[question.name] ?? "").trim(),
        ])
      )
    );
  }
  return answers;
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

export function getSubmissionQuote(data: FormValues): SubmissionQuote {
  const firstQuote = calculatePrice(
    Number(data.petWeightLb),
    Number(data.petAgeYears),
    data.prescreenSpayedNeutered,
    data.prescreenHighEnergy,
    data.dropoffDate,
    data.dropoffTime,
    data.pickupDate,
    data.pickupTime
  );

  const secondQuote = data.hasSecondDog
    ? calculatePrice(
        Number(data.secondPetWeightLb),
        Number(data.secondPetAgeYears),
        data.secondPrescreenSpayedNeutered,
        data.secondPrescreenHighEnergy,
        data.dropoffDate,
        data.dropoffTime,
        data.pickupDate,
        data.pickupTime
      )
    : null;

  if (!firstQuote || (data.hasSecondDog && !secondQuote)) {
    throw new Error("Unable to calculate price");
  }
  const dogs = secondQuote ? [firstQuote, secondQuote] : [firstQuote];
  const totalPrice = Math.round(dogs.reduce((sum, quote) => sum + quote.totalPrice, 0) * 100) / 100;
  const depositAmount = Math.round(dogs.reduce((sum, quote) => sum + quote.depositAmount, 0) * 100) / 100;
  return {
    dogs,
    totalPrice,
    depositAmount,
    summary: dogs.map((quote, index) => `Dog ${index + 1}: ${quote.summary}`).join(" | "),
  };
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
  submissionPets?: Array<{
    position: number;
    petSnapshot: unknown;
    prescreenAnswers: unknown;
    prescreenNotes: string | null;
  }>;
};

export function formValuesFromSubmission(submission: SubmissionLike): FormValues {
  const customer = submission.customerSnapshot as Partial<CustomerSnapshot>;
  const pet = submission.petSnapshot as Partial<PetSnapshot>;
  const prescreen = submission.prescreenAnswers as Partial<Record<keyof FormValues, string>>;
  const second = submission.submissionPets
    ?.filter((item) => item.position === 2)
    .at(0);
  const secondPet = (second?.petSnapshot ?? {}) as Partial<PetSnapshot>;
  const secondPrescreen = (second?.prescreenAnswers ?? {}) as Partial<Record<keyof FormValues, string>>;

  return {
    firstTimeBooking: submission.firstTimeBooking,
    prescreenAggression: prescreen.prescreenAggression ?? "",
    prescreenBitten: prescreen.prescreenBitten ?? "",
    prescreenPottyTraining: prescreen.prescreenPottyTraining ?? "",
    prescreenSeparationAnxiety: prescreen.prescreenSeparationAnxiety ?? "",
    prescreenFrequentBarking: prescreen.prescreenFrequentBarking ?? "",
    prescreenSpayedNeutered: prescreen.prescreenSpayedNeutered ?? "",
    prescreenHighEnergy: prescreen.prescreenHighEnergy ?? "",
    prescreenMedicalHistory: prescreen.prescreenMedicalHistory ?? "",
    prescreenAggressionChildren: prescreen.prescreenAggressionChildren ?? "",
    hasSecondDog: Boolean(second),
    secondPrescreenAggression: secondPrescreen.prescreenAggression ?? "",
    secondPrescreenBitten: secondPrescreen.prescreenBitten ?? "",
    secondPrescreenPottyTraining: secondPrescreen.prescreenPottyTraining ?? "",
    secondPrescreenSeparationAnxiety: secondPrescreen.prescreenSeparationAnxiety ?? "",
    secondPrescreenFrequentBarking: secondPrescreen.prescreenFrequentBarking ?? "",
    secondPrescreenSpayedNeutered: secondPrescreen.prescreenSpayedNeutered ?? "",
    secondPrescreenHighEnergy: secondPrescreen.prescreenHighEnergy ?? "",
    secondPrescreenMedicalHistory: secondPrescreen.prescreenMedicalHistory ?? "",
    secondPrescreenAggressionChildren: secondPrescreen.prescreenAggressionChildren ?? "",
    firstName: customer.firstName ?? "",
    lastName: customer.lastName ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    backupContact: customer.backupContact ?? "",
    emergencyContactName: customer.emergencyContactName ?? "",
    emergencyContactPhone: customer.emergencyContactPhone ?? "",
    wechatId: customer.wechatId ?? "",
    petName: pet.name ?? "",
    petBreed: pet.breed ?? "",
    petWeightLb: pet.weightLb == null ? "" : String(pet.weightLb),
    petAgeYears: pet.ageYears == null ? "" : String(pet.ageYears),
    secondPetName: secondPet.name ?? "",
    secondPetBreed: secondPet.breed ?? "",
    secondPetWeightLb: secondPet.weightLb == null ? "" : String(secondPet.weightLb),
    secondPetAgeYears: secondPet.ageYears == null ? "" : String(secondPet.ageYears),
    dropoffDate: toDateInputValue(submission.dropoffAt),
    dropoffTime: toTimeInputValue(submission.dropoffAt),
    pickupDate: toDateInputValue(submission.pickupAt),
    pickupTime: toTimeInputValue(submission.pickupAt),
    prescreenNotes: submission.prescreenNotes ?? "",
    secondPrescreenNotes: second?.prescreenNotes ?? "",
    agreed: false,
    signature: "",
    honeypot: "",
  };
}
