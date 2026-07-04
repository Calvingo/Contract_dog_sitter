import { SubmissionStatus, type Prisma } from "@prisma/client";
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
        ageYears: petSnapshot.ageYears,
      },
      update: {
        breed: petSnapshot.breed,
        weightLb: petSnapshot.weightLb,
        ageYears: petSnapshot.ageYears,
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

export async function updateSubmissionRecord(options: {
  submissionId: string;
  data: FormValues;
}) {
  const customerSnapshot = buildCustomerSnapshot(options.data);
  const petSnapshot = buildPetSnapshot(options.data);
  const prescreenAnswers = buildPrescreenAnswers(options.data);
  const quote = getSubmissionQuote(options.data);
  const { dropoffAt, pickupAt } = getSubmissionDateTimes(options.data);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const current = await tx.submission.findUnique({
      where: { id: options.submissionId },
      include: {
        customer: true,
        pet: true,
      },
    });

    if (!current) {
      throw new Error("Submission not found");
    }

    if (
      current.status === SubmissionStatus.REJECTED ||
      current.status === SubmissionStatus.CANCELLED
    ) {
      throw new Error("This submission can no longer be edited");
    }

    await tx.submissionRevision.upsert({
      where: {
        submissionId_revision: {
          submissionId: current.id,
          revision: current.revision,
        },
      },
      create: {
        submissionId: current.id,
        revision: current.revision,
        status: current.status,
        quotedBreakdown: current.quotedBreakdown as Prisma.InputJsonValue,
        quotedTotal: current.quotedTotal,
        prescreenAnswers: current.prescreenAnswers as Prisma.InputJsonValue,
        prescreenNotes: current.prescreenNotes,
        signatureData: current.signatureData,
        customerSnapshot: current.customerSnapshot as Prisma.InputJsonValue,
        petSnapshot: current.petSnapshot as Prisma.InputJsonValue,
        dropoffAt: current.dropoffAt,
        pickupAt: current.pickupAt,
      },
      update: {},
    });

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
        ageYears: petSnapshot.ageYears,
      },
      update: {
        breed: petSnapshot.breed,
        weightLb: petSnapshot.weightLb,
        ageYears: petSnapshot.ageYears,
      },
    });

    const nextStatus =
      current.status === SubmissionStatus.PENDING
        ? SubmissionStatus.PENDING
        : SubmissionStatus.NEEDS_REVIEW;

    const submission = await tx.submission.update({
      where: { id: current.id },
      data: {
        customerId: customer.id,
        petId: pet.id,
        status: nextStatus,
        revision: current.revision + 1,
        firstTimeBooking: options.data.firstTimeBooking,
        dropoffAt,
        pickupAt,
        quotedTotal: quote.totalPrice,
        quotedBreakdown: quote as unknown as Prisma.InputJsonValue,
        prescreenAnswers: prescreenAnswers as Prisma.InputJsonValue,
        prescreenNotes: options.data.prescreenNotes?.trim() || null,
        agreedAt: now,
        signatureData: options.data.signature,
        customerSnapshot: customerSnapshot as unknown as Prisma.InputJsonValue,
        petSnapshot: petSnapshot as unknown as Prisma.InputJsonValue,
        lastEditedAt: now,
        previouslyAcceptedAt:
          current.status === SubmissionStatus.ACCEPTED
            ? current.updatedAt
            : current.previouslyAcceptedAt,
      },
    });

    return {
      submission,
      customer,
      pet,
      quote,
      previousStatus: current.status,
    };
  });
}
