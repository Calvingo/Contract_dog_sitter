import { SubmissionStatus, type Prisma } from "@prisma/client";
import type { FormValues } from "@/lib/form-config";
import { prisma } from "@/lib/db";
import {
  buildCustomerSnapshot,
  buildPetSnapshots,
  buildPetPrescreenAnswers,
  getSubmissionDateTimes,
  getSubmissionQuote,
} from "@/lib/submission-data";

export async function createSubmissionRecord(data: FormValues) {
  const customerSnapshot = buildCustomerSnapshot(data);
  const petSnapshots = buildPetSnapshots(data);
  const prescreenAnswersByPet = buildPetPrescreenAnswers(data);
  const petSnapshot = petSnapshots[0];
  const prescreenAnswers = prescreenAnswersByPet[0];
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
        emergencyContactName: customerSnapshot.emergencyContactName,
        emergencyContactPhone: customerSnapshot.emergencyContactPhone,
        wechatId: customerSnapshot.wechatId,
        lastSeenAt: now,
      },
    });

    const pets = [];
    for (const snapshot of petSnapshots) {
      pets.push(await tx.pet.upsert({
        where: { customerId_name: { customerId: customer.id, name: snapshot.name } },
        create: { customerId: customer.id, ...snapshot },
        update: { breed: snapshot.breed, weightLb: snapshot.weightLb, ageYears: snapshot.ageYears },
      }));
    }
    const pet = pets[0];

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
        submissionPets: {
          create: pets.map((savedPet, index) => ({
            petId: savedPet.id,
            position: index + 1,
            petSnapshot: petSnapshots[index] as unknown as Prisma.InputJsonValue,
            prescreenAnswers: prescreenAnswersByPet[index] as Prisma.InputJsonValue,
            prescreenNotes: index === 0 ? data.prescreenNotes?.trim() || null : data.secondPrescreenNotes?.trim() || null,
            quotedBreakdown: quote.dogs[index] as unknown as Prisma.InputJsonValue,
            quotedTotal: quote.dogs[index].totalPrice,
          })),
        },
      },
    });

    return { submission, customer, pet, pets, quote };
  });
}

export async function updateSubmissionRecord(options: {
  submissionId: string;
  data: FormValues;
}) {
  const customerSnapshot = buildCustomerSnapshot(options.data);
  const petSnapshots = buildPetSnapshots(options.data);
  const prescreenAnswersByPet = buildPetPrescreenAnswers(options.data);
  const petSnapshot = petSnapshots[0];
  const prescreenAnswers = prescreenAnswersByPet[0];
  const quote = getSubmissionQuote(options.data);
  const { dropoffAt, pickupAt } = getSubmissionDateTimes(options.data);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const current = await tx.submission.findUnique({
      where: { id: options.submissionId },
      include: {
        customer: true,
        pet: true,
        submissionPets: { orderBy: { position: "asc" } },
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
        petsSnapshot: current.submissionPets.map((item) => ({
          position: item.position,
          petSnapshot: item.petSnapshot,
          prescreenAnswers: item.prescreenAnswers,
          prescreenNotes: item.prescreenNotes,
          quotedBreakdown: item.quotedBreakdown,
          quotedTotal: item.quotedTotal.toString(),
        })) as unknown as Prisma.InputJsonValue,
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
        emergencyContactName: customerSnapshot.emergencyContactName,
        emergencyContactPhone: customerSnapshot.emergencyContactPhone,
        wechatId: customerSnapshot.wechatId,
        lastSeenAt: now,
      },
    });

    const pets = [];
    for (const snapshot of petSnapshots) {
      pets.push(await tx.pet.upsert({
        where: { customerId_name: { customerId: customer.id, name: snapshot.name } },
        create: { customerId: customer.id, ...snapshot },
        update: { breed: snapshot.breed, weightLb: snapshot.weightLb, ageYears: snapshot.ageYears },
      }));
    }
    const pet = pets[0];

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

    await tx.submissionPet.deleteMany({ where: { submissionId: current.id } });
    await tx.submissionPet.createMany({
      data: pets.map((savedPet, index) => ({
        submissionId: current.id,
        petId: savedPet.id,
        position: index + 1,
        petSnapshot: petSnapshots[index] as unknown as Prisma.InputJsonValue,
        prescreenAnswers: prescreenAnswersByPet[index] as Prisma.InputJsonValue,
        prescreenNotes: index === 0 ? options.data.prescreenNotes?.trim() || null : options.data.secondPrescreenNotes?.trim() || null,
        quotedBreakdown: quote.dogs[index] as unknown as Prisma.InputJsonValue,
        quotedTotal: quote.dogs[index].totalPrice,
      })),
    });

    return {
      submission,
      customer,
      pet,
      pets,
      quote,
      previousStatus: current.status,
    };
  });
}
