import Link from "next/link";
import { BoardingChecklist } from "@/components/BoardingChecklist";
import { ui } from "@/lib/i18n";

export default function SuccessContent() {
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-orange-100">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
            ✓
          </div>
          <h1 className="text-2xl font-bold text-stone-900">{ui.successTitle}</h1>
          <p className="mt-3 text-stone-600">{ui.successBody}</p>
        </div>

        <BoardingChecklist />

        <div className="text-center">
          <Link
            href="/"
            className="inline-flex rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700"
          >
            {ui.backHome}
          </Link>
        </div>
      </div>
    </main>
  );
}
