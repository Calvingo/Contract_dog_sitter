import { NextResponse } from "next/server";
import { allowRequest, requestIp } from "@/lib/platform/rate-limit";
import { issueAdminCode, verifyAdminCode } from "@/lib/auth/admin-code";
import { setAdminSession } from "@/lib/auth/admin-session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json(
      { error: "Enter a valid admin email." },
      { status: 400 },
    );
  const verify = body?.action === "verify";
  if (
    !(await allowRequest(
      verify ? "admin-code-verify-ip" : "admin-code-send-ip",
      requestIp(request),
      verify ? 20 : 8,
      900,
    ))
  )
    return NextResponse.json(
      { error: "Too many attempts. Please try again in 15 minutes." },
      { status: 429 },
    );
  try {
    if (verify) {
      const valid = await verifyAdminCode(
        String(body.challengeId || ""),
        email,
        String(body.code || "").trim(),
      );
      if (!valid)
        return NextResponse.json(
          {
            error:
              "Invalid or expired code. Request a new code if you have tried five times.",
          },
          { status: 401 },
        );
      await setAdminSession(email);
      return NextResponse.json({ ok: true });
    }
    if (!(await allowRequest("admin-code-send-email", email, 1, 60)))
      return NextResponse.json(
        { error: "Please wait a minute before requesting another code." },
        { status: 429 },
      );
    const challengeId = await issueAdminCode(email);
    return NextResponse.json(
      {
        ok: true,
        challengeId,
        message:
          "If this is an approved admin email, a six-digit code has been sent. Check your inbox and spam folder.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not send the admin code. Please check the email settings or try again later.",
      },
      { status: 503 },
    );
  }
}
