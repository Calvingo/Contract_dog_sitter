import type { Prisma, RewardState } from "@prisma/client";
import { acceptedStay, type OccupancyBooking } from "./rules";

// Booking timestamps encode Pacific wall-clock values as UTC (see parseDateTime).
const pacificClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
export function pacificWallTime(now = new Date()) {
  return new Date(pacificClock.format(now).replace(" ", "T") + "Z");
}

type LoyaltyBooking = OccupancyBooking & {
  submissionPets: { lateDropoffAt?: Date | null; earlyPickupAt?: Date | null }[];
};

// Loyalty credit keeps its original duration rounding so pricing changes do not
// retroactively change earned rewards: short stays can earn half a day, and an
// eight-hour remainder earns a full day.
function calculateLoyaltyDays(totalHours: number): number {
  if (totalHours <= 0) return 0;
  const fullDays = Math.floor(totalHours / 24);
  const remainderHours = totalHours % 24;
  const extra = remainderHours <= 2 ? 0 : remainderHours < 8 ? 0.5 : 1;
  return Math.max(0.5, fullDays + extra);
}

function stayCredit(booking: LoyaltyBooking) {
  const stay = acceptedStay(booking);
  const pickups = Array.from({ length: stay.dogs }, (_, i) =>
    booking.submissionPets[i]?.earlyPickupAt ?? stay.pickupAt);
  const endsAt = Math.max(...pickups.map(end => end.getTime()));
  const days = pickups.reduce((sum, end, index) => {
    const start = booking.submissionPets[index]?.lateDropoffAt ?? stay.dropoffAt;
    return sum + calculateLoyaltyDays((end.getTime() - start.getTime()) / 3600000);
  }, 0);
  return { endsAt, days };
}

export function completedDogDays(booking: LoyaltyBooking, wallTime: Date) {
  if (booking.status !== "ACCEPTED") return 0;
  const credit = stayCredit(booking);
  return credit.endsAt <= wallTime.getTime() ? credit.days : 0;
}

export function rewardBalance(days: number, used: number, held: number) {
  const earned = Math.floor(days / 100);
  return {
    days,
    available: Math.max(0, earned - used - held),
    daysToNext: (Math.max(earned, used) + 1) * 100 - days,
  };
}

export async function loadRewards(db: Pick<Prisma.TransactionClient, "submission">, customerId: string) {
  const rows = await db.submission.findMany({
    where: { customerId, status: { not: "CANCELLED" }, OR: [
      { status: "ACCEPTED" }, { rewardState: { in: ["USED", "HELD"] } },
    ] },
    select: {
      id: true, status: true, rewardState: true, dropoffAt: true, pickupAt: true,
      acceptedDropoffAt: true, acceptedPickupAt: true, acceptedDogs: true,
      submissionPets: { select: { lateDropoffAt: true, earlyPickupAt: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const now = new Date();
  const wallTime = pacificWallTime(now).getTime();
  let days = 0;
  let nextPickup = Infinity;
  for (const row of rows) {
    if (row.status !== "ACCEPTED") continue;
    const credit = stayCredit(row);
    if (credit.endsAt <= wallTime) days += credit.days;
    else nextPickup = Math.min(nextPickup, credit.endsAt);
  }
  // The next check is at pickup, or hourly across a possible DST transition.
  const nextCheckAt = Number.isFinite(nextPickup)
    ? now.getTime() + Math.min(nextPickup - wallTime, 3600000) + 1000
    : null;
  const used = rows.filter(row => row.rewardState === "USED").length;
  const held = rows.filter(row => row.rewardState === "HELD" && row.status !== "REJECTED");
  const slots = Math.max(0, Math.floor(days / 100) - used);
  return {
    nextCheckAt,
    balance: rewardBalance(days, used, Math.min(slots, held.length)),
    validHolds: held.slice(0, slots).map(row => row.id),
    excessHolds: [...held.slice(slots), ...rows.filter(row => row.rewardState === "HELD" && row.status === "REJECTED")],
  };
}

export function discounted(state: RewardState) {
  return state === "USED" || state === "HELD";
}
