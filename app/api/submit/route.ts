import { NextResponse } from "next/server";
import type { FormValues } from "@/lib/form-config";
import { sendSubmissionEmails } from "@/lib/email";
import { createSubmissionRecord } from "@/lib/services/submission-service";
import { signatureToBuffer, validateSubmission } from "@/lib/validate";

export async function POST(request: Request) {
  try {
    const data = (await request.json()) as FormValues;
    const validationError = validateSubmission(data);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const signatureBuffer = signatureToBuffer(data.signature);
    const { submission } = await createSubmissionRecord(data);
    await sendSubmissionEmails(data, signatureBuffer, submission.id, {
      revision: submission.revision,
    });

    return NextResponse.json({ ok: true, submissionId: submission.id });
  } catch (error) {
    console.error("Submit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
