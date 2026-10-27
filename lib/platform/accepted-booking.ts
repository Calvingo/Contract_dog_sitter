import { acceptedStay, type OccupancyBooking } from "./rules";

type Version = {
  revision: number;
  petSnapshot: unknown;
  petsSnapshot: unknown;
  quotedTotal: { toString(): string } | number;
};

function petName(snapshot: unknown): string {
  if (snapshot && typeof snapshot === "object" && "name" in snapshot && typeof snapshot.name === "string")
    return snapshot.name;
  return "Dog";
}

// The displayed dog names must refer to the same version as the capacity count.
export function acceptedBookingDetails(booking: OccupancyBooking & {
  revision: number;
  acceptedRevision?: number | null;
  petSnapshot: unknown;
  quotedTotal: { toString(): string } | number;
  submissionPets: { petSnapshot: unknown }[];
  revisions: Version[];
}) {
  const previous = booking.acceptedRevision !== booking.revision
    ? booking.revisions.find((row) => row.revision === booking.acceptedRevision)
    : undefined;
  const pets = previous
    ? Array.isArray(previous.petsSnapshot) ? previous.petsSnapshot : []
    : booking.submissionPets;
  const names = pets.map((row: { petSnapshot?: unknown }) => petName(row?.petSnapshot));
  return {
    ...acceptedStay(booking),
    quotedTotal: Number(previous?.quotedTotal ?? booking.quotedTotal),
    dogNames: names.join(" & ") || petName(previous?.petSnapshot ?? booking.petSnapshot),
  };
}
