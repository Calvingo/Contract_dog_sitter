import { Prisma, type Submission, type SubmissionPet } from "@prisma/client";

// Archive before any customer or administrator changes the signed booking.
export async function archiveSubmissionRevision(
  tx: Prisma.TransactionClient,
  current: Submission & { submissionPets: SubmissionPet[] },
) {
  await tx.submissionRevision.upsert({
    where: {
      submissionId_revision: { submissionId: current.id, revision: current.revision },
    },
    create: {
      submissionId: current.id,
      revision: current.revision,
      status: current.status,
      agreementVersion: current.agreementVersion,
      depositPolicySnapshot: current.depositPolicySnapshot ?? Prisma.DbNull,
      quotedBreakdown: current.quotedBreakdown as Prisma.InputJsonValue,
      quotedTotal: current.quotedTotal,
      prescreenAnswers: current.prescreenAnswers as Prisma.InputJsonValue,
      prescreenNotes: current.prescreenNotes,
      signatureData: current.signatureData,
      customerSnapshot: current.customerSnapshot as Prisma.InputJsonValue,
      petSnapshot: current.petSnapshot as Prisma.InputJsonValue,
      petsSnapshot: current.submissionPets.map((item) => ({
        position: item.position,
        petSnapshot: item.petSnapshot,
        prescreenAnswers: item.prescreenAnswers,
        prescreenNotes: item.prescreenNotes,
        quotedBreakdown: item.quotedBreakdown,
        quotedTotal: item.quotedTotal.toString(),
      })) as Prisma.InputJsonValue,
      dropoffAt: current.dropoffAt,
      pickupAt: current.pickupAt,
    },
    update: {},
  });
}
