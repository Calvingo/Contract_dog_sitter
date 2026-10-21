import type { Prisma } from "@prisma/client";
export function marketingAudienceWhere(
  allCustomers = false,
): Prisma.CustomerWhereInput {
  return { deactivatedAt: null, marketingEmailDeletedAt: null, ...(allCustomers
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
    marketingEmailDeletedAt?: Date | null;
  },
  allCustomers = false,
) {
  return (
    !customer.deactivatedAt && !customer.marketingEmailDeletedAt && (customer.emailMarketingOptIn ||
    (allCustomers && customer.marketingConsentUpdatedAt === null))
  );
}
