import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/auth/customer-session";
import BookingForm from "@/components/BookingForm";
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ editToken?: string }>;
}) {
  const { editToken } = await searchParams;
  if (!editToken && !(await getCustomerSession()))
    redirect("/login?next=%2Fbook");
  return <BookingForm />;
}
