import type { Prisma } from "@prisma/client";
import type { FormValues } from "@/lib/form-config";
import { prisma } from "@/lib/db";
import {
  buildCustomerSnapshot,
  buildPetSnapshot,
  buildPrescreenAnswers,
  getSubmissionDateTimes,
  getSubmissionQuote,
} from "@/lib/submission-data";

export async function createSubmissionRecord(data: FormValues) {
  const customerSnapshot = buildCustomerSnapshot(data);
  const petSnapshot = buildPetSnapshot(data);
  const prescreenAnswers = buildPrescreenAnswers(data);
  const quote = getSubmissionQuote(data);
  const { dropoffAt, pickupAt } = getSubmissionDateTimes(data);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { email: customerSnapshot.email },
      create: {
        ...customerSnapshot,
        wechatId: customerSnapshot.wechatId,
        lastSeenAt: now,
      },
      update: {
        firstName: customerSnapshot.firstName,
        lastName: customerSnapshot.lastName,
        phone: customerSnapshot.phone,
        backupContact: customerSnapshot.backupContact,
        wechatId: customerSnapshot.wechatId,
        lastSeenAt: now,
      },
    });

    const pet = await tx.pet.upsert({
      where: {
        customerId_name: {
          customerId: customer.id,
          name: petSnapshot.name,
        },
      },
      create: {
        customerId: customer.id,
        name: petSnapshot.name,
        breed: petSnapshot.breed,
        weightLb: petSnapshot.weightLb,
      },
      update: {
        breed: petSnapshot.breed,
        weightLb: petSnapshot.weightLb,
      },
    });

    const submission = await tx.submission.create({
      data: {
        customerId: customer.id,
        petId: pet.id,
        firstTimeBooking: data.firstTimeBooking,
        dropoffAt,
        pickupAt,
        quotedTotal: quote.totalPrice,
        quotedBreakdown: quote as unknown as Prisma.InputJsonValue,
        prescreenAnswers: prescreenAnswers as Prisma.InputJsonValue,
        prescreenNotes: data.prescreenNotes?.trim() || null,
        agreedAt: now,
        signatureData: data.signature,
        customerSnapshot: customerSnapshot as unknown as Prisma.InputJsonValue,
        petSnapshot: petSnapshot as unknown as Prisma.InputJsonValue,
      },
    });

    return { submission, customer, pet, quote };
  });
}
