import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

export function FormSection({ title, children }: Props) {
  return (
    <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-orange-100">
      <h2 className="text-lg font-semibold text-stone-800">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
