import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_SETTINGS,
  dateRange,
  occupancyByDay,
  stayDates,
} from "./rules";

export class BookingConflict extends Error {}
// All capacity-changing writes take the same transaction-scoped Postgres lock.
// The lock is obtained BEFORE reading occupancy, including admin/email decisions.
export async function lockCapacity(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(17317001)::text`;
}
export async function getSettings(
  db: Pick<Prisma.TransactionClient, "platformSettings"> = prisma,
) {
  return (
    (await db.platformSettings.findUnique({ where: { id: "default" } })) ??
    DEFAULT_SETTINGS
  );
}
export async function availability(
  start: string,
  end: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
  excludeId?: string,
) {
  const dates = dateRange(start, end);
  const settings = await getSettings(db);
  const [bookings, overrides] = await Promise.all([
    db.submission.findMany({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        dropoffAt: { lte: new Date(`${end}T23:59:59.999Z`) },
        pickupAt: { gte: new Date(`${start}T00:00:00Z`) },
        status: { notIn: ["CANCELLED", "REJECTED"] },
      },
      include: { submissionPets: { select: { id: true } }, payments: true },
    }),
    db.dailyCapacity.findMany({ where: { date: { gte: start, lte: end } } }),
  ]);
  const counts = occupancyByDay(bookings, settings.includePickupDay);
  const capacities = new Map(overrides.map((row) => [row.date, row]));
  return {
    includePickupDay: settings.includePickupDay,
    days: dates.map((date) => {
      const override = capacities.get(date);
      const capacity = override?.capacity ?? settings.defaultCapacity;
      const closed = Boolean(override?.blocked) || capacity === 0;
      const occupied = counts.get(date) ?? 0;
      return {
        date,
        capacity,
        occupied,
        remaining: closed ? 0 : Math.max(0, capacity - occupied),
        closed,
        overCapacity: occupied > capacity,
      };
    }),
  };
}
export async function assertCapacity(
  tx: Prisma.TransactionClient,
  start: Date,
  end: Date,
  dogs: number,
  excludeId?: string,
) {
  const settings = await getSettings(tx);
  const days = stayDates(start, end, settings.includePickupDay);
  const result = await availability(days[0], days.at(-1)!, tx, excludeId);
  const unavailable = result.days.find((day) => day.remaining < dogs);
  if (unavailable)
    throw new BookingConflict(
      `There is not enough space for ${dogs} dog${dogs === 1 ? "" : "s"} on ${unavailable.date}. Please choose different dates.`,
    );
}

export async function prepareStatusChange(
  tx: Prisma.TransactionClient,
  id: string,
  status: string,
  expectedRevision?: number,
  expectedStatus?: string,
) {
  await lockCapacity(tx);
  const current = await tx.submission.findUnique({
    where: { id },
    include: { submissionPets: true },
  });
  if (!current) throw new BookingConflict("Booking not found.");
  if (expectedStatus && current.status !== expectedStatus)
    throw new BookingConflict(
      "This booking was already processed. Refresh before continuing.",
    );
  if (expectedRevision !== undefined && current.revision !== expectedRevision)
    throw new BookingConflict(
      "This booking changed. Refresh and review the latest details.",
    );
  if (!["REJECTED", "CANCELLED"].includes(status)) {
    if (["CANCELLED", "REJECTED"].includes(current.status))
      throw new BookingConflict(
        "This booking is closed. Create a new request instead.",
      );
    await assertCapacity(
      tx,
      current.dropoffAt,
      current.pickupAt,
      Math.max(1, current.submissionPets.length),
      current.id,
    );
  }
  const settings = await getSettings(tx);
  return {
    holdExpiresAt:
      current.holdExpiresAt === null
        ? null
        : new Date(Date.now() + settings.holdHours * 3600000),
  };
}
