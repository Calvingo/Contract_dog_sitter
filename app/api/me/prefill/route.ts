import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
    include: {
      pets: {
        orderBy: { updatedAt: "desc" },
        include: {
          submissions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              prescreenAnswers: true,
              prescreenNotes: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    customer: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      backupContact: customer.backupContact,
      wechatId: customer.wechatId ?? "",
    },
    pets: customer.pets.map((pet) => {
      const latest = pet.submissions[0];
      return {
        id: pet.id,
        name: pet.name,
        breed: pet.breed,
        weightLb: pet.weightLb,
        lastPrescreenAnswers: latest?.prescreenAnswers ?? null,
        lastPrescreenNotes: latest?.prescreenNotes ?? "",
        lastSubmittedAt: latest?.createdAt ?? null,
      };
    }),
  });
}
