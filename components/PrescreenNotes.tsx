import type { FormValues } from "@/lib/form-config";

type Props = {
  value: string;
  label: string;
  placeholder: string;
  name?: "prescreenNotes" | "secondPrescreenNotes";
  onChange: (name: keyof FormValues, value: string) => void;
};

export function PrescreenNotes({ value, label, placeholder, name = "prescreenNotes", onChange }: Props) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-xl border border-orange-100 bg-white px-4 py-3 text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
      />
    </label>
  );
}
