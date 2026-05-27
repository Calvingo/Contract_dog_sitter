import type { FormValues } from "./form-config";
import { allSubmittableFieldKeys } from "./form-config";

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

  if (!emailPattern.test(data.email)) {
    return "Invalid email address";
  }

  if (data.dropoffDate && data.pickupDate && data.pickupDate < data.dropoffDate) {
    return "Pick-up date must be on or after drop-off date";
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
