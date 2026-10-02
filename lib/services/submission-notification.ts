import { after } from "next/server";
import { logEmail } from "@/lib/email-log";
import type { sendSubmissionEmails } from "@/lib/email";

type ReceiptArguments = Parameters<typeof sendSubmissionEmails>;

// Next keeps the request's server lifetime open until this callback finishes,
// while allowing the saved-booking response to reach the browser immediately.
export async function scheduleSubmissionNotification(
  ...args: ReceiptArguments
): Promise<boolean> {
  const recordFailure = async (error: unknown) => {
    console.error("Booking saved; background notification did not finish", error);
    try {
      // Also covers PDF/configuration failures before the mailer's delivery logs.
      await logEmail({
        submissionId: args[2],
        type: "CUSTOMER_RECEIPT",
        to: args[0].email,
        subject: `Receipt processing failed (revision ${args[3]?.revision ?? 1})`,
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
      });
    } catch (logError) {
      console.error("Could not record notification failure", logError);
    }
  };

  try {
    after(async () => {
      try {
        // Keep PDF/font/mail loading out of the submission response path.
        const { sendSubmissionEmails } = await import("@/lib/email");
        await sendSubmissionEmails(...args);
      } catch (error) {
        await recordFailure(error);
      }
    });
    return true;
  } catch (error) {
    // The booking is already committed; never report a failed booking here.
    await recordFailure(error);
    return false;
  }
}
