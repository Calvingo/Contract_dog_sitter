import { SubmissionStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/db";
import {
  decideSubmissionAction,
  updateCustomerPetAction,
  updateSubmissionAction,
} from "../../actions";
import { AdminShell } from "../../admin-ui";

function moneyValue(value: { toNumber: () => number }): string {
  return value.toNumber().toFixed(2);
}

function dateTime(value: Date): string {
  return value.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function localDateTimeInputValue(value: Date): string {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60 * 1000)
    .toISOString()
    .slice(0, 16);
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
      pet: true,
      decisionEvents: { orderBy: { createdAt: "desc" } },
      emailLogs: { orderBy: { createdAt: "desc" } },
      revisions: { orderBy: { revision: "desc" }, take: 10 },
    },
  });

  if (!submission) notFound();

  return (
    <AdminShell
      email={session.email}
      title={`${submission.pet.name} · ${submission.customer.firstName} ${submission.customer.lastName}`}
      subtitle="Review, decide, and edit this booking request."
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <Summary label="Status" value={submission.status.replaceAll("_", " ")} />
          <Summary label="Dropoff" value={dateTime(submission.dropoffAt)} />
          <Summary label="Pickup" value={dateTime(submission.pickupAt)} />
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
          <h2 className="text-xl font-bold text-stone-950">Admin Decision</h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <form action={decideSubmissionAction}>
              <input type="hidden" name="submissionId" value={submission.id} />
              <input type="hidden" name="action" value="accept" />
              <button className="rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-600">
                Accept and email customer
              </button>
            </form>
            <form action={decideSubmissionAction}>
              <input type="hidden" name="submissionId" value={submission.id} />
              <input type="hidden" name="action" value="reject" />
              <button className="rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-600">
                Reject and email customer
              </button>
            </form>
            <form action={decideSubmissionAction} className="flex flex-1 gap-2">
              <input type="hidden" name="submissionId" value={submission.id} />
              <input type="hidden" name="action" value="meet_greet" />
              <input
                type="datetime-local"
                name="meetGreetAt"
                className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-3 text-sm"
                required
              />
              <button className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-600">
                Send meet
              </button>
            </form>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <form
            action={updateSubmissionAction}
            className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100"
          >
            <input type="hidden" name="submissionId" value={submission.id} />
            <h2 className="text-xl font-bold text-stone-950">Edit Order</h2>
            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Status</span>
                <select
                  name="status"
                  defaultValue={submission.status}
                  className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
                >
                  {Object.values(SubmissionStatus).map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">
                  Dropoff
                </span>
                <input
                  type="datetime-local"
                  name="dropoffAt"
                  defaultValue={localDateTimeInputValue(submission.dropoffAt)}
                  className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Pickup</span>
                <input
                  type="datetime-local"
                  name="pickupAt"
                  defaultValue={localDateTimeInputValue(submission.pickupAt)}
                  className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">
                  Quoted total
                </span>
                <input
                  type="number"
                  name="quotedTotal"
                  min="0"
                  step="0.01"
                  defaultValue={moneyValue(submission.quotedTotal)}
                  className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">
                  Prescreen notes
                </span>
                <textarea
                  name="prescreenNotes"
                  defaultValue={submission.prescreenNotes || ""}
                  rows={5}
                  className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
                />
              </label>
            </div>
            <button className="mt-5 rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800">
              Save order changes
            </button>
          </form>

          <form
            action={updateCustomerPetAction}
            className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100"
          >
            <input type="hidden" name="submissionId" value={submission.id} />
            <input type="hidden" name="customerId" value={submission.customerId} />
            <input type="hidden" name="petId" value={submission.petId} />
            <h2 className="text-xl font-bold text-stone-950">
              Edit Customer and Dog
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextInput name="firstName" label="First name" value={submission.customer.firstName} />
              <TextInput name="lastName" label="Last name" value={submission.customer.lastName} />
              <TextInput name="email" label="Email" value={submission.customer.email} type="email" />
              <TextInput name="phone" label="Phone" value={submission.customer.phone} />
              <TextInput name="backupContact" label="Backup contact" value={submission.customer.backupContact} />
              <TextInput name="wechatId" label="WeChat ID" value={submission.customer.wechatId || ""} required={false} />
              <TextInput name="petName" label="Dog name" value={submission.pet.name} />
              <TextInput name="petBreed" label="Breed" value={submission.pet.breed} />
              <TextInput name="petWeightLb" label="Weight lb" value={String(submission.pet.weightLb)} type="number" />
              <TextInput
                name="petAgeYears"
                label="Age years"
                value={submission.pet.ageYears == null ? "" : String(submission.pet.ageYears)}
                type="number"
                required={false}
              />
            </div>
            <button className="mt-5 rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800">
              Save customer and dog
            </button>
          </form>
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
                    {dateTime(event.createdAt)} · {event.actorEmail || "email link"}
                  </div>
                  {event.message ? (
                    <div className="mt-1 text-sm text-stone-600">{event.message}</div>
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
                  <div className="mt-1 text-sm text-stone-600">{email.subject}</div>
                  {email.error ? (
                    <div className="mt-1 text-xs text-red-600">{email.error}</div>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="py-3 text-sm text-stone-500">No email logs yet.</li>
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

function TextInput(props: {
  name: string;
  label: string;
  value: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-700">{props.label}</span>
      <input
        type={props.type || "text"}
        name={props.name}
        defaultValue={props.value}
        required={props.required !== false}
        step={props.type === "number" ? "0.01" : undefined}
        className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-3"
      />
    </label>
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
