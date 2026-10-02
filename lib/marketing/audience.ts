import type { Prisma } from "@prisma/client";
export function marketingAudienceWhere(
  allCustomers = false,
): Prisma.CustomerWhereInput {
  return { deactivatedAt: null, ...(allCustomers
    ? {
        OR: [
          { emailMarketingOptIn: true },
          { marketingConsentUpdatedAt: null },
        ],
      }
    : { emailMarketingOptIn: true }) };
}
export function canReceiveMarketing(
  customer: {
    emailMarketingOptIn: boolean;
    marketingConsentUpdatedAt: Date | null;
    deactivatedAt?: Date | null;
  },
  allCustomers = false,
) {
  return (
    !customer.deactivatedAt && (customer.emailMarketingOptIn ||
    (allCustomers && customer.marketingConsentUpdatedAt === null))
  );
}
