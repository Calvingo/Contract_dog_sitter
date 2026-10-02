import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { prisma } from "@/lib/db";
import { allowRequest, requestIp } from "@/lib/platform/rate-limit";
import { normalizeEmail } from "@/lib/submission-data";

const includeQuery = {
  _count: { select: { submissions: true } },
  pets: {
    orderBy: { updatedAt: "desc" as const },
    include: {
      submissionPets: {
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: {
          prescreenAnswers: true,
          prescreenNotes: true,
          createdAt: true,
        },
      },
    },
  },
};

type PrefillSubmission = {
  prescreenAnswers: unknown | null;
  prescreenNotes: string | null;
  createdAt: Date;
};

type PrefillPet = {
  id: string;
  name: string;
  breed: string;
  weightLb: number;
  ageYears: number | null;
  submissionPets: PrefillSubmission[];
};

type PrefillCustomer = {
  _count: { submissions: number };
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  backupContact: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  wechatId: string | null;
  pets: PrefillPet[];
};

function toPrefillResponse(customer: PrefillCustomer) {
  return {
    authenticated: true,
    customer: {
      hasBookedBefore: customer._count.submissions > 0,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      backupContact: customer.backupContact,
      emergencyContactName: customer.emergencyContactName ?? "",
      emergencyContactPhone: customer.emergencyContactPhone ?? "",
      wechatId: customer.wechatId ?? "",
    },
    pets: customer.pets.map((pet) => {
      const latest = pet.submissionPets[0];
      return {
        id: pet.id,
        name: pet.name,
        breed: pet.breed,
        weightLb: pet.weightLb,
        ageYears: pet.ageYears ?? undefined,
        lastPrescreenAnswers: latest?.prescreenAnswers ?? null,
        lastPrescreenNotes: latest?.prescreenNotes ?? "",
        lastSubmittedAt: latest?.createdAt ?? null,
      };
    }),
  };
}

export async function GET() {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
    include: includeQuery,
  });

  if (!customer) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json(toPrefillResponse(customer));
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
