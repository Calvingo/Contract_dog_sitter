import { isPickupDropoffTimeAllowed } from "./booking-time";
import type { FormValues } from "./form-config";
import { allSubmittableFieldKeys } from "./form-config";
import { calculatePrice, parseDateTime } from "./pricing";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const quote = calculatePrice(
    weight,
    age,
    data.dropoffDate,
    data.dropoffTime,
    data.pickupDate,
    data.pickupTime
  );
  if (!quote) {
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
