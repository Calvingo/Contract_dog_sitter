import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
function signature(id: string, email: string) {
  const secret = process.env.MARKETING_TOKEN_SECRET || "";
  if (secret.length < 32)
    throw new Error("Marketing token secret is not configured.");
  return createHmac("sha256", secret)
    .update(`unsubscribe-v1:${id}:${email.toLowerCase()}`)
    .digest("base64url");
}
export function unsubscribeToken(id: string, email: string) {
  return `${id}.${signature(id, email)}`;
}
export async function unsubscribeCustomer(token: string) {
  if (token.length > 300) return null;
  const index = token.lastIndexOf(".");
  if (index < 1) return null;
  const id = token.slice(0, index),
    sig = token.slice(index + 1);
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) return null;
  const expected = signature(id, customer.email);
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  return customer;
}
export async function unsubscribe(token: string) {
  const customer = await unsubscribeCustomer(token);
  if (!customer) return false;
  await prisma.$transaction(async (tx) => {
    const changed = await tx.customer.updateMany({
      where: {
        id: customer.id,
        OR: [
          { emailMarketingOptIn: true },
          { marketingConsentUpdatedAt: null },
        ],
      },
      data: {
        emailMarketingOptIn: false,
        marketingConsentUpdatedAt: new Date(),
      },
    });
    if (changed.count)
      await tx.marketingConsentEvent.create({
        data: {
          customerId: customer.id,
          emailOptIn: false,
          smsOptIn: false,
          source: "email-unsubscribe-v1",
        },
      });
  });
  return true;
}
