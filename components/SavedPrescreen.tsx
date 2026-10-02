"use client";
import { useState, type ReactNode } from "react";
export function SavedPrescreen({
  saved,
  dogName,
  hasErrors,
  children,
}: {
  saved: boolean;
  dogName: string;
  hasErrors: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!saved) return <>{children}</>;
  return (
    <div className="space-y-3">
      <p
        className="rounded-xl bg-green-50 p-4 text-sm text-green-800"
        role="status"
      >
        Saved pre-screening answers and notes loaded for {dogName}. You don’t
        need to fill them in again. Please update anything that has changed.
      </p>
      <details
        open={expanded || hasErrors}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-semibold text-green-800">
          Review or update saved answers
        </summary>
        <div className="mt-4 space-y-4">{children}</div>
      </details>
    </div>
  );
}
