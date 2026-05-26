"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/form-config";
import { getUiCopy } from "@/lib/i18n";

export default function SuccessContent() {
  const searchParams = useSearchParams();
  const lang = searchParams.get("lang");
  const locale: Locale = lang === "zh" ? "zh" : "en";
  const ui = getUiCopy(locale);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-orange-100">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-stone-900">{ui.successTitle}</h1>
        <p className="mt-3 text-stone-600">{ui.successBody}</p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700"
        >
          {ui.backHome}
        </Link>
      </div>
    </main>
  );
}
