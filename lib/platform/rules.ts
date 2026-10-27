import { DEPOSIT_PERCENT } from "../pricing";
// Dates are boarding-site calendar dates, independent of the browser's time zone.
// Existing submission timestamps use UTC wall-clock values in production.
export const DEFAULT_SETTINGS = {
  defaultCapacity: 17,
  holdHours: 72,
  includePickupDay: true,
  zelleRecipient: "",
  zelleName: "",
  venmoUsername: "",
  venmoName: "",
};
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
export function todayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
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
  acceptedDropoffAt?: Date | null;
  acceptedPickupAt?: Date | null;
  acceptedDogs?: number | null;
  id: string;
  status: string;
  dropoffAt: Date;
  pickupAt: Date;
  submissionPets: unknown[];
};
type PaymentRecord = { status: string; amount: {toString(): string} | number; refundedAmount?: {toString():string} | number };
// A notification is a record of the customer's claim, never proof of receipt.
export function recordedPaymentAmount(booking: {payments: PaymentRecord[]}): number {
  return Math.round(booking.payments.filter(p => ["REPORTED","VERIFIED","REFUNDED"].includes(p.status)).reduce((sum,p) => sum + Math.max(0, Number(p.amount) - (p.status === "REFUNDED" ? Number(p.refundedAmount ?? p.amount) : 0)),0)*100)/100;
}

export function verifiedAmount(
  booking: {payments: PaymentRecord[]},
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
  void now;
  if (booking.status === "CANCELLED") return false;
  return Boolean(booking.acceptedDropoffAt && booking.acceptedPickupAt) || booking.status === "ACCEPTED";
}
export function acceptedStay(booking: OccupancyBooking) {
  return {
    dropoffAt: booking.acceptedDropoffAt ?? booking.dropoffAt,
    pickupAt: booking.acceptedPickupAt ?? booking.pickupAt,
    dogs: booking.acceptedDogs ?? Math.max(1, booking.submissionPets.length),
  };
}

export function occupancyByDay(
  bookings: OccupancyBooking[],
  includePickupDay: boolean,
  now = new Date(),
): Map<string, number> {
  const result = new Map<string, number>();
  const seen = new Set<string>();
  for (const booking of bookings) {
    if (seen.has(booking.id)) continue;
    seen.add(booking.id);
    if (!reservesCapacity(booking, now)) continue;
    for (const date of stayDates(
      acceptedStay(booking).dropoffAt,
      acceptedStay(booking).pickupAt,
      includePickupDay,
    )) {
      result.set(
        date,
        (result.get(date) ?? 0) + acceptedStay(booking).dogs,
      );
    }
  }
  return result;
}
export function bookingLabel(booking: OccupancyBooking): string {
  if (booking.status === "CANCELLED") return "Cancelled";
  if (booking.status === "ACCEPTED") return "Confirmed";
  if (booking.status === "REJECTED" && reservesCapacity(booking)) return "Confirmed stay — proposed changes declined";
  if (reservesCapacity(booking)) return "Confirmed stay — changes awaiting review";
  if (booking.status === "REJECTED") return "Not approved";
  return booking.status === "MEET_GREET_REQUESTED"
    ? "Meet & greet requested"
    : "Awaiting review";
}
