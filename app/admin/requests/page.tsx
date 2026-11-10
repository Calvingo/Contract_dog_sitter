import { BookingRequestActions } from "@/components/BookingRequestActions";
import { CancelOrderForm } from "@/components/CancelOrderForm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { listBookingRequests, type BookingRequestParams } from "@/lib/admin/booking-requests";
import { submissionDogNames } from "@/lib/submission-pets";
import { AdminShell, StatusBadge, dateTime, money } from "../admin-ui";

export const maxDuration = 120;

export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<BookingRequestParams> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { query, submissions, total, page, pages, skip, pending } = await listBookingRequests(await searchParams);
  function pageLink(targetPage: number) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("page", String(targetPage));
    return `/admin/requests?${params}`;
  }

  return (
    <AdminShell
      email={session.email}
      title="Requests"
      subtitle="Review booking requests and send customer decision emails."
    >
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-stone-950">
              Booking Requests
            </h2>
            <p className="text-sm text-stone-600">
              {pending._count} pending · pending quoted {money(pending._sum.quotedTotal ?? 0)}
            </p>
          </div>
        </div>

        <form action="/admin/requests" method="get" className="filter-form mt-4" key={query}>
          <label>
            Customer or pet name
            <input type="search" name="q" defaultValue={query} maxLength={100} />
          </label>
          <button className="button" type="submit">Search</button>
          {query && <Link className="button secondary" href="/admin/requests">Clear search</Link>}
        </form>

        {total > 0 && <p className="mt-4 text-sm text-stone-600">
          Showing {skip + 1}–{skip + submissions.length} of {total} {query ? "matching " : ""}bookings
        </p>}
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase text-stone-500">
              <tr>
                <th className="py-3 pr-4">Customer</th>
                <th className="py-3 pr-4">Dog</th>
                <th className="py-3 pr-4">Stay</th>
                <th className="py-3 pr-4">Quote</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {total === 0 && <tr><td colSpan={6} className="py-6 text-stone-600">
                {query ? `No bookings match “${query}”.` : "No bookings yet."}
              </td></tr>}
              {submissions.map((submission) => (
                <tr key={submission.id} className="align-top">
                  <td className="py-4 pr-4">
                    <div className="font-semibold text-stone-900">
                      {submission.customer.firstName}{" "}
                      {submission.customer.lastName}
                    </div>
                    <div className="text-xs text-stone-500">
                      {submission.customer.email}
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="font-semibold text-stone-900">
                      {submissionDogNames(
                        submission.submissionPets,
                        submission.pet.name,
                      )}
                    </div>
                    <div className="text-xs text-stone-500">
                      {submission.submissionPets
                        .map(
                          (item) =>
                            `${item.pet.breed}, ${item.pet.weightLb} lb`,
                        )
                        .join(" · ") ||
                        `${submission.pet.breed}, ${submission.pet.weightLb} lb`}
                    </div>
                  </td>
                  <td className="py-4 pr-4 text-stone-700">
                    <div>{dateTime(submission.dropoffAt)}</div>
                    <div>{dateTime(submission.pickupAt)}</div>
                  </td>
                  <td className="py-4 pr-4 font-semibold text-stone-900">
                    {money(submission.quotedTotal)}
                  </td>
                  <td className="py-4 pr-4">
                    <StatusBadge status={submission.status} />
                    {submission.cancellationRequestedAt &&
                      submission.status !== "CANCELLED" && (
                        <p className="mt-2 text-xs font-semibold text-red-700">
                          Cancellation requested
                        </p>
                      )}
                    {submission.emailLogs[0] ? (
                      <div className="mt-2 text-xs text-stone-500">
                        Last email:{" "}
                        {submission.emailLogs[0].status.toLowerCase()}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-4 pr-4">
                    <BookingRequestActions
                      id={submission.id}
                      status={submission.status}
                      revision={submission.revision}
                    />
                    <CancelOrderForm id={submission.id} status={submission.status} revision={submission.revision} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <nav aria-label="Booking pages" className="mt-5 flex flex-wrap items-center justify-center gap-4">
            {page > 1 && <Link className="button secondary" href={pageLink(page - 1)}>Previous</Link>}
            <span className="text-sm">Page {page} of {pages}</span>
            {page < pages && <Link className="button secondary" href={pageLink(page + 1)}>Next</Link>}
          </nav>
        )}
      </section>
    </AdminShell>
  );
}
