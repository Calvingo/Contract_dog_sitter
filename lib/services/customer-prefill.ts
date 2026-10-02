import { prisma } from "@/lib/db";
import type { PrefillResponse } from "@/lib/booking-prefill";

export async function loadCustomerPrefill(
  customerId: string,
): Promise<PrefillResponse | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      _count: { select: { submissions: true } },
      pets: {
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        include: {
          submissionPets: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              prescreenAnswers: true,
              prescreenNotes: true,
              createdAt: true,
            },
          },
          // Older single-dog bookings can predate the per-dog snapshot table.
          submissions: {
            where: { submissionPets: { none: {} } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              prescreenAnswers: true,
              prescreenNotes: true,
              createdAt: true,
              lastEditedAt: true,
            },
          },
        },
      },
    },
  });
  if (!customer) return null;
  return {
    authenticated: true,
    customer: {
      hasBookedBefore: customer._count.submissions > 0,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      backupContact: customer.backupContact,
      emergencyContactName: customer.emergencyContactName || "",
      emergencyContactPhone: customer.emergencyContactPhone || "",
      wechatId: customer.wechatId || "",
    },
    pets: customer.pets.map((pet) => {
      const snapshot = pet.submissionPets[0];
      const legacy = pet.submissions[0];
      const legacyAt = legacy?.lastEditedAt || legacy?.createdAt;
      const latest =
        legacy && (!snapshot || legacyAt! > snapshot.createdAt)
          ? { ...legacy, createdAt: legacyAt! }
          : snapshot;
      return {
        id: pet.id,
        name: pet.name,
        breed: pet.breed,
        weightLb: pet.weightLb,
        ageYears: pet.ageYears,
        lastPrescreenAnswers: latest?.prescreenAnswers ?? null,
        lastPrescreenNotes: latest?.prescreenNotes || "",
        lastSubmittedAt: latest?.createdAt.toISOString() ?? null,
      };
    }),
  };
}
