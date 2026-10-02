import { prisma } from "@/lib/db";
import { dateRange, reservesCapacity } from "./rules";
export type CustomerFilters = {
  q?: string;
  channel?: string;
  start?: string;
  end?: string;
};
export async function customerAudience(filters: CustomerFilters) {
  const q = (filters.q || "").trim().slice(0, 100);
  if (filters.start || filters.end)
    dateRange(filters.start || "", filters.end || "");
  const channel = filters.channel || "all";
  if (!["all", "email"].includes(channel)) {
    throw new Error("Only email promotion audiences are supported.");
  }
  const suppressions =
    channel === "email"
      ? await prisma.marketingSuppression.findMany({ select: { email: true } })
      : [];
  const customers = await prisma.customer.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              {
                pets: {
                  some: { name: { contains: q, mode: "insensitive" as const } },
                },
              },
            ],
          }
        : {}),
      ...(channel === "email"
        ? {
            emailMarketingOptIn: true,
            email: { notIn: suppressions.map((s) => s.email) },
          }
        : {}),
    },
    include: {
      pets: { orderBy: { name: "asc" } },
      submissions: {
        ...(filters.start && filters.end
          ? {
              where: {
                dropoffAt: { lte: new Date(`${filters.end}T23:59:59.999Z`) },
                pickupAt: { gte: new Date(`${filters.start}T00:00:00Z`) },
              },
            }
          : {}),
        include: { submissionPets: true, payments: true },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const excluded = filters.start
    ? customers.filter((c) => c.submissions.some((s) => reservesCapacity(s)))
    : [];
  const excludedIds = new Set(excluded.map((c) => c.id));
  return {
    customers: customers.filter((c) => !excludedIds.has(c.id)),
    excludedCount: excluded.length,
    excludedCustomers: excluded,
    subscribedCount: customers.length,
  };
}
