import { NextResponse } from "next/server";
import { findCustomerEmailLink } from "@/lib/auth/customer-email-link";
import { setCustomerSession } from "@/lib/auth/customer-session";
import { prisma } from "@/lib/db";

function redirectLocal(path: string) {
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
  const next = url.searchParams.get("next") || "";
  const link = await findCustomerEmailLink(url.searchParams.get("token") || "", next);
  if (!link) return redirectLocal("/login?error=expired");

  const customer = await prisma.customer.upsert({
    where: { email: link.email },
    update: { lastSeenAt: new Date() },
    create: {
      email: link.email,
      firstName: "",
      lastName: "",
      phone: "",
      backupContact: "email",
    },
  });
  await setCustomerSession(customer.id);
  // Reusable until expiry: mail scanners and later clicks must not consume it.
  return redirectLocal(next);
}
