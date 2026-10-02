import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { prisma } from "@/lib/db";
import { BRAND_NAME, getEnv, sendMail } from "@/lib/mailer";
import { isAdminEmail } from "./admin-session";

function codeHash(id: string, email: string, code: string) {
  const secret =
    process.env.ADMIN_SESSION_SECRET || process.env.APP_SECRET || "";
  if (secret.length < 16) throw new Error("Admin login is not configured.");
  return createHmac("sha256", secret)
    .update(`admin-code-v1:${id}:${email}:${code}`)
    .digest("hex");
}
export async function issueAdminCode(email: string, send = sendMail) {
  const id = randomUUID();
  if (!isAdminEmail(email)) return id;
  const code = String(randomInt(100000, 1000000));
  await prisma.$transaction(async (tx) => {
    await tx.adminLoginChallenge.updateMany({
      where: { email, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.adminLoginChallenge.create({
      data: {
        id,
        email,
        codeHash: codeHash(id, email, code),
        expiresAt: new Date(Date.now() + 10 * 60000),
      },
    });
  });
  try {
    await send({
      from: `"${BRAND_NAME}" <${getEnv("GMAIL_USER")}>`,
      to: email,
      subject: `[${BRAND_NAME}] Admin sign-in code`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Admin sign-in</h2><p>Your one-time code is:</p><p style="font-size:30px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. Enter it on the admin sign-in page. If you did not request it, ignore this email. Never share this code.</p></div>`,
    });
  } catch {
    await prisma.adminLoginChallenge.updateMany({
      where: { id },
      data: { usedAt: new Date() },
    });
    throw new Error("Could not send the admin code. Please try again later.");
  }
  return id;
}
export async function verifyAdminCode(id: string, email: string, code: string) {
  if (!isAdminEmail(email) || id.length > 60 || !/^\d{6}$/.test(code))
    return false;
  // Attempts and one-time consumption remain atomic across concurrent requests.
  const attempt = await prisma.adminLoginChallenge.updateMany({
    where: {
      id,
      email,
      usedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: 5 },
    },
    data: { attempts: { increment: 1 } },
  });
  if (!attempt.count) return false;
  const challenge = await prisma.adminLoginChallenge.findUnique({
    where: { id },
  });
  if (!challenge) return false;
  const expected = codeHash(id, email, code);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(challenge.codeHash)))
    return false;
  const consumed = await prisma.adminLoginChallenge.updateMany({
    where: {
      id,
      email,
      codeHash: expected,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  return consumed.count === 1;
}
