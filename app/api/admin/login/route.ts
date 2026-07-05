import { NextResponse } from "next/server";
import {
  setAdminSession,
  verifyAdminCredentials,
} from "@/lib/auth/admin-session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;

  const email = String(body?.email || "");
  const password = String(body?.password || "");

  if (!verifyAdminCredentials(email, password)) {
    return NextResponse.json(
      { error: "Invalid admin email or password" },
      { status: 401 }
    );
  }

  await setAdminSession(email);
  return NextResponse.json({ ok: true });
}
