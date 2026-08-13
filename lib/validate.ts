import { isPickupDropoffTimeAllowed } from "./booking-time";
import type { FormValues } from "./form-config";
import {
  allSubmittableFieldKeys,
  prescreenQuestions,
  secondPetFields,
  secondPrescreenQuestions,
} from "./form-config";
import { getSubmissionQuote } from "./submission-data";
import { parseDateTime } from "./pricing";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const yesNoAnswers = new Set(["yes", "no"]);

export function validateSubmission(data: FormValues): string | null {
  if (data.honeypot) {
    return "Invalid submission";
  }

  for (const key of allSubmittableFieldKeys) {
    if (key === "wechatId") continue;
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) {
      return `Missing required field: ${key}`;
    }
  }

  for (const question of prescreenQuestions) {
    if (!yesNoAnswers.has(String(data[question.name] ?? ""))) {
      return `Invalid answer for field: ${question.name}`;
    }
  }

  if (data.backupContact === "wechat" && !data.wechatId?.trim()) {
    return "Missing required field: wechatId";
  }

  const weight = Number(data.petWeightLb);
  if (!Number.isFinite(weight) || weight <= 0) {
    return "Invalid weight";
  }

  const age = Number(data.petAgeYears);
  if (!Number.isFinite(age) || age < 0) {
    return "Invalid age";
  }

  if (data.hasSecondDog) {
    for (const field of secondPetFields) {
      if (!String(data[field.name] ?? "").trim()) {
        return `Missing required field: ${field.name}`;
      }
    }
    for (const question of secondPrescreenQuestions) {
      const answer = String(data[question.name] ?? "").trim();
      if (!answer) {
        return `Missing required field: ${question.name}`;
      }
      if (!yesNoAnswers.has(answer)) {
        return `Invalid answer for field: ${question.name}`;
      }
    }
    const secondWeight = Number(data.secondPetWeightLb);
    const secondAge = Number(data.secondPetAgeYears);
    if (!Number.isFinite(secondWeight) || secondWeight <= 0) return "Invalid second dog weight";
    if (!Number.isFinite(secondAge) || secondAge < 0) return "Invalid second dog age";
    if (data.petName.trim().toLowerCase() === data.secondPetName.trim().toLowerCase()) {
      return "The two dogs must have different names";
    }
  }

  const dropoff = parseDateTime(data.dropoffDate, data.dropoffTime);
  const pickup = parseDateTime(data.pickupDate, data.pickupTime);
  if (!dropoff || !pickup) {
    return "Invalid drop-off or pick-up date/time";
  }
  if (
    !isPickupDropoffTimeAllowed(data.dropoffTime) ||
    !isPickupDropoffTimeAllowed(data.pickupTime)
  ) {
    return "Drop-offs and pick-ups are available from 8:30 AM to 9:00 PM";
  }
  if (pickup <= dropoff) {
    return "Pick-up must be after drop-off";
  }

  try {
    getSubmissionQuote(data);
  } catch {
    return "Unable to calculate price";
  }

  if (!emailPattern.test(data.email)) {
    return "Invalid email address";
  }

  if (!data.agreed) {
    return "Agreement not accepted";
  }

  if (!data.signature || !data.signature.startsWith("data:image/png;base64,")) {
    return "Invalid signature";
  }

  return null;
}

export function signatureToBuffer(signature: string): Buffer {
  const base64 = signature.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(base64, "base64");
}
