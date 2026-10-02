import { notFound } from "next/navigation";
import Link from "next/link";
import { CustomerShell } from "@/components/PlatformShell";
import { ActionForm } from "@/components/ActionForm";
import { requireCustomer } from "@/lib/platform/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/platform/capacity";
import { getVenmoDetails } from "@/lib/platform/payment-details";
import {
  bookingLabel,
  depositDue,
  reservesCapacity,
  verifiedAmount,
} from "@/lib/platform/rules";
import { editBooking, reportPayment, requestCancellation } from "../../actions";
export default async function BookingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ emailWarning?: string; emailPending?: string }>;
}) {
  const customer = await requireCustomer();
  const notification = await searchParams;
  const { id } = await params;
  const booking = await prisma.submission.findFirst({
    where: { id, customerId: customer.id },
    include: {
      pet: true,
      submissionPets: { orderBy: { position: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!booking) notFound();
  const settings = await getSettings();
  const active = !["CANCELLED", "REJECTED"].includes(booking.status);
  const remaining = Math.max(
    0,
    depositDue(Number(booking.quotedTotal)) - verifiedAmount(booking),
  );
  const legacyPayment =
    booking.holdExpiresAt === null && booking.payments.length === 0;
  const canPay =
    !legacyPayment &&
    booking.status === "ACCEPTED" &&
    reservesCapacity(booking) &&
    remaining > 0 &&
    !booking.payments.some((p) => p.status === "REPORTED");
  const zelle = Boolean(settings.zelleName && settings.zelleRecipient),
    venmo = getVenmoDetails(settings);
  const dogNames =
    booking.submissionPets
      .map((p) => {
        const snapshot = p.petSnapshot as { name?: string };
        return snapshot.name || "Dog";
      })
      .join(" & ") || booking.pet.name;
  const format = (date: Date) =>
    date.toLocaleString("en-US", {
      timeZone: "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    });
  return (
    <CustomerShell
      name={customer.firstName}
      title={`${dogNames}’s stay`}
      subtitle={`Booking reference: ${booking.id}`}
    >
      <Link href="/account" className="text-link">
        ← All bookings
      </Link>
      {notification.emailWarning && (
        <p role="status" className="notice">
          Your booking was saved, but the email notification could not be
          delivered. You can track it here.
        </p>
      )}
      {!notification.emailWarning && notification.emailPending && (
        <p role="status" className="notice">
          Your request has been saved. Your confirmation email and signed PDF
          will arrive shortly. You do not need to submit again.
        </p>
      )}
      <section className="metric-grid">
        <div className="panel">
          <span>Booking status</span>
          <h3>{bookingLabel(booking)}</h3>
        </div>
        <div className="panel">
          <span>Drop-off · Pacific local time</span>
          <h3>{format(booking.dropoffAt)}</h3>
        </div>
        <div className="panel">
          <span>Pick-up · Pacific local time</span>
          <h3>{format(booking.pickupAt)}</h3>
        </div>
      </section>
      <div className="detail-grid">
        <section className="panel">
          <p className="eyebrow">PAYMENT</p>
          <h2>A few details before their stay.</h2>
          {legacyPayment ? (
            <p className="notice">
              This reservation was made before online payment tracking. Please
              contact us about its payment balance; this page does not request
              another deposit.
            </p>
          ) : (
            <dl className="summary-list">
              <div>
                <dt>Estimated stay total</dt>
                <dd>${Number(booking.quotedTotal).toFixed(2)}</dd>
              </div>
              <div>
                <dt>20% deposit</dt>
                <dd>${depositDue(Number(booking.quotedTotal)).toFixed(2)}</dd>
              </div>
              <div>
                <dt>Verified payments</dt>
                <dd>${verifiedAmount(booking).toFixed(2)}</dd>
              </div>
              <div>
                <dt>Deposit remaining</dt>
                <dd>${remaining.toFixed(2)}</dd>
              </div>
            </dl>
          )}
          {booking.holdExpiresAt && active && remaining > 0 && (
            <p className="notice">
              Space is held until{" "}
              {booking.holdExpiresAt.toLocaleString("en-US", {
                timeZone: "America/Los_Angeles",
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              Pacific time. Contact us if you need more time.
            </p>
          )}
          {canPay ? (
            <>
              {zelle || venmo ? (
                <>
                  <h3>Payment details</h3>
                  <p>
                    Transfer <strong>${remaining.toFixed(2)}</strong> using one
                    of the accounts below. Verify the recipient before sending.
                  </p>
                  <p className="notice">
                    <strong>Payment note:</strong> Enter only <strong>friends</strong>
                    {" "}in the transfer note. Do not include “boarding”, “deposit”,
                    or your booking reference.
                  </p>
                  <div className="payment-options">
                    {zelle && (
                      <div>
                        <h3>Zelle</h3>
                        <p>{settings.zelleName}</p>
                        <code>{settings.zelleRecipient}</code>
                      </div>
                    )}
                    {venmo && (
                      <div>
                        <h3>Venmo</h3>
                        <p>{venmo.name}</p>
                        {venmo.profileUrl ? (
                          <a
                            className="text-link"
                            href={venmo.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            @{venmo.recipient} ↗
                          </a>
                        ) : (
                          <code>{venmo.recipient}</code>
                        )}
                      </div>
                    )}
                  </div>
                  <ActionForm
                    action={reportPayment}
                    label="I’ve sent the payment"
                  >
                    <input type="hidden" name="id" value={booking.id} />
                    <p className="small">
                      After transferring, use the button below to let us know.
                      We check the actual transfer before confirming your deposit.
                    </p>
                  </ActionForm>
                </>
              ) : (
                <p className="notice">
                  Payment instructions are being prepared. Please contact us
                  before transferring money.
                </p>
              )}
            </>
          ) : (
            <p className="notice">
              {!active
                ? "This booking is closed. Please contact us about any payment or refund."
                : legacyPayment
                  ? "Your existing reservation remains on file. Contact us for any payment questions."
                  : booking.status !== "ACCEPTED"
                    ? "We’ll review your request before asking you to pay."
                    : remaining === 0
                      ? "Your deposit has been verified."
                      : booking.payments.some((p) => p.status === "REPORTED")
                        ? "We have your payment report and are checking the transfer."
                        : "The hold has expired. Please contact us before sending money."}
            </p>
          )}
          {booking.payments.length > 0 && (
            <>
              <h3>Payment history</h3>
              {booking.payments.map((p) => (
                <div key={p.id} className="history-item">
                  <span>
                    {p.method === "TRANSFER" ? "Transfer" : p.method} · ${Number(p.amount).toFixed(2)}
                  </span>
                  <span className="pill">{p.status.replaceAll("_", " ")}</span>
                  {p.reviewNote && <p className="small">{p.reviewNote}</p>}
                </div>
              ))}
            </>
          )}
        </section>
        <aside className="panel">
          <h2>Plans changed?</h2>
          <p>
            Changes are reviewed again and depend on availability. Refunds are
            handled by our team.
          </p>
          {active ? (
            <>
              <form action={editBooking}>
                <input type="hidden" name="id" value={booking.id} />
                <button className="button secondary">
                  Request booking changes
                </button>
              </form>
              {booking.cancellationRequestedAt ? (
                <p className="notice">
                  Your cancellation request is awaiting review. The booking
                  remains active until our team confirms cancellation.
                </p>
              ) : (
                <section className="mt-6">
                  <h3>Request cancellation</h3>
                  <ActionForm
                    action={requestCancellation}
                    label="Send cancellation request"
                  >
                    <input type="hidden" name="id" value={booking.id} />
                    <label>
                      Reason
                      <textarea
                        name="reason"
                        required
                        maxLength={1000}
                        rows={3}
                      />
                    </label>
                  </ActionForm>
                </section>
              )}
            </>
          ) : (
            <p className="notice">
              This booking is closed. Please check payment history or contact us
              about any outstanding refund.
            </p>
          )}
        </aside>
      </div>
    </CustomerShell>
  );
}
