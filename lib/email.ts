import type { FormValues } from "./form-config";
import {
  formFields,
  getOptionLabel,
  prescreenQuestions,
  yesNoOptions,
  type FormField,
} from "./form-config";
import { teamContacts } from "./contacts";
import {
  calculatePrice,
  formatDateTime,
  type PriceBreakdown,
} from "./pricing";
import { generateSubmissionPdf, pdfFilename } from "./pdf-receipt";
import { getAppBaseUrl } from "./app-url";
import { buildDecisionUrl, createDecisionToken } from "./token";
import {
  BRAND_NAME,
  sendMail,
  getEnv,
  parseAdminEmails,
} from "./mailer";

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

function getQuote(data: FormValues): PriceBreakdown | null {
  return calculatePrice(
    Number(data.petWeightLb),
    data.dropoffDate,
    data.dropoffTime,
    data.pickupDate,
    data.pickupTime
  );
}

function formatPrescreenSection(data: FormValues): string {
  const rows = prescreenQuestions.map((q) =>
    rowHtml(q.label, getOptionLabel(yesNoOptions, String(data[q.name])))
  );
  if (data.prescreenNotes?.trim()) {
    rows.push(rowHtml("Additional notes", data.prescreenNotes.trim()));
  }
  return `
    <h3 style="margin:24px 0 8px;font-size:16px;">Pre-Screening</h3>
    ${formatTable(rows)}
  `;
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

function formatPricingSection(quote: PriceBreakdown): string {
  const rows = [
    rowHtml("Weight tier", quote.weightTier),
    rowHtml("Stay duration", `${quote.totalHours} hours`),
    rowHtml("Billable days", String(quote.billableDays)),
    rowHtml("Daily rate", `$${quote.dailyRate}`),
    rowHtml("Boarding subtotal", `$${quote.boardingSubtotal.toFixed(2)}`),
  ];
  if (quote.holidayFee > 0) {
    rows.push(
      rowHtml(
        "Holiday fee",
        `$${quote.holidayFee.toFixed(2)} (${quote.holidayDays} day(s) × $${quote.holidayFeePerDay})`
      )
    );
  }
  rows.push(rowHtml("Estimated total", `$${quote.totalPrice.toFixed(2)}`));
  return `
    <h3 style="margin:24px 0 8px;font-size:16px;">Price Estimate</h3>
    ${formatTable(rows)}
  `;
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

function buildAdminDecisionButtons(data: FormValues): string {
  const tokenBase = {
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    petName: data.petName,
  };

  const acceptToken = createDecisionToken(tokenBase);
  const rejectToken = createDecisionToken(tokenBase);
  const meetToken = createDecisionToken(tokenBase);
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

function buildCustomerEmailHtml(data: FormValues, quote: PriceBreakdown): string {
  const ownerName = `${data.firstName} ${data.lastName}`.trim();

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:640px;">
      <h2>[${BRAND_NAME}] Your signed agreement receipt</h2>
      <p>Dear ${escapeHtml(ownerName)},</p>
      <p>Thank you for submitting your pet boarding agreement with ${BRAND_NAME}.</p>
      <p><strong>Please find your signed submission attached as a PDF.</strong> It includes all information you provided, the price estimate ($${quote.totalPrice.toFixed(2)}), and your signature. Please save it for your records.</p>
      <p>We will review your request and follow up soon.</p>
      ${formatContactsSection()}
      <p style="margin-top:24px;">We look forward to caring for ${escapeHtml(data.petName)}!</p>
      <p>${BRAND_NAME}</p>
    </div>
  `;
}

function buildAdminEmailHtml(data: FormValues, quote: PriceBreakdown): string {
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const submittedAt = new Date().toLocaleString("en-US");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
      <h2>New Agreement Submission</h2>
      <p><strong>Owner:</strong> ${escapeHtml(ownerName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
      <p><strong>Pet:</strong> ${escapeHtml(data.petName)}</p>
      <p><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</p>
      ${buildAdminDecisionButtons(data)}
      ${formatPricingSection(quote)}
      ${formatPrescreenSection(data)}
      ${formatFormSection(data)}
      <p>Signature attached as PNG. Customer received a PDF receipt.</p>
    </div>
  `;
}

export async function sendSubmissionEmails(
  data: FormValues,
  signatureBuffer: Buffer
) {
  const quote = getQuote(data);
  if (!quote) {
    throw new Error("Unable to calculate price for email");
  }

  const pdfBuffer = await generateSubmissionPdf(data, quote, signatureBuffer);
  const pdfName = pdfFilename(data.petName);

  const fromUser = getEnv("GMAIL_USER");
  const adminEmails = parseAdminEmails();
  const ownerName = `${data.firstName} ${data.lastName}`.trim();
  const fromHeader = `"${BRAND_NAME}" <${fromUser}>`;

  await sendMail({
    from: fromHeader,
    to: data.email,
    subject: `[${BRAND_NAME}] Your signed agreement — ${data.petName}`,
    html: buildCustomerEmailHtml(data, quote),
    attachments: [
      {
        filename: pdfName,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  await sendMail({
    from: fromHeader,
    to: adminEmails,
    subject: `[New Submission] ${ownerName} - ${data.petName} — $${quote.totalPrice.toFixed(2)}`,
    html: buildAdminEmailHtml(data, quote),
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
}
