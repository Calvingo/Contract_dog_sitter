import { SubmissionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import type { FormValues } from "@/lib/form-config";
import { sendSubmissionEmails } from "@/lib/email";
import {
  findValidSubmissionEditToken,
} from "@/lib/submission-edit-token";
import { formValuesFromSubmission } from "@/lib/submission-data";
import { updateSubmissionRecord } from "@/lib/services/submission-service";
import { signatureToBuffer, validateSubmission } from "@/lib/validate";

function canEdit(status: SubmissionStatus): boolean {
  return (
    status === SubmissionStatus.PENDING ||
    status === SubmissionStatus.ACCEPTED ||
    status === SubmissionStatus.NEEDS_REVIEW ||
    status === SubmissionStatus.MEET_GREET_REQUESTED
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const editToken = await findValidSubmissionEditToken(token);

  if (!editToken) {
    return NextResponse.json({ error: "Edit link expired or invalid" }, { status: 403 });
  }

  if (!canEdit(editToken.submission.status)) {
    return NextResponse.json(
      {
        error:
          "This request has already been reviewed. Please contact us directly to make changes.",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    token,
    status: editToken.submission.status,
    revision: editToken.submission.revision,
    values: formValuesFromSubmission(editToken.submission),
    notice:
      editToken.submission.status === SubmissionStatus.ACCEPTED
        ? "Your previous booking was accepted. If you submit changes, the request will need to be reviewed again."
        : "You are editing a submitted request. Please review, sign again, and submit your changes.",
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string; values?: FormValues };
    const editToken = await findValidSubmissionEditToken(body.token || null);

    if (!editToken) {
      return NextResponse.json({ error: "Edit link expired or invalid" }, { status: 403 });
    }

    if (!canEdit(editToken.submission.status)) {
      return NextResponse.json(
        { error: "This request can no longer be edited" },
        { status: 409 }
      );
    }

    if (!body.values) {
      return NextResponse.json({ error: "Missing form values" }, { status: 400 });
    }

    const validationError = validateSubmission(body.values);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const signatureBuffer = signatureToBuffer(body.values.signature);
    const result = await updateSubmissionRecord({
      submissionId: editToken.submissionId,
      data: body.values,
    });

    await sendSubmissionEmails(body.values, signatureBuffer, result.submission.id, {
      revision: result.submission.revision,
      isUpdate: true,
      previousStatus: result.previousStatus,
    });

    return NextResponse.json({
      ok: true,
      submissionId: result.submission.id,
      status: result.submission.status,
      revision: result.submission.revision,
    });
  } catch (error) {
    console.error("Edit submission error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
