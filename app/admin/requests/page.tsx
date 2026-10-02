import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { SubmissionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/db";
import { submissionDogNames } from "@/lib/submission-pets";
import { decideSubmissionActionWithState } from "../actions";
import { AdminShell, StatusBadge, dateTime, money } from "../admin-ui";

export default async function AdminRequestsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const submissions = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      customer: true,
      pet: true,
      submissionPets: { orderBy: { position: "asc" }, include: { pet: true } },
      emailLogs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const pending = submissions.filter(
    (submission) =>
      submission.status === SubmissionStatus.PENDING ||
      submission.status === SubmissionStatus.NEEDS_REVIEW,
  );
  const pendingQuoted = pending.reduce(
    (sum, submission) => sum + submission.quotedTotal.toNumber(),
    0,
  );

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
              {pending.length} pending · pending quoted {money(pendingQuoted)}
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
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
                    <div className="flex min-w-64 flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        <DecisionButton
                          submissionId={submission.id}
                          action="accept"
                          label="Accept"
                        />
                        <DecisionButton
                          submissionId={submission.id}
                          action="reject"
                          label="Reject"
                        />
                      </div>
                      <ActionForm
                        action={decideSubmissionActionWithState}
                        label="Send meet & greet"
                        className="form-stack"
                      >
                        <input
                          type="hidden"
                          name="submissionId"
                          value={submission.id}
                        />
                        <input type="hidden" name="action" value="meet_greet" />
                        <input
                          type="datetime-local"
                          name="meetGreetAt"
                          className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-2 text-xs"
                          required
                        />
                      </ActionForm>
                      <Link
                        href={`/admin/submissions/${submission.id}`}
                        className="text-xs font-semibold text-orange-700"
                      >
                        View and edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}

function DecisionButton(props: {
  submissionId: string;
  action: "accept" | "reject";
  label: string;
}) {
  return (
    <ActionForm action={decideSubmissionActionWithState} label={props.label}>
      <input type="hidden" name="submissionId" value={props.submissionId} />
      <input type="hidden" name="action" value={props.action} />
    </ActionForm>
  );
}
