import type { FormValues } from "./form-config";
import { prescreenQuestions, secondPrescreenQuestions } from "./form-config";
import { calculatePrice, DEPOSIT_PERCENT, parseDateTime, type PriceBreakdown } from "./pricing";

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
  manualPrice?: ManualOrderPrice;
};

// A final price for this particular stay, never a discount on future quotes.
export type ManualOrderPrice = { stayKey: string; total: number };

export function storedManualPrice(snapshot: unknown): ManualOrderPrice | undefined {
  const price = (snapshot as Partial<SubmissionQuote> | null)?.manualPrice;
  return price && typeof price.stayKey === "string" && Number.isFinite(price.total) ? price : undefined;
}

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

export function buildPrescreenAnswers(
  data: FormValues,
): Record<string, string> {
  return Object.fromEntries(
    prescreenQuestions.map((question) => [
      question.name,
      String(data[question.name] ?? "").trim(),
    ]),
  );
}

export function buildPetPrescreenAnswers(
  data: FormValues,
): Record<string, string>[] {
  const answers = [buildPrescreenAnswers(data)];
  if (data.hasSecondDog) {
    answers.push(
      Object.fromEntries(
        secondPrescreenQuestions.map((question, index) => [
          prescreenQuestions[index].name,
          String(data[question.name] ?? "").trim(),
        ]),
      ),
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

export type DogPricingTerms = {
  petId: string;
  lateDropoffAt?: string;
  earlyPickupAt?: string;
  returningDiscountRate?: number;
};

// Carry forward an explicitly discounted boarding base. A manual change to an
// order total has no allocation between boarding and fees and cannot identify a rate.
function storedBoardingDiscount(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const dog = snapshot as Partial<PriceBreakdown>;
  if (typeof dog.returningDiscountRate === "number" && dog.returningDiscountRate >= 0 && dog.returningDiscountRate <= 1)
    return dog.returningDiscountRate;
  const gross = Number(dog.dailyRate) * Number(dog.billableDays);
  const base = dog.boardingSubtotal;
  return typeof base === "number" && gross > 0 && base >= 0 && base < gross ? 1 - base / gross : undefined;
}

export function storedDogTerms(booking: {
  petId: string;
  quotedBreakdown: unknown;
  submissionPets: { petId: string; position: number; lateDropoffAt?: Date | null; earlyPickupAt?: Date | null; quotedBreakdown: unknown }[];
}): DogPricingTerms[] {
  if (!booking.submissionPets.length) {
    const quote = booking.quotedBreakdown as { dogs?: PriceBreakdown[] } | null;
    return [{ petId: booking.petId, returningDiscountRate: storedBoardingDiscount(quote?.dogs?.[0] ?? quote) }];
  }
  return [...booking.submissionPets].sort((a, b) => a.position - b.position).map(pet => ({
    petId: pet.petId,
    lateDropoffAt: pet.lateDropoffAt?.toISOString().slice(0, 16),
    earlyPickupAt: pet.earlyPickupAt?.toISOString().slice(0, 16),
    returningDiscountRate: storedBoardingDiscount(pet.quotedBreakdown),
  }));
}

export function withBoardingDiscounts(quote: PriceBreakdown, reward: boolean, returningRate = 0): PriceBreakdown {
  if (!reward && !returningRate) return quote;
  const grossCents = Math.round(quote.boardingSubtotal * 100);
  const baseCents = Math.round(grossCents * (1 - returningRate));
  const rewardCents = reward ? Math.round(baseCents / 10) : 0;
  const totalPrice = (Math.round(quote.totalPrice * 100) - grossCents + baseCents - rewardCents) / 100;
  return {
    ...quote,
    boardingSubtotal: baseCents / 100,
    ...(returningRate ? { returningDiscountRate: returningRate } : {}),
    ...(reward ? { loyaltyDiscount: rewardCents / 100 } : {}),
    totalPrice,
    depositAmount: Math.round(totalPrice * DEPOSIT_PERCENT) / 100,
    summary: `Boarding $${(baseCents / 100).toFixed(2)} + fees $${(quote.totalPrice - quote.boardingSubtotal).toFixed(2)} − loyalty $${(rewardCents / 100).toFixed(2)} = $${totalPrice.toFixed(2)}`,
  };
}

export function getSubmissionQuote(data: FormValues, terms: DogPricingTerms[] = [], price?: ManualOrderPrice | number): SubmissionQuote {
  const pets = [{
    id: data.savedPetId, weight: data.petWeightLb, age: data.petAgeYears,
    neutered: data.prescreenSpayedNeutered, energy: data.prescreenHighEnergy, medical: data.prescreenMedicalHistory,
  }];
  if (data.hasSecondDog) pets.push({
    id: data.savedSecondPetId, weight: data.secondPetWeightLb, age: data.secondPetAgeYears,
    neutered: data.secondPrescreenSpayedNeutered, energy: data.secondPrescreenHighEnergy, medical: data.secondPrescreenMedicalHistory,
  });

  const scheduledArrival = `${data.dropoffDate}T${data.dropoffTime}`;
  const scheduledPickup = `${data.pickupDate}T${data.pickupTime}`;
  const dogs = pets.map(pet => {
    const dog = terms.find(term => term.petId === pet.id);
    const arrival = dog?.lateDropoffAt || scheduledArrival;
    const pickup = dog?.earlyPickupAt || scheduledPickup;
    if (arrival < scheduledArrival || pickup > scheduledPickup)
      throw new Error("Each dog’s dates must fall within the stay.");
    const base = calculatePrice(
      Number(pet.weight), Number(pet.age), pet.neutered, pet.energy, pet.medical,
      arrival.slice(0, 10), arrival.slice(11), pickup.slice(0, 10), pickup.slice(11),
      Boolean(dog?.lateDropoffAt || dog?.earlyPickupAt),
    );
    if (!base) throw new Error("Unable to calculate price. Check the stay and each dog's pickup time.");
    return withBoardingDiscounts(base, data.useReward === true, dog?.returningDiscountRate);
  });
  const quote = combineDogQuotes(dogs);
  if (price === undefined) return quote;
  const stayKey = JSON.stringify([scheduledArrival, scheduledPickup, data.useReward === true, ...pets.map((pet, index) => {
    const term = terms.find(term => term.petId === pet.id);
    return [pet.id, term?.lateDropoffAt || scheduledArrival, term?.earlyPickupAt || scheduledPickup, dogs[index].totalPrice];
  })]);
  if (typeof price !== "number" && price.stayKey !== stayKey) return quote;
  const total = typeof price === "number" ? price : price.total;
  return { ...quote, manualPrice: { stayKey, total }, totalPrice: total,
    depositAmount: Math.round(total * DEPOSIT_PERCENT) / 100,
    summary: `${quote.summary} | Manually set order total: $${total.toFixed(2)}` };
}

export function combineDogQuotes(dogs: PriceBreakdown[]): SubmissionQuote {
  const totalPrice =
    Math.round(dogs.reduce((sum, quote) => sum + quote.totalPrice, 0) * 100) /
    100;
  const depositAmount = Math.round(totalPrice * DEPOSIT_PERCENT) / 100;
  return {
    dogs,
    totalPrice,
    depositAmount,
    summary: dogs
      .map((quote, index) => `Dog ${index + 1}: ${quote.summary}`)
      .join(" | "),
  };
}

function toDateInputValue(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

type SubmissionLike = {
  rewardState?: string;
  petId?: string;
  firstTimeBooking: string;
  dropoffAt: Date;
  pickupAt: Date;
  prescreenAnswers: unknown;
  prescreenNotes: string | null;
  signatureData: string;
  customerSnapshot: unknown;
  petSnapshot: unknown;
  submissionPets?: Array<{
    petId?: string;
    position: number;
    petSnapshot: unknown;
    prescreenAnswers: unknown;
    prescreenNotes: string | null;
  }>;
};

export function formValuesFromSubmission(
  submission: SubmissionLike,
): FormValues {
  const customer = submission.customerSnapshot as Partial<CustomerSnapshot>;
  const pet = submission.petSnapshot as Partial<PetSnapshot>;
  const prescreen = submission.prescreenAnswers as Partial<
    Record<keyof FormValues, string>
  >;
  const second = submission.submissionPets
    ?.filter((item) => item.position === 2)
    .at(0);
  const secondPet = (second?.petSnapshot ?? {}) as Partial<PetSnapshot>;
  const secondPrescreen = (second?.prescreenAnswers ?? {}) as Partial<
    Record<keyof FormValues, string>
  >;

  return {
    useReward: submission.rewardState === "HELD" || submission.rewardState === "USED",
    firstTimeBooking: submission.firstTimeBooking,
    savedPetId: submission.petId,
    savedSecondPetId: second?.petId,
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
    secondPrescreenSeparationAnxiety:
      secondPrescreen.prescreenSeparationAnxiety ?? "",
    secondPrescreenFrequentBarking:
      secondPrescreen.prescreenFrequentBarking ?? "",
    secondPrescreenSpayedNeutered:
      secondPrescreen.prescreenSpayedNeutered ?? "",
    secondPrescreenHighEnergy: secondPrescreen.prescreenHighEnergy ?? "",
    secondPrescreenMedicalHistory:
      secondPrescreen.prescreenMedicalHistory ?? "",
    secondPrescreenAggressionChildren:
      secondPrescreen.prescreenAggressionChildren ?? "",
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
    secondPetWeightLb:
      secondPet.weightLb == null ? "" : String(secondPet.weightLb),
    secondPetAgeYears:
      secondPet.ageYears == null ? "" : String(secondPet.ageYears),
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
