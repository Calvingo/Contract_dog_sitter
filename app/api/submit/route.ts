import { NextResponse } from "next/server";
import type { FormValues } from "@/lib/form-config";
import { sendSubmissionEmails } from "@/lib/email";
import { signatureToBuffer, validateSubmission } from "@/lib/validate";

export async function POST(request: Request) {
  try {
    const data = (await request.json()) as FormValues;
    const validationError = validateSubmission(data);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const signatureBuffer = signatureToBuffer(data.signature);
    await sendSubmissionEmails(data, signatureBuffer);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Submit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
