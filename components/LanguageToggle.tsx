"use client";

import type { Locale } from "@/lib/form-config";
import { getLocaleLabel, toggleLocale } from "@/lib/i18n";

type Props = {
  locale: Locale;
  onChange: (locale: Locale) => void;
};

export function LanguageToggle({ locale, onChange }: Props) {
  return (
    <button
      type="button"
      onClick={() => onChange(toggleLocale(locale))}
      className="rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-orange-700 shadow-sm transition hover:bg-orange-50"
    >
      {getLocaleLabel(locale)}
    </button>
  );
}
