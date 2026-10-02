import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { prisma } from "@/lib/db";
import { allowRequest, requestIp } from "@/lib/platform/rate-limit";
import { loadCustomerPrefill } from "@/lib/services/customer-prefill";
import { normalizeEmail } from "@/lib/submission-data";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  const session = await getCustomerSession();
  const data = session ? await loadCustomerPrefill(session.customerId) : null;
  if (!data)
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: privateHeaders },
    );
  return NextResponse.json(data, { headers: privateHeaders });
}

// Explicit product policy: email-only booking prefill is public. This never grants an account session.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(
    typeof body?.email === "string" ? body.email : "",
  );
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  const session = await getCustomerSession();
  if (session) {
    const owner = await prisma.customer.findUnique({
      where: { id: session.customerId },
      select: { email: true },
    });
    if (owner?.email === email) {
      const data = await loadCustomerPrefill(session.customerId);
      if (data)
        return NextResponse.json(
          { found: true, ...data },
          { headers: privateHeaders },
        );
    }
  }
  if (
    !(await allowRequest("booking-lookup-ip", requestIp(request), 30, 900)) ||
    !(await allowRequest("booking-lookup-email", email, 10, 900))
  )
    return NextResponse.json(
      { error: "Too many lookups. Please try again later." },
      { status: 429 },
    );
  const customer = await prisma.customer.findUnique({
    where: { email },
    include: {
      _count: { select: { submissions: true } },
      pets: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          breed: true,
          weightLb: true,
          ageYears: true,
        },
      },
    },
  });
  const headers = { "Cache-Control": "no-store" };
  if (!customer)
    return NextResponse.json(
      { found: false, authenticated: false },
      { headers },
    );
  return NextResponse.json(
    {
      found: true,
      authenticated: false,
      customer: {
        hasBookedBefore: customer._count.submissions > 0,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        backupContact: customer.backupContact,
        emergencyContactName: "",
        emergencyContactPhone: "",
        wechatId: "",
      },
      pets: customer.pets,
    },
    { headers },
  );
}
