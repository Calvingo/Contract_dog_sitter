import { Prisma, type Submission, type SubmissionPet, type SubmissionStatus } from "@prisma/client";
import type { FormValues } from "@/lib/form-config";
import { depositPolicy, DEPOSIT_POLICY_VERSION } from "@/lib/federal-holidays";
import { buildPetSnapshots, getSubmissionDateTimes, getSubmissionQuote, storedDogTerms, storedManualPrice } from "@/lib/submission-data";

export function readManualTotal(form: FormData): number | null | undefined {
  const mode = form.get("priceMode");
  if (mode === null || mode === "keep") return undefined;
  if (mode === "automatic") return null;
  const value = form.get("manualTotal");
  if (mode !== "manual" || typeof value !== "string" || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value))
    throw new Error("Enter a price from $0 to $99,999,999.99 with at most two decimal places.");
  return Number(value);
}

// Both admin editors must save the same quote, per-dog prices and signed policy.
// The caller archives the old revision and holds the capacity lock first.
export async function repriceAdminSubmission(
  tx: Prisma.TransactionClient,
  current: Submission & { submissionPets: SubmissionPet[] },
  values: FormValues,
  status: SubmissionStatus = current.status,
  terms = storedDogTerms(current),
  manualTotal?: number | null,
) {
  const price = manualTotal === undefined ? storedManualPrice(current.quotedBreakdown) : manualTotal ?? undefined;
  const quote = getSubmissionQuote(values, terms, price);
  const { dropoffAt, pickupAt } = getSubmissionDateTimes(values);
  const pets = buildPetSnapshots(values);
  const policy = current.agreementVersion === DEPOSIT_POLICY_VERSION
    ? depositPolicy(values.dropoffDate, values.pickupDate, quote.totalPrice)
    : null;

  for (const pet of current.submissionPets) {
    const index = pet.position - 1;
    if (!quote.dogs[index] || !pets[index]) throw new Error("Invalid booking dog details.");
    await tx.submissionPet.update({
      where: { id: pet.id },
      data: {
        lateDropoffAt: terms[index]?.lateDropoffAt ? new Date(terms[index].lateDropoffAt + ":00Z") : null,
        earlyPickupAt: terms[index]?.earlyPickupAt ? new Date(terms[index].earlyPickupAt + ":00Z") : null,
        petSnapshot: pets[index] as unknown as Prisma.InputJsonValue,
        quotedTotal: quote.dogs[index].totalPrice,
        quotedBreakdown: quote.dogs[index] as unknown as Prisma.InputJsonValue,
        ...(index === 0 ? { prescreenNotes: values.prescreenNotes || null } : {}),
      },
    });
  }

  return {
    quotedTotal: quote.totalPrice,
    quotedBreakdown: quote as unknown as Prisma.InputJsonValue,
    depositPolicySnapshot: policy ?? Prisma.DbNull,
    ...(status === "ACCEPTED" ? {
      acceptedDropoffAt: dropoffAt,
      acceptedPickupAt: pickupAt,
      acceptedDogs: quote.dogs.length,
      acceptedRevision: current.revision + 1,
      acceptedDepositPolicySnapshot: policy ?? Prisma.DbNull,
    } : {}),
    lastEditedAt: new Date(),
    revision: { increment: 1 },
  };
}
