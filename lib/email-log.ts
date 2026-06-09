import type { EmailStatus, EmailType } from "@prisma/client";
import { prisma } from "./db";

export async function logEmail(options: {
  submissionId?: string | null;
  type: EmailType;
  to: string | string[];
  subject: string;
  status: EmailStatus;
  error?: string | null;
}) {
  await prisma.emailLog.create({
    data: {
      submissionId: options.submissionId ?? null,
      type: options.type,
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
      status: options.status,
      error: options.error ?? null,
    },
  });
}
