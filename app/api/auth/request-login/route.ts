import { allowRequest, requestIp } from "@/lib/platform/rate-limit";
import { EmailStatus, EmailType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAppBaseUrlDiagnostics } from "@/lib/app-url";
import {
  createRawLoginToken,
  hashLoginToken,
} from "@/lib/auth/customer-session";
import { prisma } from "@/lib/db";
import { logEmail } from "@/lib/email-log";
import { BRAND_NAME, getEnv, sendMail } from "@/lib/mailer";
import { normalizeEmail } from "@/lib/submission-data";
import { EMAIL_LINK_HASH_PREFIX } from "@/lib/auth/customer-email-link";

const LOGIN_TOKEN_TTL_MINUTES = Number(
  process.env.LOGIN_TOKEN_TTL_MINUTES || "30",
);

function getRequestBaseUrl(request: Request): string {
  const requestedOrigin = new URL(request.url).origin;
  const configured = getAppBaseUrlDiagnostics();
  console.info("[request-login] app_base_url", {
    source: configured.appBaseUrlSource,
    configured: configured.appBaseUrl,
    misconfigured: configured.appBaseUrlMisconfigured,
    requestOrigin: requestedOrigin,
  });
  const isLocalFallback =
    !configured.appBaseUrl ||
    configured.appBaseUrl.includes("localhost") ||
    configured.appBaseUrl.includes("127.0.0.1") ||
    configured.appBaseUrl.includes("0.0.0.0");
  if (!configured.appBaseUrlMisconfigured && !isLocalFallback) {
    return configured.appBaseUrl;
  }
  return requestedOrigin;
}

function loginEmailHtml(url: string): string {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:640px;">
      <h2>Return to ${BRAND_NAME}</h2>
      <p>Use this secure link to sign in, manage your dogs, and view your bookings.</p>
      <p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#ea580c;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Sign in to your account</a></p>
      <p style="font-size:13px;color:#78716c;">This link expires in ${LOGIN_TOKEN_TTL_MINUTES} minutes and can only be used once.</p>
    </div>
  `;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      next?: string;
    } | null;
    const email = normalizeEmail(
      typeof body?.email === "string" ? body.email : "",
    );
    console.info("[request-login] start", { email });

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 },
      );
    }

    if (
      !(await allowRequest("customer-login-ip", requestIp(request), 20, 900)) ||
      !(await allowRequest("customer-login-email", email, 5, 3600))
    )
      return NextResponse.json(
        { error: "Too many sign-in requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "900" } },
      );

    const recentToken = await prisma.loginToken.findFirst({
      where: {
        email,
        createdAt: { gt: new Date(Date.now() - 60_000) },
        NOT: { tokenHash: { startsWith: EMAIL_LINK_HASH_PREFIX } },
      },
    });
    if (recentToken)
      return NextResponse.json({
        ok: true,
        message:
          "Check your inbox. Please wait a minute before requesting another link.",
      });

    const rawToken = createRawLoginToken();
    const tokenHash = hashLoginToken(rawToken);
    const expiresAt = new Date(
      Date.now() + LOGIN_TOKEN_TTL_MINUTES * 60 * 1000,
    );

    await prisma.loginToken.create({
      data: {
        email,
        tokenHash,
        expiresAt,
      },
    });

    const url = `${getRequestBaseUrl(request)}/api/auth/verify?token=${encodeURIComponent(
      rawToken,
    )}&next=${body?.next === "/book" ? "%2Fbook" : "%2Faccount"}`;
    const subject = `[${BRAND_NAME}] Your secure sign-in link`;
    const fromUser = getEnv("GMAIL_USER").trim();

    try {
      await sendMail({
        from: `"${BRAND_NAME}" <${fromUser}>`,
        to: email,
        subject,
        html: loginEmailHtml(url),
      });
      console.info("[request-login] email_sent", { email });
      await logEmail({
        type: EmailType.LOGIN_LINK,
        to: email,
        subject,
        status: EmailStatus.SENT,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[request-login] send_failed", {
        email,
        message,
      });
      await logEmail({
        type: EmailType.LOGIN_LINK,
        to: email,
        subject,
        status: EmailStatus.FAILED,
        error: message,
      });
      throw error;
    }

    return NextResponse.json({
      ok: true,
      message: "Check your inbox for your secure sign-in link.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Secure link request failed:", message);
    return NextResponse.json(
      { error: "Could not send the secure link. Please try again later." },
      { status: 500 },
    );
  }
}
