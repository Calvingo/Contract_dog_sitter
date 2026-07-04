import { createHmac, randomBytes } from "node:crypto";
import { getAppBaseUrl } from "./app-url";
import { prisma } from "./db";

const EDIT_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("APP_SECRET must be set (min 16 characters)");
  }
  return secret;
}

export function hashSubmissionEditToken(token: string): string {
  return createHmac("sha256", getSecret()).update(token).digest("base64url");
}

export async function createSubmissionEditToken(submissionId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.submissionEditToken.create({
    data: {
      submissionId,
      tokenHash: hashSubmissionEditToken(token),
      expiresAt: new Date(Date.now() + EDIT_TOKEN_TTL_MS),
    },
  });
  return token;
}

export function buildSubmissionEditUrl(token: string): string {
  const params = new URLSearchParams({ editToken: token });
  return `${getAppBaseUrl()}?${params.toString()}`;
}

export async function findValidSubmissionEditToken(token: string | null) {
  if (!token) return null;
  const editToken = await prisma.submissionEditToken.findUnique({
    where: { tokenHash: hashSubmissionEditToken(token) },
    include: {
      submission: {
        include: {
          customer: true,
          pet: true,
        },
      },
    },
  });

  if (!editToken || editToken.expiresAt.getTime() < Date.now()) return null;
  return editToken;
}
