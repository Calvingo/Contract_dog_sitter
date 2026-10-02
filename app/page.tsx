import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicNav } from "@/components/PlatformShell";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ editToken?: string; returning?: string }>;
}) {
  const params = await searchParams;
  if (params.editToken)
    redirect(`/book?editToken=${encodeURIComponent(params.editToken)}`);
  if (params.returning === "ok") redirect("/account");
  return (
    <main className="platform-wrap">
      <PublicNav />
      <section className="home-hero">
        <div>
          <p className="eyebrow">SILICON PAWS RETREAT · DOG BOARDING</p>
          <h1>
            Their happy place.
            <br />
            <em>Your peace of mind.</em>
          </h1>
          <p>
            A familiar place to stay, with a little less planning on your plate.
            Find available dates, tell us about your dog, and keep every detail
            together.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/book">
              Plan their stay →
            </Link>
            <Link className="button secondary" href="/account">
              View my bookings
            </Link>
          </div>
          <div className="hero-notes">
            <span>Personal dog profiles</span>
            <span>Live availability</span>
            <span>Thoughtful care</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-sun" />
          <div className="dog-portrait">
            <div className="dog-ear left" />
            <div className="dog-ear right" />
            <div className="dog-face">
              <i />
              <i />
              <b />
              <span />
            </div>
          </div>
          <div className="art-caption">A stay worth wagging about.</div>
          <div className="art-flower">✳</div>
        </div>
      </section>
      <section className="home-planning">
        <div>
          <p className="eyebrow">A SIMPLE WAY TO BOOK</p>
          <h2>
            More tail wags.
            <br />
            Less back-and-forth.
          </h2>
          <ol className="steps">
            <li>
              <span>01</span>
              <div>
                <h3>Meet your pack</h3>
                <p>Sign in and save your dog’s profile.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Choose their dates</h3>
                <p>See available space and submit your stay for review.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Make it official</h3>
                <p>
                  Once approved, send your deposit. We’ll verify it and confirm
                  your booking.
                </p>
              </div>
            </li>
          </ol>
          <Link href="/book" className="text-link">
            Start a booking →
          </Link>
        </div>
        <AvailabilityCalendar />
      </section>
      <footer className="public-footer">
        <span>Silicon Paws Retreat · A little home away from home.</span>
        <Link href="/admin/login">Admin sign in</Link>
      </footer>
    </main>
  );
}
