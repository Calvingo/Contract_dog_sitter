import { getCustomerSession } from "@/lib/auth/customer-session";
import { BookingConflict } from "@/lib/platform/capacity";
import { dateRange, todayKey } from "@/lib/platform/rules";
import { NextResponse } from "next/server";
import type { FormValues } from "@/lib/form-config";
import { scheduleSubmissionNotification } from "@/lib/services/submission-notification";
import { createSubmissionRecord } from "@/lib/services/submission-service";
import { signatureToBuffer, validateSubmission } from "@/lib/validate";
import { allowRequest, requestIp } from "@/lib/platform/rate-limit";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/submission-data";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const session = await getCustomerSession();
    const data = (await request.json()) as FormValues;
    const validationError = validateSubmission(data);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    if (
      !(await allowRequest("booking-ip", requestIp(request), 10, 3600)) ||
      !(await allowRequest(
        "booking-email",
        normalizeEmail(data.email),
        5,
        3600,
      ))
    )
      return NextResponse.json(
        { error: "Too many booking requests. Please try again later." },
        { status: 429 },
      );
    const owner = session
      ? await prisma.customer.findUnique({
          where: { id: session.customerId },
          select: { id: true, email: true },
        })
      : null;
    const verifiedOwnerId =
      owner?.email === normalizeEmail(data.email) ? owner.id : undefined;

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
    const { submission, quote } = await createSubmissionRecord(data, verifiedOwnerId);
    const emailPending = await scheduleSubmissionNotification(
      data, signatureBuffer, submission.id, {
        revision: submission.revision,
        quote,
      },
    );

    return NextResponse.json({
      ok: true,
      submissionId: submission.id,
      emailWarning: !emailPending,
      emailPending,
      accountAccess: Boolean(verifiedOwnerId),
    }, { headers: { "Server-Timing": `booking;dur=${(performance.now() - startedAt).toFixed(1)}` } });
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
