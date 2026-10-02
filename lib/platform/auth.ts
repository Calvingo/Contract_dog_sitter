import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/auth/customer-session";
import { getAdminSession } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/db";
export async function requireCustomer() {
  const session = await getCustomerSession();
  if (!session) redirect("/login");
  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
  });
  if (!customer) redirect("/login");
  return customer;
}
export async function requirePlatformAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}
