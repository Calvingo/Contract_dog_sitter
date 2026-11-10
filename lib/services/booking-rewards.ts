import { Prisma, type RewardState } from "@prisma/client";
import { depositPolicy, DEPOSIT_POLICY_VERSION } from "../federal-holidays";
import { loadRewards } from "../platform/loyalty";
import { DEPOSIT_PERCENT } from "../pricing";
import { combineDogQuotes, type SubmissionQuote } from "../submission-data";
import { archiveSubmissionRevision } from "./submission-revision";

// Call under the capacity lock, shared by booking edits, cancellations and both decision paths.
export async function rewardOnAcceptance(tx: Prisma.TransactionClient, booking: {
  id: string; customerId: string; rewardState: RewardState;
}) {
  if (booking.rewardState === "RECONFIRM") throw new Error("The customer must confirm the revised price before acceptance.");
  if (booking.rewardState !== "HELD") return booking.rewardState;
  const { validHolds } = await loadRewards(tx, booking.customerId);
  if (!validHolds.includes(booking.id)) throw new Error("The reward is no longer available. The customer must review the new price.");
  return "USED" as const;
}

export async function reconcileRewardHolds(tx: Prisma.TransactionClient, customerId: string) {
  const { excessHolds } = await loadRewards(tx, customerId);
  for (const { id } of excessHolds) {
    const row = await tx.submission.findUniqueOrThrow({ where: { id }, include: { submissionPets: true } });
    await archiveSubmissionRevision(tx, row);
    // Reverse only the reward on the signed quote, retaining all other rate terms.
    const original = row.quotedBreakdown as unknown as SubmissionQuote;
    const quote = combineDogQuotes(original.dogs.map(({ loyaltyDiscount = 0, ...dog }) => {
      const totalPrice = Math.round((dog.totalPrice + loyaltyDiscount) * 100) / 100;
      return { ...dog, totalPrice, depositAmount: Math.round(totalPrice * DEPOSIT_PERCENT) / 100,
        summary: `Boarding $${dog.boardingSubtotal.toFixed(2)} plus fees = $${totalPrice.toFixed(2)}` };
    }));
    for (const pet of row.submissionPets) {
      const dog = quote.dogs[pet.position - 1];
      await tx.submissionPet.update({ where: { id: pet.id }, data: {
        quotedTotal: dog.totalPrice, quotedBreakdown: dog as unknown as Prisma.InputJsonValue,
      } });
    }
    await tx.submission.update({ where: { id }, data: {
      rewardState: "RECONFIRM", revision: { increment: 1 }, lastEditedAt: new Date(),
      quotedTotal: quote.totalPrice, quotedBreakdown: quote as unknown as Prisma.InputJsonValue,
      ...(row.agreementVersion === DEPOSIT_POLICY_VERSION ? {
        depositPolicySnapshot: depositPolicy(row.dropoffAt.toISOString().slice(0, 10), row.pickupAt.toISOString().slice(0, 10), quote.totalPrice),
      } : {}),
    } });
  }
}
