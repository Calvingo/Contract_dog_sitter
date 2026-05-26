import { agreementSections } from "@/lib/form-config";

type Props = {
  intro: string;
};

export function AgreementPanel({ intro }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">{intro}</p>
      <div className="max-h-80 overflow-y-auto rounded-xl border border-orange-100 bg-orange-50/40 p-4 text-sm leading-6 text-stone-700">
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
    </div>
  );
}
