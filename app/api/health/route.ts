import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";

/** Quick check that email/decision env is configured (no secrets exposed). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    appBaseUrl: getAppBaseUrl(),
    hasAppSecret: Boolean(process.env.APP_SECRET && process.env.APP_SECRET.length >= 16),
    hasGmailUser: Boolean(process.env.GMAIL_USER),
    hasGmailPassword: Boolean(process.env.GMAIL_APP_PASSWORD),
    hasAdminEmail: Boolean(process.env.ADMIN_EMAIL),
  });
}
