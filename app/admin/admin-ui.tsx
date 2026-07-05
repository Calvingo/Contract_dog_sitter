import { SubmissionStatus } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAdminAction } from "./actions";

export function money(value: { toNumber: () => number } | number): string {
  const amount = typeof value === "number" ? value : value.toNumber();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function dateTime(value: Date): string {
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dateOnly(value: Date): string {
  return value.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function statusClass(status: SubmissionStatus): string {
  switch (status) {
    case SubmissionStatus.ACCEPTED:
      return "bg-green-100 text-green-800";
    case SubmissionStatus.REJECTED:
      return "bg-red-100 text-red-800";
    case SubmissionStatus.MEET_GREET_REQUESTED:
      return "bg-blue-100 text-blue-800";
    case SubmissionStatus.CANCELLED:
      return "bg-stone-200 text-stone-700";
    case SubmissionStatus.NEEDS_REVIEW:
      return "bg-amber-100 text-amber-800";
    case SubmissionStatus.PENDING:
    default:
      return "bg-orange-100 text-orange-800";
  }
}

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
        status
      )}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function AdminShell({
  email,
  title,
  subtitle,
  children,
}: {
  email: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 border-b border-orange-100 pb-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap gap-4 text-sm font-semibold">
              <Link href="/admin" className="text-orange-700">
                Admin home
              </Link>
              <Link href="/" className="text-stone-600 hover:text-orange-700">
                Booking form
              </Link>
            </div>
            <h1 className="mt-2 text-3xl font-bold text-stone-950">{title}</h1>
            <p className="mt-1 text-sm text-stone-600">
              {subtitle || `Signed in as ${email}`}
            </p>
          </div>
          <form action={logoutAdminAction}>
            <button className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50">
              Log out
            </button>
          </form>
        </header>
        {children}
      </div>
    </main>
  );
}

export function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
      <div className="text-sm font-medium text-stone-500">{props.label}</div>
      <div className="mt-2 text-2xl font-bold text-stone-950">{props.value}</div>
    </div>
  );
}

export function ModuleCard(props: {
  href: string;
  title: string;
  description: string;
  meta: string;
}) {
  return (
    <Link
      href={props.href}
      className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-orange-100 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-orange-200"
    >
      <div className="text-sm font-semibold text-orange-700">{props.meta}</div>
      <h2 className="mt-3 text-xl font-bold text-stone-950">{props.title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">{props.description}</p>
      <div className="mt-5 text-sm font-semibold text-stone-900">
        Open module
      </div>
    </Link>
  );
}
