import { EmailStatus, EmailType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createCustomerEmailUrl } from "@/lib/auth/customer-email-link";
import { BRAND_NAME, getEnv, sendMail } from "@/lib/mailer";
import { logEmail } from "@/lib/email-log";

export async function sendPaymentConfirmation(submissionId: string) {
  const booking = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: { customer: true },
  });
  const subject = `[${BRAND_NAME}] Deposit verified — booking confirmed`;
  try {
    const bookingUrl = await createCustomerEmailUrl(
      booking.customer.email,
      `/account/bookings/${booking.id}`,
    );
    await sendMail({
      from: `"${BRAND_NAME}" <${getEnv("GMAIL_USER")}>`,
      to: booking.customer.email,
      subject,
      html: `<p>Your deposit has been verified and your booking is confirmed.</p><p><a href="${bookingUrl.replaceAll("&", "&amp;")}">View your dates, payment history, and booking details</a></p><p>Thank you,<br />${BRAND_NAME}</p>`,
    });
    await logEmail({
      submissionId,
      type: EmailType.CUSTOMER_RECEIPT,
      to: booking.customer.email,
      subject,
      status: EmailStatus.SENT,
    });
  } catch (error) {
    await logEmail({
      submissionId,
      type: EmailType.CUSTOMER_RECEIPT,
      to: booking.customer.email,
      subject,
      status: EmailStatus.FAILED,
      error: error instanceof Error ? error.message : "Email delivery failed",
    });
    throw error;
  }
}
