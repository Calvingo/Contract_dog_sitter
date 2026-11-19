import Link from "next/link";
import { BoardingChecklist } from "@/components/BoardingChecklist";
import { ui } from "@/lib/i18n";
import { WAITLIST_SAVED } from "@/lib/waitlist";

export default function SuccessContent({ emailWarning = false, waitlisted = false }: { emailWarning?: boolean; waitlisted?: boolean }) {
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-orange-100">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
            ✓
          </div>
          <h1 className="text-2xl font-bold text-stone-900">
            {waitlisted ? "You’re on the waiting list" : ui.successTitle}
          </h1>
          {waitlisted && <p className="mt-3 text-stone-600">{WAITLIST_SAVED}</p>}
          <p className="mt-3 text-stone-600">{emailWarning
            ? "Your request has been saved, but we could not start sending your receipt. Please contact us for a copy. You do not need to submit again."
            : waitlisted ? "Your details have been saved. You do not need to submit again." : ui.successBody}</p>
        </div>

        <BoardingChecklist />

        <div className="text-center">
          <Link
            href="/account"
            className="inline-flex rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700"
          >
            View my bookings
          </Link>
        </div>
      </div>
    </main>
  );
}
