import type { FormValues } from "./form-config";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSubmission(data: FormValues): string | null {
  if (data.honeypot) {
    return "Invalid submission";
  }

  const requiredKeys: (keyof FormValues)[] = [
    "firstTimeBooking",
    "infoUpdates",
    "firstName",
    "lastName",
    "email",
    "phone",
    "backupContact",
    "petName",
    "petBreed",
  ];

  for (const key of requiredKeys) {
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
