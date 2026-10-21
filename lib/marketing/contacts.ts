import { prisma } from "@/lib/db";
import { lockCustomerProfile } from "@/lib/services/customer-profile";
import { canReceiveMarketing } from "./audience";

type MarketingCustomer = Parameters<typeof canReceiveMarketing>[0];

export function promotionStatus(customer: MarketingCustomer, suppressed = false) {
  if (customer.marketingEmailDeletedAt) return "Deleted";
  if (customer.deactivatedAt) return "Account inactive";
  if (suppressed) return "Blocked";
  return canReceiveMarketing(customer, true) ? "Promotion on" : "Unsubscribed";
}

export async function marketingContacts() {
  const [customers, suppressions] = await Promise.all([
    prisma.customer.findMany({
      select: {
        id: true, firstName: true, lastName: true, email: true,
        emailMarketingOptIn: true, marketingConsentUpdatedAt: true,
        marketingEmailDeletedAt: true, deactivatedAt: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    }),
    prisma.marketingSuppression.findMany(),
  ]);
  const blocked = new Map(suppressions.map((item) => [item.email.toLowerCase(), item.reason]));
  return customers.map((customer) => ({
    ...customer,
    status: promotionStatus(customer, blocked.has(customer.email.toLowerCase())),
    reason: blocked.get(customer.email.toLowerCase()) || "",
  }));
}

export async function changeMarketingContact(customerId: string, action: string, adminEmail: string) {
  if (!customerId || !["enable", "block", "delete", "restore"].includes(action))
    throw new Error("Choose a customer email and a valid action.");
  await prisma.$transaction(async (tx) => {
    await lockCustomerProfile(tx, customerId);
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new Error("This customer no longer exists. Refresh the list.");
    if (action === "enable" && customer.deactivatedAt)
      throw new Error("Restore this customer's account before enabling promotions.");
    if (customer.marketingEmailDeletedAt && !["restore", "delete"].includes(action))
      throw new Error("Restore this email from Deleted emails first.");
    if (action === "restore" && !customer.marketingEmailDeletedAt)
      throw new Error("This email has already been restored. Refresh the list.");

    const enabled = action === "enable";
    await tx.customer.update({
      where: { id: customerId },
      data: {
        emailMarketingOptIn: enabled,
        marketingConsentUpdatedAt: new Date(),
        ...(action === "delete" ? { marketingEmailDeletedAt: new Date() } : {}),
        ...(action === "restore" ? { marketingEmailDeletedAt: null } : {}),
      },
    });
    const email = customer.email.toLowerCase();
    if (enabled) {
      await tx.marketingSuppression.deleteMany({ where: { email } });
    } else {
      await tx.marketingSuppression.upsert({
        where: { email },
        create: { email, reason: action === "delete" ? "Deleted from customer emails by admin." : "Promotions blocked by admin." },
        update: {},
      });
      await tx.marketingDelivery.updateMany({
        where: { customerId, status: "PENDING" },
        data: { status: "SKIPPED", detail: "Customer email removed or promotions blocked by admin." },
      });
    }
    await tx.marketingConsentEvent.create({
      data: {
        customerId, emailOptIn: enabled, smsOptIn: customer.smsMarketingOptIn,
        source: `admin:${adminEmail}:marketing-email:${action}`,
      },
    });
  });
}
