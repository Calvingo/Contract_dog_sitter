import Link from "next/link";
import { CustomerShell } from "@/components/PlatformShell";
import { requireCustomer } from "@/lib/platform/auth";
import { prisma } from "@/lib/db";
import { bookingLabel, dateKey, reservesCapacity } from "@/lib/platform/rules";
import { submissionDogNames } from "@/lib/submission-pets";
export default async function AccountPage() {
  const customer = await requireCustomer();
  const [bookings, dogs] = await Promise.all([
    prisma.submission.findMany({
      where: { customerId: customer.id },
      orderBy: { dropoffAt: "desc" },
      include: {
        pet: true,
        submissionPets: {
          orderBy: { position: "asc" },
          include: { pet: true },
        },
        payments: true,
      },
    }),
    prisma.pet.count({ where: { customerId: customer.id } }),
  ]);
  const upcoming = bookings.filter(
    (b) => b.pickupAt > new Date() && reservesCapacity(b),
  );
  return (
    <CustomerShell
      name={customer.firstName}
      title="A little planning. A happy stay."
      subtitle="Your bookings, dogs, and everything you need for their next visit."
    >
      <section className="metric-grid">
        <div className="panel">
          <span>Upcoming stays</span>
          <strong>{upcoming.length}</strong>
        </div>
        <div className="panel">
          <span>Dog profiles</span>
          <strong>{dogs}</strong>
        </div>
        <div className="panel">
          <span>Next adventure</span>
          <Link href="/book" className="text-link">
            Find available dates →
          </Link>
        </div>
      </section>
      <section className="section-heading">
        <h2>My bookings</h2>
        <Link href="/book" className="button">
          Book a stay
        </Link>
      </section>
      <div className="booking-grid">
        {bookings.length ? (
          bookings.map((booking) => (
            <Link
              className="panel booking-card"
              key={booking.id}
              href={`/account/bookings/${booking.id}`}
            >
              <span className="pill">{bookingLabel(booking)}</span>
              <h3>
                {submissionDogNames(booking.submissionPets, booking.pet.name)}
              </h3>
              <p>
                {dateKey(booking.dropoffAt)} → {dateKey(booking.pickupAt)}
              </p>
              <div className="card-bottom">
                <span>
                  ${Number(booking.quotedTotal).toFixed(2)} estimated total
                </span>
                <span>View booking →</span>
              </div>
              {booking.cancellationRequestedAt &&
                booking.status !== "CANCELLED" && (
                  <p className="small">Cancellation requested</p>
                )}
            </Link>
          ))
        ) : (
          <div className="panel empty-state">
            <h3>Their next stay starts here.</h3>
            <p>
              Add your dog’s profile, then choose the dates that work for you.
            </p>
            <Link href="/account/dogs" className="button secondary">
              Add my dog
            </Link>
          </div>
        )}
      </div>
    </CustomerShell>
  );
}
