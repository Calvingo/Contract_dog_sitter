import { getCustomerSession } from "@/lib/auth/customer-session";
import { BookingConflict } from "@/lib/platform/capacity";
import { dateRange, todayKey } from "@/lib/platform/rules";
import { NextResponse } from "next/server";
import type { FormValues } from "@/lib/form-config";
import { sendSubmissionEmails } from "@/lib/email";
import { createSubmissionRecord } from "@/lib/services/submission-service";
import { signatureToBuffer, validateSubmission } from "@/lib/validate";

export async function POST(request: Request) {
  try {
    const session = await getCustomerSession();
    if (!session)
      return NextResponse.json(
        { error: "Please sign in before booking." },
        { status: 401 },
      );
    const data = (await request.json()) as FormValues;
    const validationError = validateSubmission(data);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    try {
      dateRange(data.dropoffDate, data.pickupDate);
    } catch {
      return NextResponse.json(
        { error: "Choose valid dates within one year." },
        { status: 400 },
      );
    }
    if (data.dropoffDate < todayKey())
      return NextResponse.json(
        { error: "Please choose a future arrival date." },
        { status: 400 },
      );
    const signatureBuffer = signatureToBuffer(data.signature);
    const { submission } = await createSubmissionRecord(
      data,
      session.customerId,
    );
    let emailWarning = false;
    try {
      await sendSubmissionEmails(data, signatureBuffer, submission.id, {
        revision: submission.revision,
      });
    } catch (error) {
      console.error("Booking saved; notification failed", error);
      emailWarning = true;
    }

    return NextResponse.json({
      ok: true,
      submissionId: submission.id,
      emailWarning,
    });
  } catch (error) {
    if (error instanceof BookingConflict)
      return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Submit error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
