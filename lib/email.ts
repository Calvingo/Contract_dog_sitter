import { EmailStatus, EmailType } from "@prisma/client";
import type { FormValues } from "./form-config";
import {
  formFields,
  getOptionLabel,
  prescreenQuestions,
  secondPrescreenQuestions,
  yesNoOptions,
  type FormField,
} from "./form-config";
import { teamContacts } from "./contacts";
import {
  DEPOSIT_PERCENT,
  formatDateTime,
  type PriceBreakdown,
} from "./pricing";
import { getSubmissionQuote, type SubmissionQuote } from "./submission-data";
import { generateSubmissionPdf, pdfFilename } from "./pdf-receipt";
import { getAppBaseUrl } from "./app-url";
import { buildDecisionUrl, createDecisionToken } from "./token";
import {
  buildSubmissionEditUrl,
  createSubmissionEditToken,
} from "./submission-edit-token";
import {
  BRAND_NAME,
  sendMail,
  getEnv,
  parseAdminEmails,
} from "./mailer";
import { logEmail } from "./email-log";
import {
  BOARDING_CHECKLIST_INTRO,
  BOARDING_CHECKLIST_ITEMS,
  BOARDING_CHECKLIST_TITLE,
} from "./boarding-checklist";

export { sendMail } from "./mailer";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rowHtml(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px;border:1px solid #eee;font-weight:600;vertical-align:top;width:45%;">${escapeHtml(label)}</td>
    <td style="padding:8px 12px;border:1px solid #eee;">${escapeHtml(value)}</td>
  </tr>`;
}

function formatTable(rows: string[]): string {
  return `<table style="border-collapse:collapse;width:100%;max-width:640px;margin-bottom:20px;">${rows.join("")}</table>`;
}

function formatValue(field: FormField, data: FormValues): string {
  const rawValue = data[field.name];
  if (field.type === "select") {
    return getOptionLabel(field.options, String(rawValue));
  }
  if (field.name === "dropoffDate") {
    return formatDateTime(data.dropoffDate, data.dropoffTime);
  }
  if (field.name === "pickupDate") {
    return formatDateTime(data.pickupDate, data.pickupTime);
  }
  return String(rawValue);
}

function getQuote(data: FormValues): SubmissionQuote | null {
  try { return getSubmissionQuote(data); } catch { return null; }
}

function formatPrescreenSection(data: FormValues, second = false): string {
  const questions = second ? secondPrescreenQuestions : prescreenQuestions;
  const rows = questions.map((q) =>
    rowHtml(q.label, getOptionLabel(yesNoOptions, String(data[q.name])))
  );
  const notes = second ? data.secondPrescreenNotes : data.prescreenNotes;
  if (notes?.trim()) {
    rows.push(rowHtml("Additional notes", notes.trim()));
  }
  return `
    <h3 style="margin:24px 0 8px;font-size:16px;">${second ? `Dog 2 — ${escapeHtml(data.secondPetName)}` : `Dog 1 — ${escapeHtml(data.petName)}`} Pre-Screening</h3>
    ${formatTable(rows)}
  `;
}

function formatSecondDogSection(data: FormValues): string {
  if (!data.hasSecondDog) return "";
  return `<h3 style="margin:24px 0 8px;font-size:16px;">Dog 2 Details</h3>${formatTable([
    rowHtml("Name", data.secondPetName), rowHtml("Breed", data.secondPetBreed),
    rowHtml("Weight (lbs)", data.secondPetWeightLb), rowHtml("Age (years)", data.secondPetAgeYears),
  ])}`;
}

function formatFormSection(data: FormValues): string {
  const skipNames = new Set<keyof FormValues>(["dropoffTime", "pickupTime"]);
  const rows = formFields
    .filter((f) => !skipNames.has(f.name))
    .filter((f) => f.name !== "wechatId" || data.backupContact === "wechat")
    .map((field) => rowHtml(field.label, formatValue(field, data)));

  return `
    <h3 style="margin:24px 0 8px;font-size:16px;">Booking &amp; Contact Details</h3>
    ${formatTable(rows)}
  `;
}

function formatEmergencyContactSection(data: FormValues): string {
  return `
    <h3 style="margin:24px 0 8px;font-size:16px;">Emergency Contact</h3>
    ${formatTable([
      rowHtml("Emergency contact name", data.emergencyContactName || "—"),
      rowHtml("Emergency contact phone", data.emergencyContactPhone || "—"),
    ])}
  `;
}

function formatSinglePricingSection(quote: PriceBreakdown, dogName: string): string {
  const rows = [
    rowHtml("Weight tier", quote.weightTier),
    rowHtml("Stay duration", `${quote.totalHours} hours`),
    rowHtml("Billable days", String(quote.billableDays)),
    rowHtml("Daily rate", `$${quote.dailyRate}`),
    rowHtml("Boarding subtotal", `$${quote.boardingSubtotal.toFixed(2)}`),
  ];
  if (quote.puppyFee > 0) {
    rows.push(
      rowHtml(
        "Puppy fee",
        `$${quote.puppyFee.toFixed(2)} (${quote.billableDays} day(s) × $${quote.puppyFeePerDay})`
      )
    );
  }
  if (quote.seniorDogFee > 0) {
    rows.push(
      rowHtml(
        "Senior dog fee",
        `$${quote.seniorDogFee.toFixed(2)} (${quote.billableDays} day(s) × $${quote.seniorDogFeePerDay})`
      )
    );
  }
  if (quote.intactDogFee > 0) {
    rows.push(
      rowHtml(
        "Unspayed/unneutered dog fee",
        `$${quote.intactDogFee.toFixed(2)} (${quote.billableDays} day(s) × $${quote.intactDogFeePerDay})`
      )
    );
  }
  if (quote.highEnergyDogFee > 0) {
    rows.push(
      rowHtml(
        "High-energy care fee",
        `$${quote.highEnergyDogFee.toFixed(2)} (${quote.billableDays} day(s) × $${quote.highEnergyDogFeePerDay})`
      )
    );
  }
  if (quote.holidayFee > 0) {
    rows.push(
      rowHtml(
        "Holiday fee",
        `$${quote.holidayFee.toFixed(2)} (entire stay: ${quote.holidayDays} day(s) × $${quote.holidayFeePerDay})`
      )
    );
  }
  rows.push(rowHtml("Estimated total", `$${quote.totalPrice.toFixed(2)}`));
  rows.push(
    rowHtml(
      `Deposit (${DEPOSIT_PERCENT}% of total)`,
      `$${quote.depositAmount.toFixed(2)}`
    )
  );
  return `
    <h3 style="margin:24px 0 8px;font-size:16px;">${escapeHtml(dogName)} — Price Estimate</h3>
    ${formatTable(rows)}
  `;
}

function formatPricingSection(data: FormValues, quote: SubmissionQuote): string {
  const parts = [formatSinglePricingSection(quote.dogs[0], data.petName)];
  if (quote.dogs[1]) parts.push(formatSinglePricingSection(quote.dogs[1], data.secondPetName));
  parts.push(`<h3 style="margin:24px 0 8px;font-size:16px;">Combined Total</h3>${formatTable([
    rowHtml("Estimated total", `$${quote.totalPrice.toFixed(2)}`),
    rowHtml(`Deposit (${DEPOSIT_PERCENT}% of total)`, `$${quote.depositAmount.toFixed(2)}`),
  ])}`);
  return parts.join("");
}

function formatContactsSection(): string {
  const items = teamContacts
    .map(
      (c) =>
        `<li style="margin-bottom:8px;"><strong>${escapeHtml(c.name)}</strong><br/>
        Email: <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a><br/>
        Phone: ${escapeHtml(c.phone)}</li>`
    )
    .join("");
  return `
    <h3 style="margin:24px 0 8px;font-size:16px;">Contact Us</h3>
    <p>If you have any questions, please reach out:</p>
    <ul style="padding-left:20px;line-height:1.8;">${items}</ul>
  `;
}

function formatBoardingChecklistSection(): string {
  const items = BOARDING_CHECKLIST_ITEMS.map(
    (item) => `<li>${escapeHtml(item)}</li>`
  ).join("");

  return `
    <div style="margin:20px 0;padding:16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;">
      <p style="margin:0 0 6px;"><strong>${escapeHtml(BOARDING_CHECKLIST_TITLE)}</strong></p>
      <p style="margin:0 0 8px;">${escapeHtml(BOARDING_CHECKLIST_INTRO)}</p>
      <ol style="margin:0;padding-left:24px;line-height:1.8;">${items}</ol>
    </div>
  `;
}

function decisionButtonRow(
  label: string,
  action: string,
  token: string,
  bg: string
): string {
  const url = buildDecisionUrl(action, token);
  return `<tr>
    <td style="padding:0 8px 10px 0;">
      <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 24px;background:${bg};color:#ffffff !important;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;font-family:Arial,sans-serif;">${label}</a>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 14px 0;font-size:11px;color:#78716c;word-break:break-all;">
      Or copy this link: <a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#ea580c;">${escapeHtml(url)}</a>
    </td>
  </tr>`;
}

function buildAdminDecisionButtons(
  data: FormValues,
  submissionId?: string,
  revision?: number
): string {
  const tokenBase = {
    submissionId,
    revision,
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    petName: [data.petName, data.hasSecondDog ? data.secondPetName : ""].filter(Boolean).join(" & "),
  };

  const acceptToken = createDecisionToken({ ...tokenBase, action: "accept" });
  const rejectToken = createDecisionToken({ ...tokenBase, action: "reject" });
  const meetToken = createDecisionToken({ ...tokenBase, action: "meet_greet" });
  const baseUrl = getAppBaseUrl();

  return `
    <div style="margin:28px 0;padding:20px;background:#fff7ed;border-radius:12px;border:1px solid #fed7aa;">
      <p style="margin:0 0 8px;font-weight:bold;color:#9a3412;">Review this submission</p>
      <p style="margin:0 0 16px;font-size:12px;color:#78716c;">Tap a button (opens in browser). Customer will be emailed automatically. Links expire in 7 days.</p>
      <p style="margin:0 0 12px;font-size:11px;color:#57534e;">Site: ${escapeHtml(baseUrl)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        ${decisionButtonRow("Accept", "accept", acceptToken, "#16a34a")}
        ${decisionButtonRow("Reject", "reject", rejectToken, "#dc2626")}
        ${decisionButtonRow("Meet &amp; Greet", "meet_greet", meetToken, "#ea580c")}
      </table>
    </div>
  `;
}

function buildCustomerEmailHtml(
  data: FormValues,
  quote: SubmissionQuote,
  editUrl?: string,
  isUpdate = false
): string {
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const editBlock = editUrl
    ? `<p style="margin-top:20px;"><strong>Need to make changes?</strong><br/>
        You can edit this request here while it remains eligible for changes:<br/>
        <a href="${escapeHtml(editUrl)}" style="color:#ea580c;">Edit your submission</a></p>`
    : "";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:640px;">
      <h2>[${BRAND_NAME}] ${isUpdate ? "Your updated agreement receipt" : "Your signed agreement receipt"}</h2>
      <p>Dear ${escapeHtml(ownerName)},</p>
      <p>Thank you for ${isUpdate ? "updating" : "submitting"} your pet boarding agreement with ${BRAND_NAME}.</p>
      ${formatBoardingChecklistSection()}
      <p><strong>Please find your signed submission attached as a PDF.</strong> It includes all information you provided, the price estimate ($${quote.totalPrice.toFixed(2)}), the required deposit ($${quote.depositAmount.toFixed(2)}, which is ${DEPOSIT_PERCENT}% of the total), and your signature. Please save it for your records.</p>
      <p>${isUpdate ? "We will review the updated request and follow up soon." : "We will review your request and follow up soon."}</p>
      ${editBlock}
      ${formatContactsSection()}
      <p style="margin-top:24px;">We look forward to caring for ${escapeHtml([data.petName, data.hasSecondDog ? data.secondPetName : ""].filter(Boolean).join(" and "))}!</p>
      <p>${BRAND_NAME}</p>
    </div>
  `;
}

function buildAdminEmailHtml(
  data: FormValues,
  quote: SubmissionQuote,
  submissionId?: string,
  revision?: number,
  isUpdate = false,
  previousStatus?: string
): string {
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const submittedAt = new Date().toLocaleString("en-US");
  const title = isUpdate ? "Updated Agreement Submission" : "New Agreement Submission";
  const updateNote = isUpdate
    ? `<p style="padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412;"><strong>This customer updated a previous request.</strong> Previous admin decision links are no longer valid. Please use the buttons in this latest email.${previousStatus ? ` Previous status: ${escapeHtml(previousStatus)}.` : ""}</p>`
    : "";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
      <h2>${title}</h2>
      ${updateNote}
      <p><strong>Owner:</strong> ${escapeHtml(ownerName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
      <p><strong>Dogs:</strong> ${escapeHtml([data.petName, data.hasSecondDog ? data.secondPetName : ""].filter(Boolean).join(" & "))}</p>
      <p><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</p>
      ${formatBoardingChecklistSection()}
      ${buildAdminDecisionButtons(data, submissionId, revision)}
      ${formatPricingSection(data, quote)}
      ${formatPrescreenSection(data)}
      ${data.hasSecondDog ? formatPrescreenSection(data, true) : ""}
      ${formatEmergencyContactSection(data)}
      ${formatFormSection(data)}
      ${formatSecondDogSection(data)}
      <p>Signature attached as PNG. Customer received a PDF receipt.</p>
    </div>
  `;
}

export async function sendSubmissionEmails(
  data: FormValues,
  signatureBuffer: Buffer,
  submissionId?: string,
  options: {
    revision?: number;
    isUpdate?: boolean;
    previousStatus?: string;
  } = {}
) {
  const quote = getQuote(data);
  if (!quote) {
    throw new Error("Unable to calculate price for email");
  }

  const pdfBuffer = await generateSubmissionPdf(data, quote, signatureBuffer);
  const dogNames = [data.petName, data.hasSecondDog ? data.secondPetName : ""].filter(Boolean).join(" & ");
  const pdfName = pdfFilename(dogNames);

  const fromUser = getEnv("GMAIL_USER");
  const adminEmails = parseAdminEmails();
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const fromHeader = `"${BRAND_NAME}" <${fromUser}>`;
  const editUrl = submissionId
    ? buildSubmissionEditUrl(await createSubmissionEditToken(submissionId))
    : undefined;
  const bookingDates = `${data.dropoffDate} to ${data.pickupDate}`;
  const bookingSummary = `${dogNames} — $${quote.totalPrice.toFixed(2)} — ${bookingDates}`;

  const customerSubject = options.isUpdate
    ? `[${BRAND_NAME}] Updated booking confirmation — ${bookingSummary}`
    : `[${BRAND_NAME}] Booking confirmation — ${bookingSummary}`;
  const adminSubject = options.isUpdate
    ? `[Updated Submission - Needs Review] ${bookingSummary} — ${ownerName}`
    : `[New Submission] ${bookingSummary} — ${ownerName}`;

  try {
    await sendMail({
      from: fromHeader,
      to: data.email,
      subject: customerSubject,
      html: buildCustomerEmailHtml(data, quote, editUrl, options.isUpdate),
      attachments: [
        {
          filename: pdfName,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    await logEmail({
      submissionId,
      type: EmailType.CUSTOMER_RECEIPT,
      to: data.email,
      subject: customerSubject,
      status: EmailStatus.SENT,
    });
  } catch (error) {
    await logEmail({
      submissionId,
      type: EmailType.CUSTOMER_RECEIPT,
      to: data.email,
      subject: customerSubject,
      status: EmailStatus.FAILED,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  try {
    await sendMail({
      from: fromHeader,
      to: adminEmails,
      subject: adminSubject,
      html: buildAdminEmailHtml(
        data,
        quote,
        submissionId,
        options.revision,
        options.isUpdate,
        options.previousStatus
      ),
      attachments: [
        {
          filename: `signature-${Date.now()}.png`,
          content: signatureBuffer,
          contentType: "image/png",
        },
        {
          filename: pdfName,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    await logEmail({
      submissionId,
      type: EmailType.ADMIN_NOTIFICATION,
      to: adminEmails,
      subject: adminSubject,
      status: EmailStatus.SENT,
    });
  } catch (error) {
    await logEmail({
      submissionId,
      type: EmailType.ADMIN_NOTIFICATION,
      to: adminEmails,
      subject: adminSubject,
      status: EmailStatus.FAILED,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
