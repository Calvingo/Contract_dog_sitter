import { OfflineReceipts } from "../_offline-receipts";
import { ActionForm } from "@/components/ActionForm";
import { setBookingBlock } from "../../booking-blocklist-actions";
import Link from "next/link";
import { BookingRequestActions } from "@/components/BookingRequestActions";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/db";
import { submissionDogNames } from "@/lib/submission-pets";
import { formValuesFromSubmission, storedDogTerms, storedManualPrice } from "@/lib/submission-data";
import { CancelOrderForm } from "@/components/CancelOrderForm";
import { AdminShell } from "../../admin-ui";
import { EditOrderForm } from "../_edit-order-form";
import { EditCustomerPetsForm } from "../_edit-customer-pets-form";

export const maxDuration = 120;

function moneyValue(value: { toNumber: () => number }): string {
  return value.toNumber().toFixed(2);
}

function dateTime(value: Date): string {
  return value.toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function localDateTimeInputValue(value: Date): string {
  return value.toISOString().slice(0, 16);
}

export default async function AdminSubmissionDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { id } = await props.params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      customer: true,
      payments: { orderBy: { createdAt: "desc" } },
      pet: true,
      submissionPets: { orderBy: { position: "asc" }, include: { pet: true } },
      decisionEvents: { orderBy: { createdAt: "desc" } },
      emailLogs: { orderBy: { createdAt: "desc" } },
      revisions: { orderBy: { revision: "desc" }, take: 10 },
    },
  });

  if (!submission) notFound();

  const values = formValuesFromSubmission(submission);
  const manualPrice = storedManualPrice(submission.quotedBreakdown);
  const bookingBlock = await prisma.bookingBlocklist.findUnique({where:{email:submission.customer.email.toLowerCase()}});
  return (
    <AdminShell
      email={session.email}
      title={`${submissionDogNames(submission.submissionPets, submission.pet.name)} · ${submission.customer.firstName} ${submission.customer.lastName}`}
      subtitle="Review, decide, and edit this booking request."
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {submission.cancellationRequestedAt &&
          submission.status !== "CANCELLED" && (
            <div className="notice error">
              <strong>Cancellation requested</strong>
              <p>{submission.cancellationReason}</p>
              <p>
                Review the request and use Cancel order below to confirm it.
                Handle any refund separately.
              </p>
            </div>
          )}
        <ActionForm action={setBookingBlock} label={bookingBlock?.blocked ? "Unblock customer bookings" : "Block customer bookings"}><input type="hidden" name="email" value={submission.customer.email}/><input type="hidden" name="blocked" value={bookingBlock?.blocked ? "false" : "true"}/><label>Internal booking block reason<textarea name="reason" maxLength={1000}/></label></ActionForm>
        <Link className="text-link" href="/admin/payments">
          Review payments and refunds →
        </Link>
        <section className="grid gap-4 md:grid-cols-4">
          <Summary
            label="Status"
            value={submission.status.replaceAll("_", " ")}
          />
          <Summary label="Dropoff" value={dateTime(submission.dropoffAt)} />
          <Summary label="Pickup" value={dateTime(submission.pickupAt)} />
          <Summary label="Quoted total" value={`$${moneyValue(submission.quotedTotal)}`} />
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
          <h2 className="text-xl font-bold text-stone-950">Admin Decision</h2>
          {submission.rewardState === "RECONFIRM" && <p className="notice">Reward withdrawn. The customer must confirm the revised price in their account before acceptance.</p>}
          <BookingRequestActions
            id={submission.id}
            status={submission.status}
            revision={submission.revision}
            showEdit={false}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          {submission.status !== "CANCELLED" && <EditOrderForm
            revision={submission.revision}
            key={`${submission.revision}:${submission.status}`}
            submissionId={submission.id}
            defaultStatus={submission.status}
            defaultDropoffAt={localDateTimeInputValue(submission.dropoffAt)}
            defaultPickupAt={localDateTimeInputValue(submission.pickupAt)}
            defaultPrescreenNotes={submission.prescreenNotes || ""}
            manualPrice={manualPrice}
            dogTerms={storedDogTerms(submission)}
            dogNames={[values.petName, values.secondPetName]}
            pricingValues={{
              useReward: values.useReward,
              savedPetId: values.savedPetId, savedSecondPetId: values.savedSecondPetId,
              petWeightLb: values.petWeightLb,
              petAgeYears: values.petAgeYears,
              prescreenSpayedNeutered: values.prescreenSpayedNeutered,
              prescreenHighEnergy: values.prescreenHighEnergy,
              prescreenMedicalHistory: values.prescreenMedicalHistory,
              hasSecondDog: values.hasSecondDog,
              secondPetWeightLb: values.secondPetWeightLb,
              secondPetAgeYears: values.secondPetAgeYears,
              secondPrescreenSpayedNeutered: values.secondPrescreenSpayedNeutered,
              secondPrescreenHighEnergy: values.secondPrescreenHighEnergy,
              secondPrescreenMedicalHistory: values.secondPrescreenMedicalHistory,
            }}
          />}

          {submission.status !== "CANCELLED" && <EditCustomerPetsForm
            key={`customer:${submission.revision}:${submission.status}`}
            submissionId={submission.id}
            revision={submission.revision}
            customerId={submission.customerId}
            petId={submission.petId}
            secondPetId={submission.submissionPets.find(pet => pet.position === 2)?.petId}
            initialValues={values}
            manualPrice={manualPrice}
            dogTerms={storedDogTerms(submission)}
          />}

        </section>

        <OfflineReceipts id={id} accepted={submission.status === "ACCEPTED"} payments={submission.payments} />

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-red-100">
            <h2 className="text-xl font-bold text-stone-950">{submission.status === "CANCELLED" ? "Order cancelled" : "Cancel order"}</h2>
            {submission.status === "CANCELLED" && <p className="my-3 text-sm text-stone-600">Reserved availability has been released. Check the email log for confirmation delivery; handle any refund separately.</p>}
            <CancelOrderForm id={submission.id} status={submission.status} revision={submission.revision} />
          </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <History title="Decision History">
            {submission.decisionEvents.length ? (
              submission.decisionEvents.map((event) => (
                <li key={event.id} className="border-b border-stone-100 py-3">
                  <div className="font-semibold text-stone-900">
                    {event.action.replaceAll("_", " ")}
                  </div>
                  <div className="text-xs text-stone-500">
                    {dateTime(event.createdAt)} ·{" "}
                    {event.actorEmail || "email link"}
                  </div>
                  {event.message ? (
                    <div className="mt-1 text-sm text-stone-600">
                      {event.message}
                    </div>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="py-3 text-sm text-stone-500">No decisions yet.</li>
            )}
          </History>

          <History title="Email Log">
            {submission.emailLogs.length ? (
              submission.emailLogs.map((email) => (
                <li key={email.id} className="border-b border-stone-100 py-3">
                  <div className="font-semibold text-stone-900">
                    {email.type.replaceAll("_", " ")} · {email.status}
                  </div>
                  <div className="text-xs text-stone-500">
                    {dateTime(email.createdAt)} · {email.to}
                  </div>
                  <div className="mt-1 text-sm text-stone-600">
                    {email.subject}
                  </div>
                  {email.error ? (
                    <div className="mt-1 text-xs text-red-600">
                      {email.error}
                    </div>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="py-3 text-sm text-stone-500">
                No email logs yet.
              </li>
            )}
          </History>
        </section>
      </div>
    </AdminShell>
  );
}

function Summary(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
      <div className="text-sm font-medium text-stone-500">{props.label}</div>
      <div className="mt-2 text-lg font-bold text-stone-950">{props.value}</div>
    </div>
  );
}

function History(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
      <h2 className="text-xl font-bold text-stone-950">{props.title}</h2>
      <ul className="mt-3">{props.children}</ul>
    </section>
  );
}
