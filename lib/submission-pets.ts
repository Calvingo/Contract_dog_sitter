export type SubmissionPetDisplay = {
  position: number;
  pet: { name: string; breed: string; weightLb: number; ageYears: number | null };
};

export function submissionPetNames(
  submissionPets: { pet: { name: string } }[],
  fallbackName: string
): string[] {
  const names = submissionPets.map(item => item.pet.name.trim()).filter(Boolean);
  return names.length ? names : [fallbackName];
}

export function submissionDogNames(
  submissionPets: { pet: { name: string } }[],
  fallbackName: string
): string {
  return submissionPetNames(submissionPets, fallbackName).join(" & ");
}

export function submissionDogCount(submissionPets: unknown[]): number {
  return Math.max(1, submissionPets.length);
}
