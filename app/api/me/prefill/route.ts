import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/submission-data";

const includeQuery = {
  pets: {
    orderBy: { updatedAt: "desc" as const },
    include: {
      submissions: {
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

function toPrefillResponse(customer: { id: string; firstName: string; lastName: string; email: string; phone: string; backupContact: string; emergencyContactName: string | null; emergencyContactPhone: string | null; wechatId: string | null; pets: Array<{ id: string; name: string; breed: string; weightLb: number; ageYears: number | null; submissions: Array<{ prescreenAnswers: object; prescreenNotes: string | null; createdAt: Date }> }>}) {
  return {
    authenticated: true,
    customer: {
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
      const latest = pet.submissions[0];
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = normalizeEmail(url.searchParams.get("email") || "");

  if (email) {
    const customer = await prisma.customer.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: includeQuery,
    });

    if (!customer) {
      return NextResponse.json({ authenticated: false }, { status: 404 });
    }

    return NextResponse.json(toPrefillResponse(customer));
  }

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
