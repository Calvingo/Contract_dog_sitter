import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/db";
import { submissionDogNames } from "@/lib/submission-pets";
import { AdminShell, StatusBadge, dateOnly, money } from "../admin-ui";

export default async function AdminCustomersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const customers = await prisma.customer.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      pets: true,
      submissions: {
        orderBy: { dropoffAt: "desc" },
        take: 6,
        include: { pet: true, submissionPets: { orderBy: { position: "asc" }, include: { pet: true } } },
      },
    },
  });

  return (
    <AdminShell
      email={session.email}
      title="Customers"
      subtitle="Customer contact details, dog profiles, and recent stays."
    >
      <section className="grid gap-4 lg:grid-cols-2">
        {customers.map((customer) => (
          <article
            key={customer.id}
            className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-stone-950">
                  {customer.firstName} {customer.lastName}
                </h2>
                <p className="mt-1 text-sm text-stone-600">{customer.email}</p>
                <p className="text-sm text-stone-600">{customer.phone}</p>
              </div>
              <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-600">
                {customer.pets.length} dog{customer.pets.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-stone-700">Dogs</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {customer.pets.map((pet) => (
                  <span
                    key={pet.id}
                    className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700"
                  >
                    {pet.name} · {pet.breed} · {pet.weightLb} lb
                    {pet.ageYears == null ? "" : ` · ${pet.ageYears} yr`}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-stone-700">
                Recent stays
              </h3>
              <div className="mt-2 space-y-2">
                {customer.submissions.length ? (
                  customer.submissions.map((submission) => (
                    <Link
                      key={submission.id}
                      href={`/admin/submissions/${submission.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 p-3 hover:border-orange-300 hover:bg-orange-50/60"
                    >
                      <div>
                        <div className="font-semibold text-stone-950">
                          {submissionDogNames(submission.submissionPets, submission.pet.name)}
                        </div>
                        <div className="text-xs text-stone-500">
                          {dateOnly(submission.dropoffAt)} -{" "}
                          {dateOnly(submission.pickupAt)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={submission.status} />
                        <span className="text-xs font-bold text-stone-700">
                          {money(submission.quotedTotal)}
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-stone-500">No stays yet.</p>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>
    </AdminShell>
  );
}
