import {
  BookingConflict,
  assertCapacity,
  getSettings,
  lockCapacity,
} from "@/lib/platform/capacity";
import { verifiedAmount, depositDue } from "@/lib/platform/rules";
import { SubmissionStatus, type Prisma } from "@prisma/client";
import type { FormValues } from "@/lib/form-config";
import { prisma } from "@/lib/db";
import { lockCustomerProfile } from "@/lib/services/customer-profile";
import {
  buildCustomerSnapshot,
  buildPetSnapshots,
  buildPetPrescreenAnswers,
  getSubmissionDateTimes,
  getSubmissionQuote,
  type PetSnapshot,
} from "@/lib/submission-data";

// Stable IDs let owners correct a dog's name without creating a second profile.
async function saveBookingPets(
  tx: Prisma.TransactionClient,
  customerId: string,
  data: FormValues,
  snapshots: PetSnapshot[],
  answers: Record<string, string>[],
  verified: boolean,
) {
  const requestedIds = [data.savedPetId, data.savedSecondPetId].slice(0, snapshots.length);
  if (verified && requestedIds[0] && requestedIds[0] === requestedIds[1])
    throw new BookingConflict("Choose a different dog for each slot.");
  const pets = [];
  for (const [index, snapshot] of snapshots.entries()) {
    const id = verified ? requestedIds[index] : undefined;
    if (id !== undefined && (typeof id !== "string" || id.length > 200))
      throw new BookingConflict("Invalid saved dog.");
    const existing = id
      ? await tx.pet.findFirst({ where: { id, customerId } })
      : await tx.pet.findFirst({ where: { customerId, name: { equals: snapshot.name, mode: "insensitive" } } });
    if (id && !existing) throw new BookingConflict("Saved dog not found in your account.");
    if (existing?.archivedAt) throw new BookingConflict("Restore this dog in My dogs before booking again.");
    const sameName = await tx.pet.findFirst({ where: { customerId, name: { equals: snapshot.name, mode: "insensitive" } } });
    if (sameName && sameName.id !== existing?.id)
      throw new BookingConflict("You already have a dog with this name. Choose that saved dog instead.");
    const profile = {
      ...snapshot,
      prescreenAnswers: answers[index] as Prisma.InputJsonValue,
      prescreenNotes: (index === 0 ? data.prescreenNotes : data.secondPrescreenNotes)?.trim() || "",
    };
    pets.push(existing
      ? verified ? await tx.pet.update({ where: { id: existing.id }, data: profile }) : existing
      : await tx.pet.create({ data: { customerId, ...profile } }));
  }
  return pets;
}

export async function createSubmissionRecord(
  data: FormValues,
  customerId?: string,
) {
  const customerSnapshot = buildCustomerSnapshot(data);
  const petSnapshots = buildPetSnapshots(data);
  const prescreenAnswersByPet = buildPetPrescreenAnswers(data);
  const petSnapshot = petSnapshots[0];
  const prescreenAnswers = prescreenAnswersByPet[0];
  const quote = getSubmissionQuote(data);
  const { dropoffAt, pickupAt } = getSubmissionDateTimes(data);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await lockCapacity(tx);
    const existingCustomer = await tx.customer.findUnique({ where: { email: customerSnapshot.email } });
    if (existingCustomer) {
      await lockCustomerProfile(tx, existingCustomer.id);
      const active = await tx.customer.findUniqueOrThrow({ where: { id: existingCustomer.id } });
      if (active.deactivatedAt) throw new BookingConflict("This account is deactivated. Contact us to restore access.");
    }
    const owner = customerId
      ? await tx.customer.findUnique({ where: { id: customerId } })
      : null;
    if (customerId && (!owner || owner.email !== customerSnapshot.email))
      throw new BookingConflict("Please use your signed-in email address.");
    await assertCapacity(tx, dropoffAt, pickupAt, petSnapshots.length);
    const settings = await getSettings(tx);
    const customer = await tx.customer.upsert({
      where: { email: customerSnapshot.email },
      create: {
        ...customerSnapshot,
        wechatId: customerSnapshot.wechatId,
        lastSeenAt: now,
      },
      update: owner
        ? {
            ...(owner.phone !== customerSnapshot.phone
              ? { smsMarketingOptIn: false }
              : {}),
            firstName: customerSnapshot.firstName,
            lastName: customerSnapshot.lastName,
            phone: customerSnapshot.phone,
            backupContact: customerSnapshot.backupContact,
            emergencyContactName: customerSnapshot.emergencyContactName,
            emergencyContactPhone: customerSnapshot.emergencyContactPhone,
            wechatId: customerSnapshot.wechatId,
            lastSeenAt: now,
          }
        : {},
    });

    // Guest booking never reverses an existing customer's email preferences.
    if (
      data.emailMarketingOptIn === true &&
      (!existingCustomer || owner) &&
      !customer.emailMarketingOptIn
    ) {
      await tx.customer.update({
        where: { id: customer.id },
        data: { emailMarketingOptIn: true, marketingConsentUpdatedAt: now },
      });
      await tx.marketingConsentEvent.create({
        data: {
          customerId: customer.id,
          emailOptIn: true,
          smsOptIn: false,
          source: owner
            ? "signed-in-booking-opt-in-v1"
            : "new-customer-booking-opt-in-v1",
        },
      });
    }

    const pets = await saveBookingPets(tx, customer.id, data, petSnapshots, prescreenAnswersByPet, Boolean(owner));
    const pet = pets[0];

    const submission = await tx.submission.create({
      data: {
        customerId: customer.id,
        petId: pet.id,
        holdExpiresAt: new Date(now.getTime() + settings.holdHours * 3600000),
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
            petSnapshot: petSnapshots[
              index
            ] as unknown as Prisma.InputJsonValue,
            prescreenAnswers: prescreenAnswersByPet[
              index
            ] as Prisma.InputJsonValue,
            prescreenNotes:
              index === 0
                ? data.prescreenNotes?.trim() || null
                : data.secondPrescreenNotes?.trim() || null,
            quotedBreakdown: quote.dogs[
              index
            ] as unknown as Prisma.InputJsonValue,
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
    await lockCapacity(tx);
    const current = await tx.submission.findUnique({
      where: { id: options.submissionId },
      include: {
        customer: true,
        payments: true,
        pet: true,
        submissionPets: { orderBy: { position: "asc" } },
      },
    });

    if (!current) {
      throw new Error("Submission not found");
    }

    await lockCustomerProfile(tx, current.customerId);
    const activeCustomer = await tx.customer.findUniqueOrThrow({ where: { id: current.customerId } });
    if (activeCustomer.deactivatedAt) throw new BookingConflict("This account is deactivated. Contact us to restore access.");

    if (
      current.status === SubmissionStatus.REJECTED ||
      current.status === SubmissionStatus.CANCELLED
    ) {
      throw new Error("This submission can no longer be edited");
    }

    if (current.customer.email !== customerSnapshot.email)
      throw new BookingConflict(
        "Use the original booking email. Contact us to change the booking owner.",
      );
    await assertCapacity(
      tx,
      dropoffAt,
      pickupAt,
      petSnapshots.length,
      current.id,
    );
    const settings = await getSettings(tx);
    const holdExpiresAt =
      current.holdExpiresAt === null ||
      verifiedAmount(current) >= depositDue(quote.totalPrice)
        ? current.holdExpiresAt
        : new Date(now.getTime() + settings.holdHours * 3600000);

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
        ...(current.customer.phone !== customerSnapshot.phone
          ? { smsMarketingOptIn: false }
          : {}),
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

    const pets = await saveBookingPets(tx, customer.id, options.data, petSnapshots, prescreenAnswersByPet, true);
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
        holdExpiresAt,
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
        prescreenNotes:
          index === 0
            ? options.data.prescreenNotes?.trim() || null
            : options.data.secondPrescreenNotes?.trim() || null,
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
