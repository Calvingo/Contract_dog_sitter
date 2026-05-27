import { resolve4 } from "node:dns/promises";
import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";
import { getSmtpHost } from "@/lib/mailer";

/** Quick check that email/decision env is configured (no secrets exposed). */
export async function GET() {
  const smtpHost = getSmtpHost();
  let smtpResolvable = false;
  let smtpResolveError: string | undefined;

  try {
    const addresses = await resolve4(smtpHost);
    smtpResolvable = addresses.length > 0;
    if (!smtpResolvable) {
      smtpResolveError = "No IPv4 addresses returned";
    }
  } catch (error) {
    smtpResolveError =
      error instanceof Error ? error.message : "DNS lookup failed";
  }

  return NextResponse.json({
    ok: true,
    appBaseUrl: getAppBaseUrl(),
    smtpHost,
    smtpResolvable,
    smtpResolveError,
    hasAppSecret: Boolean(
      process.env.APP_SECRET && process.env.APP_SECRET.length >= 16
    ),
    hasGmailUser: Boolean(process.env.GMAIL_USER),
    hasGmailPassword: Boolean(process.env.GMAIL_APP_PASSWORD),
    hasAdminEmail: Boolean(process.env.ADMIN_EMAIL),
  });
}
