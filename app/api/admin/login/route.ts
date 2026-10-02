import { NextResponse } from "next/server";
import { allowRequest, requestIp } from "@/lib/platform/rate-limit";
import {
  setAdminSession,
  verifyAdminCredentials,
} from "@/lib/auth/admin-session";

export async function POST(request: Request) {
  if (!(await allowRequest("admin-login", requestIp(request), 15, 900)))
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again in 15 minutes." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;

  const email = String(body?.email || "");
  const password = String(body?.password || "");

  if (!(await verifyAdminCredentials(email, password))) {
    return NextResponse.json(
      { error: "Invalid admin email or password" },
      { status: 401 },
    );
  }

  await setAdminSession(email);
  return NextResponse.json({ ok: true });
}
