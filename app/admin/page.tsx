import { SubmissionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/db";
import { AdminShell, ModuleCard, Stat, money } from "./admin-ui";

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [submissions, customerCount] = await Promise.all([
    prisma.submission.findMany({
      where: {
        OR: [
          { createdAt: { gte: monthStart } },
          { pickupAt: { gte: now } },
          { status: { in: [SubmissionStatus.PENDING, SubmissionStatus.NEEDS_REVIEW] } },
        ],
      },
      include: { pet: true },
    }),
    prisma.customer.count(),
  ]);

  const pending = submissions.filter(
    (submission) =>
      submission.status === SubmissionStatus.PENDING ||
      submission.status === SubmissionStatus.NEEDS_REVIEW
  );
  const activeDogsToday = submissions.filter(
    (submission) =>
      submission.status === SubmissionStatus.ACCEPTED &&
      submission.dropoffAt <= now &&
      submission.pickupAt >= now
  ).length;
  const acceptedThisMonth = submissions.filter(
    (submission) =>
      submission.status === SubmissionStatus.ACCEPTED &&
      submission.dropoffAt >= monthStart
  );
  const acceptedRevenue = acceptedThisMonth.reduce(
    (sum, submission) => sum + submission.quotedTotal.toNumber(),
    0
  );

  return (
    <AdminShell
      email={session.email}
      title="Admin Dashboard"
      subtitle="Choose a module to manage requests, calendar, reports, or customers."
    >
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Pending requests" value={String(pending.length)} />
        <Stat label="Active dogs today" value={String(activeDogsToday)} />
        <Stat label="Accepted this month" value={String(acceptedThisMonth.length)} />
        <Stat label="Accepted revenue" value={money(acceptedRevenue)} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ModuleCard
          href="/admin/requests"
          title="Requests"
          meta={`${pending.length} pending`}
          description="Review new booking requests, accept, reject, schedule meet & greet, and open order details."
        />
        <ModuleCard
          href="/admin/calendar"
          title="Calendar"
          meta={`${activeDogsToday} active today`}
          description="See upcoming dog stays by dropoff and pickup span, grouped for scheduling visibility."
        />
        <ModuleCard
          href="/admin/reports"
          title="Reports"
          meta={money(acceptedRevenue)}
          description="Track accepted revenue, pending quoted value, average booking value, and status totals."
        />
        <ModuleCard
          href="/admin/customers"
          title="Customers"
          meta={`${customerCount} customers`}
          description="Browse previous customers, dog profiles, contact details, and recent stay history."
        />
      </section>
    </AdminShell>
  );
}
