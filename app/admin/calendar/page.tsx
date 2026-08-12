import Link from "next/link";
import { SubmissionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/db";
import { submissionDogCount, submissionDogNames } from "@/lib/submission-pets";
import { AdminShell, StatusBadge, dateOnly, dateTime, money } from "../admin-ui";

export default async function AdminCalendarPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const now = new Date();
  const nextNinetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const calendarItems = await prisma.submission.findMany({
    where: {
      pickupAt: { gte: now },
      dropoffAt: { lte: nextNinetyDays },
      status: {
        in: [
          SubmissionStatus.PENDING,
          SubmissionStatus.NEEDS_REVIEW,
          SubmissionStatus.ACCEPTED,
          SubmissionStatus.MEET_GREET_REQUESTED,
        ],
      },
    },
    orderBy: { dropoffAt: "asc" },
    include: { customer: true, pet: true, submissionPets: { orderBy: { position: "asc" }, include: { pet: true } } },
  });

  const activeDogsToday = calendarItems.filter(
    (submission) =>
      submission.status === SubmissionStatus.ACCEPTED &&
      submission.dropoffAt <= now &&
      submission.pickupAt >= now
  ).reduce((sum, submission) => sum + submissionDogCount(submission.submissionPets), 0);

  return (
    <AdminShell
      email={session.email}
      title="Calendar"
      subtitle={`${activeDogsToday} accepted dogs are currently active. Showing the next 90 days.`}
    >
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
        <h2 className="text-xl font-bold text-stone-950">Upcoming Stays</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {calendarItems.length ? (
            calendarItems.map((item) => (
              <Link
                key={item.id}
                href={`/admin/submissions/${item.id}`}
                className="rounded-xl border border-stone-200 p-4 transition hover:border-orange-300 hover:bg-orange-50/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-stone-950">
                      {submissionDogNames(item.submissionPets, item.pet.name)}
                    </div>
                    <div className="text-sm text-stone-600">
                      {item.customer.firstName} {item.customer.lastName}
                    </div>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
                  <div className="font-semibold">
                    {dateOnly(item.dropoffAt)} - {dateOnly(item.pickupAt)}
                  </div>
                  <div className="mt-1 text-xs text-stone-500">
                    Dropoff {dateTime(item.dropoffAt)}
                  </div>
                  <div className="text-xs text-stone-500">
                    Pickup {dateTime(item.pickupAt)}
                  </div>
                </div>
                <div className="mt-3 text-sm font-semibold text-stone-900">
                  {money(item.quotedTotal)}
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-stone-500">No upcoming stays.</p>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
