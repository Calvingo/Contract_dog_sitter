import { NextResponse } from "next/server";
import {
  hashLoginToken,
  setCustomerSession,
} from "@/lib/auth/customer-session";
import { prisma } from "@/lib/db";
function redirectLocal(path: string) {
  // Keep redirects on the browser's origin, including localhost/127.0.0.1 aliases.
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: path,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token");
  if (!rawToken) return redirectLocal("/login?error=invalid");
  const customer = await prisma.$transaction(async (tx) => {
    const token = await tx.loginToken.findUnique({
      where: { tokenHash: hashLoginToken(rawToken) },
    });
    if (!token) return null;
    const used = await tx.loginToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) return null;
    return tx.customer.upsert({
      where: { email: token.email },
      update: { lastSeenAt: new Date() },
      create: {
        email: token.email,
        firstName: "",
        lastName: "",
        phone: "",
        backupContact: "email",
      },
    });
  });
  if (!customer) return redirectLocal("/login?error=expired");
  await setCustomerSession(customer.id);
  const next = url.searchParams.get("next");
  return redirectLocal(next === "/book" ? "/book" : "/account");
}
