import { NextResponse } from "next/server";
import {
  hashLoginToken,
  setCustomerSession,
} from "@/lib/auth/customer-session";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token");

  if (!rawToken) {
    return NextResponse.redirect(new URL("/?returning=invalid", request.url));
  }

  const tokenHash = hashLoginToken(rawToken);
  const loginToken = await prisma.loginToken.findUnique({
    where: { tokenHash },
  });

  if (
    !loginToken ||
    loginToken.usedAt ||
    loginToken.expiresAt.getTime() < Date.now()
  ) {
    return NextResponse.redirect(new URL("/?returning=expired", request.url));
  }

  const customer = await prisma.customer.findUnique({
    where: { email: loginToken.email },
  });

  if (!customer) {
    return NextResponse.redirect(new URL("/?returning=missing", request.url));
  }

  await prisma.loginToken.update({
    where: { id: loginToken.id },
    data: { usedAt: new Date() },
  });

  await setCustomerSession(customer.id);
  return NextResponse.redirect(new URL("/?returning=ok", request.url));
}
