"use client";

import { useEffect, useRef } from "react";
import { agreementSections } from "@/lib/form-config";

type Props = {
  intro: string;
  scrollHint?: string;
  hasReadToBottom: boolean;
  onReachBottom: () => void;
};

export function AgreementPanel({
  intro,
  scrollHint,
  hasReadToBottom,
  onReachBottom,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const checkBottom = () => {
      const reachedBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight <= 4;
      if (reachedBottom) {
        onReachBottom();
      }
    };

    // If content fits without scrolling, count as read.
    if (el.scrollHeight <= el.clientHeight + 4) {
      onReachBottom();
    }

    el.addEventListener("scroll", checkBottom);
    return () => {
      el.removeEventListener("scroll", checkBottom);
    };
  }, [onReachBottom]);

  return (
    <div className="space-y-2">
      <p className="text-sm text-stone-600">{intro}</p>
      <div
        ref={scrollRef}
        className="max-h-80 overflow-y-auto rounded-xl border border-orange-100 bg-orange-50/40 p-4 text-sm leading-6 text-stone-700"
      >
        {agreementSections.map((section) => (
          <div key={section.titleEn} className="mb-5 last:mb-0">
            <h3 className="font-semibold text-stone-900">
              {section.titleEn} / {section.titleZh}
            </h3>
            <p className="mt-2">{section.bodyEn}</p>
            <p className="mt-2 text-stone-600">{section.bodyZh}</p>
          </div>
        ))}
      </div>
      {!hasReadToBottom && scrollHint ? (
        <p className="text-xs text-orange-600">{scrollHint}</p>
      ) : null}
    </div>
  );
}
