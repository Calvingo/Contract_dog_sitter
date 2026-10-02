import { CustomerShell } from "@/components/PlatformShell";
import { CustomerDogs } from "@/components/CustomerDogs";
import { requireCustomer } from "@/lib/platform/auth";
import { prisma } from "@/lib/db";
import { loadCustomerPrefill } from "@/lib/services/customer-prefill";
export default async function DogsPage() {
  const customer = await requireCustomer();
  const [prefill, archivedDogs] = await Promise.all([
    loadCustomerPrefill(customer.id),
    prisma.pet.findMany({
      where: { customerId: customer.id, archivedAt: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, breed: true, weightLb: true, ageYears: true },
    }),
  ]);
  return (
    <CustomerShell
      name={customer.firstName}
      title="Meet your pack."
      subtitle="Manage your dogs’ details and care notes for their next stay."
    >
      <CustomerDogs dogs={prefill?.pets ?? []} archivedDogs={archivedDogs} />
    </CustomerShell>
  );
}
