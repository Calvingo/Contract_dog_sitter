import { EmailStatus, EmailType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  createRawLoginToken,
  hashLoginToken,
} from "@/lib/auth/customer-session";
import { prisma } from "@/lib/db";
import { logEmail } from "@/lib/email-log";
import { BRAND_NAME, getEnv, sendMail } from "@/lib/mailer";
import { normalizeEmail } from "@/lib/submission-data";

const LOGIN_TOKEN_TTL_MINUTES = Number(
  process.env.LOGIN_TOKEN_TTL_MINUTES || "30"
);

function loginEmailHtml(url: string): string {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:640px;">
      <h2>Return to ${BRAND_NAME}</h2>
      <p>Use the secure link below to prefill your saved owner and pet information.</p>
      <p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#ea580c;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Open your saved profile</a></p>
      <p style="font-size:13px;color:#78716c;">This link expires in ${LOGIN_TOKEN_TTL_MINUTES} minutes and can only be used once.</p>
    </div>
  `;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = normalizeEmail(body?.email || "");

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({ where: { email } });

  if (customer) {
    const rawToken = createRawLoginToken();
    const tokenHash = hashLoginToken(rawToken);
    const expiresAt = new Date(
      Date.now() + LOGIN_TOKEN_TTL_MINUTES * 60 * 1000
    );

    await prisma.loginToken.create({
      data: {
        email,
        tokenHash,
        expiresAt,
      },
    });

    const url = `${getAppBaseUrl()}/api/auth/verify?token=${encodeURIComponent(
      rawToken
    )}`;
    const subject = `[${BRAND_NAME}] Your secure returning customer link`;
    const fromUser = getEnv("GMAIL_USER");

    try {
      await sendMail({
        from: `"${BRAND_NAME}" <${fromUser}>`,
        to: email,
        subject,
        html: loginEmailHtml(url),
      });
      await logEmail({
        type: EmailType.LOGIN_LINK,
        to: email,
        subject,
        status: EmailStatus.SENT,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logEmail({
        type: EmailType.LOGIN_LINK,
        to: email,
        subject,
        status: EmailStatus.FAILED,
        error: message,
      });
      throw error;
    }
  }

  return NextResponse.json({
    ok: true,
    message:
      "If we have a saved profile for that email, a secure link has been sent.",
  });
}
