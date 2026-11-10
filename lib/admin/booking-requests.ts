import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 25;

function nameContains(text: string) {
  // Prisma's contains uses ILIKE. Treat wildcard characters in a name literally.
  return { contains: text.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" as const };
}

function searchByName(query: string): Prisma.SubmissionWhereInput {
  if (!query) return {};
  const petName = nameContains(query);
  return {
    OR: [
      { customer: { AND: query.split(" ").map(word => {
        const name = nameContains(word);
        return { OR: [{ firstName: name }, { lastName: name }] };
      }) } },
      { pet: { name: petName } },
      { submissionPets: { some: { pet: { name: petName } } } },
    ],
  };
}

export type BookingRequestParams = { q?: string | string[]; page?: string | string[] };

export async function listBookingRequests(params: BookingRequestParams) {
  const query = typeof params.q === "string" ? params.q.slice(0, 100).trim().replace(/\s+/g, " ") : "";
  const requested = typeof params.page === "string" ? Number(params.page) : 1;
  const where = searchByName(query);

  return prisma.$transaction(async tx => {
    const total = await tx.submission.count({ where });
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Number.isSafeInteger(requested) ? Math.max(1, Math.min(pages, requested)) : 1;
    const skip = (page - 1) * PAGE_SIZE;
    const pending = await tx.submission.aggregate({
      where: { ...where, status: { in: ["PENDING", "NEEDS_REVIEW"] } },
      _count: true,
      _sum: { quotedTotal: true },
    });
    const submissions = await tx.submission.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip, take: PAGE_SIZE,
      select: {
        id: true, status: true, revision: true, dropoffAt: true, pickupAt: true,
        quotedTotal: true, cancellationRequestedAt: true,
        customer: { select: { firstName: true, lastName: true, email: true } },
        pet: { select: { name: true, breed: true, weightLb: true } },
        submissionPets: {
          orderBy: { position: "asc" },
          select: { pet: { select: { name: true, breed: true, weightLb: true } } },
        },
        emailLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    });
    return { query, submissions, total, pages, page, skip, pending };
  }, { isolationLevel: "RepeatableRead" });
}
