import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { acceptanceImpact, acceptanceSummary, getSettings } from "@/lib/platform/capacity";
import { validDate } from "@/lib/platform/rules";
import { waitingListWhere } from "@/lib/services/waitlist-alerts";
import { bookingDecisionActions } from "./booking-actions";

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

export type BookingRequestParams = { q?: string | string[]; page?: string | string[]; view?: string | string[]; date?: string | string[] };

export async function listBookingRequests(params: BookingRequestParams) {
  const query = typeof params.q === "string" ? params.q.slice(0, 100).trim().replace(/\s+/g, " ") : "";
  const requested = typeof params.page === "string" ? Number(params.page) : 1;
  const view = params.view === "waitlist" ? "waitlist" : "all";
  const date = typeof params.date === "string" && validDate(params.date) ? params.date : "";

  return prisma.$transaction(async tx => {
    const settings = await getSettings(tx);
    const start = date ? new Date(`${date}T00:00:00Z`) : null;
    const end = date ? new Date(`${date}T23:59:59.999Z`) : null;
    const dateFilter: Prisma.SubmissionWhereInput = start && end ? {
      dropoffAt: { lte: end },
      ...(settings.includePickupDay ? { pickupAt: { gte: start } } : { OR: [
        { pickupAt: { gte: new Date(start.getTime() + 86400000) } },
        { dropoffAt: { gte: start } },
      ] }),
    } : {};
    const base = { AND: [searchByName(query), dateFilter] };
    const where: Prisma.SubmissionWhereInput = { AND: [base, view === "waitlist" ? waitingListWhere : {}] };
    const waitlistCount = await tx.submission.count({ where: { AND: [base, waitingListWhere] } });
    const total = await tx.submission.count({ where });
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Number.isSafeInteger(requested) ? Math.max(1, Math.min(pages, requested)) : 1;
    const skip = (page - 1) * PAGE_SIZE;
    const pending = await tx.submission.aggregate({
      where: { ...base, waitlistedAt: null, status: { in: ["PENDING", "NEEDS_REVIEW"] } },
      _count: true,
      _sum: { quotedTotal: true },
    });
    const submissions = await tx.submission.findMany({
      where,
      orderBy: view === "waitlist" ? [{ waitlistedAt: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }],
      skip, take: PAGE_SIZE,
      select: {
        id: true, status: true, revision: true, dropoffAt: true, pickupAt: true,
        waitlistedAt: true, waitlistDates: true, customerSnapshot: true,
        acceptedDropoffAt: true, acceptedPickupAt: true, acceptedDogs: true,
        quotedTotal: true, cancellationRequestedAt: true,
        customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
        pet: { select: { name: true, breed: true, weightLb: true } },
        submissionPets: {
          orderBy: { position: "asc" },
          select: { pet: { select: { name: true, breed: true, weightLb: true } } },
        },
        emailLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    });
    const rows = await Promise.all(submissions.map(async submission => ({
      ...submission,
      contactPhone: (submission.customerSnapshot as { phone?: string } | null)?.phone || submission.customer.phone,
      capacitySummary: bookingDecisionActions(submission.status).includes("accept")
        ? acceptanceSummary(await acceptanceImpact(tx, submission)) : undefined,
    })));
    return { query, view, date, waitlistCount, submissions: rows, total, pages, page, skip, pending };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
