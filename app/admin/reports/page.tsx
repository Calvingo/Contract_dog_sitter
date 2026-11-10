import { completedDogDays, pacificWallTime } from "@/lib/platform/loyalty";
import { netReceiptCents } from "@/lib/platform/rules";
import { SubmissionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/db";
import { submissionDogNames } from "@/lib/submission-pets";
import { AdminShell, Stat, money } from "../admin-ui";

export default async function AdminReportsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const submissions = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, customerId: true, status: true, dropoffAt: true, pickupAt: true,
      acceptedDropoffAt: true, acceptedPickupAt: true, acceptedDogs: true, quotedTotal: true,
      pet: { select: { name: true } }, customer: { select: { firstName: true, lastName: true, email: true } },
      payments: { select: { status: true, amount: true, refundedAmount: true } },
      submissionPets: { orderBy: { position: "asc" }, select: { lateDropoffAt: true, earlyPickupAt: true, pet: { select: { name: true } } } },
    },
  });

  const accepted = submissions.filter(
    (submission) => submission.status === SubmissionStatus.ACCEPTED
  );
  const wallTime = pacificWallTime(now);
  const customers = new Map<string, { id: string; name: string; email: string; days: number; netCents: number; hasReceipt: boolean }>();
  for (const booking of accepted) {
    const row = customers.get(booking.customerId) ?? {
      id: booking.customerId, name: `${booking.customer.firstName} ${booking.customer.lastName}`,
      email: booking.customer.email, days: 0, netCents: 0, hasReceipt: false,
    };
    row.days += completedDogDays(booking, wallTime);
    row.hasReceipt ||= booking.payments.some(payment => payment.status === "VERIFIED" || payment.status === "REFUNDED");
    row.netCents += netReceiptCents(booking.payments);
    customers.set(row.id, row);
  }
  const acceptedThisMonth = accepted.filter(
    (submission) => submission.dropoffAt >= monthStart
  );
  const pending = submissions.filter(
    (submission) =>
      submission.status === SubmissionStatus.PENDING ||
      submission.status === SubmissionStatus.NEEDS_REVIEW
  );
  const acceptedRevenue = acceptedThisMonth.reduce(
    (sum, submission) => sum + submission.quotedTotal.toNumber(),
    0
  );
  const pendingQuoted = pending.reduce(
    (sum, submission) => sum + submission.quotedTotal.toNumber(),
    0
  );
  const allAcceptedRevenue = accepted.reduce(
    (sum, submission) => sum + submission.quotedTotal.toNumber(),
    0
  );
  const averageAccepted =
    accepted.length > 0 ? allAcceptedRevenue / accepted.length : 0;

  const statusCounts = Object.values(SubmissionStatus).map((status) => ({
    status,
    count: submissions.filter((submission) => submission.status === status).length,
  }));

  return (
    <AdminShell
      email={session.email}
      title="Reports"
      subtitle="All-time customer rankings, booking values and request status."
    >
      <section className="grid gap-6 lg:grid-cols-2">
        {(["days", "netCents"] as const).map(metric => {
          const rows = [...customers.values()].filter(row => metric === "days" ? row.days > 0 : row.hasReceipt)
            .sort((a, b) => b[metric] - a[metric] || a.email.localeCompare(b.email));
          return <section className="panel" key={metric}>
            <h2>{metric === "days" ? "Customers by completed dog-days" : "Customers by net payments"}</h2>
            <p className="small">{metric === "days" ? "All accepted stays after pickup, counted per dog." : "Confirmed offline receipts less refunds on accepted bookings, including deposits."}</p>
            {rows.length ? <ol className="mt-3 space-y-2">{rows.map((row, index) => (
              <li className="flex justify-between gap-3 border-b py-2" key={row.id}>
                <span>{index + 1}. {row.name}<small className="block text-stone-500">{row.email}</small></span>
                <strong>{metric === "days" ? `${row.days} days` : money(row.netCents / 100)}</strong>
              </li>
            ))}</ol> : <p className="small">No qualifying activity yet.</p>}
          </section>;
        })}
      </section>
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Accepted booking value this month" value={money(acceptedRevenue)} />
        <Stat label="Pending quoted value" value={money(pendingQuoted)} />
        <Stat label="Accepted bookings" value={String(accepted.length)} />
        <Stat label="Average accepted value" value={money(averageAccepted)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
          <h2 className="text-xl font-bold text-stone-950">Status Breakdown</h2>
          <div className="mt-4 space-y-3">
            {statusCounts.map((item) => (
              <div
                key={item.status}
                className="flex items-center justify-between border-b border-stone-100 pb-3 last:border-0 last:pb-0"
              >
                <span className="text-sm font-semibold text-stone-700">
                  {item.status.replaceAll("_", " ")}
                </span>
                <span className="text-sm font-bold text-stone-950">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
          <h2 className="text-xl font-bold text-stone-950">
            Recent Accepted Booking Values
          </h2>
          <div className="mt-4 space-y-3">
            {accepted.slice(0, 12).map((submission) => (
              <div
                key={submission.id}
                className="flex items-start justify-between gap-4 border-b border-stone-100 pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <div className="font-semibold text-stone-950">
                    {submissionDogNames(submission.submissionPets, submission.pet.name)}
                  </div>
                  <div className="text-xs text-stone-500">
                    {submission.customer.firstName} {submission.customer.lastName}
                  </div>
                </div>
                <div className="text-sm font-bold text-stone-950">
                  {money(submission.quotedTotal)}
                </div>
              </div>
            ))}
            {!accepted.length ? (
              <p className="text-sm text-stone-500">No accepted bookings yet.</p>
            ) : null}
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
