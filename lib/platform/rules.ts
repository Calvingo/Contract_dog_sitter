import { DEPOSIT_PERCENT } from "../pricing";
// Dates are boarding-site calendar dates, independent of the browser's time zone.
// Existing submission timestamps use UTC wall-clock values in production.
export const DEFAULT_SETTINGS = {
  defaultCapacity: 17,
  holdHours: 24,
  includePickupDay: true,
  zelleRecipient: "",
  zelleName: "",
  venmoUsername: "",
  venmoName: "",
};
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) &&
    dateKey(new Date(`${value}T00:00:00Z`)) === value
  );
}
export function dateRange(start: string, end: string): string[] {
  if (!validDate(start) || !validDate(end) || end < start)
    throw new Error("Choose a valid date range.");
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (days > 366) throw new Error("Choose a date range of at most one year.");
  return Array.from({ length: days + 1 }, (_, i) =>
    dateKey(new Date(Date.parse(start) + i * 86400000)),
  );
}
export function stayDates(
  start: Date,
  end: Date,
  includePickupDay: boolean,
): string[] {
  const days = dateRange(dateKey(start), dateKey(end));
  return !includePickupDay && days.length > 1 ? days.slice(0, -1) : days;
}
export function depositDue(total: number): number {
  return Math.round(total * DEPOSIT_PERCENT) / 100;
}
export type OccupancyBooking = {
  id: string;
  status: string;
  dropoffAt: Date;
  pickupAt: Date;
  holdExpiresAt: Date | null;
  quotedTotal: { toString(): string } | number;
  submissionPets: unknown[];
  payments: { status: string; amount: { toString(): string } | number }[];
};
export function verifiedAmount(
  booking: Pick<OccupancyBooking, "payments">,
): number {
  return (
    Math.round(
      booking.payments
        .filter((p) => p.status === "VERIFIED")
        .reduce((sum, p) => sum + Number(p.amount), 0) * 100,
    ) / 100
  );
}
export function reservesCapacity(
  booking: OccupancyBooking,
  now = new Date(),
): boolean {
  if (["CANCELLED", "REJECTED"].includes(booking.status)) return false;
  // A null deadline preserves legacy reservations until an admin reviews them.
  return (
    !booking.holdExpiresAt ||
    booking.holdExpiresAt > now ||
    (verifiedAmount(booking) > 0 &&
      verifiedAmount(booking) >= depositDue(Number(booking.quotedTotal)))
  );
}
export function occupancyByDay(
  bookings: OccupancyBooking[],
  includePickupDay: boolean,
  now = new Date(),
): Map<string, number> {
  const result = new Map<string, number>();
  for (const booking of bookings) {
    if (!reservesCapacity(booking, now)) continue;
    for (const date of stayDates(
      booking.dropoffAt,
      booking.pickupAt,
      includePickupDay,
    )) {
      result.set(
        date,
        (result.get(date) ?? 0) + Math.max(1, booking.submissionPets.length),
      );
    }
  }
  return result;
}
export function bookingLabel(booking: OccupancyBooking): string {
  if (booking.status === "CANCELLED") return "Cancelled";
  if (booking.status === "REJECTED") return "Not approved";
  if (!reservesCapacity(booking)) return "Hold expired — contact us";
  if (booking.status === "ACCEPTED") {
    if (!booking.holdExpiresAt && booking.payments.length === 0)
      return "Confirmed — existing booking";
    if (verifiedAmount(booking) >= depositDue(Number(booking.quotedTotal)))
      return "Confirmed";
    if (booking.payments.some((p) => p.status === "REPORTED"))
      return "Payment under review";
    return "Approved — deposit due";
  }
  return booking.status === "MEET_GREET_REQUESTED"
    ? "Meet & greet requested"
    : "Awaiting review";
}
