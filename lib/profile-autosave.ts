import type { FormValues } from "./form-config";
import { buildPetPrescreenAnswers, buildPetSnapshots } from "./submission-data";
import type { PrefillResponse } from "./booking-prefill";

export function profileSavePayload(values: FormValues) {
  const answers = buildPetPrescreenAnswers(values);
  return {
    customer: {
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      backupContact: values.backupContact,
      emergencyContactName: values.emergencyContactName,
      emergencyContactPhone: values.emergencyContactPhone,
      wechatId: values.wechatId,
    },
    pets: buildPetSnapshots(values).map((pet, index) => ({
      ...pet,
      id: (index === 0 ? values.savedPetId : values.savedSecondPetId) || undefined,
      ageYears: (index === 0 ? values.petAgeYears : values.secondPetAgeYears) || null,
      prescreenAnswers: answers[index],
      prescreenNotes: index === 0 ? values.prescreenNotes : values.secondPrescreenNotes,
    })),
  };
}

// Do not send temporarily empty required fields while someone is typing.
export function profileReadyToSave(values: FormValues) {
  const required = [values.firstName, values.lastName, values.phone, values.backupContact];
  if (values.backupContact === "wechat") required.push(values.wechatId);
  if (required.some(value => !value.trim())) return false;
  return profileSavePayload(values).pets.every(pet =>
    pet.name.trim() && pet.breed.trim() && Number(pet.weightLb) > 0,
  );
}

// Only adopt assigned IDs. A slow response must never replace newer typed values.
export function applySavedProfileIds(
  current: FormValues,
  sent: FormValues,
  saved: PrefillResponse,
): FormValues {
  const pets = profileSavePayload(sent).pets;
  const ids = pets.map(pet => pet.id || saved.pets.find(savedPet =>
    savedPet.name.toLowerCase() === pet.name.trim().toLowerCase(),
  )?.id);
  return {
    ...current,
    savedPetId: current.savedPetId === sent.savedPetId ? ids[0] : current.savedPetId,
    savedSecondPetId: current.hasSecondDog && current.savedSecondPetId === sent.savedSecondPetId
      ? ids[1] : current.savedSecondPetId,
  };
}
