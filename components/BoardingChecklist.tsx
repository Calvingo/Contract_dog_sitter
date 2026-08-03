import {
  BOARDING_CHECKLIST_INTRO,
  BOARDING_CHECKLIST_ITEMS,
  BOARDING_CHECKLIST_TITLE,
} from "@/lib/boarding-checklist";

export function BoardingChecklist() {
  return (
    <section
      aria-labelledby="boarding-checklist-title"
      className="rounded-2xl bg-orange-50 p-6 shadow-sm ring-1 ring-orange-200"
    >
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-sm ring-1 ring-orange-100"
        >
          🐾
        </div>
        <div>
          <h2
            id="boarding-checklist-title"
            className="text-lg font-semibold text-stone-900"
          >
            {BOARDING_CHECKLIST_TITLE}
          </h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            {BOARDING_CHECKLIST_INTRO}
          </p>
        </div>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {BOARDING_CHECKLIST_ITEMS.map((item) => (
          <li
            key={item}
            className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 text-sm leading-6 text-stone-700 ring-1 ring-orange-100"
          >
            <span aria-hidden="true" className="font-bold text-orange-600">
              ✓
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
