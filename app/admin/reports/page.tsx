import { SubmissionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/db";
import { AdminShell, Stat, money } from "../admin-ui";

export default async function AdminReportsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const submissions = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    include: { pet: true, customer: true },
  });

  const accepted = submissions.filter(
    (submission) => submission.status === SubmissionStatus.ACCEPTED
  );
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
      subtitle="Revenue and booking status summary."
    >
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Accepted revenue this month" value={money(acceptedRevenue)} />
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
            Recent Accepted Revenue
          </h2>
          <div className="mt-4 space-y-3">
            {accepted.slice(0, 12).map((submission) => (
              <div
                key={submission.id}
                className="flex items-start justify-between gap-4 border-b border-stone-100 pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <div className="font-semibold text-stone-950">
                    {submission.pet.name}
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
