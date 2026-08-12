import {
  DecisionAction as DbDecisionAction,
  EmailStatus,
  EmailType,
  SubmissionStatus,
} from "@prisma/client";
import {
  decisionActionLabel,
  sendDecisionEmail,
  type DecisionAction,
} from "@/lib/decision-emails";
import { prisma } from "@/lib/db";
import { logEmail } from "@/lib/email-log";
import {
  buildSubmissionEditUrl,
  createSubmissionEditToken,
} from "@/lib/submission-edit-token";

function toSubmissionStatus(action: DecisionAction): SubmissionStatus {
  switch (action) {
    case "accept":
      return SubmissionStatus.ACCEPTED;
    case "reject":
      return SubmissionStatus.REJECTED;
    case "meet_greet":
      return SubmissionStatus.MEET_GREET_REQUESTED;
  }
}

function toDbDecisionAction(action: DecisionAction): DbDecisionAction {
  switch (action) {
    case "accept":
      return DbDecisionAction.ACCEPT;
    case "reject":
      return DbDecisionAction.REJECT;
    case "meet_greet":
      return DbDecisionAction.MEET_GREET;
  }
}

function toEmailType(action: DecisionAction): EmailType {
  switch (action) {
    case "accept":
      return EmailType.DECISION_ACCEPT;
    case "reject":
      return EmailType.DECISION_REJECT;
    case "meet_greet":
      return EmailType.DECISION_MEET_GREET;
  }
}

function formatMeetGreetTime(value: string): string {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute);

  return date.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    hour12: true,
  });
}

export async function processAdminSubmissionDecision(options: {
  submissionId: string;
  action: DecisionAction;
  adminEmail: string;
  meetGreetAt?: string;
}) {
  if (options.action === "meet_greet" && !options.meetGreetAt) {
    throw new Error("Meet & greet time is required.");
  }

  const submission = await prisma.submission.findUnique({
    where: { id: options.submissionId },
    include: {
      customer: true,
      pet: true,
      submissionPets: { orderBy: { position: "asc" }, include: { pet: true } },
    },
  });

  if (!submission) {
    throw new Error("Submission not found.");
  }

  const message =
    options.action === "meet_greet" && options.meetGreetAt
      ? `Meet & greet proposed for ${formatMeetGreetTime(options.meetGreetAt)}.`
      : `Admin selected ${decisionActionLabel(options.action)}.`;

  const decisionEvent = await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: submission.id },
      data: { status: toSubmissionStatus(options.action) },
    });

    return tx.decisionEvent.create({
      data: {
        submissionId: submission.id,
        action: toDbDecisionAction(options.action),
        actorEmail: options.adminEmail,
        message,
      },
    });
  });

  const payload = {
    email: submission.customer.email,
    firstName: submission.customer.firstName,
    lastName: submission.customer.lastName,
    petName: submission.submissionPets.map((item) => item.pet.name).join(" & ") || submission.pet.name,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };
  const subjectLabel = decisionActionLabel(options.action);

  try {
    const editUrl =
      options.action === "reject"
        ? undefined
        : buildSubmissionEditUrl(await createSubmissionEditToken(submission.id));
    await sendDecisionEmail(payload, options.action, {
      editUrl,
      meetGreetAt: options.meetGreetAt
        ? formatMeetGreetTime(options.meetGreetAt)
        : undefined,
    });
    await prisma.decisionEvent.update({
      where: { id: decisionEvent.id },
      data: { emailSentAt: new Date() },
    });
    await logEmail({
      submissionId: submission.id,
      type: toEmailType(options.action),
      to: payload.email,
      subject: subjectLabel,
      status: EmailStatus.SENT,
    });
  } catch (error) {
    await logEmail({
      submissionId: submission.id,
      type: toEmailType(options.action),
      to: payload.email,
      subject: subjectLabel,
      status: EmailStatus.FAILED,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
