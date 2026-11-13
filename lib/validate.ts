import type { FormValues } from "./form-config";
import { bookingFieldLabels, getBookingFieldErrors, type BookingValidationOptions } from "./booking-validation";
import { getSubmissionQuote } from "./submission-data";

export function validateSubmissionDetails(data: FormValues, options: BookingValidationOptions = {}) {
  if (data.honeypot) return { error: "Invalid submission", fieldErrors: {} };
  const fieldErrors = getBookingFieldErrors(data, options);
  const first = Object.entries(fieldErrors)[0];
  if (first) {
    const [name, message] = first;
    return { error: `${bookingFieldLabels[name as keyof FormValues] || name}: ${message}`, fieldErrors };
  }
  try {
    getSubmissionQuote(data);
  } catch {
    return { error: "Unable to calculate price. Please review your dates, times and dog details.", fieldErrors: {} };
  }
  return null;
}

export function validateSubmission(data: FormValues): string | null {
  return validateSubmissionDetails(data)?.error ?? null;
}

export function signatureToBuffer(signature: string): Buffer {
  const base64 = signature.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(base64, "base64");
}
