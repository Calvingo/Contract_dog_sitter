import { reconcileRewardHolds } from "./booking-rewards";
import { prisma } from "@/lib/db";
import { sendMail, parseAdminEmails, BRAND_NAME, getEnv } from "@/lib/mailer";
import { logEmail } from "@/lib/email-log";
import { getAppBaseUrl } from "@/lib/app-url";
import { lockCapacity } from "@/lib/platform/capacity";
import { acceptedBookingDetails } from "@/lib/platform/accepted-booking";
import type { SubmissionStatus } from "@prisma/client";
import { archiveSubmissionRevision } from "@/lib/services/submission-revision";
import { after } from "next/server";

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export async function cancelAdminBooking(id: string, revision: number, expectedStatus: SubmissionStatus) {
  return prisma.$transaction(async (tx) => {
    await lockCapacity(tx);
    const current = await tx.submission.findUniqueOrThrow({
      where: { id },
      include: { customer: true, submissionPets: { orderBy: { position: "asc" } }, revisions: true },
    });
    if (current.status === "CANCELLED") throw new Error("This order is already cancelled.");
    if (current.revision !== revision || current.status !== expectedStatus) {
      throw new Error("This booking changed. Refresh before cancelling.");
    }
    await archiveSubmissionRevision(tx, current);
    await tx.submission.update({
      where: { id },
      data: { status: "CANCELLED", rewardState: "NONE", revision: { increment: 1 }, lastEditedAt: new Date(), holdExpiresAt: null },
    });
    await reconcileRewardHolds(tx, current.customerId);
    // Keep accepted terms, quoted amounts, payments and the customer's request as history.
    return current;
  });
}

type CancelledBooking = Awaited<ReturnType<typeof cancelAdminBooking>>;

export async function scheduleCancellationConfirmation(booking: CancelledBooking) {
  try {
    after(async () => { await sendCancellationConfirmation(booking); });
    return true;
  } catch (error) {
    // Cancellation is already committed; surface a notification-only failure.
    try {
      await logEmail({
        submissionId: booking.id, type: "CUSTOMER_RECEIPT", to: booking.customer.email,
        subject: `${BRAND_NAME} — Booking cancelled`, status: "FAILED",
        error: `Unable to schedule cancellation email: ${error instanceof Error ? error.message : String(error)}`,
      });
    } catch (logError) {
      console.error("Order cancelled; could not log email scheduling failure", { id: booking.id, logError });
    }
    return false;
  }
}

async function sendCancellationConfirmation(booking: CancelledBooking) {
  const id = booking.id;
  const to = booking.customer.email;
  const subject = `${BRAND_NAME} — Booking cancelled`;
  let deliveryError: unknown;
  try {
    const stay = acceptedBookingDetails(booking);
    const schedule = (date: Date) => date.toISOString().slice(0, 16).replace("T", " ");
    await sendMail({
      from: `"${BRAND_NAME}" <${getEnv("GMAIL_USER")}>`,
      to,
      subject,
      html: `<h2>Your booking has been cancelled</h2>
        <p>Hi ${escape(booking.customer.firstName)}, our team has confirmed the cancellation of your booking.</p>
        <p><strong>Booking ID:</strong> ${escape(id)}</p>
        <p><strong>Dogs:</strong> ${escape(stay.dogNames)}</p>
        <p><strong>Stay:</strong> ${escape(schedule(stay.dropoffAt))} – ${escape(schedule(stay.pickupAt))} (California local time)</p>
        <p>The booking is no longer active. Any refund is handled separately under your signed booking terms. This email does not confirm a refund.</p>`,
    });
  } catch (error) {
    deliveryError = error;
  }
  try {
    await logEmail({
      submissionId: id, type: "CUSTOMER_RECEIPT", to, subject,
      status: deliveryError ? "FAILED" : "SENT",
      error: deliveryError instanceof Error ? deliveryError.message : deliveryError ? String(deliveryError) : undefined,
    });
  } catch (error) {
    console.error("Order cancelled; could not record confirmation delivery", { id, error });
  }
  return { notificationFailed: Boolean(deliveryError) };
}

export async function saveCancellationRequest(id: string, customerId: string, reason: string) {
  const trimmedReason = reason.trim();
  if (!trimmedReason || trimmedReason.length > 1000)
    throw new Error("Enter a cancellation reason of up to 1,000 characters.");
  const booking = await prisma.$transaction(async (tx) => {
    await lockCapacity(tx);
    const result = await tx.submission.updateMany({
      where: {
        id, customerId, status: { not: "CANCELLED" }, cancellationRequestedAt: null,
        OR: [{ status: { not: "REJECTED" } }, { acceptedDropoffAt: { not: null } }],
      },
      data: { cancellationRequestedAt: new Date(), cancellationReason: trimmedReason },
    });
    if (!result.count) return null;
    return tx.submission.findUniqueOrThrow({
      where: { id },
      include: { customer: true, submissionPets: true, revisions: true },
    });
  });
  if (!booking) return false;

  // SMTP starts only after committing. Failures never undo the saved request.
  const subject = `Cancellation requested — ${id}`;
  const record = async (to: string, error?: unknown) => {
    try {
      await logEmail({
        submissionId: id, type: "ADMIN_NOTIFICATION", to, subject,
        status: error ? "FAILED" : "SENT",
        error: error instanceof Error ? error.message : error ? String(error) : undefined,
      });
    } catch (logError) {
      console.error("Cancellation saved; could not record notification delivery", { id, to, logError });
    }
  };
  try {
    const stay = acceptedBookingDetails(booking);
    const schedule = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} America/Los_Angeles`;
    const rows = {
      Customer: `${booking.customer.firstName} ${booking.customer.lastName}`,
      Email: booking.customer.email,
      Dogs: stay.dogNames,
      Count: stay.dogs,
      "Booking ID": id,
      Status: booking.status,
      "Drop-off": schedule(stay.dropoffAt),
      Pickup: schedule(stay.pickupAt),
      "Requested at": booking.cancellationRequestedAt?.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
      Reason: booking.cancellationReason,
    };
    const recipients = [...new Set(parseAdminEmails().map(email => email.trim().toLowerCase()))];
    if (!recipients.length) {
      await record("unconfigured", new Error("No administrator notification recipients configured."));
      return true;
    }
    const html = `<h2>Cancellation requested</h2>${Object.entries(rows).map(([key, value]) =>
      `<p><strong>${escape(key)}:</strong> ${escape(value)}</p>`).join("")}
      <a href="${escape(getAppBaseUrl())}/admin/submissions/${encodeURIComponent(id)}">Review booking</a>
      <p>Dates and dogs above reflect the last accepted stay when one exists. Accepted occupancy remains until an administrator cancels the booking.</p>`;
    for (const to of recipients) {
      try {
        await sendMail({ from: `"${BRAND_NAME}" <${getEnv("GMAIL_USER")}>`, to, subject, html });
        await record(to);
      } catch (error) {
        await record(to, error);
      }
    }
  } catch (error) {
    await record(process.env.ADMIN_EMAIL || "unconfigured", error);
  }
  return true;
}
