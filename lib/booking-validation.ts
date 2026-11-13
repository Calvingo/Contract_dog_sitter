import {
  formFields,
  prescreenQuestions,
  secondPetFields,
  secondPrescreenQuestions,
  type FormValues,
} from "./form-config";
import { isPickupDropoffTimeAllowed } from "./booking-time";
import { ui } from "./i18n";
import { validDate } from "./platform/rules";
import { parseDateTime } from "./pricing";

export type BookingFieldErrors = Partial<Record<keyof FormValues, string>>;
export type BookingValidationOptions = {
  minimumDate?: string;
  hasReadAgreement?: boolean;
};

// Match the visible form order and distinguish the two dogs in the summary.
export const bookingFieldLabels = Object.fromEntries([
  ...["dropoffDate", "pickupDate", "dropoffTime", "pickupTime", "email"].map(name => [
    name, formFields.find(field => field.name === name)!.label,
  ]),
  ...prescreenQuestions.map(question => [question.name, `Dog 1 — ${question.label.split("\n")[0]}`]),
  ...formFields.filter(field => field.section === "owner" && field.name !== "email")
    .map(field => [field.name, field.label]),
  ...formFields.filter(field => field.name.startsWith("pet"))
    .map(field => [field.name, `Dog 1 — ${field.label}`]),
  ...secondPetFields.map(field => [field.name, `Dog 2 — ${field.label}`]),
  ...secondPrescreenQuestions.map(question => [question.name, `Dog 2 — ${question.label.split("\n")[0]}`]),
  ["firstTimeBooking", "First-time booking"],
  ["agreed", "Agreement"],
  ["signature", "Signature"],
]) as Partial<Record<keyof FormValues, string>>;

export function getBookingFieldErrors(
  data: FormValues,
  { minimumDate, hasReadAgreement }: BookingValidationOptions = {},
): BookingFieldErrors {
  const errors: BookingFieldErrors = {};
  const value = (name: keyof FormValues) => typeof data[name] === "string" ? (data[name] as string).trim() : "";
  const fields = [...formFields, ...(data.hasSecondDog ? secondPetFields : [])];
  for (const field of fields) {
    const current = value(field.name);
    if (field.required && !current) errors[field.name] = ui.required;
    else if (current && field.options && !field.options.some(option => option.value === current))
      errors[field.name] = "Please select one of the available options.";
  }
  for (const question of [...prescreenQuestions, ...(data.hasSecondDog ? secondPrescreenQuestions : [])]) {
    if (!["yes", "no"].includes(value(question.name)))
      errors[question.name] = "Please answer Yes or No.";
  }
  if (data.backupContact === "wechat" && !value("wechatId")) errors.wechatId = ui.wechatIdRequired;
  if (value("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value("email")))
    errors.email = "Please enter a valid email address, such as you@example.com.";
  for (const name of ["phone", "emergencyContactPhone"] as const) {
    const phone = value(name);
    // Accept international prefixes, common separators, and optional extensions.
    const main = phone.replace(/\s*(?:ext\.?|x|#)\s*\d+$/i, "");
    const digits = main.replace(/\D/g, "");
    if (phone && (!/^\+?[\d\s().-]+$/.test(main) || digits.length < 7 || digits.length > 15))
      errors[name] = "Please enter a valid phone number, including the area or country code.";
  }
  for (const name of ["petWeightLb", ...(data.hasSecondDog ? ["secondPetWeightLb" as const] : [])] as const) {
    if (value(name) && (!Number.isFinite(Number(value(name))) || Number(value(name)) <= 0))
      errors[name] = "Please enter a weight greater than 0 in lbs.";
  }
  for (const name of ["petAgeYears", ...(data.hasSecondDog ? ["secondPetAgeYears" as const] : [])] as const) {
    if (value(name) && (!Number.isFinite(Number(value(name))) || Number(value(name)) < 0))
      errors[name] = ui.invalidAge;
  }
  if (data.hasSecondDog && value("petName") && value("secondPetName") &&
    value("petName").toLowerCase() === value("secondPetName").toLowerCase())
    errors.secondPetName = "Please enter a different name for the second dog.";

  for (const name of ["dropoffDate", "pickupDate"] as const) {
    if (value(name) && !validDate(value(name))) errors[name] = "Please choose a valid calendar date.";
  }
  if (!errors.dropoffDate && minimumDate && value("dropoffDate") < minimumDate)
    errors.dropoffDate = "Choose today or a future date in California time.";
  for (const [time, date] of [["dropoffTime", "dropoffDate"], ["pickupTime", "pickupDate"]] as const) {
    if (value(time) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value(time)))
      errors[time] = "Please choose a valid time.";
    else if (value(time) && !isPickupDropoffTimeAllowed(value(time), value(date)))
      errors[time] = ui.pickupDropoffTimeRestricted;
  }
  if (!errors.dropoffDate && !errors.pickupDate) {
    if (value("pickupDate") < value("dropoffDate")) errors.pickupDate = ui.pickupBeforeDropoff;
    else if ((Date.parse(value("pickupDate")) - Date.parse(value("dropoffDate"))) / 86400000 > 366)
      errors.pickupDate = "Please choose a stay of at most one year.";
    const dropoff = parseDateTime(value("dropoffDate"), value("dropoffTime"));
    const pickup = parseDateTime(value("pickupDate"), value("pickupTime"));
    if (dropoff && pickup && pickup <= dropoff) {
      errors.pickupDate = ui.pickupBeforeDropoff;
      errors.pickupTime = ui.pickupBeforeDropoff;
    }
  }
  if (hasReadAgreement === false) errors.agreed = ui.agreementScrollRequired;
  else if (data.agreed !== true) errors.agreed = ui.agreeRequired;
  if (!value("signature").startsWith("data:image/png;base64,")) errors.signature = ui.signatureRequired;
  return errors;
}
