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
} from "./decision-emails";
import { prisma } from "./db";
import { logEmail } from "./email-log";
import {
  buildSubmissionEditUrl,
  createSubmissionEditToken,
} from "./submission-edit-token";
import { verifyDecisionToken } from "./token";

const VALID_ACTIONS: DecisionAction[] = ["accept", "reject", "meet_greet"];

export type DecisionResult =
  | {
      ok: true;
      action: DecisionAction;
      owner: string;
      email: string;
      petName: string;
      requiresScheduling?: false;
    }
  | {
      ok: true;
      action: "meet_greet";
      owner: string;
      email: string;
      petName: string;
      submissionId: string;
      token: string;
      requiresScheduling: true;
      alreadySent: boolean;
    }
  | { ok: false; status: number; title: string; message: string };

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

export async function processDecision(
  token: string | null,
  action: string | null
): Promise<DecisionResult> {
  if (!token || !action || !VALID_ACTIONS.includes(action as DecisionAction)) {
    return {
      ok: false,
      status: 400,
      title: "Invalid link",
      message:
        "This decision link is invalid. Please use the buttons in the admin email, or open the plain link below each button.",
    };
  }

  const payload = verifyDecisionToken(token);
  if (!payload) {
    return {
      ok: false,
      status: 403,
      title: "Link expired or invalid",
      message:
        "This link has expired, was already used with an old deployment, or APP_SECRET changed. Ask the customer to resubmit, or contact them directly.",
    };
  }

  const decisionAction = action as DecisionAction;

  if (payload.action && payload.action !== decisionAction) {
    return {
      ok: false,
      status: 400,
      title: "Invalid link",
      message:
        "This decision link does not match the selected action. Please use the original button from the admin email.",
    };
  }

  if (payload.submissionId) {
    const submission = await prisma.submission.findUnique({
      where: { id: payload.submissionId },
      include: {
        customer: true,
        pet: true,
        submissionPets: { orderBy: { position: "asc" }, include: { pet: true } },
      },
    });

    if (!submission) {
      return {
        ok: false,
        status: 404,
        title: "Submission not found",
        message:
          "This decision link points to a submission that no longer exists.",
      };
    }

    if (payload.revision && payload.revision !== submission.revision) {
      return {
        ok: false,
        status: 409,
        title: "Submission updated",
        message:
          "This submission has been updated. Please use the latest admin email.",
      };
    }

    if (
      submission.status === SubmissionStatus.MEET_GREET_REQUESTED &&
      decisionAction === "meet_greet"
    ) {
      const decisionEvent = await prisma.decisionEvent.findFirst({
        where: {
          submissionId: submission.id,
          action: DbDecisionAction.MEET_GREET,
        },
        orderBy: { createdAt: "desc" },
      });

      return {
        ok: true,
        action: "meet_greet",
        owner: `${submission.customer.firstName} ${submission.customer.lastName}`.trim(),
        email: submission.customer.email,
        petName: submission.submissionPets.map((item) => item.pet.name).join(" & ") || submission.pet.name,
        submissionId: submission.id,
        token,
        requiresScheduling: true,
        alreadySent: Boolean(decisionEvent?.emailSentAt),
      };
    }

    if (
      submission.status !== SubmissionStatus.PENDING &&
      submission.status !== SubmissionStatus.NEEDS_REVIEW
    ) {
      return {
        ok: false,
        status: 409,
        title: "Already processed",
        message: `This submission is already marked as ${submission.status.toLowerCase().replaceAll("_", " ")}. No email was sent.`,
      };
    }

    if (decisionAction === "meet_greet") {
      await prisma.$transaction(async (tx) => {
        await tx.submission.update({
          where: { id: submission.id },
          data: { status: SubmissionStatus.MEET_GREET_REQUESTED },
        });

        await tx.decisionEvent.create({
          data: {
            submissionId: submission.id,
            action: DbDecisionAction.MEET_GREET,
            message: "Meet & greet selected; waiting for proposed time.",
          },
        });
      });

      return {
        ok: true,
        action: "meet_greet",
        owner: `${submission.customer.firstName} ${submission.customer.lastName}`.trim(),
        email: submission.customer.email,
        petName: submission.submissionPets.map((item) => item.pet.name).join(" & ") || submission.pet.name,
        submissionId: submission.id,
        token,
        requiresScheduling: true,
        alreadySent: false,
      };
    }

    const decisionPayload = {
      email: submission.customer.email,
      firstName: submission.customer.firstName,
      lastName: submission.customer.lastName,
      petName: submission.submissionPets.map((item) => item.pet.name).join(" & ") || submission.pet.name,
      exp: payload.exp,
    };

    const decisionEvent = await prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: submission.id },
        data: { status: toSubmissionStatus(decisionAction) },
      });

      return tx.decisionEvent.create({
        data: {
          submissionId: submission.id,
          action: toDbDecisionAction(decisionAction),
        },
      });
    });

    const subjectLabel = decisionActionLabel(decisionAction);

    try {
      const editUrl =
        decisionAction === "reject"
          ? undefined
          : buildSubmissionEditUrl(await createSubmissionEditToken(submission.id));
      await sendDecisionEmail(decisionPayload, decisionAction, { editUrl });
      await prisma.decisionEvent.update({
        where: { id: decisionEvent.id },
        data: { emailSentAt: new Date() },
      });
      await logEmail({
        submissionId: submission.id,
        type: toEmailType(decisionAction),
        to: decisionPayload.email,
        subject: subjectLabel,
        status: EmailStatus.SENT,
      });
    } catch (error) {
      await logEmail({
        submissionId: submission.id,
        type: toEmailType(decisionAction),
        to: decisionPayload.email,
        subject: subjectLabel,
        status: EmailStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return {
      ok: true,
      action: decisionAction,
      owner: `${decisionPayload.firstName} ${decisionPayload.lastName}`.trim(),
      email: decisionPayload.email,
      petName: decisionPayload.petName,
    };
  }

  await sendDecisionEmail(payload, decisionAction);

  const owner = `${payload.firstName} ${payload.lastName}`.trim();

  return {
    ok: true,
    action: decisionAction,
    owner,
    email: payload.email,
    petName: payload.petName,
  };
}

export async function processMeetGreetSchedule(options: {
  token: string | null;
  scheduledAt: string | null;
}): Promise<DecisionResult> {
  const payload = options.token ? verifyDecisionToken(options.token) : null;
  const scheduledAt = options.scheduledAt?.trim();

  if (!payload?.submissionId || !scheduledAt) {
    return {
      ok: false,
      status: 400,
      title: "Missing information",
      message: "Please choose a meet & greet time from the decision page.",
    };
  }

  if (payload.action && payload.action !== "meet_greet") {
    return {
      ok: false,
      status: 400,
      title: "Invalid link",
      message:
        "This schedule form must be opened from the Meet & Greet button in the admin email.",
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledAt)) {
    return {
      ok: false,
      status: 400,
      title: "Invalid time",
      message: "Please choose a valid meet & greet date and time.",
    };
  }

  const submission = await prisma.submission.findUnique({
    where: { id: payload.submissionId },
    include: {
      customer: true,
      pet: true,
      submissionPets: { orderBy: { position: "asc" }, include: { pet: true } },
    },
  });

  if (!submission) {
    return {
      ok: false,
      status: 404,
      title: "Submission not found",
      message: "This meet & greet request no longer exists.",
    };
  }

  if (payload.revision && payload.revision !== submission.revision) {
    return {
      ok: false,
      status: 409,
      title: "Submission updated",
      message:
        "This submission has been updated. Please use the latest admin email.",
    };
  }

  if (submission.status !== SubmissionStatus.MEET_GREET_REQUESTED) {
    return {
      ok: false,
      status: 409,
      title: "Already processed",
      message: `This submission is already marked as ${submission.status.toLowerCase().replaceAll("_", " ")}. No email was sent.`,
    };
  }

  let decisionEvent = await prisma.decisionEvent.findFirst({
    where: {
      submissionId: submission.id,
      action: DbDecisionAction.MEET_GREET,
    },
    orderBy: { createdAt: "desc" },
  });

  if (decisionEvent?.emailSentAt) {
    return {
      ok: false,
      status: 409,
      title: "Already sent",
      message:
        "The meet & greet email has already been sent for this submission.",
    };
  }

  if (!decisionEvent) {
    decisionEvent = await prisma.decisionEvent.create({
      data: {
        submissionId: submission.id,
        action: DbDecisionAction.MEET_GREET,
      },
    });
  }

  const decisionPayload = {
    email: submission.customer.email,
    firstName: submission.customer.firstName,
    lastName: submission.customer.lastName,
    petName: submission.submissionPets.map((item) => item.pet.name).join(" & ") || submission.pet.name,
    exp: payload.exp,
  };

  const subjectLabel = decisionActionLabel("meet_greet");
  const displayTime = formatMeetGreetTime(scheduledAt);
  const message = `Meet & greet proposed for ${displayTime}.`;

  try {
    const editUrl = buildSubmissionEditUrl(
      await createSubmissionEditToken(submission.id)
    );
    await sendDecisionEmail(decisionPayload, "meet_greet", {
      meetGreetAt: displayTime,
      editUrl,
    });
    await prisma.decisionEvent.update({
      where: { id: decisionEvent.id },
      data: {
        emailSentAt: new Date(),
        message,
      },
    });
    await logEmail({
      submissionId: submission.id,
      type: EmailType.DECISION_MEET_GREET,
      to: decisionPayload.email,
      subject: subjectLabel,
      status: EmailStatus.SENT,
    });
  } catch (error) {
    await logEmail({
      submissionId: submission.id,
      type: EmailType.DECISION_MEET_GREET,
      to: decisionPayload.email,
      subject: subjectLabel,
      status: EmailStatus.FAILED,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  return {
    ok: true,
    action: "meet_greet",
    owner: `${decisionPayload.firstName} ${decisionPayload.lastName}`.trim(),
    email: decisionPayload.email,
    petName: decisionPayload.petName,
  };
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

export function decisionResultMessage(result: DecisionResult): {
  title: string;
  message: string;
  success: boolean;
} {
  if (result.ok) {
    if (result.requiresScheduling) {
      return {
        success: true,
        title: result.alreadySent
          ? "Meet & Greet already sent"
          : "Choose Meet & Greet time",
        message: result.alreadySent
          ? `A meet & greet email has already been sent to ${result.owner} (${result.email}) regarding ${result.petName}.`
          : `This submission is now locked as Meet & Greet. Choose a time to email ${result.owner} (${result.email}) regarding ${result.petName}.`,
      };
    }
    return {
      success: true,
      title: decisionActionLabel(result.action),
      message: `A notification email has been sent to ${result.owner} (${result.email}) regarding ${result.petName}.`,
    };
  }
  return {
    success: false,
    title: result.title,
    message: result.message,
  };
}
