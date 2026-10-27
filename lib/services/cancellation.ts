import { prisma } from "@/lib/db";
import { sendMail, parseAdminEmails, BRAND_NAME, getEnv } from "@/lib/mailer";
import { logEmail } from "@/lib/email-log";
import { getAppBaseUrl } from "@/lib/app-url";
import { lockCapacity } from "@/lib/platform/capacity";
import { acceptedBookingDetails } from "@/lib/platform/accepted-booking";

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

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
