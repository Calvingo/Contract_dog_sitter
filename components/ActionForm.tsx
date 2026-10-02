"use client";
import { useActionState, type ReactNode } from "react";
export type ActionState = { error?: string; message?: string };
export function ActionForm({
  action,
  children,
  label = "Save changes",
  className = "form-stack",
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <button className="button" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
      {state.error && (
        <p role="alert" className="notice error">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="notice">
          {state.message}
        </p>
      )}
    </form>
  );
}
