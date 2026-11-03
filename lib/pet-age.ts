export type PetAgeUnit = "years" | "months";

export function petAgeInputFromYears(value: string): { amount: string; unit: PetAgeUnit } {
  const years = Number(value);
  if (value.trim() && Number.isFinite(years) && years >= 0 && years < 1) {
    // Remove floating-point noise when restoring whole months (e.g. 7 / 12).
    return { amount: String(Number((years * 12).toPrecision(12))), unit: "months" };
  }
  return { amount: value, unit: "years" };
}

export function petAgeInYears(amount: string, unit: PetAgeUnit): string {
  if (!amount.trim()) return "";
  // Keep full precision: rounding 11 months up to 1 year changes puppy pricing.
  return unit === "months" ? String(Number(amount) / 12) : amount;
}
