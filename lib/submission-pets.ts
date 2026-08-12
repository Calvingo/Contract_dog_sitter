export type SubmissionPetDisplay = {
  position: number;
  pet: { name: string; breed: string; weightLb: number; ageYears: number | null };
};

export function submissionDogNames(
  submissionPets: SubmissionPetDisplay[],
  fallbackName: string
): string {
  return submissionPets.map((item) => item.pet.name).join(" & ") || fallbackName;
}

export function submissionDogCount(submissionPets: unknown[]): number {
  return Math.max(1, submissionPets.length);
}
