import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
export const BOOKING_UNAVAILABLE_MESSAGE = "We are unable to accept a booking request at this time. Please contact us for assistance.";
export async function bookingEmailAllowed(email: string, db: Pick<Prisma.TransactionClient, "bookingBlocklist"> = prisma) {
  const entry = await db.bookingBlocklist.findUnique({where:{email:email.trim().toLowerCase()}});
  return !entry?.blocked;
}
